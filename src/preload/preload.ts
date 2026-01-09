import { contextBridge, ipcRenderer } from "electron";

console.log("[Preload] Script starting...");

// Inline IPC_CHANNELS to avoid module resolution issues
const IPC_CHANNELS = {
  // Audio
  GET_AUDIO_SOURCES: "get-audio-sources",
  START_AUDIO_CAPTURE: "start-audio-capture",
  STOP_AUDIO_CAPTURE: "stop-audio-capture",
  AUDIO_SOURCE_SELECTED: "audio-source-selected",

  // Visualization
  GET_VISUALIZATIONS: "get-visualizations",
  SET_VISUALIZATION: "set-visualization",
  UPDATE_VISUALIZATION_CONFIG: "update-visualization-config",
  REGISTER_VISUALIZATIONS: "register-visualizations",
  VISUALIZATIONS_UPDATED: "visualizations-updated",

  // Presets
  GET_PRESETS: "get-presets",
  LOAD_PRESET: "load-preset",
  SAVE_PRESET: "save-preset",
  DELETE_PRESET: "delete-preset",

  // State
  GET_STATE: "get-state",
  UPDATE_STATE: "update-state",
  STATE_CHANGED: "state-changed",

  // Rotation
  NEXT_VISUALIZATION: "next-visualization",
  PREV_VISUALIZATION: "prev-visualization",
  SET_ROTATION: "set-rotation",

  // Display
  SET_DISPLAY_CONFIG: "set-display-config",
  SET_AUDIO_CONFIG: "set-audio-config",
};

// Expose protected methods
try {
  contextBridge.exposeInMainWorld("vizecAPI", {
    // Audio sources
    getAudioSources: () => ipcRenderer.invoke(IPC_CHANNELS.GET_AUDIO_SOURCES),

    getAudioInputDevices: async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices
          .filter((d) => d.kind === "audioinput")
          .map((d) => ({
            id: d.deviceId,
            name: d.label || `Audio Input ${d.deviceId.slice(0, 8)}`,
            type: "audioInput",
          }));
      } catch (error) {
        console.error("Error getting audio input devices:", error);
        return [];
      }
    },

    selectAudioSource: (source: any) =>
      ipcRenderer.send(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, source),
    startCapture: () => ipcRenderer.send(IPC_CHANNELS.START_AUDIO_CAPTURE),
    stopCapture: () => ipcRenderer.send(IPC_CHANNELS.STOP_AUDIO_CAPTURE),

    // Visualizations
    getVisualizations: () => ipcRenderer.invoke(IPC_CHANNELS.GET_VISUALIZATIONS),
    setVisualization: (vizId: string) => ipcRenderer.send(IPC_CHANNELS.SET_VISUALIZATION, vizId),
    updateVisualizationConfig: (config: any) =>
      ipcRenderer.send(IPC_CHANNELS.UPDATE_VISUALIZATION_CONFIG, config),
    registerVisualizations: (metas: any[]) =>
      ipcRenderer.send(IPC_CHANNELS.REGISTER_VISUALIZATIONS, metas),
    onVisualizationsUpdated: (callback: any) => {
      const handler = (_event: any, metas: any[]) => callback(metas);
      ipcRenderer.on(IPC_CHANNELS.VISUALIZATIONS_UPDATED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.VISUALIZATIONS_UPDATED, handler);
    },

    // Presets
    getPresets: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PRESETS),
    loadPreset: (presetId: string) => ipcRenderer.invoke(IPC_CHANNELS.LOAD_PRESET, presetId),
    savePreset: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_PRESET, name),
    deletePreset: (presetId: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_PRESET, presetId),

    // State
    getState: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STATE),
    updateState: (partial: any) => ipcRenderer.send(IPC_CHANNELS.UPDATE_STATE, partial),
    onStateChanged: (callback: any) => {
      const handler = (_event: any, state: any) => callback(state);
      ipcRenderer.on(IPC_CHANNELS.STATE_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.STATE_CHANGED, handler);
    },

    // Navigation
    nextVisualization: () => ipcRenderer.send(IPC_CHANNELS.NEXT_VISUALIZATION),
    prevVisualization: () => ipcRenderer.send(IPC_CHANNELS.PREV_VISUALIZATION),

    // Settings
    setRotation: (rotation: any) => ipcRenderer.send(IPC_CHANNELS.SET_ROTATION, rotation),
    setDisplayConfig: (config: any) => ipcRenderer.send(IPC_CHANNELS.SET_DISPLAY_CONFIG, config),
    setAudioConfig: (config: any) => ipcRenderer.send(IPC_CHANNELS.SET_AUDIO_CONFIG, config),

    // Audio source selected event
    onAudioSourceSelected: (callback: any) => {
      const handler = (_event: any, source: any) => callback(source);
      ipcRenderer.on(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, handler);
    },
  });
  console.log("[Preload] vizecAPI exposed successfully");
} catch (err) {
  console.error("[Preload] Failed to expose API:", err);
}
