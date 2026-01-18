import { AudioData } from "../../shared/types";

type RawAudioCallback = (samples: Float32Array, sampleRate: number) => void;

export class AudioAnalyzer {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private frequencyData: Uint8Array = new Uint8Array(0);
  private timeDomainData: Uint8Array = new Uint8Array(0);

  // Raw audio capture for speech recognition (using AudioWorklet)
  private workletNode: AudioWorkletNode | null = null;
  private rawAudioCallback: RawAudioCallback | null = null;
  private workletReady = false;

  private sensitivity = 4.0; // Sensitivity multiplier
  private smoothing = 0.5; // Lower smoothing for more responsiveness to music
  private gain = 15.0; // High audio gain multiplier
  private noiseGate = 5; // Lower noise gate to catch more audio

  async connect(stream: MediaStream): Promise<void> {
    // Create audio context
    this.audioContext = new AudioContext();

    // Ensure context is running
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    // Load AudioWorklet for raw audio capture
    try {
      await this.audioContext.audioWorklet.addModule("./audio-processor.js");
      this.workletNode = new AudioWorkletNode(this.audioContext, "audio-capture-processor");

      this.workletNode.port.onmessage = (event) => {
        if (!this.rawAudioCallback) return;
        const { samples, sampleRate } = event.data;
        this.rawAudioCallback(new Float32Array(samples), sampleRate);
      };

      this.workletReady = true;
    } catch (err) {
      console.warn("[AudioAnalyzer] Failed to load AudioWorklet:", err);
      this.workletReady = false;
    }

    // Create gain node to amplify the signal (loopback audio is often quiet)
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = this.gain;

    // Create analyser node
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = this.smoothing;
    this.analyser.minDecibels = -100; // Very sensitive to quiet sounds
    this.analyser.maxDecibels = -10; // Wide dynamic range

    // Connect stream -> gain -> analyser
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.source.connect(this.gainNode);
    this.gainNode.connect(this.analyser);

    // Also connect to worklet for raw capture (if available)
    if (this.workletNode) {
      this.gainNode.connect(this.workletNode);
      // Worklet doesn't need to connect to destination
    }

    // Initialize data arrays
    const bufferLength = this.analyser.frequencyBinCount;
    this.frequencyData = new Uint8Array(bufferLength);
    this.timeDomainData = new Uint8Array(bufferLength);

  }

  /**
   * Set callback for raw audio data (used by speech recognition)
   */
  setRawAudioCallback(callback: RawAudioCallback | null): void {
    this.rawAudioCallback = callback;
  }

  /**
   * Check if raw audio capture is available
   */
  isRawCaptureAvailable(): boolean {
    return this.workletReady;
  }

  disconnect(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
  }

  setGain(gain: number): void {
    this.gain = gain;
    if (this.gainNode) {
      this.gainNode.gain.value = gain;
    }
  }

  setSensitivity(sensitivity: number): void {
    this.sensitivity = sensitivity;
  }

  setSmoothing(smoothing: number): void {
    this.smoothing = smoothing;
    if (this.analyser) {
      this.analyser.smoothingTimeConstant = smoothing;
    }
  }

  getAudioData(): AudioData {
    if (!this.analyser) {
      return {
        frequencyData: new Uint8Array(1024),
        timeDomainData: new Uint8Array(1024),
        volume: 0,
        bass: 0,
        mid: 0,
        treble: 0,
      };
    }

    // Get frequency and time domain data
    this.analyser.getByteFrequencyData(this.frequencyData as Uint8Array<ArrayBuffer>);
    this.analyser.getByteTimeDomainData(this.timeDomainData as Uint8Array<ArrayBuffer>);

    // Apply noise gate - zero out values below threshold, but scale up remaining values
    const gatedFrequencyData = new Uint8Array(this.frequencyData.length);
    for (let i = 0; i < this.frequencyData.length; i++) {
      if (this.frequencyData[i] > this.noiseGate) {
        // Scale remaining values to use full 0-255 range
        const scaledValue =
          ((this.frequencyData[i] - this.noiseGate) / (255 - this.noiseGate)) * 255;
        gatedFrequencyData[i] = Math.min(255, scaledValue);
      } else {
        gatedFrequencyData[i] = 0;
      }
    }

    // Calculate frequency bands using gated data
    const bufferLength = gatedFrequencyData.length;
    const bassEnd = Math.floor(bufferLength / 8);
    const midEnd = Math.floor(bufferLength / 2);

    const bass = this.calculateBandEnergy(gatedFrequencyData, 0, bassEnd);
    const mid = this.calculateBandEnergy(gatedFrequencyData, bassEnd, midEnd);
    const treble = this.calculateBandEnergy(gatedFrequencyData, midEnd, bufferLength);
    const volume = this.calculateBandEnergy(gatedFrequencyData, 0, bufferLength);

    return {
      frequencyData: gatedFrequencyData,
      timeDomainData: new Uint8Array(this.timeDomainData),
      volume: Math.min(1, volume),
      bass: Math.min(1, bass),
      mid: Math.min(1, mid),
      treble: Math.min(1, treble),
    };
  }

  isConnected(): boolean {
    return this.audioContext !== null && this.analyser !== null;
  }

  private calculateBandEnergy(data: Uint8Array, start: number, end: number): number {
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += data[i];
    }
    return (sum / (end - start) / 255) * this.sensitivity;
  }
}
