import { ipcMain, desktopCapturer } from "electron";
import {
  IPC_CHANNELS,
  AudioConfig,
  AudioSource,
  DisplayConfig,
  Preset,
  RotationConfig,
  SpeechAudioChunk,
  SpeechInitOptions,
  VisualizationConfig,
  VisualizationMeta,
} from "../../shared/types";
import {
  getAppState,
  updateAppState,
  getPresetManager,
  getVisualizerWindow,
  getControlWindow,
} from "../index";
import { getSpeechSidecar } from "../speech/sidecar";
import { visualizationRegistry } from "../registry";

export function setupIpcHandlers() {
  console.log("Setting up IPC handlers...");

  const getSpeechSidecarSafe = () => {
    try {
      return getSpeechSidecar();
    } catch {
      return null;
    }
  };

  // Get available audio sources
  ipcMain.handle(IPC_CHANNELS.GET_AUDIO_SOURCES, async (): Promise<AudioSource[]> => {
    console.log("IPC: GET_AUDIO_SOURCES called");
    try {
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
        fetchWindowIcons: true,
      });

      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        type: source.id.startsWith("screen") ? "screen" : "window",
      }));
    } catch (error) {
      console.error("Error getting audio sources:", error);
      return [];
    }
  });

  // Audio source selected - notify visualizer window
  ipcMain.on(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, (event, source: AudioSource) => {
    console.log("IPC: AUDIO_SOURCE_SELECTED", source);
    updateAppState({ audioSource: source });
    const visualizer = getVisualizerWindow();
    if (visualizer && !visualizer.isDestroyed()) {
      visualizer.webContents.send(IPC_CHANNELS.AUDIO_SOURCE_SELECTED, source);
    }
  });

  // Start/stop audio capture
  ipcMain.on(IPC_CHANNELS.START_AUDIO_CAPTURE, () => {
    console.log("IPC: START_AUDIO_CAPTURE");
    updateAppState({ isCapturing: true });
  });

  ipcMain.on(IPC_CHANNELS.STOP_AUDIO_CAPTURE, () => {
    console.log("IPC: STOP_AUDIO_CAPTURE");
    updateAppState({ isCapturing: false });
  });

  // Speech control
  ipcMain.on(IPC_CHANNELS.SPEECH_INIT, (_event, options: SpeechInitOptions) => {
    const sidecar = getSpeechSidecarSafe();
    if (!sidecar) return;
    sidecar.init(options);
  });

  ipcMain.on(IPC_CHANNELS.SPEECH_ENABLE, () => {
    const sidecar = getSpeechSidecarSafe();
    if (!sidecar) return;
    sidecar.enable();
  });

  ipcMain.on(IPC_CHANNELS.SPEECH_DISABLE, () => {
    const sidecar = getSpeechSidecarSafe();
    if (!sidecar) return;
    sidecar.disable();
  });

  ipcMain.on(IPC_CHANNELS.SPEECH_AUDIO, (_event, chunk: SpeechAudioChunk) => {
    const sidecar = getSpeechSidecarSafe();
    if (!sidecar) return;
    const samples = resolveSamples(chunk.samples);
    if (!samples) return;
    if (typeof chunk.sampleRate !== "number" || !Number.isFinite(chunk.sampleRate)) return;
    sidecar.sendAudio(samples, chunk.sampleRate);
  });

  // Register visualizations (from Renderer)
  ipcMain.on(IPC_CHANNELS.REGISTER_VISUALIZATIONS, (event, metas: VisualizationMeta[]) => {
    console.log(`IPC: REGISTER_VISUALIZATIONS received ${metas.length} items`);
    visualizationRegistry.registerMany(metas);

    // Broadcast update to all windows (specifically Control window)
    const control = getControlWindow();
    if (control && !control.isDestroyed()) {
      console.log("Broadcasting VISUALIZATIONS_UPDATED to control window");
      control.webContents.send(IPC_CHANNELS.VISUALIZATIONS_UPDATED, metas);
    }
  });

  // Get available visualizations
  ipcMain.handle(IPC_CHANNELS.GET_VISUALIZATIONS, () => {
    console.log("IPC: GET_VISUALIZATIONS called");
    const metas = visualizationRegistry.getAllMeta();
    console.log(`Returning ${metas.length} visualizations`);
    return metas;
  });

  // Set current visualization
  ipcMain.on(IPC_CHANNELS.SET_VISUALIZATION, (event, vizId: string) => {
    console.log("IPC: SET_VISUALIZATION", vizId);
    updateAppState({ currentVisualization: vizId });
  });

  // Update visualization config
  ipcMain.on(
    IPC_CHANNELS.UPDATE_VISUALIZATION_CONFIG,
    (event, config: Partial<VisualizationConfig>) => {
      const state = getAppState();
      updateAppState({
        visualizationConfig: { ...state.visualizationConfig, ...config },
      });
    },
  );

  // Preset management
  ipcMain.handle(IPC_CHANNELS.GET_PRESETS, (): Preset[] => {
    console.log("IPC: GET_PRESETS called");
    const presets = getPresetManager().getAllPresets();
    console.log(`Returning ${presets.length} presets`);
    return presets;
  });

  ipcMain.handle(IPC_CHANNELS.LOAD_PRESET, (event, presetId: string): Preset | null => {
    console.log("IPC: LOAD_PRESET", presetId);
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
    console.log("IPC: GET_STATE called");
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
    const currentIndex = allViz.findIndex(
      (v: VisualizationMeta) => v.id === state.currentVisualization,
    );
    let nextIndex: number;

    if (state.rotation.order === "random") {
      nextIndex = Math.floor(Math.random() * allViz.length);
    } else {
      nextIndex = (currentIndex + 1) % allViz.length;
    }

    updateAppState({ currentVisualization: allViz[nextIndex].id });
  });

  ipcMain.on(IPC_CHANNELS.PREV_VISUALIZATION, () => {
    const state = getAppState();
    const allViz = visualizationRegistry.getAllMeta();
    const currentIndex = allViz.findIndex(
      (v: VisualizationMeta) => v.id === state.currentVisualization,
    );
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

function resolveSamples(value: unknown): Float32Array | null {
  if (value instanceof Float32Array) return value;
  if (value instanceof ArrayBuffer) return new Float32Array(value);
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Float32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  if (Array.isArray(value)) return Float32Array.from(value);
  if (isRecord(value) && Array.isArray(value.data)) return Float32Array.from(value.data);
  return null;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}
