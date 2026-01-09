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
export { ParticleStormVisualization } from './webgl/particleStorm';
export { SpectrumTunnelVisualization } from './webgl/spectrumTunnel';
export { AudioMeshVisualization } from './webgl/audioMesh';
export { AudioSphereVisualization } from './webgl/audioSphere';
export { CubeFieldVisualization } from './webgl/cubeField';
export { CircularWaveVisualization } from './p5/circularWave';
export { NeonFlowFieldVisualization } from './p5/neonFlowField';
export { HexagonMatrixVisualization } from './p5/hexagonMatrix';
export { SpiralWaveformVisualization } from './p5/spiralWaveform';
export { LissajousVisualization } from './p5/lissajous';

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
import { ParticleStormVisualization } from './webgl/particleStorm';
import { SpectrumTunnelVisualization } from './webgl/spectrumTunnel';
import { AudioMeshVisualization } from './webgl/audioMesh';
import { AudioSphereVisualization } from './webgl/audioSphere';
import { CubeFieldVisualization } from './webgl/cubeField';
import { CircularWaveVisualization } from './p5/circularWave';
import { NeonFlowFieldVisualization } from './p5/neonFlowField';
import { HexagonMatrixVisualization } from './p5/hexagonMatrix';
import { SpiralWaveformVisualization } from './p5/spiralWaveform';
import { LissajousVisualization } from './p5/lissajous';

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
    'particleStorm',
    'spectrumTunnel',
    'audioMesh',
    'circularWave',
    'neonFlowField',
    'hexagonMatrix',
    'spiralWaveform',
    'lissajous',
    'audioSphere',
    'cubeField'
  ];
}
