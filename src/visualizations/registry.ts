import { VisualizationMeta } from './types';

// Visualization metadata registry (used in main process)
// The actual visualization classes are only loaded in the renderer

interface VisualizationEntry {
  meta: VisualizationMeta;
}

class VisualizationRegistry {
  private visualizations: Map<string, VisualizationEntry> = new Map();

  constructor() {
    // Register built-in visualizations
    this.register({
      id: 'frequencyBars',
      name: 'Frequency Bars',
      author: 'Vizec',
      description: 'Classic frequency spectrum with vertical bars',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'particleStorm',
      name: 'Particle Storm',
      author: 'Vizec',
      description: '3D particles that react to audio',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'circularWave',
      name: 'Circular Waveform',
      author: 'Vizec',
      description: 'Circular oscilloscope with geometric patterns',
      renderer: 'p5',
      transitionType: 'zoom',
    });

    this.register({
      id: 'spectrumTunnel',
      name: 'Spectrum Tunnel',
      author: 'Vizec',
      description: 'Spectrum tunnel with geometric patterns',
      renderer: 'webgl',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'beatPulseRings',
      name: 'Beat Pulse Rings',
      author: 'Vizec',
      description: 'Concentric rings that pulse outward on beats',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'oscilloscope',
      name: 'Oscilloscope',
      author: 'Vizec',
      description: 'Classic oscilloscope waveform display',
      renderer: 'canvas2d',
      transitionType: 'cut',
    });

    this.register({
      id: 'audioMesh',
      name: 'Audio Mesh',
      author: 'Vizec',
      description: 'A grid mesh that deforms like water based on audio',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'spectrumCircle',
      name: 'Spectrum Circle',
      author: 'Vizec',
      description: 'Frequency bars arranged in a circle like a sun',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'starfield',
      name: 'Starfield',
      author: 'Vizec',
      description: 'Stars flying through space, speed based on audio',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'kaleidoscope',
      name: 'Kaleidoscope',
      author: 'Vizec',
      description: 'Mirrored geometric patterns that morph with audio',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'matrixRain',
      name: 'Matrix Rain',
      author: 'Vizec',
      description: 'Falling code like The Matrix, reactive to audio',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'neonGrid',
      name: 'Neon Grid',
      author: 'Vizec',
      description: '80s retro synthwave grid with audio-reactive mountains',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'fireworks',
      name: 'Fireworks',
      author: 'Vizec',
      description: 'Fireworks that launch and explode on beats',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'waveformTerrain',
      name: 'Waveform Terrain',
      author: 'Vizec',
      description: 'Scrolling pseudo-3D terrain where audio waveform shapes mountain ridges',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'laserScanner',
      name: 'Laser Scanner',
      author: 'Vizec',
      description: 'Horizontal scanning lines that sweep up/down with glow effect',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'dnaHelix',
      name: 'DNA Helix',
      author: 'Vizec',
      description: 'Double helix rotating around vertical center axis with audio-reactive pulsing',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'spiralWaveform',
      name: 'Spiral Waveform',
      author: 'Vizec',
      description: 'Waveform drawn as an expanding spiral from center',
      renderer: 'p5',
      transitionType: 'zoom',
    });

    this.register({
      id: 'lissajous',
      name: 'Lissajous Curves',
      author: 'Vizec',
      description: 'Classic Lissajous curves with audio-reactive frequency ratios',
      renderer: 'p5',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'audioSphere',
      name: 'Audio Sphere',
      author: 'Vizec',
      description: 'Glowing wireframe sphere with frequency-based vertex displacement',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'cubeField',
      name: 'Cube Field',
      author: 'Vizec',
      description: 'Grid of cubes that react to frequency data',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });
  }

  register(meta: VisualizationMeta): void {
    this.visualizations.set(meta.id, { meta });
  }

  getMeta(id: string): VisualizationMeta | null {
    const entry = this.visualizations.get(id);
    return entry ? entry.meta : null;
  }

  getAllMeta(): VisualizationMeta[] {
    return Array.from(this.visualizations.values()).map((e) => e.meta);
  }

  getIds(): string[] {
    return Array.from(this.visualizations.keys());
  }
}

export const visualizationRegistry = new VisualizationRegistry();
