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
      id: 'additiveField',
      name: 'Additive Field',
      author: 'Vizec',
      description: 'Floating additive particles that brighten on audio peaks without obscuring the desktop.',
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

    this.register({
      id: 'ribbons',
      name: 'Ribbons',
      author: 'Vizec',
      description: 'Flowing 3D ribbons that undulate through space with audio reactivity',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'plasma',
      name: 'Plasma',
      author: 'Vizec',
      description: 'Classic demoscene plasma effect with sine wave interference patterns',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'voronoi',
      name: 'Voronoi',
      author: 'Vizec',
      description: 'Voronoi diagram with animated seed points reacting to audio',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'fractalTree',
      name: 'Fractal Tree',
      author: 'Vizec',
      description: 'Recursive fractal tree that sways and pulses with audio',
      renderer: 'p5',
      transitionType: 'zoom',
    });

    this.register({
      id: 'waveformRings',
      name: 'Waveform Rings',
      author: 'Vizec',
      description: 'Concentric rings showing waveform that expand on beats',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'galaxy',
      name: 'Galaxy',
      author: 'Vizec',
      description: 'Spiral galaxy made of particles with audio-reactive rotation and brightness',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'bars3d',
      name: '3D Bars',
      author: 'Vizec',
      description: '3D equalizer bars arranged in a cylinder with audio-reactive heights',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'waterfall',
      name: 'Waterfall',
      author: 'Vizec',
      description: 'Scrolling spectrogram/waterfall display showing frequency over time',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'lightning',
      name: 'Lightning',
      author: 'Vizec',
      description: 'Lightning bolts that strike from top on bass hits',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'neuralNetwork',
      name: 'Neural Network',
      author: 'Vizec',
      description: 'Grid of connected nodes that pulse based on frequency data',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'tunnel',
      name: 'Tunnel',
      author: 'Vizec',
      description: 'Flying through an infinite tunnel with concentric shapes',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'geometricPulse',
      name: 'Geometric Pulse',
      author: 'Vizec',
      description: 'Central rotating geometric shape with nested layers that pulse with audio',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'supernova',
      name: 'Supernova',
      author: 'Vizec',
      description: 'Massive stellar explosion with shockwaves, particle trails, and nebula clouds',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'audioTerrain',
      name: 'Audio Terrain',
      author: 'Vizec',
      description: 'Flying over mountains that ARE the music - synthwave terrain flythrough',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'blackHole',
      name: 'Black Hole',
      author: 'Vizec',
      description: 'Cinematic black hole with accretion disk, gravitational lensing, and particle streams',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'fresnelGlow',
      name: 'Fresnel Pulse',
      author: 'Vizec',
      description: 'Transparent fresnel-edged form that glows on loud audio bursts',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'magentaPulse',
      name: 'Magenta Pulse',
      author: 'Vizec',
      description: 'Magenta bursts keyed for overlay transparencies with graceful trails',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'magentaKeyPulse',
      name: 'Magenta Key Pulse',
      author: 'Vizec',
      description: 'Color-keyed magenta bursts that expand and fade with bass hits',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'glitchSpectrum',
      name: 'Glitch Spectrum',
      author: 'Vizec',
      description: 'Frequency bars with intentional glitch effects on bass kicks',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'pulsar',
      name: 'Pulsar',
      author: 'Vizec',
      description: 'Rotating neutron star with sweeping light beams that pulse with the beat',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'starfieldWarp',
      name: 'Starfield Warp',
      author: 'Vizec',
      description: 'Classic hyperspace/warp speed effect with stars streaking past from center',
      renderer: 'canvas2d',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'nebula',
      name: 'Nebula',
      author: 'Vizec',
      description: 'Swirling cosmic gas clouds with particle dust that reacts to audio',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'wormhole',
      name: 'Wormhole',
      author: 'Vizec',
      description: 'Spiraling tunnel through spacetime with camera flying through a twisting vortex',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'cosmicWeb',
      name: 'Cosmic Web',
      author: 'Vizec',
      description: 'Large-scale universe structure with glowing galaxy nodes connected by filaments',
      renderer: 'threejs',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'neonFlowField',
      name: 'Neon Flow Fields',
      author: 'Vizec',
      description: 'Particles following flow vectors determined by audio energy, surging with beats',
      renderer: 'p5',
      transitionType: 'crossfade',
    });

    this.register({
      id: 'hexagonMatrix',
      name: 'Hexagon Matrix',
      author: 'Vizec',
      description: 'Hexagonal grid where cells light up to frequency, with radial bass waves',
      renderer: 'p5',
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
