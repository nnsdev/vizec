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

  window.loadFile(path.join(app.getAppPath(), "dist/renderer/control/index.html"));
  window.setMenuBarVisibility(false);

  window.webContents.on("console-message", (_event, level, message, _line, _sourceId) => {
    const LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;
    const type = LOG_LEVELS[level] ?? "ERROR";
    console.log(`[ControlRenderer][${type}] ${message}`);
  });

  return window;
}
