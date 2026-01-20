import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface ForgeSparksConfig extends VisualizationConfig {
  sparkDensity: number;
  sparkLifetime: number;
  forgeIntensity: number;
}

// SparkBurst interface removed - not currently used

export class ForgeSparksVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "forgeSparks",
    name: "Forge Sparks",
    author: "Vizec",
    description: "3D metalworking sparks flying from an industrial forge",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private sparksGeometry: THREE.BufferGeometry | null = null;
  private sparksPoints: THREE.Points | null = null;
  private anvilMesh: THREE.Mesh | null = null;
  private glowMesh: THREE.Mesh | null = null;

  private config: ForgeSparksConfig = {
    sensitivity: 1.0,
    colorScheme: "fire",
    sparkDensity: 1.0,
    sparkLifetime: 1.0,
    forgeIntensity: 1.0,
  };

  private maxSparks = 3000;
  private sparkPositions: Float32Array;
  private sparkVelocities: Float32Array;
  private sparkLifetimes: Float32Array;
  private sparkColors: Float32Array;

  private time = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private lastBurstTime = 0;

  constructor() {
    super();
    this.sparkPositions = new Float32Array(this.maxSparks * 3);
    this.sparkVelocities = new Float32Array(this.maxSparks * 3);
    this.sparkLifetimes = new Float32Array(this.maxSparks);
    this.sparkColors = new Float32Array(this.maxSparks * 3);
  }

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 8, 20);
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

    // Initialize spark data
    this.initializeSparks();

    // Create anvil
    this.createAnvil();
  }

  private initializeSparks(): void {
    if (!this.scene) return;

    const { colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Initialize all sparks as inactive
    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkPositions[i * 3] = 0;
      this.sparkPositions[i * 3 + 1] = -100; // Hidden below view
      this.sparkPositions[i * 3 + 2] = 0;
      this.sparkVelocities[i * 3] = 0;
      this.sparkVelocities[i * 3 + 1] = 0;
      this.sparkVelocities[i * 3 + 2] = 0;
      this.sparkLifetimes[i] = 0;

      // Warm colors for sparks
      const t = Math.random();
      const color = new THREE.Color(colors.primary).lerp(new THREE.Color(colors.accent), t);
      this.sparkColors[i * 3] = color.r;
      this.sparkColors[i * 3 + 1] = color.g;
      this.sparkColors[i * 3 + 2] = color.b;
    }

    // Create geometry
    this.sparksGeometry = new THREE.BufferGeometry();
    this.sparksGeometry.setAttribute("position", new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparksGeometry.setAttribute("color", new THREE.BufferAttribute(this.sparkColors, 3));

    // Create material - larger sparks for visibility
    const material = new THREE.PointsMaterial({
      size: 0.4,
      transparent: true,
      opacity: 0.9,
      vertexColors: true,
      sizeAttenuation: true,
    });

    this.sparksPoints = new THREE.Points(this.sparksGeometry, material);
    this.scene.add(this.sparksPoints);
  }

  private createAnvil(): void {
    if (!this.scene) return;

    const { colorScheme, forgeIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Anvil body
    const anvilGeometry = new THREE.BoxGeometry(4, 2, 2);
    const anvilMaterial = new THREE.MeshBasicMaterial({
      color: 0x333333,
      transparent: true,
      opacity: 0.5,
    });
    this.anvilMesh = new THREE.Mesh(anvilGeometry, anvilMaterial);
    this.anvilMesh.position.set(0, -1, 0);
    this.scene.add(this.anvilMesh);

    // Forge glow
    const glowGeometry = new THREE.SphereGeometry(2, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.3 * forgeIntensity,
    });
    this.glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    this.glowMesh.position.set(0, 1, 0);
    this.scene.add(this.glowMesh);
  }

  private emitSparkBurst(): void {
    const { sparkDensity, sparkLifetime } = this.config;
    const burstCount = Math.floor(50 * sparkDensity * (0.5 + this.smoothedBass));

    let sparksEmitted = 0;
    for (let i = 0; i < this.maxSparks && sparksEmitted < burstCount; i++) {
      if (this.sparkLifetimes[i] <= 0) {
        // Emit from anvil area
        const angle = Math.random() * Math.PI * 2;
        const upAngle = Math.random() * Math.PI * 0.4 + Math.PI * 0.1; // Mostly upward

        const speed = 5 + Math.random() * 10;

        this.sparkPositions[i * 3] = (Math.random() - 0.5) * 2;
        this.sparkPositions[i * 3 + 1] = 0.5;
        this.sparkPositions[i * 3 + 2] = (Math.random() - 0.5) * 2;

        this.sparkVelocities[i * 3] = Math.cos(angle) * Math.sin(upAngle) * speed;
        this.sparkVelocities[i * 3 + 1] = Math.cos(upAngle) * speed;
        this.sparkVelocities[i * 3 + 2] = Math.sin(angle) * Math.sin(upAngle) * speed;

        this.sparkLifetimes[i] = sparkLifetime * (0.5 + Math.random() * 0.5);

        sparksEmitted++;
      }
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.sparksGeometry) return;

    const { bass, mid } = audioData;
    const { sensitivity, forgeIntensity } = this.config;

    // Smooth audio - faster response, boosted sensitivity
    const smoothing = 0.3;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * 2 * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * 2 * smoothing;

    this.time += deltaTime * 0.001;
    const dt = deltaTime * 0.001;

    // Emit spark bursts on bass hits - lowered threshold, faster rate
    // Also emit continuous small bursts for constant activity
    if (this.smoothedBass > 0.1 && this.time - this.lastBurstTime > 0.05) {
      this.emitSparkBurst();
      this.lastBurstTime = this.time;
    } else if (this.time - this.lastBurstTime > 0.15) {
      // Ambient sparks even without strong bass
      this.emitSparkBurst();
      this.lastBurstTime = this.time;
    }

    // Update sparks
    const gravity = -15;

    for (let i = 0; i < this.maxSparks; i++) {
      if (this.sparkLifetimes[i] > 0) {
        // Apply physics
        this.sparkVelocities[i * 3 + 1] += gravity * dt;

        this.sparkPositions[i * 3] += this.sparkVelocities[i * 3] * dt;
        this.sparkPositions[i * 3 + 1] += this.sparkVelocities[i * 3 + 1] * dt;
        this.sparkPositions[i * 3 + 2] += this.sparkVelocities[i * 3 + 2] * dt;

        // Air resistance
        this.sparkVelocities[i * 3] *= 0.99;
        this.sparkVelocities[i * 3 + 2] *= 0.99;

        // Age spark
        this.sparkLifetimes[i] -= dt;

        // Kill if below ground
        if (this.sparkPositions[i * 3 + 1] < -5) {
          this.sparkLifetimes[i] = 0;
          this.sparkPositions[i * 3 + 1] = -100;
        }
      }
    }

    // Update geometry
    this.sparksGeometry.attributes.position.needsUpdate = true;

    // Update forge glow
    if (this.glowMesh) {
      const scale = 1 + this.smoothedBass * 0.5;
      this.glowMesh.scale.setScalar(scale);
      const material = this.glowMesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.2 * forgeIntensity + this.smoothedBass * 0.3;
    }

    // Anvil pulse
    if (this.anvilMesh) {
      const pulse = 1 + this.smoothedMid * 0.1;
      this.anvilMesh.scale.set(pulse, 1, pulse);
    }

    // Camera movement
    const cameraRadius = 20 - this.smoothedBass * 3;
    this.camera.position.x = Math.sin(this.time * 0.2) * cameraRadius * 0.5;
    this.camera.position.z = Math.cos(this.time * 0.2) * cameraRadius;
    this.camera.position.y = 8 + Math.sin(this.time * 0.3) * 2;
    this.camera.lookAt(0, 2, 0);

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
    this.config = { ...this.config, ...config } as ForgeSparksConfig;

    if (this.scene && this.config.colorScheme !== oldColorScheme) {
      // Update spark colors
      const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, this.config.colorScheme);

      for (let i = 0; i < this.maxSparks; i++) {
        const t = Math.random();
        const color = new THREE.Color(colors.primary).lerp(new THREE.Color(colors.accent), t);
        this.sparkColors[i * 3] = color.r;
        this.sparkColors[i * 3 + 1] = color.g;
        this.sparkColors[i * 3 + 2] = color.b;
      }

      if (this.sparksGeometry) {
        this.sparksGeometry.attributes.color.needsUpdate = true;
      }

      // Update glow color
      if (this.glowMesh) {
        (this.glowMesh.material as THREE.MeshBasicMaterial).color.set(colors.primary);
      }
    }
  }

  destroy(): void {
    if (this.sparksGeometry) {
      this.sparksGeometry.dispose();
    }

    if (this.sparksPoints) {
      (this.sparksPoints.material as THREE.Material).dispose();
    }

    if (this.anvilMesh) {
      this.anvilMesh.geometry.dispose();
      (this.anvilMesh.material as THREE.Material).dispose();
    }

    if (this.glowMesh) {
      this.glowMesh.geometry.dispose();
      (this.glowMesh.material as THREE.Material).dispose();
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
    this.sparksGeometry = null;
    this.sparksPoints = null;
    this.anvilMesh = null;
    this.glowMesh = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sparkDensity: {
        type: "number",
        label: "Spark Density",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      sparkLifetime: {
        type: "number",
        label: "Spark Lifetime",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      forgeIntensity: {
        type: "number",
        label: "Forge Glow",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "fire",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
