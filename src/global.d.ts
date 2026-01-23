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
} from "./shared/types";

// Allow wildcard imports for esbuild-plugin-import-glob
declare module "*.ts" {
  const modules: unknown[];
  export default modules;
}

interface VizecAPI {
  getAudioSources: () => Promise<AudioSource[]>;
  getAudioInputDevices: () => Promise<AudioSource[]>;
  selectAudioSource: (source: AudioSource) => void;
  startCapture: () => void;
  stopCapture: () => void;
  getVisualizations: () => Promise<VisualizationMeta[]>;
  setVisualization: (vizId: string) => void;
  updateVisualizationConfig: (config: Partial<VisualizationConfig>) => void;
  registerVisualizations: (metas: VisualizationMeta[]) => void;
  onVisualizationsUpdated: (callback: (metas: VisualizationMeta[]) => void) => () => void;
  getPresets: () => Promise<Preset[]>;
  loadPreset: (presetId: string) => Promise<Preset | null>;
  savePreset: (name: string) => Promise<Preset>;
  deletePreset: (presetId: string) => Promise<boolean>;
  getState: () => Promise<AppState>;
  updateState: (partial: Partial<AppState>) => void;
  onStateChanged: (callback: (state: AppState) => void) => () => void;
  nextVisualization: () => void;
  prevVisualization: () => void;
  resetRandomRotationPool: () => void;
  setRotation: (rotation: RotationConfig) => void;
  setDisplayConfig: (config: DisplayConfig) => void;
  setAudioConfig: (config: AudioConfig) => void;
  onAudioSourceSelected: (callback: (source: AudioSource) => void) => () => void;
  initSpeech: (options: SpeechInitOptions) => void;
  enableSpeech: () => void;
  disableSpeech: () => void;
  sendSpeechAudio: (chunk: SpeechAudioChunk) => void;
  onSpeechStatus: (callback: (event: SpeechStatusEvent) => void) => () => void;
  onSpeechWord: (callback: (event: WordEvent) => void) => () => void;
  onSpeechTranscript: (callback: (event: SpeechTranscriptEvent) => void) => () => void;
}

declare global {
  interface Window {
    vizecAPI: VizecAPI;
  }
}

export {};
