import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_HEX, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface SonicRippleConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  maxRipples: number;
  rippleSpeed: number;
  rippleSize: number;
}

export class SonicRippleVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "sonicRipple",
    name: "Sonic Ripple",
    author: "Vizec",
    description: "Expanding spherical wavefronts reacting to beats",
    renderer: "threejs",
    transitionType: "zoom",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private ripples: Ripple[] = [];

  private config: SonicRippleConfig = {
    sensitivity: 1.0,
    colorScheme: "ocean",
    maxRipples: 15,
    rippleSpeed: 0.33,
    rippleSize: 5,
  };

  private width = 0;
  private height = 0;

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
    this.camera.position.z = 50;

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.resize(container.clientWidth, container.clientHeight);
  }

  private createRipple(): Ripple {
    const { colorScheme, rippleSize } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    const geometry = new THREE.RingGeometry(0.1, 0.5, 64);
    const material = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Random orientation
    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.y = Math.random() * Math.PI;

    const ripple: Ripple = {
      mesh,
      radius: 0.1,
      speed: rippleSize * (0.17 + Math.random() * 0.17),
      opacity: 0.8,
      color:
        Math.random() < 0.33
          ? colors.primary
          : Math.random() < 0.5
            ? colors.secondary
            : colors.glow,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
    };

    if (this.scene) {
      this.scene.add(mesh);
    }

    return ripple;
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.scene || !this.camera) return;

    const { bass, mid, treble, frequencyData } = audioData;
    const { sensitivity, colorScheme, maxRipples, rippleSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    // Create new ripple on bass beat (more frequently)
    if (this.ripples.length < maxRipples) {
      const spawnChance = bass > 0.4 ? 0.15 + bassBoost * 0.2 : 0.02;
      if (Math.random() < spawnChance || this.ripples.length === 0) {
        this.ripples.push(this.createRipple());
      }
    }

    // Get frequency data for color variation
    const freqIndex = Math.floor(Math.random() * frequencyData.length * 0.3);
    const _freqValue = frequencyData[freqIndex] / 255;

    // Update and draw ripples
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];

      // Expand ripple (reduced by 3x)
      ripple.radius += ripple.speed * rippleSpeed * (1 + bassBoost * 0.17);

      // Fade out
      ripple.opacity = Math.max(0, 0.8 - ripple.radius / 50);

      // Update mesh
      const scale = ripple.radius;
      ripple.mesh.scale.set(scale, scale, scale);
      (ripple.mesh.material as THREE.MeshBasicMaterial).opacity = ripple.opacity;

      // Update color
      if (trebleBoost > 1 && Math.random() < trebleBoost * 0.05) {
        ripple.color = colors.glow;
      } else if (midBoost > 0.5 && Math.random() < midBoost * 0.02) {
        ripple.color = colors.secondary;
      }
      (ripple.mesh.material as THREE.MeshBasicMaterial).color.setHex(ripple.color);

      // Rotation
      ripple.mesh.rotation.x += ripple.rotationSpeed * (1 + trebleBoost);
      ripple.mesh.rotation.y += ripple.rotationSpeed * (1 + midBoost);

      // Remove faded ripples
      if (ripple.opacity <= 0 || ripple.radius > 50) {
        this.scene!.remove(ripple.mesh);
        ripple.mesh.geometry.dispose();
        ripple.mesh.material.dispose();
        this.ripples.splice(i, 1);
      }
    }

    // Camera movement
    this.camera.position.x = Math.sin(Date.now() * 0.0005) * 5;
    this.camera.position.y = Math.cos(Date.now() * 0.0003) * 3;
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
    this.config = { ...this.config, ...config } as SonicRippleConfig;
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.container && this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    for (const ripple of this.ripples) {
      ripple.mesh.geometry.dispose();
      ripple.mesh.material.dispose();
    }

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.ripples = [];
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
        default: "ocean",
        label: "Color Scheme",
      },
      maxRipples: {
        type: "number",
        min: 5,
        max: 30,
        step: 5,
        default: 15,
        label: "Max Ripples",
      },
      rippleSpeed: {
        type: "number",
        min: 0.1,
        max: 1,
        step: 0.1,
        default: 0.33,
        label: "Ripple Speed",
      },
      rippleSize: {
        type: "number",
        min: 1,
        max: 10,
        step: 0.5,
        default: 5,
        label: "Ripple Size",
      },
    };
  }
}

interface Ripple {
  mesh: THREE.Mesh;
  radius: number;
  speed: number;
  opacity: number;
  color: number;
  rotationSpeed: number;
}
