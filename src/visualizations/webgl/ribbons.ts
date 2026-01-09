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

interface RibbonsConfig extends VisualizationConfig {
  ribbonCount: number;
  length: number;
  colorScheme: string;
  waveIntensity: number;
  speed: number;
}

interface Ribbon {
  mesh: THREE.Mesh;
  geometry: THREE.TubeGeometry;
  curve: THREE.CatmullRomCurve3;
  basePoints: THREE.Vector3[];
  phase: number;
  frequency: number;
  axis: THREE.Vector3;
}

export class RibbonsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "ribbons",
    name: "Ribbons",
    author: "Vizec",
    description: "Flowing 3D ribbons that undulate through space with audio reactivity",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private ribbons: Ribbon[] = [];

  private config: RibbonsConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    ribbonCount: 8,
    length: 50,
    waveIntensity: 1.0,
    speed: 1.0,
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
    this.camera.position.z = 80;

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

    // Create ribbons
    this.createRibbons();
  }

  private createRibbons(): void {
    if (!this.scene) return;

    const { ribbonCount, length, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    // Remove existing ribbons
    this.disposeRibbons();

    // Create new ribbons
    for (let i = 0; i < ribbonCount; i++) {
      const ribbon = this.createRibbon(i, ribbonCount, length, colors);
      this.ribbons.push(ribbon);
      this.scene.add(ribbon.mesh);
    }
  }

  private createRibbon(
    index: number,
    total: number,
    length: number,
    colors: { primary: number; secondary: number; glow: number },
  ): Ribbon {
    // Generate base points for the ribbon curve
    const pointCount = 32;
    const basePoints: THREE.Vector3[] = [];

    // Distribute ribbons in a circular pattern
    const angleOffset = (index / total) * Math.PI * 2;
    const radius = 20 + (index % 3) * 10;

    // Create a helical/spiral base path
    for (let j = 0; j < pointCount; j++) {
      const t = j / (pointCount - 1);
      const angle = angleOffset + t * Math.PI * 2;
      const x = Math.cos(angle) * radius * (1 - t * 0.3);
      const y = (t - 0.5) * length;
      const z = Math.sin(angle) * radius * (1 - t * 0.3);
      basePoints.push(new THREE.Vector3(x, y, z));
    }

    // Create curve from points
    const curve = new THREE.CatmullRomCurve3(basePoints);

    // Create tube geometry
    const geometry = new THREE.TubeGeometry(curve, 64, 0.5, 8, false);

    // Interpolate color based on ribbon index
    const primaryColor = new THREE.Color(colors.primary);
    const secondaryColor = new THREE.Color(colors.secondary);
    const mixedColor = primaryColor.clone().lerp(secondaryColor, index / total);

    // Create material with transparency
    const material = new THREE.MeshBasicMaterial({
      color: mixedColor,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Random axis for wave motion
    const axis = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).normalize();

    return {
      mesh,
      geometry,
      curve,
      basePoints,
      phase: Math.random() * Math.PI * 2,
      frequency: 0.5 + Math.random() * 1.5,
      axis,
    };
  }

  private updateRibbonGeometry(ribbon: Ribbon, audioData: AudioData): void {
    const { bass, treble, volume } = audioData;
    const { sensitivity, waveIntensity, speed } = this.config;

    const bassBoost = Math.pow(bass, 0.7) * 2;
    const trebleBoost = Math.pow(treble, 0.7) * 1.5;

    // Update curve points based on audio
    const newPoints: THREE.Vector3[] = [];
    const pointCount = ribbon.basePoints.length;

    for (let i = 0; i < pointCount; i++) {
      const t = i / (pointCount - 1);
      const base = ribbon.basePoints[i];

      // Wave amplitude affected by bass
      const waveAmplitude = (2 + bassBoost * sensitivity * 3) * waveIntensity;

      // Wave frequency affected by treble
      const waveFreq = (1 + trebleBoost * sensitivity * 0.5) * ribbon.frequency;

      // Calculate wave offset
      const waveOffset =
        Math.sin(this.time * speed * 2 + ribbon.phase + t * Math.PI * 4 * waveFreq) * waveAmplitude;

      // Apply wave along ribbon's random axis
      const offset = ribbon.axis.clone().multiplyScalar(waveOffset);

      // Secondary perpendicular wave
      const perpAxis = new THREE.Vector3(0, 1, 0).cross(ribbon.axis).normalize();
      const perpWave =
        Math.sin(this.time * speed * 1.5 + ribbon.phase * 0.5 + t * Math.PI * 2) *
        waveAmplitude *
        0.5;
      const perpOffset = perpAxis.multiplyScalar(perpWave);

      newPoints.push(
        new THREE.Vector3(
          base.x + offset.x + perpOffset.x,
          base.y + offset.y + perpOffset.y,
          base.z + offset.z + perpOffset.z,
        ),
      );
    }

    // Update curve and regenerate geometry
    ribbon.curve.points = newPoints;

    // Calculate tube radius based on bass
    const tubeRadius = 0.3 + bassBoost * sensitivity * 0.4;

    // Dispose old geometry
    ribbon.geometry.dispose();

    // Create new geometry
    ribbon.geometry = new THREE.TubeGeometry(ribbon.curve, 64, tubeRadius, 8, false);
    ribbon.mesh.geometry = ribbon.geometry;

    // Update material opacity based on volume
    const material = ribbon.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.4 + volume * 0.4;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid } = audioData;
    const { sensitivity, speed } = this.config;

    this.time += deltaTime;

    const bassBoost = Math.pow(bass, 0.7) * 2;
    const midBoost = Math.pow(mid, 0.7) * 1.5;

    // Update each ribbon
    for (const ribbon of this.ribbons) {
      this.updateRibbonGeometry(ribbon, audioData);

      // Rotate ribbon slightly based on audio
      ribbon.mesh.rotation.y += 0.001 * speed * (1 + midBoost * sensitivity * 0.5);
    }

    // Camera slowly rotates around the scene
    this.cameraAngle += 0.002 * speed * (1 + bassBoost * sensitivity * 0.2);
    const cameraRadius = 80 - bassBoost * sensitivity * 10;
    this.camera.position.x = Math.sin(this.cameraAngle) * cameraRadius;
    this.camera.position.z = Math.cos(this.cameraAngle) * cameraRadius;
    this.camera.position.y = Math.sin(this.cameraAngle * 0.3) * 20;
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
    const oldColorScheme = this.config.colorScheme;
    const oldRibbonCount = this.config.ribbonCount;
    const oldLength = this.config.length;

    this.config = { ...this.config, ...config } as RibbonsConfig;

    // Recreate ribbons if relevant settings changed
    if (
      this.scene &&
      (this.config.colorScheme !== oldColorScheme ||
        this.config.ribbonCount !== oldRibbonCount ||
        this.config.length !== oldLength)
    ) {
      this.createRibbons();
    }
  }

  private disposeRibbons(): void {
    for (const ribbon of this.ribbons) {
      ribbon.geometry.dispose();
      (ribbon.mesh.material as THREE.Material).dispose();
      if (this.scene) {
        this.scene.remove(ribbon.mesh);
      }
    }
    this.ribbons = [];
  }

  destroy(): void {
    this.disposeRibbons();

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
        options: COLOR_SCHEME_OPTIONS,
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      ribbonCount: { type: "number", min: 2, max: 20, step: 1, default: 8, label: "Ribbon Count" },
      length: { type: "number", min: 20, max: 100, step: 5, default: 50, label: "Ribbon Length" },
      waveIntensity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Wave Intensity",
      },
      speed: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Animation Speed",
      },
    };
  }
}
