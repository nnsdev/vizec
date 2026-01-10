import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  ColorSchemeId,
  COLOR_SCHEMES_HEX_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface AdditiveFieldConfig extends VisualizationConfig {
  colorScheme: string;
  particleCount: number;
  spread: number;
  lift: number;
  speed: number;
  noiseScale: number;
}

export class AdditiveFieldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "additiveField",
    name: "Additive Field",
    author: "Vizec",
    description:
      "Floating additive particles that brighten on audio peaks without obscuring the desktop.",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private velocities: Float32Array | null = null;
  private config: AdditiveFieldConfig = {
    sensitivity: 1,
    colorScheme: "synthwave",
    particleCount: 3600,
    spread: 140,
    lift: 0.6,
    speed: 0.14,
    noiseScale: 0.6,
  };
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 150);

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createField();
  }

  private createField(): void {
    if (!this.scene) return;

    if (this.points) {
      this.scene.remove(this.points);
      (this.points.material as THREE.Material).dispose();
      this.geometry?.dispose();
    }

    const colors = getColorScheme(
      COLOR_SCHEMES_HEX_ACCENT,
      this.config.colorScheme as ColorSchemeId,
      "synthwave",
    );
    const { particleCount, spread } = this.config;

    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colorsArray = new Float32Array(particleCount * 3);
    this.velocities = new Float32Array(particleCount * 3);

    const primary = new THREE.Color(colors.primary);
    const accent = new THREE.Color(colors.accent);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * spread;
      positions[i3 + 1] = (Math.random() - 0.5) * spread * 0.5;
      positions[i3 + 2] = (Math.random() - 0.5) * spread;

      this.velocities[i3] = (Math.random() - 0.5) * 0.02;
      this.velocities[i3 + 1] = Math.random() * 0.01;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.02;

      const mix = Math.random();
      const color = primary.clone().lerp(accent, mix);
      colorsArray[i3] = color.r;
      colorsArray[i3 + 1] = color.g;
      colorsArray[i3 + 2] = color.b;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));

    const material = new THREE.PointsMaterial({
      vertexColors: true,
      size: 1.8,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.scene.add(this.points);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (
      !this.scene ||
      !this.camera ||
      !this.rendererThree ||
      !this.points ||
      !this.geometry ||
      !this.velocities
    )
      return;

    const { frequencyData, bass, mid, treble, volume } = audioData;
    const { speed, spread, lift, noiseScale, sensitivity } = this.config;
    const positions = this.geometry.attributes.position.array as Float32Array;
    const length = positions.length;
    const count = length / 3;
    const freqLen = frequencyData.length;

    this.time += deltaTime;
    const intensity = Math.min(1, (bass + mid * 0.5 + treble * 0.2) * sensitivity);
    const noiseBase = Math.sin(this.time * 0.8) * noiseScale;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const freqIndex = Math.floor((i / count) * freqLen);
      const bin = (frequencyData[freqIndex] || 0) / 255;
      const vibe = 1 + bin * 2;

      positions[i3] += (this.velocities[i3] * vibe + noiseBase * 0.05) * speed * deltaTime * 60;
      positions[i3 + 1] +=
        (this.velocities[i3 + 1] * vibe + lift * bass * 0.5) * speed * deltaTime * 60;
      positions[i3 + 2] +=
        (this.velocities[i3 + 2] * vibe + noiseBase * 0.05) * speed * deltaTime * 60;

      const halfSpread = spread * 0.52;
      if (positions[i3] > halfSpread) positions[i3] = -halfSpread;
      if (positions[i3] < -halfSpread) positions[i3] = halfSpread;
      if (positions[i3 + 1] > halfSpread) positions[i3 + 1] = -halfSpread;
      if (positions[i3 + 1] < -halfSpread) positions[i3 + 1] = halfSpread;
      if (positions[i3 + 2] > halfSpread) positions[i3 + 2] = -halfSpread;
      if (positions[i3 + 2] < -halfSpread) positions[i3 + 2] = halfSpread;
    }

    this.geometry.attributes.position.needsUpdate = true;

    const material = this.points.material as THREE.PointsMaterial;
    material.size = 1 + intensity * 4;
    material.opacity = 0.45 + volume * 0.4;

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
    const oldCount = this.config.particleCount;
    const oldScheme = this.config.colorScheme;
    this.config = { ...this.config, ...config } as AdditiveFieldConfig;

    if (
      this.scene &&
      this.points &&
      (this.config.particleCount !== oldCount || this.config.colorScheme !== oldScheme)
    ) {
      this.createField();
    }
  }

  destroy(): void {
    if (this.scene && this.points) {
      this.scene.remove(this.points);
      (this.points.material as THREE.Material).dispose();
    }
    this.geometry?.dispose();
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.points = null;
    this.geometry = null;
    this.velocities = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      particleCount: {
        type: "number",
        label: "Particle Density",
        default: 3600,
        min: 800,
        max: 8000,
        step: 200,
      },
      spread: {
        type: "number",
        label: "Spread Radius",
        default: 140,
        min: 80,
        max: 260,
        step: 10,
      },
      lift: {
        type: "number",
        label: "Lift Strength",
        default: 0.6,
        min: 0,
        max: 2,
        step: 0.1,
      },
      speed: {
        type: "number",
        label: "Motion Speed",
        default: 0.14,
        min: 0.05,
        max: 0.4,
        step: 0.02,
      },
      noiseScale: {
        type: "number",
        label: "Noise Blend",
        default: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}
