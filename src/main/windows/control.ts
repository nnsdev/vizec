import { BrowserWindow } from 'electron';
import * as path from 'path';

export function createControlWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 720,
    height: 580,
    minWidth: 600,
    minHeight: 450,
    frame: true,
    resizable: true,
    title: 'Vizec Control',
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Load the control HTML
  window.loadFile(path.join(__dirname, '..', '..', 'renderer', 'control', 'index.html'));

  // Open DevTools for debugging (uncomment when needed)
  // window.webContents.openDevTools({ mode: 'detach' });

  // Remove menu bar
  window.setMenuBarVisibility(false);

  return window;
}
