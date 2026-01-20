import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_HEX, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface QuantumEntanglementConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  particleCount: number;
  pairCount: number;
  connectionDistance: number;
}

export class QuantumEntanglementVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "quantumEntanglement",
    name: "Quantum Entanglement",
    author: "Vizec",
    description: "Particle pairs that connect based on audio",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;
  private particles: THREE.Points | null = null;
  private lineGeometry: THREE.BufferGeometry | null = null;
  private lineMaterial: THREE.LineBasicMaterial | null = null;
  private lines: THREE.LineSegments | null = null;

  private config: QuantumEntanglementConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    particleCount: 300,
    pairCount: 150,
    connectionDistance: 5,
  };

  private width = 0;
  private height = 0;
  private positions: Float32Array | null = null;
  private velocities: Float32Array | null = null;
  private pairPartner: Int32Array | null = null;

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

    this.createParticles();

    this.resize(container.clientWidth, container.clientHeight);
  }

  private createParticles(): void {
    if (!this.scene) return;

    const { particleCount, pairCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    // Remove existing
    if (this.particles) {
      this.scene.remove(this.particles);
      this.particleGeometry?.dispose();
      this.particleMaterial?.dispose();
    }
    if (this.lines) {
      this.scene.remove(this.lines);
      this.lineGeometry?.dispose();
      this.lineMaterial?.dispose();
    }

    // Create particle geometry
    this.particleGeometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(particleCount * 3);
    this.velocities = new Float32Array(particleCount * 3);
    this.pairPartner = new Int32Array(particleCount);

    const colorArray = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 50;
      this.positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 50;

      this.velocities[i * 3] = (Math.random() - 0.5) * 0.1;
      this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.1;
      this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.1;

      // Assign to pairs
      const pairIndex = i % pairCount;
      this.pairPartner[i] = i < particleCount / 2 ? pairIndex + particleCount / 2 : pairIndex;

      // Set colors based on pair
      const color =
        i < particleCount / 2 ? new THREE.Color(colors.primary) : new THREE.Color(colors.secondary);

      colorArray[i * 3] = color.r;
      colorArray[i * 3 + 1] = color.g;
      colorArray[i * 3 + 2] = color.b;
    }

    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.particleGeometry.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));

    this.particleMaterial = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.scene.add(this.particles);

    // Create connection lines
    this.lineGeometry = new THREE.BufferGeometry();
    const linePositions = new Float32Array(pairCount * 2 * 3);
    this.lineGeometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
    });

    this.lines = new THREE.LineSegments(this.lineGeometry, this.lineMaterial);
    this.scene.add(this.lines);
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.scene || !this.camera || !this.positions || !this.velocities) return;

    const { bass, mid, treble, frequencyData } = audioData;
    const { sensitivity, colorScheme, pairCount, connectionDistance } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    const positionAttr = this.particleGeometry!.attributes.position as THREE.BufferAttribute;
    const linePositionAttr = this.lineGeometry!.attributes.position as THREE.BufferAttribute;

    // Update particle positions
    for (let i = 0; i < this.positions!.length / 3; i++) {
      const i3 = i * 3;

      // Apply audio-reactive forces
      const freqIndex = Math.floor((i / (this.positions!.length / 3)) * frequencyData.length * 0.3);
      const freqValue = frequencyData[freqIndex] / 255;

      // Attraction to pair partner
      const partnerIndex = this.pairPartner![i];
      const partnerI3 = partnerIndex * 3;

      const dx = this.positions![partnerI3] - this.positions![i3];
      const dy = this.positions![partnerI3 + 1] - this.positions![i3 + 1];
      const dz = this.positions![partnerI3 + 2] - this.positions![i3 + 2];

      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 0.1) {
        const force = (midBoost * 0.01) / dist;
        this.velocities![i3] += dx * force;
        this.velocities![i3 + 1] += dy * force;
        this.velocities![i3 + 2] += dz * force;
      }

      // Audio-reactive repulsion
      const repulsionStrength = bassBoost * 0.02;
      if (dist < connectionDistance && midBoost > 0.5) {
        this.velocities![i3] -= (dx / dist) * repulsionStrength;
        this.velocities![i3 + 1] -= (dy / dist) * repulsionStrength;
        this.velocities![i3 + 2] -= (dz / dist) * repulsionStrength;
      }

      // Apply velocities
      this.positions![i3] += this.velocities![i3] * (1 + freqValue * sensitivity);
      this.positions![i3 + 1] += this.velocities![i3 + 1] * (1 + freqValue * sensitivity);
      this.positions![i3 + 2] += this.velocities![i3 + 2] * (1 + freqValue * sensitivity);

      // Damping
      this.velocities![i3] *= 0.98;
      this.velocities![i3 + 1] *= 0.98;
      this.velocities![i3 + 2] *= 0.98;

      // Boundary constraint
      const bound = 25;
      if (Math.abs(this.positions![i3]) > bound) this.velocities![i3] *= -0.5;
      if (Math.abs(this.positions![i3 + 1]) > bound) this.velocities![i3 + 1] *= -0.5;
      if (Math.abs(this.positions![i3 + 2]) > bound) this.velocities![i3 + 2] *= -0.5;
    }

    positionAttr.needsUpdate = true;

    // Update connection lines
    for (let i = 0; i < pairCount; i++) {
      const i3 = i * 3;
      const partnerI3 = (i + pairCount) * 3;

      linePositionAttr.array[i3] = this.positions![i3];
      linePositionAttr.array[i3 + 1] = this.positions![i3 + 1];
      linePositionAttr.array[i3 + 2] = this.positions![i3 + 2];
      linePositionAttr.array[i3 + 3] = this.positions![partnerI3];
      linePositionAttr.array[i3 + 4] = this.positions![partnerI3 + 1];
      linePositionAttr.array[i3 + 5] = this.positions![partnerI3 + 2];
    }

    linePositionAttr.needsUpdate = true;

    // Update line material based on audio
    if (this.lineMaterial) {
      this.lineMaterial.opacity = 0.1 + midBoost * 0.2;
      if (trebleBoost > 1) {
        this.lineMaterial.color.setHex(colors.glow);
      } else {
        this.lineMaterial.color.setHex(colors.primary);
      }
    }

    // Rotate camera
    this.camera.position.x = Math.sin(Date.now() * 0.0002) * 50;
    this.camera.position.z = Math.cos(Date.now() * 0.0002) * 50;
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
    this.config = { ...this.config, ...config } as QuantumEntanglementConfig;

    if (config.particleCount !== undefined || config.colorScheme !== undefined) {
      this.createParticles();
    }
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.container && this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.particleGeometry?.dispose();
    this.particleMaterial?.dispose();
    this.lineGeometry?.dispose();
    this.lineMaterial?.dispose();

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.particles = null;
    this.particleGeometry = null;
    this.particleMaterial = null;
    this.lines = null;
    this.lineGeometry = null;
    this.lineMaterial = null;
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
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      particleCount: {
        type: "number",
        min: 100,
        max: 1000,
        step: 50,
        default: 300,
        label: "Particle Count",
      },
      pairCount: {
        type: "number",
        min: 50,
        max: 500,
        step: 25,
        default: 150,
        label: "Pair Count",
      },
      connectionDistance: {
        type: "number",
        min: 1,
        max: 10,
        step: 0.5,
        default: 5,
        label: "Connection Distance",
      },
    };
  }
}
