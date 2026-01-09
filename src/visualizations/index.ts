// Visualization exports for renderer usage
export { FrequencyBarsVisualization } from './canvas/frequencyBars';
export { GlitchSpectrumVisualization } from './canvas/glitchSpectrum';
export { BeatPulseRingsVisualization } from './canvas/beatPulseRings';
export { OscilloscopeVisualization } from './canvas/oscilloscope';
export { SpectrumCircleVisualization } from './canvas/spectrumCircle';
export { StarfieldVisualization } from './canvas/starfield';
export { KaleidoscopeVisualization } from './canvas/kaleidoscope';
export { MatrixRainVisualization } from './canvas/matrixRain';
export { NeonGridVisualization } from './canvas/neonGrid';
export { FireworksVisualization } from './canvas/fireworks';
export { WaveformTerrainVisualization } from './canvas/waveformTerrain';
export { LaserScannerVisualization } from './canvas/laserScanner';
export { DNAHelixVisualization } from './canvas/dnaHelix';
export { PlasmaVisualization } from './canvas/plasma';
export { VoronoiVisualization } from './canvas/voronoi';
export { ParticleStormVisualization } from './webgl/particleStorm';
export { SpectrumTunnelVisualization } from './webgl/spectrumTunnel';
export { AudioMeshVisualization } from './webgl/audioMesh';
export { AudioSphereVisualization } from './webgl/audioSphere';
export { CubeFieldVisualization } from './webgl/cubeField';
export { RibbonsVisualization } from './webgl/ribbons';
export { GalaxyVisualization } from './webgl/galaxy';
export { Bars3DVisualization } from './webgl/bars3d';
export { SupernovaVisualization } from './webgl/supernova';
export { AudioTerrainVisualization } from './webgl/audioTerrain';
export { BlackHoleVisualization } from './webgl/blackHole';
export { CircularWaveVisualization } from './p5/circularWave';
export { NeonFlowFieldVisualization } from './p5/neonFlowField';
export { HexagonMatrixVisualization } from './p5/hexagonMatrix';
export { SpiralWaveformVisualization } from './p5/spiralWaveform';
export { LissajousVisualization } from './p5/lissajous';
export { FractalTreeVisualization } from './p5/fractalTree';
export { WaveformRingsVisualization } from './canvas/waveformRings';
export { WaterfallVisualization } from './canvas/waterfall';
export { LightningVisualization } from './canvas/lightning';
export { NeuralNetworkVisualization } from './canvas/neuralNetwork';
export { TunnelVisualization } from './canvas/tunnel';
export { GeometricPulseVisualization } from './canvas/geometricPulse';
export { PulsarVisualization } from './canvas/pulsar';
export { StarfieldWarpVisualization } from './canvas/starfieldWarp';
export { NebulaVisualization } from './webgl/nebula';
export { WormholeVisualization } from './webgl/wormhole';
export { CosmicWebVisualization } from './webgl/cosmicWeb';
export { FresnelGlowVisualization } from './webgl/fresnelGlow';
export { AdditiveFieldVisualization } from './webgl/additiveField';
export { MagentaPulseVisualization } from './canvas/magentaPulse';
export { MagentaKeyPulseVisualization } from './canvas/magentaKeyPulse';

import { Visualization } from './types';
import { FrequencyBarsVisualization } from './canvas/frequencyBars';
import { GlitchSpectrumVisualization } from './canvas/glitchSpectrum';
import { BeatPulseRingsVisualization } from './canvas/beatPulseRings';
import { OscilloscopeVisualization } from './canvas/oscilloscope';
import { SpectrumCircleVisualization } from './canvas/spectrumCircle';
import { StarfieldVisualization } from './canvas/starfield';
import { KaleidoscopeVisualization } from './canvas/kaleidoscope';
import { MatrixRainVisualization } from './canvas/matrixRain';
import { NeonGridVisualization } from './canvas/neonGrid';
import { FireworksVisualization } from './canvas/fireworks';
import { WaveformTerrainVisualization } from './canvas/waveformTerrain';
import { LaserScannerVisualization } from './canvas/laserScanner';
import { DNAHelixVisualization } from './canvas/dnaHelix';
import { PlasmaVisualization } from './canvas/plasma';
import { VoronoiVisualization } from './canvas/voronoi';
import { ParticleStormVisualization } from './webgl/particleStorm';
import { SpectrumTunnelVisualization } from './webgl/spectrumTunnel';
import { AudioMeshVisualization } from './webgl/audioMesh';
import { AudioSphereVisualization } from './webgl/audioSphere';
import { CubeFieldVisualization } from './webgl/cubeField';
import { RibbonsVisualization } from './webgl/ribbons';
import { GalaxyVisualization } from './webgl/galaxy';
import { Bars3DVisualization } from './webgl/bars3d';
import { SupernovaVisualization } from './webgl/supernova';
import { AudioTerrainVisualization } from './webgl/audioTerrain';
import { BlackHoleVisualization } from './webgl/blackHole';
import { CircularWaveVisualization } from './p5/circularWave';
import { NeonFlowFieldVisualization } from './p5/neonFlowField';
import { HexagonMatrixVisualization } from './p5/hexagonMatrix';
import { SpiralWaveformVisualization } from './p5/spiralWaveform';
import { LissajousVisualization } from './p5/lissajous';
import { FractalTreeVisualization } from './p5/fractalTree';
import { WaveformRingsVisualization } from './canvas/waveformRings';
import { WaterfallVisualization } from './canvas/waterfall';
import { LightningVisualization } from './canvas/lightning';
import { NeuralNetworkVisualization } from './canvas/neuralNetwork';
import { TunnelVisualization } from './canvas/tunnel';
import { GeometricPulseVisualization } from './canvas/geometricPulse';
import { PulsarVisualization } from './canvas/pulsar';
import { StarfieldWarpVisualization } from './canvas/starfieldWarp';
import { NebulaVisualization } from './webgl/nebula';
import { WormholeVisualization } from './webgl/wormhole';
import { CosmicWebVisualization } from './webgl/cosmicWeb';
import { FresnelGlowVisualization } from './webgl/fresnelGlow';
import { AdditiveFieldVisualization } from './webgl/additiveField';
import { MagentaPulseVisualization } from './canvas/magentaPulse';
import { MagentaKeyPulseVisualization } from './canvas/magentaKeyPulse';

// Factory function to create visualization instances
export function createVisualization(id: string): Visualization | null {
  switch (id) {
    case 'frequencyBars':
      return new FrequencyBarsVisualization();
    case 'glitchSpectrum':
      return new GlitchSpectrumVisualization();
    case 'beatPulseRings':
      return new BeatPulseRingsVisualization();
    case 'oscilloscope':
      return new OscilloscopeVisualization();
    case 'spectrumCircle':
      return new SpectrumCircleVisualization();
    case 'starfield':
      return new StarfieldVisualization();
    case 'kaleidoscope':
      return new KaleidoscopeVisualization();
    case 'matrixRain':
      return new MatrixRainVisualization();
    case 'neonGrid':
      return new NeonGridVisualization();
    case 'fireworks':
      return new FireworksVisualization();
    case 'waveformTerrain':
      return new WaveformTerrainVisualization();
    case 'laserScanner':
      return new LaserScannerVisualization();
    case 'dnaHelix':
      return new DNAHelixVisualization();
    case 'magentaPulse':
      return new MagentaPulseVisualization();
    case 'magentaKeyPulse':
      return new MagentaKeyPulseVisualization();
    case 'particleStorm':
      return new ParticleStormVisualization();
    case 'spectrumTunnel':
      return new SpectrumTunnelVisualization();
    case 'audioMesh':
      return new AudioMeshVisualization();
    case 'circularWave':
      return new CircularWaveVisualization();
    case 'neonFlowField':
      return new NeonFlowFieldVisualization();
    case 'hexagonMatrix':
      return new HexagonMatrixVisualization();
    case 'spiralWaveform':
      return new SpiralWaveformVisualization();
    case 'lissajous':
      return new LissajousVisualization();
    case 'audioSphere':
      return new AudioSphereVisualization();
    case 'cubeField':
      return new CubeFieldVisualization();
    case 'ribbons':
      return new RibbonsVisualization();
    case 'galaxy':
      return new GalaxyVisualization();
    case 'bars3d':
      return new Bars3DVisualization();
    case 'plasma':
      return new PlasmaVisualization();
    case 'voronoi':
      return new VoronoiVisualization();
    case 'fractalTree':
      return new FractalTreeVisualization();
    case 'waveformRings':
      return new WaveformRingsVisualization();
    case 'waterfall':
      return new WaterfallVisualization();
    case 'lightning':
      return new LightningVisualization();
    case 'neuralNetwork':
      return new NeuralNetworkVisualization();
    case 'tunnel':
      return new TunnelVisualization();
    case 'geometricPulse':
      return new GeometricPulseVisualization();
    case 'supernova':
      return new SupernovaVisualization();
    case 'audioTerrain':
      return new AudioTerrainVisualization();
    case 'fresnelGlow':
      return new FresnelGlowVisualization();
    case 'additiveField':
      return new AdditiveFieldVisualization();
    case 'blackHole':
      return new BlackHoleVisualization();
    case 'pulsar':
      return new PulsarVisualization();
    case 'starfieldWarp':
      return new StarfieldWarpVisualization();
    case 'nebula':
      return new NebulaVisualization();
    case 'wormhole':
      return new WormholeVisualization();
    case 'cosmicWeb':
      return new CosmicWebVisualization();
    default:
      return null;
  }
}

// Get all visualization IDs
export function getVisualizationIds(): string[] {
  return [
    'frequencyBars',
    'glitchSpectrum',
    'beatPulseRings',
    'oscilloscope',
    'spectrumCircle',
    'starfield',
    'kaleidoscope',
    'matrixRain',
    'neonGrid',
    'fireworks',
    'waveformTerrain',
    'laserScanner',
    'dnaHelix',
    'magentaPulse',
    'magentaKeyPulse',
    'particleStorm',
    'spectrumTunnel',
    'audioMesh',
    'circularWave',
    'neonFlowField',
    'hexagonMatrix',
    'spiralWaveform',
    'lissajous',
    'audioSphere',
    'cubeField',
    'ribbons',
    'galaxy',
    'bars3d',
    'plasma',
    'voronoi',
    'fractalTree',
    'waveformRings',
    'waterfall',
    'lightning',
    'neuralNetwork',
    'tunnel',
    'geometricPulse',
    'supernova',
    'audioTerrain',
    'fresnelGlow',
    'additiveField',
    'blackHole',
    'pulsar',
    'starfieldWarp',
    'nebula',
    'wormhole',
    'cosmicWeb'
  ];
}
