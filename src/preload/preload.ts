import { contextBridge, ipcRenderer } from 'electron';
import { 
  IPC_CHANNELS, 
  AudioSource, 
  Preset, 
  AppState,
  AudioConfig,
  DisplayConfig,
  RotationConfig,
  VisualizationConfig,
  VisualizationMeta
} from '../shared/types';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('vizecAPI', {
  // Audio sources
  getAudioSources: (): Promise<AudioSource[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_AUDIO_SOURCES),
  
  // Get audio input devices (Stereo Mix, Virtual Audio Cable, etc.)
  getAudioInputDevices: async (): Promise<AudioSource[]> => {
    try {
      // Request permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          name: d.label || `Audio Input ${d.deviceId.slice(0, 8)}`,
          type: 'audioInput' as const,
        }));
    } catch (error) {
      console.error('Error getting audio input devices:', error);
      return [];
    }
  },
  
  selectAudioSource: (source: AudioSource): void => 
    ipcRenderer.send(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, source),
  
  startCapture: (): void => 
    ipcRenderer.send(IPC_CHANNELS.START_AUDIO_CAPTURE),
  
  stopCapture: (): void => 
    ipcRenderer.send(IPC_CHANNELS.STOP_AUDIO_CAPTURE),

  // Visualizations
  getVisualizations: (): Promise<VisualizationMeta[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_VISUALIZATIONS),
  
  setVisualization: (vizId: string): void => 
    ipcRenderer.send(IPC_CHANNELS.SET_VISUALIZATION, vizId),
  
  updateVisualizationConfig: (config: Partial<VisualizationConfig>): void => 
    ipcRenderer.send(IPC_CHANNELS.UPDATE_VISUALIZATION_CONFIG, config),

  // Presets
  getPresets: (): Promise<Preset[]> => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_PRESETS),
  
  loadPreset: (presetId: string): Promise<Preset | null> => 
    ipcRenderer.invoke(IPC_CHANNELS.LOAD_PRESET, presetId),
  
  savePreset: (name: string): Promise<Preset> => 
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_PRESET, name),
  
  deletePreset: (presetId: string): Promise<boolean> => 
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_PRESET, presetId),

  // State
  getState: (): Promise<AppState> => 
    ipcRenderer.invoke(IPC_CHANNELS.GET_STATE),
  
  updateState: (partial: Partial<AppState>): void => 
    ipcRenderer.send(IPC_CHANNELS.UPDATE_STATE, partial),
  
  onStateChanged: (callback: (state: AppState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, state: AppState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.STATE_CHANGED, handler);
  },

  // Navigation
  nextVisualization: (): void => 
    ipcRenderer.send(IPC_CHANNELS.NEXT_VISUALIZATION),
  
  prevVisualization: (): void => 
    ipcRenderer.send(IPC_CHANNELS.PREV_VISUALIZATION),

  // Settings
  setRotation: (rotation: RotationConfig): void => 
    ipcRenderer.send(IPC_CHANNELS.SET_ROTATION, rotation),
  
  setDisplayConfig: (config: DisplayConfig): void => 
    ipcRenderer.send(IPC_CHANNELS.SET_DISPLAY_CONFIG, config),
  
  setAudioConfig: (config: AudioConfig): void => 
    ipcRenderer.send(IPC_CHANNELS.SET_AUDIO_CONFIG, config),

  // Audio source selected event (for visualizer window)
  onAudioSourceSelected: (callback: (source: AudioSource) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, source: AudioSource) => callback(source);
    ipcRenderer.on(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, handler);
  },
});

// Type declaration for the exposed API
export interface VizecAPI {
  getAudioSources(): Promise<AudioSource[]>;
  getAudioInputDevices(): Promise<AudioSource[]>;
  selectAudioSource(source: AudioSource): void;
  startCapture(): void;
  stopCapture(): void;
  getVisualizations(): Promise<VisualizationMeta[]>;
  setVisualization(vizId: string): void;
  updateVisualizationConfig(config: Partial<VisualizationConfig>): void;
  getPresets(): Promise<Preset[]>;
  loadPreset(presetId: string): Promise<Preset | null>;
  savePreset(name: string): Promise<Preset>;
  deletePreset(presetId: string): Promise<boolean>;
  getState(): Promise<AppState>;
  updateState(partial: Partial<AppState>): void;
  onStateChanged(callback: (state: AppState) => void): () => void;
  nextVisualization(): void;
  prevVisualization(): void;
  setRotation(rotation: RotationConfig): void;
  setDisplayConfig(config: DisplayConfig): void;
  setAudioConfig(config: AudioConfig): void;
  onAudioSourceSelected(callback: (source: AudioSource) => void): () => void;
}

declare global {
  interface Window {
    vizecAPI: VizecAPI;
  }
}
