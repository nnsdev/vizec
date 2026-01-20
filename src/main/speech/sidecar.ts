import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import {
  IPC_CHANNELS,
  SpeechInitOptions,
  SpeechStatusEvent,
  SpeechTranscriptEvent,
  WordEvent,
} from "../../shared/types";

type SpeechBroadcastChannel =
  | typeof IPC_CHANNELS.SPEECH_STATUS
  | typeof IPC_CHANNELS.SPEECH_WORD
  | typeof IPC_CHANNELS.SPEECH_TRANSCRIPT;

type SpeechBroadcastPayload = SpeechStatusEvent | WordEvent | SpeechTranscriptEvent;

type SpeechBroadcast = (channel: SpeechBroadcastChannel, payload: SpeechBroadcastPayload) => void;

type SidecarMessage =
  | { type: "status"; status: string; progress?: number; message?: string }
  | { type: "ready" }
  | { type: "error"; message?: string }
  | { type: "word"; word: string; timestamp: number; confidence: number }
  | { type: "transcript"; text: string; words: WordEvent[]; timestamp: number };

export class SpeechSidecar {
  private process: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = "";
  private ready = false;
  private enabled = false;
  private initializing = false;
  private readonly broadcast: SpeechBroadcast;

  constructor(broadcast: SpeechBroadcast) {
    this.broadcast = broadcast;
  }

  start(): void {
    if (this.process) return;
    this.ready = false;
    this.enabled = false;
    this.initializing = false;
    const pythonRoot = this.getPythonRoot();
    const sidecarPath = path.join(pythonRoot, "sidecar.py");
    if (!fs.existsSync(sidecarPath)) {
      this.emitStatus("error", undefined, `Missing sidecar at ${sidecarPath}`);
      return;
    }

    this.process = spawn("uv", ["run", "sidecar.py"], {
      cwd: pythonRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout.on("data", (data: Buffer) => this.handleStdout(data));
    this.process.stderr.on("data", (data: Buffer) => {
      const message = data.toString("utf-8").trim();
      if (message) {
        this.emitStatus("stderr", undefined, message);
      }
    });
    this.process.on("error", (error) => {
      this.emitStatus("error", undefined, error.message);
    });
    this.process.on("exit", (code) => {
      this.process = null;
      this.ready = false;
      this.enabled = false;
      this.initializing = false;
      this.emitStatus("error", undefined, `Speech sidecar exited (${code ?? "unknown"})`);
    });

    this.emitStatus("spawned", 0);
  }

  stop(): void {
    if (!this.process) return;
    this.send({ type: "shutdown" });
    this.process.kill();
    this.process = null;
    this.ready = false;
    this.enabled = false;
    this.initializing = false;
  }

  init(options: SpeechInitOptions): void {
    if (this.ready) {
      this.emitStatus("ready", 100);
      return;
    }
    if (this.initializing) return;
    if (!this.process) {
      this.start();
    }
    if (!this.process) return;
    this.initializing = true;
    this.send({ type: "init", ...options });
  }

  enable(): void {
    if (!this.process) return;
    this.enabled = true;
    this.send({ type: "enable" });
  }

  disable(): void {
    if (!this.process) return;
    this.enabled = false;
    this.send({ type: "disable" });
  }

  sendAudio(samples: Float32Array, sampleRate: number): void {
    if (!this.process || !this.enabled || !this.ready) return;
    const buffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    this.send({
      type: "audio",
      samples: buffer.toString("base64"),
      sampleRate,
    });
  }

  private handleStdout(data: Buffer): void {
    this.stdoutBuffer += data.toString("utf-8");
    let index = this.stdoutBuffer.indexOf("\n");
    while (index >= 0) {
      const line = this.stdoutBuffer.slice(0, index).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1);
      if (line) {
        this.handleLine(line);
      }
      index = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleLine(line: string): void {
    const message = parseSidecarMessage(line);
    if (!message) return;

    switch (message.type) {
      case "status":
        this.emitStatus(message.status, message.progress, message.message);
        if (message.status === "ready") {
          this.ready = true;
          this.initializing = false;
        }
        break;
      case "ready":
        this.ready = true;
        this.initializing = false;
        this.emitStatus("ready", 100);
        break;
      case "error":
        this.ready = false;
        this.initializing = false;
        this.emitStatus("error", undefined, message.message ?? "Speech sidecar error");
        break;
      case "word":
        this.broadcast(IPC_CHANNELS.SPEECH_WORD, {
          word: message.word,
          timestamp: message.timestamp,
          confidence: message.confidence,
        });
        break;
      case "transcript":
        this.broadcast(IPC_CHANNELS.SPEECH_TRANSCRIPT, {
          text: message.text,
          words: message.words,
          timestamp: message.timestamp,
        });
        break;
    }
  }

  private emitStatus(status: string, progress?: number, message?: string): void {
    this.broadcast(IPC_CHANNELS.SPEECH_STATUS, {
      status,
      progress,
      message,
    });
  }

  private send(payload: Record<string, unknown>): void {
    if (!this.process) return;
    this.process.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private getPythonRoot(): string {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, "python");
    }
    return path.join(app.getAppPath(), "python");
  }
}

let instance: SpeechSidecar | null = null;

export function initSpeechSidecar(broadcast: SpeechBroadcast): SpeechSidecar {
  if (!instance) {
    instance = new SpeechSidecar(broadcast);
  }
  return instance;
}

export function getSpeechSidecar(): SpeechSidecar {
  if (!instance) {
    throw new Error("Speech sidecar not initialized");
  }
  return instance;
}

function parseSidecarMessage(line: string): SidecarMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const type = parsed.type;
  if (typeof type !== "string") return null;

  if (type === "status") {
    const status = asString(parsed.status);
    if (!status) return null;
    const progress = asNumber(parsed.progress);
    const message = asString(parsed.message);
    return { type, status, progress: progress ?? undefined, message: message ?? undefined };
  }
  if (type === "ready") {
    return { type };
  }
  if (type === "error") {
    const message = asString(parsed.message);
    return { type, message: message ?? undefined };
  }
  if (type === "word") {
    const wordEvent = parseWordEvent(parsed);
    if (!wordEvent) return null;
    return { type, ...wordEvent };
  }
  if (type === "transcript") {
    const text = asString(parsed.text);
    if (!text) return null;
    const timestamp = asNumber(parsed.timestamp);
    if (timestamp === null) return null;
    const words = parseWordArray(parsed.words);
    if (!words) return null;
    return { type, text, words, timestamp };
  }
  return null;
}

function parseWordArray(value: unknown): WordEvent[] | null {
  if (!Array.isArray(value)) return null;
  const words: WordEvent[] = [];
  for (const entry of value) {
    const word = parseWordEvent(entry);
    if (!word) continue;
    words.push(word);
  }
  return words;
}

function parseWordEvent(value: unknown): WordEvent | null {
  if (!isRecord(value)) return null;
  const word = asString(value.word);
  const timestamp = asNumber(value.timestamp);
  const confidence = asNumber(value.confidence);
  if (!word || timestamp === null || confidence === null) return null;
  return { word, timestamp, confidence };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
