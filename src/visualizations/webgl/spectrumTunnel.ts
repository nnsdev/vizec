import * as THREE from 'three';
import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

interface SpectrumTunnelConfig extends VisualizationConfig {
  ringCount: number;
  colorScheme: string;
  tunnelSpeed: number;
  bassExpansion: number;
}

const COLOR_PALETTES: Record<string, number[]> = {
  cyanMagenta: [0x00ffff, 0xff00ff, 0x8000ff],
  darkTechno: [0x1a1a2e, 0x4a00e0, 0x8000ff],
  neon: [0x39ff14, 0xff073a, 0xffff00],
  plasma: [0xff0080, 0x00ff80, 0x8000ff],
  sunset: [0xff6600, 0xff0066, 0xffcc00],
};

export class SpectrumTunnelVisualization implements Visualization {
  id = 'spectrumTunnel';
  name = 'Spectrum Tunnel';
  author = 'Vizec';
  description = 'Circular rings rushing toward viewer, bass expands tunnel dramatically';
  renderer: 'threejs' = 'threejs';
  transitionType: 'crossfade' = 'crossfade';

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private rings: THREE.Line[] = [];
  private ringGeometries: THREE.BufferGeometry[] = [];

  private config: SpectrumTunnelConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    ringCount: 30,
    tunnelSpeed: 0.5,
    bassExpansion: 1.0,
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private ringPositions: number[] = [];

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    this.camera.position.z = 50;

    // Create renderer
    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Create rings
    this.createRings();

    // Initial resize
    this.resize(container.clientWidth, container.clientHeight);
  }

  private createRings(): void {
    if (!this.scene) return;

    // Remove existing rings
    this.rings.forEach(ring => {
      this.scene?.remove(ring);
      (ring.material as THREE.Material).dispose();
    });
    this.rings = [];
    this.ringGeometries.forEach(geo => geo.dispose());
    this.ringGeometries = [];
    this.ringPositions = [];

    const { ringCount, colorScheme } = this.config;
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.cyanMagenta;

    for (let i = 0; i < ringCount; i++) {
      // Create circular geometry with segments for frequency response
      const segments = 64;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(segments * 3);

      // Initialize as perfect circle
      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        positions[j * 3] = Math.cos(angle);
        positions[j * 3 + 1] = Math.sin(angle);
        positions[j * 3 + 2] = 0;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      this.ringGeometries.push(geometry);

      // Choose color based on ring position
      const colorProgress = i / ringCount;
      const colorIndex = Math.floor(colorProgress * colors.length);
      const color = new THREE.Color(colors[colorIndex % colors.length]);

      const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });

      const line = new THREE.Line(geometry, material);
      this.rings.push(line);
      this.scene.add(line);

      // Position rings along Z axis
      this.ringPositions.push(i * 2);
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { frequencyData, bass, volume } = audioData;
    const { sensitivity, tunnelSpeed, bassExpansion, ringCount } = this.config;

    this.time += deltaTime;

    // Update ring positions
    for (let i = 0; i < ringCount; i++) {
      const ring = this.rings[i];
      if (!ring) continue;

      // Move rings toward camera
      const speed = tunnelSpeed * 20 * (1 + bass * bassExpansion * sensitivity * 0.5);
      this.ringPositions[i] -= speed * deltaTime;

      // Reset ring when it passes camera
      if (this.ringPositions[i] < -10) {
        this.ringPositions[i] = (ringCount - 1) * 2;
      }

      // Apply position
      ring.position.z = this.ringPositions[i];

      // Bass expansion effect
      const bassScale = 1 + bass * bassExpansion * sensitivity;
      const depthEffect = Math.max(0, (this.ringPositions[i] + 10) / (ringCount * 2)); // 0 = far, 1 = near
      const scale = bassScale * (0.5 + depthEffect * 0.5);
      ring.scale.set(scale, scale, scale);

      // Apply frequency data to ring geometry
      const geometry = this.ringGeometries[i];
      const positions = geometry.attributes.position.array as Float32Array;
      const segments = positions.length / 3;

      const freqStep = Math.floor(frequencyData.length / segments);

      for (let j = 0; j < segments; j++) {
        const angle = (j / segments) * Math.PI * 2;
        const freqValue = frequencyData[j * freqStep] / 255 * sensitivity;

        // Base radius varies by position in tunnel
        const baseRadius = 10 + depthEffect * 20;

        // Frequency adds spikiness
        const spikeAmount = freqValue * 5;
        const radius = baseRadius + spikeAmount;

        positions[j * 3] = Math.cos(angle) * radius;
        positions[j * 3 + 1] = Math.sin(angle) * radius;
      }

      geometry.attributes.position.needsUpdate = true;

      // Opacity fades as ring gets closer
      const material = ring.material as THREE.LineBasicMaterial;
      material.opacity = depthEffect * 0.8;
    }

    // Render
    this.rendererThree.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    if (this.rendererThree) {
      this.rendererThree.setSize(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldRingCount = this.config.ringCount;
    const oldColorScheme = this.config.colorScheme;

    this.config = { ...this.config, ...config } as SpectrumTunnelConfig;

    // Recreate rings if count or colors changed
    if (this.scene && (this.config.ringCount !== oldRingCount || this.config.colorScheme !== oldColorScheme)) {
      this.createRings();
    }
  }

  destroy(): void {
    this.rings.forEach(ring => {
      this.scene?.remove(ring);
      (ring.material as THREE.Material).dispose();
    });
    this.ringGeometries.forEach(geo => geo.dispose());

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.rings = [];
    this.ringGeometries = [];
    this.container = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      ringCount: {
        type: 'number',
        label: 'Ring Count',
        default: 30,
        min: 10,
        max: 60,
        step: 5,
      },
      colorScheme: {
        type: 'select',
        label: 'Color Scheme',
        default: 'cyanMagenta',
        options: [
          { value: 'cyanMagenta', label: 'Cyan/Magenta' },
          { value: 'darkTechno', label: 'Dark Techno' },
          { value: 'neon', label: 'Neon' },
          { value: 'plasma', label: 'Plasma' },
          { value: 'sunset', label: 'Sunset' },
        ],
      },
      tunnelSpeed: {
        type: 'number',
        label: 'Tunnel Speed',
        default: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
      },
      bassExpansion: {
        type: 'number',
        label: 'Bass Expansion',
        default: 1.0,
        min: 0,
        max: 3,
        step: 0.1,
      },
    };
  }
}
