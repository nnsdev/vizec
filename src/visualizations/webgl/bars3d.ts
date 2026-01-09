import * as THREE from 'three';
import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

const COLOR_SCHEMES: Record<string, { primary: number; secondary: number; glow: number }> = {
  cyanMagenta: { primary: 0x00ffff, secondary: 0xff00ff, glow: 0x00ffff },
  darkTechno: { primary: 0x4a00e0, secondary: 0x8e2de2, glow: 0x8000ff },
  neon: { primary: 0x39ff14, secondary: 0xff073a, glow: 0xffff00 },
  fire: { primary: 0xff4500, secondary: 0xffd700, glow: 0xff6600 },
  ice: { primary: 0x00bfff, secondary: 0xe0ffff, glow: 0x87ceeb },
  acid: { primary: 0xadff2f, secondary: 0x00ff00, glow: 0x00ff00 },
  monochrome: { primary: 0xffffff, secondary: 0x888888, glow: 0xffffff },
  purpleHaze: { primary: 0x8b00ff, secondary: 0xff1493, glow: 0x9400d3 },
  sunset: { primary: 0xff6b6b, secondary: 0xfeca57, glow: 0xff9f43 },
  ocean: { primary: 0x0077be, secondary: 0x00d4aa, glow: 0x00b4d8 },
  toxic: { primary: 0x00ff41, secondary: 0x0aff0a, glow: 0x39ff14 },
  bloodMoon: { primary: 0x8b0000, secondary: 0xff4500, glow: 0xdc143c },
  synthwave: { primary: 0xff00ff, secondary: 0x00ffff, glow: 0xff00aa },
  golden: { primary: 0xffd700, secondary: 0xff8c00, glow: 0xffb347 },
};

interface Bars3DConfig extends VisualizationConfig {
  barCount: number;
  radius: number;
  colorScheme: string;
  maxHeight: number;
  twist: number;
}

export class Bars3DVisualization implements Visualization {
  id = 'bars3d';
  name = '3D Bars';
  author = 'Vizec';
  description = '3D equalizer bars arranged in a cylinder with audio-reactive heights';
  renderer = 'threejs' as const;
  transitionType = 'crossfade' as const;

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private bars: THREE.Mesh[] = [];
  private barGroup: THREE.Group | null = null;

  private config: Bars3DConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    barCount: 64,
    radius: 20,
    maxHeight: 30,
    twist: 0.5,
  };

  private time = 0;
  private cameraAngle = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 30, 50);
    this.camera.lookAt(0, 10, 0);

    // Create renderer with transparency
    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Create bars
    this.createBars();
  }

  private createBars(): void {
    if (!this.scene) return;

    const { barCount, radius, colorScheme, maxHeight } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Remove existing bars
    if (this.barGroup) {
      this.scene.remove(this.barGroup);
      this.bars.forEach(bar => {
        bar.geometry.dispose();
        (bar.material as THREE.Material).dispose();
      });
      this.bars = [];
    }

    this.barGroup = new THREE.Group();

    const barWidth = (2 * Math.PI * radius) / barCount * 0.7;
    const barDepth = 2;

    const primaryColor = new THREE.Color(colors.primary);
    const secondaryColor = new THREE.Color(colors.secondary);

    for (let i = 0; i < barCount; i++) {
      const angle = (i / barCount) * Math.PI * 2;

      // Create bar geometry
      const geometry = new THREE.BoxGeometry(barWidth, 1, barDepth);

      // Color gradient around the circle
      const mixFactor = i / barCount;
      const barColor = new THREE.Color().lerpColors(primaryColor, secondaryColor, mixFactor);

      const material = new THREE.MeshBasicMaterial({
        color: barColor,
        transparent: true,
        opacity: 0.85,
      });

      const bar = new THREE.Mesh(geometry, material);

      // Position around circle
      bar.position.x = Math.cos(angle) * radius;
      bar.position.z = Math.sin(angle) * radius;
      bar.position.y = 0.5; // Start at bottom

      // Face outward
      bar.rotation.y = -angle;

      // Store original angle for twist calculation
      bar.userData.angle = angle;
      bar.userData.index = i;

      this.bars.push(bar);
      this.barGroup.add(bar);
    }

    this.scene.add(this.barGroup);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.barGroup) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, maxHeight, twist, radius } = this.config;

    this.time += deltaTime;

    const bassBoost = Math.pow(bass, 0.7) * 2;
    const midBoost = Math.pow(mid, 0.7) * 1.5;

    // Update bar heights based on frequency data
    const barCount = this.bars.length;
    const binsPerBar = Math.floor(frequencyData.length / barCount);

    for (let i = 0; i < barCount; i++) {
      const bar = this.bars[i];

      // Average frequency bins for this bar
      let sum = 0;
      const startBin = i * binsPerBar;
      for (let j = 0; j < binsPerBar; j++) {
        sum += frequencyData[startBin + j] || 0;
      }
      const avgFreq = sum / binsPerBar / 255;

      // Calculate target height
      const targetHeight = Math.max(0.5, avgFreq * maxHeight * sensitivity);

      // Smooth height transition
      const currentHeight = bar.scale.y;
      const newHeight = currentHeight + (targetHeight - currentHeight) * 0.3;
      bar.scale.y = newHeight;

      // Position adjustment for scaling from bottom
      bar.position.y = newHeight / 2;

      // Apply twist based on height and config
      const originalAngle = bar.userData.angle;
      const twistAmount = twist * (newHeight / maxHeight) * 0.5;
      bar.rotation.y = -originalAngle + twistAmount;

      // Update material opacity based on height
      const material = bar.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 + (newHeight / maxHeight) * 0.5;
    }

    // Slow rotation of entire group
    this.barGroup.rotation.y += 0.002 * (1 + bassBoost * sensitivity * 0.3);

    // Camera orbits slowly around
    this.cameraAngle += 0.003 * (1 + midBoost * sensitivity * 0.2);
    const camRadius = 50 - bassBoost * sensitivity * 5;
    const camHeight = 30 + Math.sin(this.time * 0.3) * 10;

    this.camera.position.x = Math.sin(this.cameraAngle) * camRadius;
    this.camera.position.z = Math.cos(this.cameraAngle) * camRadius;
    this.camera.position.y = camHeight;
    this.camera.lookAt(0, 10, 0);

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
    const oldBarCount = this.config.barCount;
    const oldRadius = this.config.radius;

    this.config = { ...this.config, ...config } as Bars3DConfig;

    // Recreate bars if relevant settings changed
    if (this.scene && (
      this.config.colorScheme !== oldColorScheme ||
      this.config.barCount !== oldBarCount ||
      this.config.radius !== oldRadius
    )) {
      this.createBars();
    }
  }

  destroy(): void {
    this.bars.forEach(bar => {
      bar.geometry.dispose();
      (bar.material as THREE.Material).dispose();
    });
    this.bars = [];

    if (this.barGroup) {
      this.barGroup.clear();
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
    this.barGroup = null;
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
      barCount: { type: 'number', min: 16, max: 128, step: 8, default: 64, label: 'Bar Count' },
      radius: { type: 'number', min: 10, max: 40, step: 2, default: 20, label: 'Circle Radius' },
      maxHeight: { type: 'number', min: 10, max: 50, step: 5, default: 30, label: 'Max Height' },
      twist: { type: 'number', min: 0, max: 2, step: 0.1, default: 0.5, label: 'Twist Amount' },
    };
  }
}
