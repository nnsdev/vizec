import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { Preset, VisualizationConfig, AudioConfig, DisplayConfig, RotationConfig } from '../../shared/types';

interface PresetData {
  visualization: string;
  visualizationConfig: VisualizationConfig;
  audioConfig: AudioConfig;
  displayConfig: DisplayConfig;
  rotation: RotationConfig;
}

// Built-in presets
const BUILTIN_PRESETS: Preset[] = [
  {
    id: 'dark-techno',
    name: 'Dark Techno',
    builtin: true,
    visualization: 'frequencyBars',
    visualizationConfig: {
      sensitivity: 1.0,
      colorScheme: 'darkTechno',
      barCount: 64,
      glow: true,
      mirror: true,
    },
    audioConfig: {
      sensitivity: 0.7,
      smoothing: 0.85,
    },
    displayConfig: {
      background: 'transparent',
    },
    rotation: {
      enabled: false,
      interval: 30,
      order: 'sequential',
      randomizeColors: false,
      randomizeAll: false,
    },
  },
  {
    id: 'rave',
    name: 'Rave',
    builtin: true,
    visualization: 'frequencyBars',
    visualizationConfig: {
      sensitivity: 1.4,
      colorScheme: 'neon',
      barCount: 128,
      glow: true,
      mirror: false,
    },
    audioConfig: {
      sensitivity: 1.2,
      smoothing: 0.6,
    },
    displayConfig: {
      background: 'transparent',
    },
    rotation: {
      enabled: true,
      interval: 20,
      order: 'random',
      randomizeColors: true,
      randomizeAll: true,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    builtin: true,
    visualization: 'frequencyBars',
    visualizationConfig: {
      sensitivity: 0.8,
      colorScheme: 'monochrome',
      barCount: 32,
      glow: false,
      mirror: false,
    },
    audioConfig: {
      sensitivity: 0.6,
      smoothing: 0.9,
    },
    displayConfig: {
      background: 'transparent',
    },
    rotation: {
      enabled: false,
      interval: 30,
      order: 'sequential',
      randomizeColors: false,
      randomizeAll: false,
    },
  },
  {
    id: 'acid',
    name: 'Acid',
    builtin: true,
    visualization: 'frequencyBars',
    visualizationConfig: {
      sensitivity: 1.2,
      colorScheme: 'acid',
      barCount: 48,
      glow: true,
      mirror: true,
    },
    audioConfig: {
      sensitivity: 1.0,
      smoothing: 0.75,
    },
    displayConfig: {
      background: 'transparent',
    },
    rotation: {
      enabled: false,
      interval: 30,
      order: 'sequential',
      randomizeColors: false,
      randomizeAll: false,
    },
  },
];

export class PresetManager {
  private presets: Map<string, Preset> = new Map();
  private userPresetsPath: string;

  constructor() {
    this.userPresetsPath = path.join(app.getPath('userData'), 'presets.json');
  }

  async init(): Promise<void> {
    // Load built-in presets
    BUILTIN_PRESETS.forEach(preset => {
      this.presets.set(preset.id, preset);
    });

    // Load user presets
    await this.loadUserPresets();
  }

  private async loadUserPresets(): Promise<void> {
    try {
      if (fs.existsSync(this.userPresetsPath)) {
        const data = fs.readFileSync(this.userPresetsPath, 'utf-8');
        const userPresets: Preset[] = JSON.parse(data);
        userPresets.forEach(preset => {
          this.presets.set(preset.id, preset);
        });
      }
    } catch (error) {
      console.error('Error loading user presets:', error);
    }
  }

  private async saveUserPresets(): Promise<void> {
    try {
      const userPresets = Array.from(this.presets.values()).filter(p => !p.builtin);
      fs.writeFileSync(this.userPresetsPath, JSON.stringify(userPresets, null, 2));
    } catch (error) {
      console.error('Error saving user presets:', error);
    }
  }

  getAllPresets(): Preset[] {
    return Array.from(this.presets.values());
  }

  getPreset(id: string): Preset | null {
    return this.presets.get(id) || null;
  }

  async savePreset(name: string, data: PresetData): Promise<Preset> {
    const id = this.generateId(name);
    const preset: Preset = {
      id,
      name,
      builtin: false,
      ...data,
    };
    
    this.presets.set(id, preset);
    await this.saveUserPresets();
    
    return preset;
  }

  async deletePreset(id: string): Promise<boolean> {
    const preset = this.presets.get(id);
    if (!preset || preset.builtin) {
      return false;
    }
    
    this.presets.delete(id);
    await this.saveUserPresets();
    
    return true;
  }

  private generateId(name: string): string {
    const baseId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let id = baseId;
    let counter = 1;
    
    while (this.presets.has(id)) {
      id = `${baseId}-${counter}`;
      counter++;
    }
    
    return id;
  }
}
