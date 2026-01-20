import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  AppState,
  AudioConfig,
  AudioSource,
  DisplayConfig,
  Preset,
  RotationConfig,
  SpeechAudioChunk,
  SpeechInitOptions,
  SpeechStatusEvent,
  SpeechTranscriptEvent,
  VisualizationConfig,
  VisualizationMeta,
  WordEvent,
} from "../shared/types";

console.log("[Preload] Script starting...");

// Inline IPC_CHANNELS to avoid module resolution issues
const IPC_CHANNELS = {
  // Audio
  GET_AUDIO_SOURCES: "get-audio-sources",
  START_AUDIO_CAPTURE: "start-audio-capture",
  STOP_AUDIO_CAPTURE: "stop-audio-capture",
  AUDIO_SOURCE_SELECTED: "audio-source-selected",

  // Speech
  SPEECH_INIT: "speech-init",
  SPEECH_ENABLE: "speech-enable",
  SPEECH_DISABLE: "speech-disable",
  SPEECH_AUDIO: "speech-audio",
  SPEECH_STATUS: "speech-status",
  SPEECH_WORD: "speech-word",
  SPEECH_TRANSCRIPT: "speech-transcript",

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
} as const;

type Unsubscribe = () => void;

const vizecAPI: Window["vizecAPI"] = {
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

  selectAudioSource: (source: AudioSource) =>
    ipcRenderer.send(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, source),
  startCapture: () => ipcRenderer.send(IPC_CHANNELS.START_AUDIO_CAPTURE),
  stopCapture: () => ipcRenderer.send(IPC_CHANNELS.STOP_AUDIO_CAPTURE),

  // Speech
  initSpeech: (options: SpeechInitOptions) => ipcRenderer.send(IPC_CHANNELS.SPEECH_INIT, options),
  enableSpeech: () => ipcRenderer.send(IPC_CHANNELS.SPEECH_ENABLE),
  disableSpeech: () => ipcRenderer.send(IPC_CHANNELS.SPEECH_DISABLE),
  sendSpeechAudio: (chunk: SpeechAudioChunk) => ipcRenderer.send(IPC_CHANNELS.SPEECH_AUDIO, chunk),
  onSpeechStatus: (callback: (event: SpeechStatusEvent) => void): Unsubscribe => {
    const handler = (_event: IpcRendererEvent, event: SpeechStatusEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.SPEECH_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SPEECH_STATUS, handler);
  },
  onSpeechWord: (callback: (event: WordEvent) => void): Unsubscribe => {
    const handler = (_event: IpcRendererEvent, event: WordEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.SPEECH_WORD, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SPEECH_WORD, handler);
  },
  onSpeechTranscript: (callback: (event: SpeechTranscriptEvent) => void): Unsubscribe => {
    const handler = (_event: IpcRendererEvent, event: SpeechTranscriptEvent) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.SPEECH_TRANSCRIPT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SPEECH_TRANSCRIPT, handler);
  },

  // Visualizations
  getVisualizations: () => ipcRenderer.invoke(IPC_CHANNELS.GET_VISUALIZATIONS),
  setVisualization: (vizId: string) => ipcRenderer.send(IPC_CHANNELS.SET_VISUALIZATION, vizId),
  updateVisualizationConfig: (config: Partial<VisualizationConfig>) =>
    ipcRenderer.send(IPC_CHANNELS.UPDATE_VISUALIZATION_CONFIG, config),
  registerVisualizations: (metas: VisualizationMeta[]) =>
    ipcRenderer.send(IPC_CHANNELS.REGISTER_VISUALIZATIONS, metas),
  onVisualizationsUpdated: (callback: (metas: VisualizationMeta[]) => void): Unsubscribe => {
    const handler = (_event: IpcRendererEvent, metas: VisualizationMeta[]) => callback(metas);
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
  updateState: (partial: Partial<AppState>) => ipcRenderer.send(IPC_CHANNELS.UPDATE_STATE, partial),
  onStateChanged: (callback: (state: AppState) => void): Unsubscribe => {
    const handler = (_event: IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATE_CHANGED, handler);
  },

  // Navigation
  nextVisualization: () => ipcRenderer.send(IPC_CHANNELS.NEXT_VISUALIZATION),
  prevVisualization: () => ipcRenderer.send(IPC_CHANNELS.PREV_VISUALIZATION),

  // Settings
  setRotation: (rotation: RotationConfig) => ipcRenderer.send(IPC_CHANNELS.SET_ROTATION, rotation),
  setDisplayConfig: (config: DisplayConfig) =>
    ipcRenderer.send(IPC_CHANNELS.SET_DISPLAY_CONFIG, config),
  setAudioConfig: (config: AudioConfig) => ipcRenderer.send(IPC_CHANNELS.SET_AUDIO_CONFIG, config),

  // Audio source selected event
  onAudioSourceSelected: (callback: (source: AudioSource) => void): Unsubscribe => {
    const handler = (_event: IpcRendererEvent, source: AudioSource) => callback(source);
    ipcRenderer.on(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, handler);
  },
};

// Expose protected methods
try {
  contextBridge.exposeInMainWorld("vizecAPI", vizecAPI);
  console.log("[Preload] vizecAPI exposed successfully");
} catch (err) {
  console.error("[Preload] Failed to expose API:", err);
}
