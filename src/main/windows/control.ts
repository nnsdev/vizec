import { app, BrowserWindow } from "electron";
import * as path from "path";

export function createControlWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 740,
    height: 600,
    minWidth: 600,
    minHeight: 450,
    frame: true,
    resizable: true,
    title: "Vizec Control",
    webPreferences: {
      preload: path.join(app.getAppPath(), "dist/preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the control HTML
  window.loadFile(path.join(app.getAppPath(), "dist/renderer/control/index.html"));

  // Open DevTools for debugging (uncomment when needed)
  // window.webContents.openDevTools({ mode: 'detach' });

  // Remove menu bar
  window.setMenuBarVisibility(false);

  // Forward console logs to terminal
  window.webContents.on("console-message", (_event, level, message, _line, _sourceId) => {
    const type = level === 0 ? "INFO" : level === 1 ? "WARN" : "ERROR";
    console.log(`[ControlRenderer][${type}] ${message}`);
  });

  return window;
}
