import {
  AppState,
  SpeechData,
  SpeechInitOptions,
  Visualization,
  VisualizationConfig,
  WordEvent,
} from "../../shared/types";
import { visualizationManager } from "./visualization-manager";
import { AudioAnalyzer } from "../shared/audioAnalyzer";
import { getSpeechRecognizer, SpeechRecognizer } from "../shared/speechRecognizer";

export class VisualizationEngine {
  private container: HTMLElement;
  private currentVisualization: Visualization | null = null;
  private currentVizId: string | null = null;
  private audioAnalyzer: AudioAnalyzer;
  private mediaStream: MediaStream | null = null;

  private isRunning = false;
  private lastFrameTime = 0;
  private animationFrameId: number | null = null;

  // Auto-rotation
  private rotationEnabled = false;
  private rotationInterval = 30;
  private rotationOrder: "sequential" | "random" = "sequential";
  private rotationRandomizeColors = false;
  private rotationRandomizeAll = false;
  private rotationTimerId: number | null = null;

  // Available color schemes for randomization
  private static COLOR_SCHEMES = [
    "cyanMagenta",
    "darkTechno",
    "neon",
    "fire",
    "ice",
    "acid",
    "monochrome",
    "purpleHaze",
    "sunset",
    "ocean",
    "toxic",
    "bloodMoon",
    "synthwave",
    "golden",
  ];

  // Generate random config for a visualization
  private generateRandomConfig(): Partial<VisualizationConfig> {
    const randomColor =
      VisualizationEngine.COLOR_SCHEMES[
        Math.floor(Math.random() * VisualizationEngine.COLOR_SCHEMES.length)
      ];

    // Random sensitivity between 0.5 and 2.0
    const sensitivity = 0.5 + Math.random() * 1.5;

    // Random settings that apply to various visualizations
    return {
      colorScheme: randomColor,
      sensitivity: Math.round(sensitivity * 10) / 10,
      // Bar-related
      barCount: [32, 48, 64, 96, 128][Math.floor(Math.random() * 5)],
      gap: Math.floor(Math.random() * 4) + 1,
      glow: Math.random() > 0.3,
      mirror: Math.random() > 0.5,
      // Circle-related
      rings: Math.floor(Math.random() * 4) + 3,
      rotationSpeed: 0.2 + Math.random() * 1.8,
      // Particle-related
      particleCount: [500, 1000, 2000, 3000][Math.floor(Math.random() * 4)],
      explosionIntensity: 0.5 + Math.random() * 1.5,
      // Grid-related
      gridDensity: Math.floor(Math.random() * 10) + 10,
      speed: 0.5 + Math.random() * 2,
      // Kaleidoscope
      segments: [4, 6, 8, 10, 12][Math.floor(Math.random() * 5)],
      // Matrix
      density: 0.3 + Math.random() * 0.5,
      trailLength: 0.5 + Math.random() * 0.4,
      // General
      lineWidth: Math.floor(Math.random() * 4) + 1,
      pulse: Math.random() > 0.3,
    };
  }

  // Transition
  private transitionContainer: HTMLElement | null = null;
  private isTransitioning = false;

  // Preloading for smooth transitions
  private preloadedViz: Visualization | null = null;
  private preloadedVizId: string | null = null;
  private preloadContainer: HTMLElement | null = null;

  // Speech recognition
  private speechRecognizer: SpeechRecognizer;
  private speechEnabled = false;
  private speechData: SpeechData = {
    recentWords: [],
    currentWord: null,
    transcript: "",
    isActive: false,
  };
  private readonly WORD_DISPLAY_DURATION = 2000; // How long to show current word (ms)
  private readonly MAX_RECENT_WORDS = 20;
  private readonly speechDefaults: SpeechInitOptions = {
    model: "tiny",
    demucsModel: "htdemucs",
    segmentSeconds: 2.5,
    stepSeconds: 0.5,
  };

  constructor(container: HTMLElement) {
    this.container = container;
    this.audioAnalyzer = new AudioAnalyzer();
    this.speechRecognizer = getSpeechRecognizer();

    // Set up speech recognition callbacks
    this.speechRecognizer.setOnWord((event) => this.handleWordEvent(event));
    this.speechRecognizer.setOnTranscript((event) => {
      this.speechData.transcript = event.text;
    });

    // Ensure container has proper styling
    this.container.style.position = "relative";
    this.container.style.width = "100%";
    this.container.style.height = "100%";

    // Create transition container for crossfade effects
    this.transitionContainer = document.createElement("div");
    this.transitionContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.5s ease-in-out;
    `;
    this.container.appendChild(this.transitionContainer);

    // Create hidden preload container (off-screen)
    this.preloadContainer = document.createElement("div");
    this.preloadContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
    `;
    this.container.appendChild(this.preloadContainer);

    console.log(
      "Engine initialized, container size:",
      container.clientWidth,
      "x",
      container.clientHeight,
    );
  }

  async startCapture(deviceId?: string): Promise<void> {
    try {
      if (deviceId && deviceId !== "system") {
        // Capture from specific audio input device (e.g., Stereo Mix, Virtual Audio Cable)
        console.log("Attempting to capture from device:", deviceId);
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
          video: false,
        });

        // Log stream info
        const audioTracks = this.mediaStream.getAudioTracks();
        console.log("Audio tracks:", audioTracks.length);
        audioTracks.forEach((track, i) => {
          console.log(
            `Track ${i}: ${track.label}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`,
          );
          const settings = track.getSettings();
          console.log("Track settings:", settings);
        });
      } else {
        // Capture system audio via display media
        this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
          video: true, // Required but we won't use it
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          } as any,
        });

        // Stop video track (we only need audio)
        this.mediaStream.getVideoTracks().forEach((track) => track.stop());
      }

      // Connect audio analyzer
      await this.audioAnalyzer.connect(this.mediaStream);

      if (this.speechEnabled) {
        this.audioAnalyzer.setRawAudioCallback((samples, sampleRate) => {
          this.speechRecognizer.feedAudio(samples, sampleRate);
        });
      }

      // Start render loop
      this.start();
    } catch (error) {
      console.error("Error starting audio capture:", error);
      throw error;
    }
  }

  stopCapture(): void {
    this.stop();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.audioAnalyzer.disconnect();
  }

  setVisualization(vizId: string, config?: VisualizationConfig): void {
    if (vizId === this.currentVizId) return;

    let newViz: Visualization | null;
    if (this.preloadedVizId === vizId && this.preloadedViz) {
      newViz = this.preloadedViz;
      this.preloadedViz = null;
      this.preloadedVizId = null;
      console.log(`Using preloaded visualization: ${vizId}`);
    } else {
      newViz = visualizationManager.createVisualization(vizId);
    }

    if (!newViz) {
      console.error(`Visualization not found: ${vizId}`);
      return;
    }

    const transitionType = newViz.transitionType || "crossfade";

    if (this.currentVisualization && this.isRunning) {
      // Perform transition
      this.performTransition(
        newViz,
        config || { sensitivity: 1.0, colorScheme: "cyanMagenta" },
        transitionType,
      );
    } else {
      // Direct switch (no animation)
      this.switchVisualization(newViz, config || { sensitivity: 1.0, colorScheme: "cyanMagenta" });
    }

    this.currentVizId = vizId;
  }

  private switchVisualization(newViz: Visualization, config: VisualizationConfig): void {
    this.currentVisualization?.destroy();
    this.removeNonTransitionChildren();

    const vizContainer = this.createVizContainer();
    this.container.insertBefore(vizContainer, this.transitionContainer);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    newViz.init(vizContainer, config);
    newViz.resize(width, height);

    this.currentVisualization = newViz;
  }

  private createVizContainer(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    `;
    return el;
  }

  private removeNonTransitionChildren(): void {
    for (const child of Array.from(this.container.children)) {
      if (child !== this.transitionContainer && child !== this.preloadContainer) {
        this.container.removeChild(child);
      }
    }
  }

  private async performTransition(
    newViz: Visualization,
    config: VisualizationConfig,
    transitionType: "crossfade" | "cut" | "zoom",
  ): Promise<void> {
    if (this.isTransitioning || !this.transitionContainer) return;
    this.isTransitioning = true;

    if (transitionType === "cut") {
      this.switchVisualization(newViz, config);
      this.isTransitioning = false;
      return;
    }

    this.transitionContainer.innerHTML = "";
    const tempContainer = this.createVizContainer();
    this.transitionContainer.appendChild(tempContainer);

    newViz.init(tempContainer, config);
    newViz.resize(this.container.clientWidth, this.container.clientHeight);

    if (transitionType === "crossfade") {
      this.transitionContainer.style.opacity = "0";
      await this.delay(50);
      this.transitionContainer.style.opacity = "1";
      await this.delay(500);
    } else if (transitionType === "zoom") {
      this.transitionContainer.style.transform = "scale(0.5)";
      this.transitionContainer.style.opacity = "0";
      this.transitionContainer.style.transition =
        "opacity 0.5s ease-in-out, transform 0.5s ease-out";
      await this.delay(50);
      this.transitionContainer.style.transform = "scale(1)";
      this.transitionContainer.style.opacity = "1";
      await this.delay(500);
    }

    this.currentVisualization?.destroy();
    this.removeNonTransitionChildren();
    this.container.insertBefore(tempContainer, this.transitionContainer);

    this.transitionContainer.style.opacity = "0";
    this.transitionContainer.style.transform = "";
    this.transitionContainer.innerHTML = "";

    this.currentVisualization = newViz;
    this.isTransitioning = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    if (this.currentVisualization) {
      this.currentVisualization.updateConfig(config);
    }
  }

  setAudioConfig(sensitivity: number, smoothing: number): void {
    this.audioAnalyzer.setSensitivity(sensitivity);
    this.audioAnalyzer.setSmoothing(smoothing);
  }

  /** Downloads model on first call (~75MB) */
  async enableSpeechRecognition(
    onStatus?: (status: string, progress?: number, message?: string) => void,
  ): Promise<void> {
    if (!this.speechRecognizer.isReady()) {
      await this.speechRecognizer.initialize(this.speechDefaults, onStatus);
    }

    if (this.audioAnalyzer.isConnected()) {
      this.audioAnalyzer.setRawAudioCallback((samples, sampleRate) => {
        this.speechRecognizer.feedAudio(samples, sampleRate);
      });
    }

    this.speechRecognizer.start();
    this.speechEnabled = true;
    this.speechData.isActive = true;
  }

  disableSpeechRecognition(): void {
    this.speechRecognizer.stop();
    this.audioAnalyzer.setRawAudioCallback(null);
    this.speechEnabled = false;
    this.speechData.isActive = false;
    this.speechData.currentWord = null;
    this.speechData.recentWords = [];
    this.speechData.transcript = "";
  }

  isSpeechEnabled(): boolean {
    return this.speechEnabled;
  }

  private handleWordEvent(event: WordEvent): void {
    this.speechData.recentWords.push(event);

    if (this.speechData.recentWords.length > this.MAX_RECENT_WORDS) {
      this.speechData.recentWords.shift();
    }

    this.speechData.currentWord = event.word;

    setTimeout(() => {
      if (this.speechData.currentWord === event.word) {
        this.speechData.currentWord = null;
      }
    }, this.WORD_DISPLAY_DURATION);
  }

  private cleanupOldWords(): void {
    const now = Date.now();
    const maxAge = 10000; // 10 seconds
    this.speechData.recentWords = this.speechData.recentWords.filter(
      (w) => now - w.timestamp < maxAge,
    );
  }

  setRotation(
    enabled: boolean,
    interval: number,
    order: "sequential" | "random",
    randomizeColors: boolean = false,
    randomizeAll: boolean = false,
  ): void {
    const wasEnabled = this.rotationEnabled;
    const previousOrder = this.rotationOrder;

    this.rotationEnabled = enabled;
    this.rotationInterval = interval;
    this.rotationOrder = order;
    this.rotationRandomizeColors = randomizeColors;
    this.rotationRandomizeAll = randomizeAll;

    if (this.rotationTimerId !== null) {
      window.clearInterval(this.rotationTimerId);
      this.rotationTimerId = null;
    }

    if (enabled) {
      if (!wasEnabled || previousOrder !== order) {
        this.preloadNextVisualization();
      }

      this.rotationTimerId = window.setInterval(() => {
        if (this.rotationRandomizeAll) {
          // Full randomization - colors + all settings
          const randomConfig = this.generateRandomConfig();
          window.vizecAPI.updateVisualizationConfig(randomConfig);
        } else if (this.rotationRandomizeColors) {
          // Just randomize color scheme
          const randomColor =
            VisualizationEngine.COLOR_SCHEMES[
              Math.floor(Math.random() * VisualizationEngine.COLOR_SCHEMES.length)
            ];
          window.vizecAPI.updateVisualizationConfig({ colorScheme: randomColor });
        }
        window.vizecAPI.nextVisualization();

        // Preload the next one after switching
        setTimeout(() => this.preloadNextVisualization(), 500);
      }, interval * 1000);
    }
  }

  private preloadNextVisualization(): void {
    if (!this.rotationEnabled || !this.preloadContainer) return;

    const ids = visualizationManager.getIds();
    if (ids.length === 0) return;

    let nextId: string;
    if (this.rotationOrder === "random") {
      const candidates = ids.filter((id) => id !== this.currentVizId);
      nextId = candidates[Math.floor(Math.random() * candidates.length)] || ids[0];
    } else {
      const currentIndex = this.currentVizId ? ids.indexOf(this.currentVizId) : -1;
      nextId = ids[(currentIndex + 1) % ids.length];
    }

    if (nextId === this.preloadedVizId) return;

    if (this.preloadedViz) {
      this.preloadedViz.destroy();
      this.preloadedViz = null;
    }
    this.preloadContainer.innerHTML = "";

    const viz = visualizationManager.createVisualization(nextId);
    if (!viz) return;

    const tempContainer = this.createVizContainer();
    this.preloadContainer.appendChild(tempContainer);

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    viz.init(tempContainer, { sensitivity: 1.0, colorScheme: "cyanMagenta" });
    viz.resize(width, height);

    this.preloadedViz = viz;
    this.preloadedVizId = nextId;
    console.log(`Preloaded visualization: ${nextId}`);
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    this.renderLoop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.rotationTimerId !== null) {
      window.clearInterval(this.rotationTimerId);
      this.rotationTimerId = null;
    }
  }

  private renderLoop(): void {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    if (this.speechEnabled) {
      this.cleanupOldWords();
    }

    const audioData = this.audioAnalyzer.getAudioData();
    if (this.speechEnabled) {
      audioData.speech = { ...this.speechData };
    }

    if (this.currentVisualization && !this.isTransitioning) {
      this.currentVisualization.render(audioData, deltaTime);
    }

    this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
  }

  resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    console.log("Engine resize:", width, "x", height);

    if (this.currentVisualization) {
      this.currentVisualization.resize(width, height);
    }
  }

  handleStateChange(state: AppState): void {
    if (state.currentVisualization !== this.currentVizId) {
      this.setVisualization(state.currentVisualization, state.visualizationConfig);
    }

    this.updateConfig(state.visualizationConfig);
    this.setAudioConfig(state.audioConfig.sensitivity, state.audioConfig.smoothing);
    this.setRotation(
      state.rotation.enabled,
      state.rotation.interval,
      state.rotation.order,
      state.rotation.randomizeColors,
      state.rotation.randomizeAll || false,
    );

    document.body.style.backgroundColor =
      state.displayConfig.background === "solid" ? "#000000" : "transparent";
  }

  destroy(): void {
    this.stop();
    this.stopCapture();
    this.disableSpeechRecognition();
    this.speechRecognizer.destroy();

    if (this.currentVisualization) {
      this.currentVisualization.destroy();
      this.currentVisualization = null;
    }

    if (this.preloadedViz) {
      this.preloadedViz.destroy();
      this.preloadedViz = null;
    }
  }
}
