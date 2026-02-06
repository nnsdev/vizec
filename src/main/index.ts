import { app, BrowserWindow, desktopCapturer, session } from "electron";
import { createVisualizerWindow } from "./windows/visualizer";
import { createControlWindow } from "./windows/control";
import { setupIpcHandlers } from "./ipc/handlers";
import { initSpeechSidecar } from "./speech/sidecar";
import { PresetManager } from "./presets/presetManager";
import { AppState } from "../shared/types";

let visualizerWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let presetManager: PresetManager;

const appState: AppState = {
  audioSource: null,
  isCapturing: false,
  currentVisualization: "frequencyBars",
  hideSpeechVisualizations: false,
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

function broadcastState(): void {
  for (const win of [visualizerWindow, controlWindow]) {
    try {
      if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
        win.webContents.send("state-changed", appState);
      }
    } catch {
      // Window may be in process of being destroyed
    }
  }
}

export function updateAppState(partial: Partial<AppState>): void {
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

async function createWindows(): Promise<void> {
  presetManager = new PresetManager();
  await presetManager.init();
  setupIpcHandlers();

  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      callback({ video: sources[0], audio: "loopback" });
    });
  });

  visualizerWindow = createVisualizerWindow();
  controlWindow = createControlWindow();

  const sidecar = initSpeechSidecar((channel, payload) => {
    for (const win of [visualizerWindow, controlWindow]) {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  });
  sidecar.start();
  sidecar.init({
    model: "tiny",
    demucsModel: "htdemucs",
    segmentSeconds: 2.5,
    stepSeconds: 0.5,
  });

  visualizerWindow.on("closed", () => {
    visualizerWindow = null;
    app.quit();
  });

  controlWindow.on("closed", () => {
    controlWindow = null;
    app.quit();
  });

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
