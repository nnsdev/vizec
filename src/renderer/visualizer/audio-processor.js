// AudioWorklet processor for capturing raw audio samples
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunkCount = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0].length > 0) {
      // Send audio data to main thread
      this.port.postMessage({
        samples: input[0], // First channel
        sampleRate: sampleRate
      });
    }
    return true; // Keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
