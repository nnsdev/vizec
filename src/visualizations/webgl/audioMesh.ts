import * as THREE from 'three';
import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

const COLOR_SCHEMES: Record<string, { primary: number; secondary: number; background: number }> = {
  cyanMagenta: { primary: 0x00ffff, secondary: 0xff00ff, background: 0x000000 },
  darkTechno: { primary: 0x4a00e0, secondary: 0x8e2de2, background: 0x0a0a0f },
  neon: { primary: 0x39ff14, secondary: 0xff073a, background: 0x000000 },
  fire: { primary: 0xff4500, secondary: 0xffd700, background: 0x000000 },
  ice: { primary: 0x00bfff, secondary: 0xe0ffff, background: 0x000510 },
  acid: { primary: 0xadff2f, secondary: 0x00ff00, background: 0x000000 },
  monochrome: { primary: 0xffffff, secondary: 0x888888, background: 0x000000 },
  purpleHaze: { primary: 0x8b00ff, secondary: 0xff1493, background: 0x000000 },
  sunset: { primary: 0xff6b6b, secondary: 0xfeca57, background: 0x000000 },
  ocean: { primary: 0x0077be, secondary: 0x00d4aa, background: 0x000000 },
  toxic: { primary: 0x00ff41, secondary: 0x0aff0a, background: 0x000000 },
  bloodMoon: { primary: 0x8b0000, secondary: 0xff4500, background: 0x000000 },
  synthwave: { primary: 0xff00ff, secondary: 0x00ffff, background: 0x000000 },
  golden: { primary: 0xffd700, secondary: 0xff8c00, background: 0x000000 },
};

export class AudioMeshVisualization implements Visualization {
  id = 'audioMesh';
  name = 'Audio Mesh';
  author = 'Vizec';
  description = 'A grid mesh that deforms like water based on audio';
  renderer = 'threejs' as const;
  transitionType = 'crossfade' as const;

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private mesh: THREE.Mesh | null = null;
  private geometry: THREE.PlaneGeometry | null = null;
  private originalPositions: Float32Array | null = null;
  
  private config: VisualizationConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    gridSize: 64,
    waveSpeed: 2,
    waveHeight: 15,
    wireframe: true,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera - looking down at the mesh at an angle
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 40, 50);
    this.camera.lookAt(0, 0, 0);

    // Create renderer with transparency
    this.rendererThree = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Create mesh
    this.createMesh();
  }

  private createMesh(): void {
    if (!this.scene) return;

    const { gridSize, colorScheme, wireframe } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Remove existing mesh
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.geometry?.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }

    // Create plane geometry
    this.geometry = new THREE.PlaneGeometry(80, 80, gridSize, gridSize);
    this.geometry.rotateX(-Math.PI / 2); // Make it horizontal

    // Store original positions
    const positions = this.geometry.attributes.position.array as Float32Array;
    this.originalPositions = new Float32Array(positions);

    // Create material
    const material = new THREE.MeshBasicMaterial({
      color: colors.primary,
      wireframe: wireframe,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.scene.add(this.mesh);

    // Add a subtle second mesh for depth effect
    const material2 = new THREE.MeshBasicMaterial({
      color: colors.secondary,
      wireframe: wireframe,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    const mesh2 = new THREE.Mesh(this.geometry.clone(), material2);
    mesh2.position.y = -2;
    mesh2.scale.set(1.1, 1, 1.1);
    this.scene.add(mesh2);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.mesh || !this.geometry || !this.originalPositions) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, waveSpeed, waveHeight } = this.config;

    this.time += deltaTime * waveSpeed;

    // Get positions
    const positions = this.geometry.attributes.position.array as Float32Array;
    const gridSize = Math.sqrt(positions.length / 3);

    // Update each vertex
    for (let i = 0; i < positions.length / 3; i++) {
      const i3 = i * 3;
      const x = this.originalPositions[i3];
      const z = this.originalPositions[i3 + 2];

      // Get grid position
      const gridX = i % gridSize;
      const gridZ = Math.floor(i / gridSize);
      
      // Map to frequency data
      const freqIndex = Math.floor((gridX / gridSize) * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIndex] / 255;

      // Create wave pattern
      const distance = Math.sqrt(x * x + z * z);
      const wave1 = Math.sin(distance * 0.1 - this.time * 2) * bass * sensitivity;
      const wave2 = Math.sin(x * 0.2 + this.time) * Math.cos(z * 0.2 + this.time) * mid * sensitivity;
      
      // Frequency-based displacement
      const freqWave = freqValue * sensitivity * waveHeight;
      
      // Combine all effects
      const displacement = (wave1 * 5 + wave2 * 3 + freqWave) * (0.5 + volume);
      
      positions[i3 + 1] = this.originalPositions[i3 + 1] + displacement;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();

    // Rotate mesh slowly
    this.mesh.rotation.y += 0.001 * (1 + mid * sensitivity);

    // Camera movement based on audio
    const targetY = 40 + bass * sensitivity * 10;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.05;
    
    const targetZ = 50 - volume * sensitivity * 10;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.05;

    // Update material opacity based on volume
    const material = this.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.4 + volume * 0.3;

    // Render
    this.rendererThree.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    if (this.rendererThree) {
      this.rendererThree.setSize(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldColorScheme = this.config.colorScheme;
    const oldGridSize = this.config.gridSize;
    const oldWireframe = this.config.wireframe;
    
    this.config = { ...this.config, ...config };
    
    // Recreate mesh if relevant settings changed
    if (this.scene && (
      config.colorScheme !== oldColorScheme ||
      config.gridSize !== oldGridSize ||
      config.wireframe !== oldWireframe
    )) {
      this.createMesh();
    }
  }

  destroy(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }

    if (this.mesh) {
      (this.mesh.material as THREE.Material).dispose();
    }

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.mesh = null;
    this.geometry = null;
    this.originalPositions = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: { type: 'number', min: 0.1, max: 3, step: 0.1, default: 1.0, label: 'Sensitivity' },
      colorScheme: {
        type: 'select',
        options: [
          { value: 'cyanMagenta', label: 'Cyan/Magenta' },
          { value: 'darkTechno', label: 'Dark Techno' },
          { value: 'neon', label: 'Neon' },
          { value: 'fire', label: 'Fire' },
          { value: 'ice', label: 'Ice' },
          { value: 'acid', label: 'Acid' },
          { value: 'monochrome', label: 'Monochrome' },
          { value: 'purpleHaze', label: 'Purple Haze' },
          { value: 'sunset', label: 'Sunset' },
          { value: 'ocean', label: 'Ocean' },
          { value: 'toxic', label: 'Toxic' },
          { value: 'bloodMoon', label: 'Blood Moon' },
          { value: 'synthwave', label: 'Synthwave' },
          { value: 'golden', label: 'Golden' },
        ],
        default: 'cyanMagenta',
        label: 'Color Scheme',
      },
      gridSize: { type: 'number', min: 16, max: 128, step: 16, default: 64, label: 'Grid Detail' },
      waveSpeed: { type: 'number', min: 0.5, max: 5, step: 0.5, default: 2, label: 'Wave Speed' },
      waveHeight: { type: 'number', min: 5, max: 30, step: 1, default: 15, label: 'Wave Height' },
      wireframe: { type: 'boolean', default: true, label: 'Wireframe Mode' },
    };
  }
}
