import { VisualizationEngine } from "./engine";
import { AppState, AudioSource } from "../../shared/types";
import { visualizationManager } from "./visualization-manager";

// Initialize visualization engine
const container = document.getElementById("visualizer-container");
if (!container) {
  throw new Error("Visualizer container not found");
}

// Register visualizations with the main process immediately
visualizationManager.registerWithMainProcess();

const engine = new VisualizationEngine(container);

// Handle window resize
window.addEventListener("resize", () => {
  engine.resize();
});

// Also resize after a short delay to ensure dimensions are available
setTimeout(() => {
  console.log("Delayed resize, container:", container.clientWidth, "x", container.clientHeight);
  engine.resize();
}, 100);

// Listen for state changes
window.vizecAPI.onStateChanged((state: AppState) => {
  engine.handleStateChange(state);
});

// Listen for audio source selection (triggers capture start)
window.vizecAPI.onAudioSourceSelected(async (source: AudioSource) => {
  console.log("Audio source selected:", source);
  try {
    // Pass the device ID for audio input devices, undefined for system audio
    const deviceId = source.type === "audioInput" ? source.id : undefined;
    await engine.startCapture(deviceId);
    console.log("Audio capture started with deviceId:", deviceId);
  } catch (error) {
    console.error("Failed to start audio capture:", error);
  }
});

// Get initial state
window.vizecAPI.getState().then((state: AppState) => {
  // Set initial visualization
  engine.setVisualization(state.currentVisualization, state.visualizationConfig);
  engine.handleStateChange(state);

  // If already capturing, start
  if (state.isCapturing) {
    engine.startCapture().catch(console.error);
  }
});

// Handle page unload
window.addEventListener("beforeunload", () => {
  engine.destroy();
});

// Speech recognition toggle (press 'S' key)
let speechLoading = false;
window.addEventListener("keydown", async (e) => {
  if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.altKey && !e.metaKey) {
    if (speechLoading) return;

    if (engine.isSpeechEnabled()) {
      engine.disableSpeechRecognition();
      showSpeechStatus("Speech recognition disabled");
    } else {
      speechLoading = true;
      showSpeechStatus("Starting speech sidecar...");
      try {
        await engine.enableSpeechRecognition((status, progress, message) => {
          const label = message || status;
          showSpeechStatus(`${label} ${progress ? `(${Math.round(progress)}%)` : ""}`);
        });
        showSpeechStatus("Speech recognition enabled", 3000);
      } catch (error) {
        console.error("Failed to enable speech recognition:", error);
        showSpeechStatus("Failed to load speech model", 5000);
      } finally {
        speechLoading = false;
      }
    }
  }
});

// Show speech status overlay
let statusTimeout: ReturnType<typeof setTimeout> | null = null;
function showSpeechStatus(message: string, duration = 0) {
  let statusEl = document.getElementById("speech-status");
  if (!statusEl) {
    statusEl = document.createElement("div");
    statusEl.id = "speech-status";
    statusEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: #00ffff;
      padding: 12px 24px;
      border-radius: 8px;
      font-family: 'Arial', sans-serif;
      font-size: 14px;
      z-index: 9999;
      border: 1px solid rgba(0, 255, 255, 0.3);
      pointer-events: none;
    `;
    document.body.appendChild(statusEl);
  }

  statusEl.textContent = message;
  statusEl.style.display = "block";

  if (statusTimeout) {
    clearTimeout(statusTimeout);
    statusTimeout = null;
  }

  if (duration > 0) {
    statusTimeout = setTimeout(() => {
      statusEl!.style.display = "none";
    }, duration);
  }
}

console.log("Vizec Visualizer initialized");
console.log("Press 'S' to toggle speech recognition");
