import type {
  SpeechAudioChunk,
  SpeechInitOptions,
  SpeechTranscriptEvent,
  WordEvent,
} from "../../shared/types";

type TranscriptCallback = (event: SpeechTranscriptEvent) => void;
type WordCallback = (event: WordEvent) => void;
type StatusCallback = (status: string, progress?: number, message?: string) => void;

const speechApi = window.vizecAPI;

/**
 * Speech recognition client that talks to the main-process sidecar
 */
export class SpeechRecognizer {
  private isInitialized = false;
  private enabled = false;
  private readyPromise: Promise<void> | null = null;
  private pendingChunks: Float32Array[] = [];
  private pendingSamples = 0;
  private pendingSampleRate: number | null = null;
  private readonly chunkSeconds = 0.5;
  private resolveReady: (() => void) | null = null;
  private rejectReady: ((error: Error) => void) | null = null;

  private onTranscript: TranscriptCallback | null = null;
  private onWord: WordCallback | null = null;
  private onStatus: StatusCallback | null = null;

  private unsubscribeStatus: (() => void) | null = null;
  private unsubscribeWord: (() => void) | null = null;
  private unsubscribeTranscript: (() => void) | null = null;

  constructor() {
    this.attachListeners();
  }

  /**
   * Initialize the sidecar (loads models)
   */
  async initialize(options: SpeechInitOptions, onStatus?: StatusCallback): Promise<void> {
    this.onStatus = onStatus || null;
    if (this.isInitialized) {
      this.updateStatus("ready", 100);
      return;
    }
    this.resetBuffer();

    if (!this.readyPromise) {
      this.readyPromise = new Promise((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
      });
      this.updateStatus("Starting speech sidecar...", 0);
      speechApi.initSpeech(options);
    }

    await this.readyPromise;
  }

  /**
   * Start processing audio for speech recognition
   */
  start(): void {
    if (!this.isInitialized) return;
    this.resetBuffer();
    this.enabled = true;
    speechApi.enableSpeech();
  }

  /**
   * Stop processing audio
   */
  stop(): void {
    this.enabled = false;
    this.resetBuffer();
    speechApi.disableSpeech();
  }

  /**
   * Feed audio data to the recognizer
   */
  feedAudio(samples: Float32Array, sourceSampleRate: number): void {
    if (!this.enabled || samples.length === 0) return;

    if (this.pendingSampleRate === null || this.pendingSampleRate !== sourceSampleRate) {
      this.resetBuffer();
      this.pendingSampleRate = sourceSampleRate;
    }

    this.pendingChunks.push(samples);
    this.pendingSamples += samples.length;
    this.flushChunks();
  }

  setOnTranscript(callback: TranscriptCallback | null): void {
    this.onTranscript = callback;
  }

  setOnWord(callback: WordCallback | null): void {
    this.onWord = callback;
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  destroy(): void {
    this.stop();
    this.resetBuffer();
    this.isInitialized = false;
    this.readyPromise = null;
    this.resolveReady = null;
    this.rejectReady = null;
    this.onTranscript = null;
    this.onWord = null;
    this.onStatus = null;
    this.unsubscribeStatus?.();
    this.unsubscribeWord?.();
    this.unsubscribeTranscript?.();
    this.unsubscribeStatus = null;
    this.unsubscribeWord = null;
    this.unsubscribeTranscript = null;
  }

  private attachListeners(): void {
    this.unsubscribeStatus = speechApi.onSpeechStatus((event) => {
      if (event.status === "ready") {
        this.isInitialized = true;
        this.resolveReady?.();
        this.resolveReady = null;
        this.rejectReady = null;
      } else if (event.status === "error") {
        if (this.rejectReady) {
          this.rejectReady(new Error(event.message || "Speech sidecar error"));
        }
        this.resolveReady = null;
        this.rejectReady = null;
        this.readyPromise = null;
        this.isInitialized = false;
      }

      if (this.onStatus) {
        this.onStatus(event.status, event.progress, event.message);
      }
    });

    this.unsubscribeWord = speechApi.onSpeechWord((event) => {
      if (this.onWord) this.onWord(event);
    });

    this.unsubscribeTranscript = speechApi.onSpeechTranscript((event) => {
      if (this.onTranscript) this.onTranscript(event);
    });
  }

  private updateStatus(status: string, progress?: number, message?: string): void {
    if (this.onStatus) {
      this.onStatus(status, progress, message);
    }
  }

  private resetBuffer(): void {
    this.pendingChunks = [];
    this.pendingSamples = 0;
    this.pendingSampleRate = null;
  }

  private flushChunks(): void {
    if (this.pendingSampleRate === null) return;
    const targetSamples = Math.max(1, Math.floor(this.chunkSeconds * this.pendingSampleRate));
    if (this.pendingSamples < targetSamples) return;

    const buffer = new Float32Array(this.pendingSamples);
    let offset = 0;
    for (const chunk of this.pendingChunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }

    let cursor = 0;
    while (buffer.length - cursor >= targetSamples) {
      const slice = buffer.slice(cursor, cursor + targetSamples);
      const chunk: SpeechAudioChunk = {
        samples: slice,
        sampleRate: this.pendingSampleRate,
      };
      speechApi.sendSpeechAudio(chunk);
      cursor += targetSamples;
    }

    const remaining = buffer.length - cursor;
    if (remaining > 0) {
      this.pendingChunks = [buffer.slice(cursor)];
      this.pendingSamples = remaining;
    } else {
      this.pendingChunks = [];
      this.pendingSamples = 0;
    }
  }
}

let instance: SpeechRecognizer | null = null;

export function getSpeechRecognizer(): SpeechRecognizer {
  if (!instance) {
    instance = new SpeechRecognizer();
  }
  return instance;
}
