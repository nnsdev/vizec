import { ipcMain, desktopCapturer } from 'electron';
import { 
  IPC_CHANNELS, 
  AudioSource, 
  Preset,
  AudioConfig,
  DisplayConfig,
  RotationConfig,
  VisualizationConfig
} from '../../shared/types';
import { 
  getAppState, 
  updateAppState, 
  getPresetManager,
  getVisualizerWindow,
  getControlWindow
} from '../index';
import { visualizationRegistry } from '../../visualizations/registry';

export function setupIpcHandlers() {
  // Get available audio sources
  ipcMain.handle(IPC_CHANNELS.GET_AUDIO_SOURCES, async (): Promise<AudioSource[]> => {
    try {
      const sources = await desktopCapturer.getSources({ 
        types: ['screen', 'window'],
        fetchWindowIcons: true 
      });
      
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith('screen') ? 'screen' : 'window',
      }));
    } catch (error) {
      console.error('Error getting audio sources:', error);
      return [];
    }
  });

  // Audio source selected - notify visualizer window
  ipcMain.on(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, (event, source: AudioSource) => {
    updateAppState({ audioSource: source });
    const visualizer = getVisualizerWindow();
    if (visualizer && !visualizer.isDestroyed()) {
      visualizer.webContents.send(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, source);
    }
  });

  // Start/stop audio capture
  ipcMain.on(IPC_CHANNELS.START_AUDIO_CAPTURE, () => {
    updateAppState({ isCapturing: true });
  });

  ipcMain.on(IPC_CHANNELS.STOP_AUDIO_CAPTURE, () => {
    updateAppState({ isCapturing: false });
  });

  // Get available visualizations
  ipcMain.handle(IPC_CHANNELS.GET_VISUALIZATIONS, () => {
    return visualizationRegistry.getAllMeta();
  });

  // Set current visualization
  ipcMain.on(IPC_CHANNELS.SET_VISUALIZATION, (event, vizId: string) => {
    updateAppState({ currentVisualization: vizId });
  });

  // Update visualization config
  ipcMain.on(IPC_CHANNELS.UPDATE_VISUALIZATION_CONFIG, (event, config: Partial<VisualizationConfig>) => {
    const state = getAppState();
    updateAppState({ 
      visualizationConfig: { ...state.visualizationConfig, ...config } 
    });
  });

  // Preset management
  ipcMain.handle(IPC_CHANNELS.GET_PRESETS, (): Preset[] => {
    return getPresetManager().getAllPresets();
  });

  ipcMain.handle(IPC_CHANNELS.LOAD_PRESET, (event, presetId: string): Preset | null => {
    const preset = getPresetManager().getPreset(presetId);
    if (preset) {
      updateAppState({
        currentPreset: preset.id,
        currentVisualization: preset.visualization,
        visualizationConfig: preset.visualizationConfig,
        audioConfig: preset.audioConfig,
        displayConfig: preset.displayConfig,
        rotation: preset.rotation,
      });
    }
    return preset;
  });

  ipcMain.handle(IPC_CHANNELS.SAVE_PRESET, async (event, name: string): Promise<Preset> => {
    const state = getAppState();
    const preset = await getPresetManager().savePreset(name, {
      visualization: state.currentVisualization,
      visualizationConfig: state.visualizationConfig,
      audioConfig: state.audioConfig,
      displayConfig: state.displayConfig,
      rotation: state.rotation,
    });
    updateAppState({ currentPreset: preset.id });
    return preset;
  });

  ipcMain.handle(IPC_CHANNELS.DELETE_PRESET, async (event, presetId: string): Promise<boolean> => {
    const success = await getPresetManager().deletePreset(presetId);
    if (success && getAppState().currentPreset === presetId) {
      updateAppState({ currentPreset: null });
    }
    return success;
  });

  // Get current state
  ipcMain.handle(IPC_CHANNELS.GET_STATE, () => {
    return getAppState();
  });

  // Update state
  ipcMain.on(IPC_CHANNELS.UPDATE_STATE, (event, partial) => {
    updateAppState(partial);
  });

  // Navigation
  ipcMain.on(IPC_CHANNELS.NEXT_VISUALIZATION, () => {
    const state = getAppState();
    const allViz = visualizationRegistry.getAllMeta();
    const currentIndex = allViz.findIndex(v => v.id === state.currentVisualization);
    let nextIndex: number;
    
    if (state.rotation.order === 'random') {
      nextIndex = Math.floor(Math.random() * allViz.length);
    } else {
      nextIndex = (currentIndex + 1) % allViz.length;
    }
    
    updateAppState({ currentVisualization: allViz[nextIndex].id });
  });

  ipcMain.on(IPC_CHANNELS.PREV_VISUALIZATION, () => {
    const state = getAppState();
    const allViz = visualizationRegistry.getAllMeta();
    const currentIndex = allViz.findIndex(v => v.id === state.currentVisualization);
    const prevIndex = (currentIndex - 1 + allViz.length) % allViz.length;
    
    updateAppState({ currentVisualization: allViz[prevIndex].id });
  });

  // Rotation settings
  ipcMain.on(IPC_CHANNELS.SET_ROTATION, (event, rotation: RotationConfig) => {
    updateAppState({ rotation });
  });

  // Display config
  ipcMain.on(IPC_CHANNELS.SET_DISPLAY_CONFIG, (event, displayConfig: DisplayConfig) => {
    updateAppState({ displayConfig });
  });

  // Audio config
  ipcMain.on(IPC_CHANNELS.SET_AUDIO_CONFIG, (event, audioConfig: AudioConfig) => {
    updateAppState({ audioConfig });
  });
}
