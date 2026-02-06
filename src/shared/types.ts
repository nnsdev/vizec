// Shared types used across main and renderer processes

export interface WordEvent {
  word: string;
  timestamp: number;
  confidence: number;
}

export interface SpeechData {
  /** Most recent words detected (last ~3 seconds) */
  recentWords: WordEvent[];
  /** Current word being displayed (for visualizations) */
  currentWord: string | null;
  /** Full recent transcript */
  transcript: string;
  /** Whether speech recognition is active */
  isActive: boolean;
}

export interface SpeechStatusEvent {
  status: string;
  progress?: number;
  message?: string;
}

export interface SpeechTranscriptEvent {
  text: string;
  words: WordEvent[];
  timestamp: number;
}

export interface SpeechInitOptions {
  model: string;
  language?: string;
  demucsModel?: string;
  segmentSeconds?: number;
  stepSeconds?: number;
}

export interface SpeechAudioChunk {
  samples: Float32Array;
  sampleRate: number;
}

export interface AudioData {
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  volume: number;
  bass: number;
  mid: number;
  treble: number;
  /** Optional speech recognition data */
  speech?: SpeechData;
}

export interface VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  [key: string]: unknown;
}

export interface ConfigField {
  type: 'number' | 'boolean' | 'select' | 'color';
  label: string;
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
}

export interface ConfigSchema {
  [key: string]: ConfigField;
}

export interface VisualizationMeta {
  id: string;
  name: string;
  author?: string;
  description?: string;
  renderer: 'canvas2d' | 'webgl' | 'p5' | 'threejs';
  transitionType: 'crossfade' | 'cut' | 'zoom';
  usesSpeech?: boolean;
}

export interface Visualization extends VisualizationMeta {
  init(container: any, config: VisualizationConfig): void;
  render(audioData: AudioData, deltaTime: number): void;
  resize(width: number, height: number): void;
  updateConfig(config: Partial<VisualizationConfig>): void;
  destroy(): void;
  getConfigSchema(): ConfigSchema;
}

export interface AudioConfig {
  sensitivity: number;
  smoothing: number;
}

export interface DisplayConfig {
  background: 'transparent' | 'solid';
}

export interface RotationConfig {
  enabled: boolean;
  interval: number;
  order: 'sequential' | 'random';
  randomizeColors: boolean;
  randomizeAll: boolean;
}

export interface Preset {
  id: string;
  name: string;
  builtin: boolean;
  visualization: string;
  visualizationConfig: VisualizationConfig;
  audioConfig: AudioConfig;
  displayConfig: DisplayConfig;
  rotation: RotationConfig;
}

export interface AudioSource {
  id: string;
  name: string;
  type: 'screen' | 'window' | 'audio' | 'audioInput';
}

export interface AppState {
  audioSource: AudioSource | null;
  isCapturing: boolean;
  currentVisualization: string;
  hideSpeechVisualizations: boolean;
  currentPreset: string | null;
  audioConfig: AudioConfig;
  displayConfig: DisplayConfig;
  rotation: RotationConfig;
  visualizationConfig: VisualizationConfig;
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Audio
  GET_AUDIO_SOURCES: 'get-audio-sources',
  START_AUDIO_CAPTURE: 'start-audio-capture',
  STOP_AUDIO_CAPTURE: 'stop-audio-capture',
  AUDIO_SOURCE_SELECTED: 'audio-source-selected',

  // Speech
  SPEECH_INIT: 'speech-init',
  SPEECH_ENABLE: 'speech-enable',
  SPEECH_DISABLE: 'speech-disable',
  SPEECH_AUDIO: 'speech-audio',
  SPEECH_STATUS: 'speech-status',
  SPEECH_WORD: 'speech-word',
  SPEECH_TRANSCRIPT: 'speech-transcript',

  // Visualization
  GET_VISUALIZATIONS: 'get-visualizations',
  SET_VISUALIZATION: 'set-visualization',
  UPDATE_VISUALIZATION_CONFIG: 'update-visualization-config',
  REGISTER_VISUALIZATIONS: 'register-visualizations',
  VISUALIZATIONS_UPDATED: 'visualizations-updated',

  // Presets
  GET_PRESETS: 'get-presets',
  LOAD_PRESET: 'load-preset',
  SAVE_PRESET: 'save-preset',
  DELETE_PRESET: 'delete-preset',

  // State
  GET_STATE: 'get-state',
  UPDATE_STATE: 'update-state',
  STATE_CHANGED: 'state-changed',

  // Rotation
  NEXT_VISUALIZATION: 'next-visualization',
  PREV_VISUALIZATION: 'prev-visualization',
  SET_ROTATION: 'set-rotation',
  RESET_RANDOM_ROTATION_POOL: 'reset-random-rotation-pool',

  // Display
  SET_DISPLAY_CONFIG: 'set-display-config',
  SET_AUDIO_CONFIG: 'set-audio-config',
} as const;
