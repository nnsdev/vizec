import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface DataNexusConfig extends VisualizationConfig {
  streamCount: number;
  particleSpeed: number;
  coreSize: number;
}

interface DataStream {
  particles: THREE.Points;
  geometry: THREE.BufferGeometry;
  positions: Float32Array;
  velocities: Float32Array;
  lifetimes: Float32Array;
  angle: number;
  elevation: number;
}

export class DataNexusVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "dataNexus",
    name: "Data Nexus",
    author: "Vizec",
    description: "Central data node with radiating digital streams",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private coreNode: THREE.Mesh | null = null;
  private coreGlow: THREE.Mesh | null = null;
  private streams: DataStream[] = [];

  private config: DataNexusConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
    streamCount: 8,
    particleSpeed: 1.0,
    coreSize: 1.0,
  };

  private time = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 10, 25);
    this.camera.lookAt(0, 0, 0);

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

    // Create core node
    this.createCore();

    // Create data streams
    this.createStreams();
  }

  private createCore(): void {
    if (!this.scene) return;

    const { colorScheme, coreSize } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Main core sphere
    const coreGeometry = new THREE.IcosahedronGeometry(2 * coreSize, 2);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.7,
      wireframe: true,
    });

    this.coreNode = new THREE.Mesh(coreGeometry, coreMaterial);
    this.scene.add(this.coreNode);

    // Glow sphere
    const glowGeometry = new THREE.SphereGeometry(3 * coreSize, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.2,
    });

    this.coreGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.scene.add(this.coreGlow);
  }

  private createStreams(): void {
    if (!this.scene) return;

    const { streamCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Clear existing streams
    this.streams.forEach(stream => {
      stream.geometry.dispose();
      (stream.particles.material as THREE.Material).dispose();
      this.scene?.remove(stream.particles);
    });
    this.streams = [];

    const particlesPerStream = 100;

    for (let i = 0; i < streamCount; i++) {
      // Distribute streams in a sphere pattern
      const phi = Math.acos(1 - 2 * (i + 0.5) / streamCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;

      const positions = new Float32Array(particlesPerStream * 3);
      const velocities = new Float32Array(particlesPerStream * 3);
      const lifetimes = new Float32Array(particlesPerStream);

      // Initialize particles
      for (let j = 0; j < particlesPerStream; j++) {
        const t = j / particlesPerStream;

        // Start at core, move outward along stream direction
        const distance = 3 + t * 15;
        const spread = t * 2;

        const dirX = Math.sin(phi) * Math.cos(theta);
        const dirY = Math.cos(phi);
        const dirZ = Math.sin(phi) * Math.sin(theta);

        positions[j * 3] = dirX * distance + (Math.random() - 0.5) * spread;
        positions[j * 3 + 1] = dirY * distance + (Math.random() - 0.5) * spread;
        positions[j * 3 + 2] = dirZ * distance + (Math.random() - 0.5) * spread;

        velocities[j * 3] = dirX * (0.5 + Math.random() * 0.5);
        velocities[j * 3 + 1] = dirY * (0.5 + Math.random() * 0.5);
        velocities[j * 3 + 2] = dirZ * (0.5 + Math.random() * 0.5);

        lifetimes[j] = Math.random();
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      // Color gradient from primary to accent
      const colorRatio = i / streamCount;
      const streamColor = new THREE.Color(colors.primary).lerp(
        new THREE.Color(colors.accent),
        colorRatio
      );

      const material = new THREE.PointsMaterial({
        color: streamColor,
        size: 0.3,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
      });

      const particles = new THREE.Points(geometry, material);
      this.scene.add(particles);

      this.streams.push({
        particles,
        geometry,
        positions,
        velocities,
        lifetimes,
        angle: theta,
        elevation: phi,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble } = audioData;
    const { sensitivity, particleSpeed, coreSize } = this.config;

    // Smooth audio
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    this.time += deltaTime * 0.001;
    const dt = deltaTime * 0.001;

    // Animate core
    if (this.coreNode) {
      // Pulse with bass
      const scale = coreSize * (1 + this.smoothedBass * 0.5);
      this.coreNode.scale.setScalar(scale);
      this.coreNode.rotation.x += 0.01 * (1 + this.smoothedMid);
      this.coreNode.rotation.y += 0.015 * (1 + this.smoothedTreble);
    }

    if (this.coreGlow) {
      const glowScale = coreSize * (1.5 + this.smoothedBass * 0.8);
      this.coreGlow.scale.setScalar(glowScale);
      const material = this.coreGlow.material as THREE.MeshBasicMaterial;
      material.opacity = 0.15 + this.smoothedBass * 0.2;
    }

    // Animate streams
    const speedBoost = 1 + this.smoothedMid * 2;

    for (const stream of this.streams) {
      const positions = stream.positions;
      const velocities = stream.velocities;
      const lifetimes = stream.lifetimes;

      for (let i = 0; i < lifetimes.length; i++) {
        // Move particle outward
        positions[i * 3] += velocities[i * 3] * dt * particleSpeed * speedBoost * 10;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt * particleSpeed * speedBoost * 10;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt * particleSpeed * speedBoost * 10;

        // Age particle
        lifetimes[i] += dt * 0.5;

        // Reset if too old or too far
        const distance = Math.sqrt(
          positions[i * 3] ** 2 +
          positions[i * 3 + 1] ** 2 +
          positions[i * 3 + 2] ** 2
        );

        if (lifetimes[i] > 1 || distance > 25) {
          lifetimes[i] = 0;

          // Reset to core
          const phi = stream.elevation + (Math.random() - 0.5) * 0.3;
          const theta = stream.angle + (Math.random() - 0.5) * 0.3;

          const startDist = 3 + Math.random() * 2;
          positions[i * 3] = Math.sin(phi) * Math.cos(theta) * startDist;
          positions[i * 3 + 1] = Math.cos(phi) * startDist;
          positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * startDist;

          // Random velocity direction
          velocities[i * 3] = Math.sin(phi) * Math.cos(theta) * (0.5 + Math.random() * 0.5);
          velocities[i * 3 + 1] = Math.cos(phi) * (0.5 + Math.random() * 0.5);
          velocities[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * (0.5 + Math.random() * 0.5);
        }
      }

      // Update geometry
      stream.geometry.attributes.position.needsUpdate = true;

      // Update material opacity based on audio
      const material = stream.particles.material as THREE.PointsMaterial;
      material.opacity = 0.4 + this.smoothedTreble * 0.4;
      material.size = 0.3 + this.smoothedBass * 0.3;
    }

    // Camera orbit
    const cameraRadius = 25 - this.smoothedBass * 5;
    this.camera.position.x = Math.sin(this.time * 0.2) * cameraRadius;
    this.camera.position.z = Math.cos(this.time * 0.2) * cameraRadius;
    this.camera.position.y = 10 + Math.sin(this.time * 0.15) * 5;
    this.camera.lookAt(0, 0, 0);

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
    const oldStreamCount = this.config.streamCount;
    const oldColorScheme = this.config.colorScheme;
    const oldCoreSize = this.config.coreSize;

    this.config = { ...this.config, ...config } as DataNexusConfig;

    if (this.scene) {
      if (this.config.streamCount !== oldStreamCount ||
          this.config.colorScheme !== oldColorScheme) {
        this.createStreams();
      }

      if (this.config.coreSize !== oldCoreSize ||
          this.config.colorScheme !== oldColorScheme) {
        // Recreate core
        if (this.coreNode) {
          this.coreNode.geometry.dispose();
          (this.coreNode.material as THREE.Material).dispose();
          this.scene.remove(this.coreNode);
        }
        if (this.coreGlow) {
          this.coreGlow.geometry.dispose();
          (this.coreGlow.material as THREE.Material).dispose();
          this.scene.remove(this.coreGlow);
        }
        this.createCore();
      }
    }
  }

  destroy(): void {
    // Clean up streams
    this.streams.forEach(stream => {
      stream.geometry.dispose();
      (stream.particles.material as THREE.Material).dispose();
    });
    this.streams = [];

    // Clean up core
    if (this.coreNode) {
      this.coreNode.geometry.dispose();
      (this.coreNode.material as THREE.Material).dispose();
    }
    if (this.coreGlow) {
      this.coreGlow.geometry.dispose();
      (this.coreGlow.material as THREE.Material).dispose();
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
    this.coreNode = null;
    this.coreGlow = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      streamCount: {
        type: "number",
        label: "Stream Count",
        default: 8,
        min: 4,
        max: 16,
        step: 1,
      },
      particleSpeed: {
        type: "number",
        label: "Particle Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      coreSize: {
        type: "number",
        label: "Core Size",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
