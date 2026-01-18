/**
 * Audio capture utilities for speech recognition
 * Uses ScriptProcessorNode (deprecated but widely supported)
 * or AudioWorklet where available
 */

type AudioChunkCallback = (samples: Float32Array, sampleRate: number) => void;

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onChunk: AudioChunkCallback | null = null;
  private isCapturing = false;

  /**
   * Start capturing audio from a MediaStream
   */
  async start(stream: MediaStream, onChunk: AudioChunkCallback): Promise<void> {
    if (this.isCapturing) {
      this.stop();
    }

    this.onChunk = onChunk;
    this.audioContext = new AudioContext();

    // Ensure audio context is running
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    // Create source from stream
    this.source = this.audioContext.createMediaStreamSource(stream);

    // Use ScriptProcessorNode for compatibility
    // Buffer size of 4096 gives ~93ms chunks at 44.1kHz
    const bufferSize = 4096;
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    this.processor.onaudioprocess = (event) => {
      if (!this.onChunk) return;

      // Get mono channel data
      const inputData = event.inputBuffer.getChannelData(0);

      // Copy to new array (input buffer is reused)
      const samples = new Float32Array(inputData.length);
      samples.set(inputData);

      this.onChunk(samples, this.audioContext!.sampleRate);
    };

    // Connect: source -> processor -> gain (muted) -> destination
    // ScriptProcessorNode requires connection to destination to process
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0; // Mute to avoid feedback

    this.source.connect(this.processor);
    this.processor.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    this.isCapturing = true;
  }

  /**
   * Stop capturing audio
   */
  stop(): void {
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.onChunk = null;
    this.isCapturing = false;
  }

  /**
   * Check if currently capturing
   */
  isActive(): boolean {
    return this.isCapturing;
  }

  /**
   * Get current sample rate
   */
  getSampleRate(): number {
    return this.audioContext?.sampleRate || 44100;
  }
}

// Singleton instance
let captureInstance: AudioCapture | null = null;

export function getAudioCapture(): AudioCapture {
  if (!captureInstance) {
    captureInstance = new AudioCapture();
  }
  return captureInstance;
}
