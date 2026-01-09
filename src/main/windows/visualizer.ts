import { app, BrowserWindow } from "electron";
import * as path from "path";

export function createVisualizerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist/preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the visualizer HTML
  window.loadFile(path.join(app.getAppPath(), "dist/renderer/visualizer/index.html"));

  // Open DevTools for debugging (uncomment when needed)
  // window.webContents.openDevTools({ mode: 'detach' });

  // Forward console logs to terminal
  window.webContents.on("console-message", (_event, level, message, _line, _sourceId) => {
    const type = level === 0 ? "INFO" : level === 1 ? "WARN" : "ERROR";
    console.log(`[VisualizerRenderer][${type}] ${message}`);
  });

  return window;
}
