import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

interface ParticleStormConfig extends VisualizationConfig {
  particleCount: number;
  colorScheme: string;
  rotationSpeed: number;
  explosionIntensity: number;
}

const COLOR_PALETTES: Record<string, number[]> = {
  cyanMagenta: [0x00ffff, 0xff00ff, 0x8000ff],
  darkTechno: [0x1a1a2e, 0x4a00e0, 0x8000ff],
  neon: [0x39ff14, 0xff073a, 0xffff00],
  fire: [0xff4500, 0xff6600, 0xffcc00],
  ice: [0x00bfff, 0x87ceeb, 0xffffff],
};

export class ParticleStormVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "particleStorm",
    name: "Particle Storm",
    author: "Vizec",
    description: "3D particles that react to audio",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  readonly id = (this.constructor as any).meta.id;
  readonly name = (this.constructor as any).meta.name;
  readonly author = (this.constructor as any).meta.author;
  readonly description = (this.constructor as any).meta.description;
  readonly renderer = (this.constructor as any).meta.renderer;
  readonly transitionType = (this.constructor as any).meta.transitionType;

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private particles: THREE.Points | null = null;
  private particleGeometry: THREE.BufferGeometry | null = null;
  private velocities: Float32Array | null = null;
  private originalPositions: Float32Array | null = null;

  private config: ParticleStormConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    particleCount: 5000,
    rotationSpeed: 0.5,
    explosionIntensity: 1.0,
  };

  private width = 0;
  private height = 0;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.z = 50;

    // Create renderer
    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Create particles
    this.createParticles();

    // Initial resize
    this.resize(container.clientWidth, container.clientHeight);
  }

  private createParticles(): void {
    if (!this.scene) return;

    // Remove existing particles
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particleGeometry?.dispose();
    }

    const { particleCount, colorScheme } = this.config;
    const colors = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.cyanMagenta;

    // Create geometry
    this.particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);
    this.velocities = new Float32Array(particleCount * 3);
    this.originalPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      // Spherical distribution
      const radius = 20 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Store original positions
      this.originalPositions[i3] = positions[i3];
      this.originalPositions[i3 + 1] = positions[i3 + 1];
      this.originalPositions[i3 + 2] = positions[i3 + 2];

      // Random velocities
      this.velocities[i3] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
      this.velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;

      // Random color from palette
      const color = new THREE.Color(colors[Math.floor(Math.random() * colors.length)]);
      particleColors[i3] = color.r;
      particleColors[i3 + 1] = color.g;
      particleColors[i3 + 2] = color.b;
    }

    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));

    // Create material with transparency for overlay mode
    const material = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    // Create points
    this.particles = new THREE.Points(this.particleGeometry, material);
    this.scene.add(this.particles);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (
      !this.scene ||
      !this.camera ||
      !this.rendererThree ||
      !this.particles ||
      !this.particleGeometry
    )
      return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, rotationSpeed, explosionIntensity } = this.config;

    this.time += deltaTime;

    // Much more reactive rotation based on audio
    const bassBoost = Math.pow(bass, 0.7) * 3; // Amplify bass response
    const midBoost = Math.pow(mid, 0.7) * 2;
    const trebleBoost = Math.pow(treble, 0.7) * 2;

    this.particles.rotation.y += rotationSpeed * 0.02 * (1 + midBoost * sensitivity);
    this.particles.rotation.x += rotationSpeed * 0.01 * (1 + trebleBoost * sensitivity);
    this.particles.rotation.z +=
      rotationSpeed * 0.005 * Math.sin(this.time * 2) * (1 + bassBoost * 0.5);

    // Pulsing camera zoom based on bass
    const targetZ = 50 - bassBoost * sensitivity * 8;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;

    // Update particle positions
    const positions = this.particleGeometry.attributes.position.array as Float32Array;
    const particleCount = positions.length / 3;

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;

      if (this.velocities && this.originalPositions) {
        // Get frequency data for this particle (spread across spectrum)
        const freqIndex = Math.floor((i / particleCount) * frequencyData.length);
        const freqValue = frequencyData[freqIndex] / 255;

        // Continuous expansion/contraction based on frequency
        const freqBoost = Math.pow(freqValue, 0.6) * sensitivity * 2;

        // Direction from center
        const direction = new THREE.Vector3(
          this.originalPositions[i3],
          this.originalPositions[i3 + 1],
          this.originalPositions[i3 + 2],
        ).normalize();

        // Always apply some movement based on audio
        const expansion = freqBoost * explosionIntensity * 0.8;
        this.velocities[i3] += direction.x * expansion;
        this.velocities[i3 + 1] += direction.y * expansion;
        this.velocities[i3 + 2] += direction.z * expansion;

        // Extra explosion on strong bass hits
        if (bassBoost > 0.3) {
          const bassExplosion = bassBoost * explosionIntensity * sensitivity * 0.5;
          this.velocities[i3] += direction.x * bassExplosion;
          this.velocities[i3 + 1] += direction.y * bassExplosion;
          this.velocities[i3 + 2] += direction.z * bassExplosion;
        }

        // Swirl effect based on mid frequencies
        const swirlStrength = midBoost * sensitivity * 0.02;
        const angle = Math.atan2(positions[i3 + 1], positions[i3]);
        this.velocities[i3] += Math.cos(angle + Math.PI / 2) * swirlStrength;
        this.velocities[i3 + 1] += Math.sin(angle + Math.PI / 2) * swirlStrength;

        // Apply velocities
        positions[i3] += this.velocities[i3];
        positions[i3 + 1] += this.velocities[i3 + 1];
        positions[i3 + 2] += this.velocities[i3 + 2];

        // Return to original position (spring effect) - stronger when quiet
        const returnStrength = 0.03 + (1 - volume) * 0.02;
        positions[i3] += (this.originalPositions[i3] - positions[i3]) * returnStrength;
        positions[i3 + 1] += (this.originalPositions[i3 + 1] - positions[i3 + 1]) * returnStrength;
        positions[i3 + 2] += (this.originalPositions[i3 + 2] - positions[i3 + 2]) * returnStrength;

        // Dampen velocities
        const damping = 0.92 - volume * 0.05; // Less damping when loud
        this.velocities[i3] *= damping;
        this.velocities[i3 + 1] *= damping;
        this.velocities[i3 + 2] *= damping;
      }
    }

    this.particleGeometry.attributes.position.needsUpdate = true;

    // Update material - more dramatic size and opacity changes
    const material = this.particles.material as THREE.PointsMaterial;
    material.size = 0.4 + volume * sensitivity * 1.5 + bassBoost * 0.3;
    material.opacity = 0.6 + volume * 0.4;

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
    const oldParticleCount = this.config.particleCount;
    const oldColorScheme = this.config.colorScheme;

    this.config = { ...this.config, ...config } as ParticleStormConfig;

    // Recreate particles if count or colors changed
    if (
      this.scene &&
      (this.config.particleCount !== oldParticleCount || this.config.colorScheme !== oldColorScheme)
    ) {
      this.createParticles();
    }
  }

  destroy(): void {
    if (this.particles) {
      this.scene?.remove(this.particles);
      (this.particles.material as THREE.Material).dispose();
    }

    this.particleGeometry?.dispose();

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.particles = null;
    this.particleGeometry = null;
    this.container = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 5000,
        min: 1000,
        max: 20000,
        step: 1000,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "darkTechno", label: "Dark Techno" },
          { value: "neon", label: "Neon" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
        ],
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 0.5,
        min: 0,
        max: 2,
        step: 0.1,
      },
      explosionIntensity: {
        type: "number",
        label: "Explosion Intensity",
        default: 1.0,
        min: 0,
        max: 3,
        step: 0.1,
      },
    };
  }
}
