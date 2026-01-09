import { VisualizationEngine } from "./engine";
import { AppState } from "../../shared/types";
import { visualizationManager } from "./visualization-manager";

// Initialize visualization engine
const container = document.getElementById("visualizer-container");
if (!container) {
  throw new Error("Visualizer container not found");
}

// Register visualizations with the main process immediately
visualizationManager.registerWithMainProcess();

// Pass the manager's create method to the engine if needed,
// or update the engine to use the manager directly.
// For now, let's inject the factory function into the engine
// (assuming we might need to modify Engine to accept a factory or update its import)
// But wait, Engine imports createVisualization from ../../visualizations/index.
// We should probably redirect that import or modify Engine.
// A cleaner approach is to modify Engine to accept a factory or specific instance creation logic.
// However, since we are replacing the global factory, let's just make Engine import from here or pass it in.

// Let's modify the global window.vizecAPI to handle some of this if needed,
// but actually the Engine is what calls createVisualization.
// I'll assume for a moment I can modify Engine or that Engine imports 'createVisualization' which we can swap.

// Actually, checking the Engine code (which I pruned but recall), it likely imports 'createVisualization'.
// I should verify where Engine gets createVisualization from.
// It was: import { createVisualization } from '../../visualizations';

// To avoid changing Engine too much, I can update src/visualizations/index.ts
// to export a dummy, OR I can change Engine to use the manager.
// Changing Engine is better architecture.

// Let's initialize the engine with the manager.
const engine = new VisualizationEngine(container);

// MONKEY PATCH / DEPENDENCY INJECTION
// Since I haven't modified Engine yet, I need to ensure it uses the new manager.
// I will modify src/renderer/visualizer/engine.ts in the next step to use visualizationManager.

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
window.vizecAPI.onAudioSourceSelected(async (source) => {
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

console.log("Vizec Visualizer initialized");
