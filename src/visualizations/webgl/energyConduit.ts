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

interface EnergyConduitConfig extends VisualizationConfig {
  conduitCount: number;
  flowSpeed: number;
  glowIntensity: number;
}

interface Conduit {
  tube: THREE.Mesh;
  curve: THREE.CatmullRomCurve3;
  energyOffset: number;
  energySpeed: number;
}

interface EnergyParticle {
  mesh: THREE.Mesh;
  conduitIndex: number;
  t: number;
  speed: number;
  size: number;
}

export class EnergyConduitVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "energyConduit",
    name: "Energy Conduit",
    author: "Vizec",
    description: "Flowing energy streams through futuristic conduit pipes",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private conduits: Conduit[] = [];
  private particles: EnergyParticle[] = [];
  private particleGeometry: THREE.SphereGeometry | null = null;

  private config: EnergyConduitConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    conduitCount: 5,
    flowSpeed: 1.0,
    glowIntensity: 1.0,
  };

  private time = 0;
  private smoothedBass = 0;
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
    this.camera.position.set(0, 5, 30);
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

    // Shared geometry for particles
    this.particleGeometry = new THREE.SphereGeometry(0.3, 8, 8);

    // Create conduits
    this.createConduits();
  }

  private createConduits(): void {
    if (!this.scene) return;

    const { conduitCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Clear existing
    this.conduits.forEach(c => {
      c.tube.geometry.dispose();
      (c.tube.material as THREE.Material).dispose();
      this.scene?.remove(c.tube);
    });
    this.conduits = [];

    // Create new conduits
    for (let i = 0; i < conduitCount; i++) {
      const angle = (i / conduitCount) * Math.PI * 2;
      const radius = 8 + Math.random() * 4;

      // Create a curved path for the conduit
      const points: THREE.Vector3[] = [];
      const segments = 8;

      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const x = Math.sin(angle + t * Math.PI * 0.5) * radius * (1 - t * 0.3);
        const y = (t - 0.5) * 20 + Math.sin(t * Math.PI * 2) * 3;
        const z = Math.cos(angle + t * Math.PI * 0.5) * radius * (1 - t * 0.3);
        points.push(new THREE.Vector3(x, y, z));
      }

      const curve = new THREE.CatmullRomCurve3(points);

      // Create tube geometry
      const tubeGeometry = new THREE.TubeGeometry(curve, 32, 0.5, 8, false);

      // Interpolate color based on conduit index
      const colorRatio = i / conduitCount;
      const tubeColor = new THREE.Color(colors.primary).lerp(
        new THREE.Color(colors.accent),
        colorRatio
      );

      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: tubeColor,
        transparent: true,
        opacity: 0.4,
        wireframe: false,
      });

      const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      this.scene.add(tube);

      this.conduits.push({
        tube,
        curve,
        energyOffset: Math.random() * 10,
        energySpeed: 0.5 + Math.random() * 0.5,
      });
    }
  }

  private spawnParticle(conduitIndex: number): void {
    if (!this.scene || !this.particleGeometry || this.particles.length > 100) return;

    const { colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    const material = new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.8,
    });

    const mesh = new THREE.Mesh(this.particleGeometry, material);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      conduitIndex,
      t: 0,
      speed: 0.02 + Math.random() * 0.02,
      size: 0.5 + Math.random() * 0.5,
    });
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, treble } = audioData;
    const { sensitivity, flowSpeed, glowIntensity } = this.config;

    // Smooth audio
    const smoothing = 0.15;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    this.time += deltaTime * 0.001;

    // Spawn particles based on treble
    if (this.smoothedTreble > 0.3 && Math.random() > 0.7) {
      const conduitIndex = Math.floor(Math.random() * this.conduits.length);
      this.spawnParticle(conduitIndex);
    }

    // Update conduit appearance
    for (const conduit of this.conduits) {
      const material = conduit.tube.material as THREE.MeshBasicMaterial;

      // Pulse opacity with bass
      material.opacity = 0.3 + this.smoothedBass * 0.4 * glowIntensity;

      // Update energy flow offset
      conduit.energyOffset += conduit.energySpeed * flowSpeed * deltaTime * 0.001 * (1 + this.smoothedBass);
    }

    // Update particles
    const bassSpeedBoost = 1 + this.smoothedBass * 2;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      const conduit = this.conduits[particle.conduitIndex];

      if (!conduit) {
        this.particles.splice(i, 1);
        continue;
      }

      // Move along curve
      particle.t += particle.speed * flowSpeed * bassSpeedBoost;

      if (particle.t >= 1) {
        // Remove particle
        this.scene.remove(particle.mesh);
        (particle.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }

      // Get position on curve
      const pos = conduit.curve.getPoint(particle.t);
      particle.mesh.position.copy(pos);

      // Scale based on audio
      const scale = particle.size * (1 + this.smoothedTreble * 0.5);
      particle.mesh.scale.setScalar(scale);

      // Fade at ends
      const material = particle.mesh.material as THREE.MeshBasicMaterial;
      const fadeT = Math.sin(particle.t * Math.PI);
      material.opacity = 0.8 * fadeT * glowIntensity;
    }

    // Rotate camera slowly
    const cameraRadius = 30 - this.smoothedBass * 5;
    this.camera.position.x = Math.sin(this.time * 0.2) * cameraRadius;
    this.camera.position.z = Math.cos(this.time * 0.2) * cameraRadius;
    this.camera.position.y = 5 + Math.sin(this.time * 0.3) * 3;
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
    const oldConduitCount = this.config.conduitCount;
    const oldColorScheme = this.config.colorScheme;

    this.config = { ...this.config, ...config } as EnergyConduitConfig;

    if (this.scene && (
      this.config.conduitCount !== oldConduitCount ||
      this.config.colorScheme !== oldColorScheme
    )) {
      this.createConduits();
    }
  }

  destroy(): void {
    // Clean up conduits
    this.conduits.forEach(c => {
      c.tube.geometry.dispose();
      (c.tube.material as THREE.Material).dispose();
    });
    this.conduits = [];

    // Clean up particles
    this.particles.forEach(p => {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    });
    this.particles = [];

    if (this.particleGeometry) {
      this.particleGeometry.dispose();
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
  }

  getConfigSchema(): ConfigSchema {
    return {
      conduitCount: {
        type: "number",
        label: "Conduit Count",
        default: 5,
        min: 3,
        max: 10,
        step: 1,
      },
      flowSpeed: {
        type: "number",
        label: "Flow Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
