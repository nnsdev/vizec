import { app, BrowserWindow, desktopCapturer, session } from "electron";
import { createVisualizerWindow } from "./windows/visualizer";
import { createControlWindow } from "./windows/control";
import { setupIpcHandlers } from "./ipc/handlers";
import { PresetManager } from "./presets/presetManager";
import { AppState } from "../shared/types";

// Keep references to windows
let visualizerWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let presetManager: PresetManager;

// App state
const appState: AppState = {
  audioSource: null,
  isCapturing: false,
  currentVisualization: "frequencyBars",
  currentPreset: null,
  audioConfig: {
    sensitivity: 1.0,
    smoothing: 0.8,
  },
  displayConfig: {
    background: "transparent",
  },
  rotation: {
    enabled: false,
    interval: 30,
    order: "sequential",
    randomizeColors: false,
    randomizeAll: false,
  },
  visualizationConfig: {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
  },
};

// Function to broadcast state changes to all windows
function broadcastState() {
  const windows = [visualizerWindow, controlWindow].filter(Boolean);
  windows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("state-changed", appState);
    }
  });
}

// Update state and broadcast
export function updateAppState(partial: Partial<AppState>) {
  Object.assign(appState, partial);
  broadcastState();
}

export function getAppState(): AppState {
  return appState;
}

export function getPresetManager(): PresetManager {
  return presetManager;
}

export function getVisualizerWindow(): BrowserWindow | null {
  return visualizerWindow;
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow;
}

async function createWindows() {
  // Initialize preset manager FIRST
  presetManager = new PresetManager();
  await presetManager.init();

  // Set up IPC handlers BEFORE creating windows
  setupIpcHandlers();

  // Set up audio loopback handler
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    });
  });

  // Create windows
  visualizerWindow = createVisualizerWindow();
  controlWindow = createControlWindow();

  // Handle window closed
  visualizerWindow.on("closed", () => {
    visualizerWindow = null;
    app.quit();
  });

  controlWindow.on("closed", () => {
    controlWindow = null;
    app.quit();
  });

  // Load default preset
  const presets = presetManager.getAllPresets();
  if (presets.length > 0) {
    const defaultPreset = presets.find((p) => p.id === "dark-techno") || presets[0];
    appState.currentPreset = defaultPreset.id;
    appState.currentVisualization = defaultPreset.visualization;
    appState.visualizationConfig = defaultPreset.visualizationConfig;
    appState.audioConfig = defaultPreset.audioConfig;
    appState.displayConfig = defaultPreset.displayConfig;
    appState.rotation = defaultPreset.rotation;
  }
}

// App lifecycle
app.whenReady().then(createWindows);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
});
