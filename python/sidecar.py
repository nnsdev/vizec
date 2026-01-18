from __future__ import annotations

import base64
import json
import queue
import re
import sys
import threading
import time
from dataclasses import dataclass
from typing import Any

import numpy as np
import torch
from faster_whisper import WhisperModel

HAS_SEPARATOR = False
HAS_DEMUCS = False
DEMUCS_IMPORT_ERROR: str | None = None

try:
    from demucs.api import Separator

    HAS_SEPARATOR = True
    HAS_DEMUCS = True
except ModuleNotFoundError:  # pragma: no cover - fallback for demucs<4
    try:
        from demucs.pretrained import get_model
        from demucs.apply import apply_model

        HAS_DEMUCS = True
    except ModuleNotFoundError as exc:
        DEMUCS_IMPORT_ERROR = str(exc)
        Separator = None  # type: ignore[assignment]
        get_model = None  # type: ignore[assignment]
        apply_model = None  # type: ignore[assignment]


def send_message(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def resample(samples: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    if from_rate == to_rate:
        return samples.astype(np.float32, copy=False)
    ratio = to_rate / from_rate
    new_length = int(round(samples.shape[0] * ratio))
    if new_length <= 0:
        return np.zeros(0, dtype=np.float32)
    x_old = np.linspace(0, samples.shape[0] - 1, samples.shape[0])
    x_new = np.linspace(0, samples.shape[0] - 1, new_length)
    return np.interp(x_new, x_old, samples).astype(np.float32)


@dataclass
class SidecarOptions:
    model: str
    language: str | None
    demucs_model: str
    segment_seconds: float
    step_seconds: float


class SpeechSidecar:
    NOISE_PATTERNS = [
        re.compile(r"^\s*\([^)]*music[^)]*\)\s*$", re.I),
        re.compile(r"^\s*\([^)]*singing[^)]*\)\s*$", re.I),
        re.compile(r"^\s*\([^)]*instrumental[^)]*\)\s*$", re.I),
        re.compile(r"^\s*\([^)]*applause[^)]*\)\s*$", re.I),
        re.compile(r"^\s*\[[^\]]*music[^\]]*\]\s*$", re.I),
        re.compile(r"^\s*\[[^\]]*\]\s*$", re.I),
        re.compile(r"^\s*\([^)]*\)\s*$", re.I),
        re.compile(r"^\s*[♪♫]+\s*$", re.I),
    ]

    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.separator: Separator | None = None
        self.demucs_model: Any | None = None
        self.demucs_sources: list[str] = []
        self.demucs_samplerate = 44100
        self.whisper: WhisperModel | None = None
        self.options: SidecarOptions | None = None
        self.ready = False
        self.enabled = False
        self.audio_queue: queue.Queue[tuple[np.ndarray, int]] = queue.Queue()
        self.shutdown_event = threading.Event()
        self.pending_chunks: list[np.ndarray] = []
        self.pending_samples = 0
        self.pending_sample_rate: int | None = None
        self.last_word: str | None = None
        self.last_word_time = 0.0
        self.worker = threading.Thread(target=self._process_loop, daemon=True)
        self.worker.start()

    def initialize(self, options: SidecarOptions) -> None:
        self.options = options
        self.ready = False
        self.enabled = False
        self.pending_chunks = []
        self.pending_samples = 0
        self.pending_sample_rate = None

        torch.set_grad_enabled(False)
        if not HAS_DEMUCS:
            message = DEMUCS_IMPORT_ERROR or "Demucs not installed"
            send_message({"type": "error", "message": f"Demucs unavailable: {message}"})
            return
        send_message({"type": "status", "status": "loading-demucs", "progress": 10})
        if HAS_SEPARATOR:
            self.separator = Separator(
                model=options.demucs_model,
                device=self.device,
                shifts=0,
                split=True,
                overlap=0.25,
                segment=options.segment_seconds,
                progress=False,
            )
            self.demucs_samplerate = int(getattr(self.separator, "samplerate", 44100))
            self.demucs_sources = ["vocals"]
            self.demucs_model = None
        else:
            self.separator = None
            self.demucs_model = get_model(options.demucs_model)
            self.demucs_model.to(self.device)
            self.demucs_model.eval()
            self.demucs_samplerate = int(
                getattr(self.demucs_model, "samplerate", 44100)
            )
            sources = list(getattr(self.demucs_model, "sources", []))
            self.demucs_sources = sources or ["drums", "bass", "other", "vocals"]

        send_message({"type": "status", "status": "loading-whisper", "progress": 60})

        compute_type = "float16" if self.device == "cuda" else "int8"
        self.whisper = WhisperModel(
            options.model, device=self.device, compute_type=compute_type
        )
        self.ready = True
        send_message({"type": "status", "status": "ready", "progress": 100})
        send_message({"type": "ready"})

    def enable(self) -> None:
        if not self.ready:
            return
        self.enabled = True
        send_message({"type": "status", "status": "enabled"})

    def disable(self) -> None:
        self.enabled = False
        self.pending_chunks = []
        self.pending_samples = 0
        self.pending_sample_rate = None
        send_message({"type": "status", "status": "disabled"})

    def handle_audio(self, samples: np.ndarray, sample_rate: int) -> None:
        if not self.ready or not self.enabled:
            return
        self.audio_queue.put((samples, sample_rate))

    def shutdown(self) -> None:
        self.shutdown_event.set()

    def _process_loop(self) -> None:
        while not self.shutdown_event.is_set():
            try:
                samples, sample_rate = self.audio_queue.get(timeout=0.2)
            except queue.Empty:
                continue
            if not self.ready or not self.enabled:
                continue
            self._append_audio(samples, sample_rate)
            self._process_buffer()

    def _append_audio(self, samples: np.ndarray, sample_rate: int) -> None:
        if self.pending_sample_rate is None or self.pending_sample_rate != sample_rate:
            self.pending_sample_rate = sample_rate
            self.pending_chunks = []
            self.pending_samples = 0
        self.pending_chunks.append(samples)
        self.pending_samples += samples.shape[0]

    def _process_buffer(self) -> None:
        if self.pending_sample_rate is None:
            return
        segment_samples = int(self.options.segment_seconds * self.pending_sample_rate)
        step_samples = int(self.options.step_seconds * self.pending_sample_rate)
        if self.pending_samples < segment_samples:
            return
        buffer = (
            np.concatenate(self.pending_chunks)
            if self.pending_chunks
            else np.zeros(0, dtype=np.float32)
        )
        while buffer.shape[0] >= segment_samples:
            segment = buffer[:segment_samples]
            self._process_segment(segment, self.pending_sample_rate)
            buffer = buffer[step_samples:]
        self.pending_chunks = [buffer] if buffer.shape[0] else []
        self.pending_samples = buffer.shape[0]

    def _process_segment(self, segment: np.ndarray, sample_rate: int) -> None:
        if not self.whisper or not self.options:
            return
        if not self.separator and self.demucs_model is None:
            return
        try:
            vocals, source_rate = self._separate_vocals(segment, sample_rate)
            if vocals.shape[0] == 0:
                return
            vocals_16k = resample(vocals, int(source_rate), 16000)
            segments, _info = self.whisper.transcribe(
                vocals_16k,
                language=self.options.language,
                word_timestamps=True,
                vad_filter=True,
            )
            for seg in segments:
                self._emit_segment(seg)
        except Exception as exc:  # noqa: BLE001
            send_message({"type": "error", "message": str(exc)})

    def _separate_vocals(
        self, segment: np.ndarray, sample_rate: int
    ) -> tuple[np.ndarray, int]:
        wav = torch.from_numpy(segment).to(torch.float32).unsqueeze(0)
        wav = wav.repeat(2, 1)
        wav_batch = wav.unsqueeze(0)
        if self.separator is not None:
            with torch.no_grad():
                try:
                    _origin, stems = self.separator.separate_tensor(
                        wav_batch, sample_rate
                    )
                except ValueError:
                    _origin, stems = self.separator.separate_tensor(wav, sample_rate)
            vocals = stems.get("vocals") if isinstance(stems, dict) else None
            if vocals is None:
                return np.zeros(0, dtype=np.float32), self.demucs_samplerate
            if vocals.dim() == 3:
                vocals = vocals[0]
            vocals = vocals.mean(dim=0)
            return vocals.detach().cpu().numpy().astype(
                np.float32
            ), self.demucs_samplerate
        if self.demucs_model is not None:
            with torch.no_grad():
                sources = apply_model(
                    self.demucs_model,
                    wav_batch.to(self.device),
                    shifts=1,
                    split=True,
                    overlap=0.25,
                )
            if isinstance(sources, tuple):
                sources = sources[0]
            if sources.dim() == 4:
                sources = sources[0]
            index = (
                self.demucs_sources.index("vocals")
                if "vocals" in self.demucs_sources
                else -1
            )
            if index < 0 or sources.dim() < 3:
                return np.zeros(0, dtype=np.float32), self.demucs_samplerate
            vocals = sources[index].mean(dim=0)
            return vocals.detach().cpu().numpy().astype(
                np.float32
            ), self.demucs_samplerate

        if self.demucs_model is not None:
            wav_batch = wav.unsqueeze(0)
            with torch.no_grad():
                sources = apply_model(
                    self.demucs_model,
                    wav_batch.to(self.device),
                    shifts=1,
                    split=True,
                    overlap=0.25,
                )
            if isinstance(sources, tuple):
                sources = sources[0]
            if sources.dim() == 4:
                sources = sources[0]
            index = (
                self.demucs_sources.index("vocals")
                if "vocals" in self.demucs_sources
                else -1
            )
            if index < 0 or sources.dim() < 3:
                return np.zeros(0, dtype=np.float32), self.demucs_samplerate
            vocals = sources[index].mean(dim=0)
            return vocals.detach().cpu().numpy().astype(
                np.float32
            ), self.demucs_samplerate
        return np.zeros(0, dtype=np.float32), sample_rate

    def _emit_segment(self, segment: Any) -> None:
        words_out: list[dict[str, float | str]] = []
        now_ms = int(time.time() * 1000)
        if getattr(segment, "words", None):
            for word_info in segment.words:
                cleaned = self._clean_word(word_info.word)
                if not cleaned or word_info.probability < 0.4:
                    continue
                if self._is_noise_text(cleaned):
                    continue
                if self._is_duplicate(cleaned):
                    continue
                word_event = {
                    "word": cleaned,
                    "timestamp": now_ms,
                    "confidence": float(word_info.probability),
                }
                words_out.append(word_event)
                send_message({"type": "word", **word_event})
        if words_out:
            transcript_text = " ".join(word["word"] for word in words_out)
            if not self._is_noise_text(transcript_text):
                send_message(
                    {
                        "type": "transcript",
                        "text": transcript_text,
                        "words": words_out,
                        "timestamp": now_ms,
                    }
                )

    def _is_duplicate(self, word: str) -> bool:
        now = time.time()
        if self.last_word == word and now - self.last_word_time < 0.6:
            return True
        self.last_word = word
        self.last_word_time = now
        return False

    def _is_noise_text(self, text: str) -> bool:
        return any(pattern.match(text) for pattern in self.NOISE_PATTERNS)

    def _clean_word(self, word: str) -> str:
        cleaned = re.sub(r"^[\s\[\(].*?[\]\)]\s*", "", word)
        cleaned = re.sub(r"\s*[\[\(].*?[\]\)]\s*$", "", cleaned)
        cleaned = re.sub(r"[♪♫]", "", cleaned)
        cleaned = cleaned.strip()
        return cleaned


def parse_options(payload: dict[str, Any]) -> SidecarOptions:
    return SidecarOptions(
        model=str(payload.get("model", "small")),
        language=payload.get("language"),
        demucs_model=str(payload.get("demucsModel", "htdemucs")),
        segment_seconds=float(payload.get("segmentSeconds", 6.0)),
        step_seconds=float(payload.get("stepSeconds", 1.5)),
    )


def main() -> None:
    sidecar = SpeechSidecar()
    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            send_message({"type": "error", "message": "Invalid JSON"})
            continue
        msg_type = message.get("type")
        if msg_type == "init":
            try:
                sidecar.initialize(parse_options(message))
            except Exception as exc:  # noqa: BLE001
                send_message({"type": "error", "message": str(exc)})
        elif msg_type == "enable":
            sidecar.enable()
        elif msg_type == "disable":
            sidecar.disable()
        elif msg_type == "audio":
            samples_b64 = message.get("samples")
            sample_rate = int(message.get("sampleRate", 0))
            if not samples_b64 or sample_rate <= 0:
                continue
            try:
                raw_bytes = base64.b64decode(samples_b64)
                samples = np.frombuffer(raw_bytes, dtype=np.float32)
            except Exception:  # noqa: BLE001
                continue
            sidecar.handle_audio(samples, sample_rate)
        elif msg_type == "shutdown":
            sidecar.shutdown()
            break


if __name__ == "__main__":
    main()
