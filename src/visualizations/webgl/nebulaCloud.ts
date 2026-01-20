import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface NebulaCloudConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  cloudCount: number;
  driftSpeed: number;
  density: number;
}

export class NebulaCloudVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "nebulaCloud",
    name: "Nebula Cloud",
    author: "Vizec",
    description: "Volumetric cloud with audio-reactive density",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private clouds: THREE.Sprite[] = [];
  private config: NebulaCloudConfig = {
    sensitivity: 1.0,
    colorScheme: "purpleHaze",
    cloudCount: 20,
    driftSpeed: 0.5,
    density: 1.0,
  };

  private width = 0;
  private height = 0;
  private cloudVelocities: { x: number; y: number; z: number }[] = [];

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.z = 30;

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createClouds();

    this.resize(container.clientWidth, container.clientHeight);
  }

  private createClouds(): void {
    if (!this.scene) return;

    // Remove existing clouds
    for (const cloud of this.clouds) {
      this.scene.remove(cloud);
      if (cloud.material) cloud.material.dispose();
    }
    this.clouds = [];
    this.cloudVelocities = [];

    const { cloudCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    // Create cloud texture
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.4, "rgba(255, 255, 255, 0.5)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);

    for (let i = 0; i < cloudCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: i % 3 === 0
          ? colors.primary
          : i % 3 === 1
            ? colors.secondary
            : colors.glow,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const sprite = new THREE.Sprite(material);
      sprite.position.set(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 20,
      );
      sprite.scale.set(5 + Math.random() * 10, 5 + Math.random() * 10, 1);

      this.scene!.add(sprite);
      this.clouds.push(sprite);

      this.cloudVelocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.02,
        z: (Math.random() - 0.5) * 0.01,
      });
    }
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.scene || !this.camera) return;

    const { bass, mid, treble, frequencyData } = audioData;
    const { sensitivity, colorScheme, driftSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    // Update each cloud
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const velocity = this.cloudVelocities[i];

      // Get frequency data for this cloud
      const freqIndex = Math.floor((i / this.clouds.length) * frequencyData.length * 0.3);
      const freqValue = frequencyData[freqIndex] / 255;

      // Update position with drift
      cloud.position.x += velocity.x * driftSpeed * (1 + midBoost);
      cloud.position.y += velocity.y * driftSpeed * (1 + bassBoost);
      cloud.position.z += velocity.z * driftSpeed;

      // Wrap around
      if (cloud.position.x > 20) cloud.position.x = -20;
      if (cloud.position.x < -20) cloud.position.x = 20;
      if (cloud.position.y > 15) cloud.position.y = -15;
      if (cloud.position.y < -15) cloud.position.y = 15;
      if (cloud.position.z > 10) cloud.position.z = -10;
      if (cloud.position.z < -10) cloud.position.z = 10;

      // Update cloud properties based on audio
      const baseScale = 5 + (i / this.clouds.length) * 10;
      const audioScale = baseScale * (1 + freqValue * 0.5 * sensitivity + bassBoost * 0.3);
      cloud.scale.set(audioScale, audioScale, 1);

      // Update opacity based on audio
      if (cloud.material instanceof THREE.SpriteMaterial) {
        cloud.material.opacity = 0.2 + freqValue * 0.4 * sensitivity + trebleBoost * 0.1;

        // Update color on treble peaks
        if (trebleBoost > 1.5 && Math.random() < trebleBoost * 0.05) {
          cloud.material.color.setHex(colors.glow);
        } else if (i % 3 === 0) {
          cloud.material.color.setHex(colors.primary);
        } else if (i % 3 === 1) {
          cloud.material.color.setHex(colors.secondary);
        }
      }
    }

    // Gentle camera movement
    this.camera.position.x = Math.sin(Date.now() * 0.0003) * 3;
    this.camera.position.y = Math.cos(Date.now() * 0.0002) * 2;
    this.camera.lookAt(0, 0, 0);

    this.rendererThree!.render(this.scene, this.camera);
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
    this.config = { ...this.config, ...config } as NebulaCloudConfig;

    if (config.cloudCount !== undefined || config.colorScheme !== undefined) {
      this.createClouds();
    }
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.container && this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    for (const cloud of this.clouds) {
      if (cloud.material) cloud.material.dispose();
    }

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.clouds = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [...COLOR_SCHEME_OPTIONS],
        default: "purpleHaze",
        label: "Color Scheme",
      },
      cloudCount: {
        type: "number",
        min: 10,
        max: 50,
        step: 5,
        default: 20,
        label: "Cloud Count",
      },
      driftSpeed: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Drift Speed",
      },
      density: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Density",
      },
    };
  }
}
