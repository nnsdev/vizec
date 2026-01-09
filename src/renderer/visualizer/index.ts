import { VisualizationEngine } from './engine';
import { AppState } from '../../shared/types';

// Initialize visualization engine
const container = document.getElementById('visualizer-container');
if (!container) {
  throw new Error('Visualizer container not found');
}

const engine = new VisualizationEngine(container);

// Handle window resize
window.addEventListener('resize', () => {
  engine.resize();
});

// Also resize after a short delay to ensure dimensions are available
setTimeout(() => {
  console.log('Delayed resize, container:', container.clientWidth, 'x', container.clientHeight);
  engine.resize();
}, 100);

// Listen for state changes
window.vizecAPI.onStateChanged((state: AppState) => {
  engine.handleStateChange(state);
});

// Listen for audio source selection (triggers capture start)
window.vizecAPI.onAudioSourceSelected(async (source) => {
  console.log('Audio source selected:', source);
  try {
    // Pass the device ID for audio input devices, undefined for system audio
    const deviceId = source.type === 'audioInput' ? source.id : undefined;
    await engine.startCapture(deviceId);
    console.log('Audio capture started with deviceId:', deviceId);
  } catch (error) {
    console.error('Failed to start audio capture:', error);
  }
});

// Get initial state
window.vizecAPI.getState().then((state: AppState) => {
  // Set initial visualization
  engine.setVisualization(state.currentVisualization, state.visualizationConfig);
  engine.handleStateChange(state);
  
  // If already capturing, start
  if (state.isCapturing) {
    engine.startCapture().catch(console.error);
  }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  engine.destroy();
});

console.log('Vizec Visualizer initialized');
