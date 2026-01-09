import { BrowserWindow } from 'electron';
import * as path from 'path';

export function createVisualizerWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1920,
    height: 1080,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the visualizer HTML
  window.loadFile(path.join(__dirname, '..', '..', 'renderer', 'visualizer', 'index.html'));

  // Open DevTools for debugging (uncomment when needed)
  // window.webContents.openDevTools({ mode: 'detach' });

  // Prevent the window from being closed accidentally
  window.on('close', (e) => {
    // Allow close
  });

  return window;
}
