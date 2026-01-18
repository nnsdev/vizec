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

interface CrushingGearsConfig extends VisualizationConfig {
  gearCount: number;
  rotationSpeed: number;
  gearSize: number;
}

interface Gear {
  mesh: THREE.Group;
  rotationDir: number;
  baseSpeed: number;
  teeth: number;
}

export class CrushingGearsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "crushingGears",
    name: "Crushing Gears",
    author: "Vizec",
    description: "Heavy industrial gears rotating with mechanical precision",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private gears: Gear[] = [];
  private gearsGroup: THREE.Group | null = null;

  private config: CrushingGearsConfig = {
    sensitivity: 1.0,
    colorScheme: "golden",
    gearCount: 5,
    rotationSpeed: 1.0,
    gearSize: 1.0,
  };

  private time = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 30);
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

    // Create gears group
    this.gearsGroup = new THREE.Group();
    this.scene.add(this.gearsGroup);

    // Create gears
    this.createGears();
  }

  private createGearMesh(
    innerRadius: number,
    outerRadius: number,
    teeth: number,
    thickness: number,
    colors: { primary: number; accent: number; glow: number }
  ): THREE.Group {
    const gearGroup = new THREE.Group();

    // Main body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(
      innerRadius * 0.9,
      innerRadius * 0.9,
      thickness,
      32
    );
    const bodyMaterial = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.6,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.rotation.x = Math.PI / 2;
    gearGroup.add(body);

    // Teeth
    const toothWidth = (2 * Math.PI * outerRadius) / (teeth * 2);
    const toothHeight = outerRadius - innerRadius;

    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;

      const toothGeometry = new THREE.BoxGeometry(toothWidth * 0.8, thickness, toothHeight);
      const toothMaterial = new THREE.MeshBasicMaterial({
        color: colors.accent,
        transparent: true,
        opacity: 0.5,
      });
      const tooth = new THREE.Mesh(toothGeometry, toothMaterial);

      const toothRadius = innerRadius + toothHeight / 2;
      tooth.position.x = Math.cos(angle) * toothRadius;
      tooth.position.y = Math.sin(angle) * toothRadius;
      tooth.rotation.z = angle;

      gearGroup.add(tooth);
    }

    // Center hole
    const holeGeometry = new THREE.CylinderGeometry(
      innerRadius * 0.3,
      innerRadius * 0.3,
      thickness * 1.1,
      16
    );
    const holeMaterial = new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.4,
    });
    const hole = new THREE.Mesh(holeGeometry, holeMaterial);
    hole.rotation.x = Math.PI / 2;
    gearGroup.add(hole);

    // Spokes
    const spokeCount = Math.min(6, Math.floor(teeth / 3));
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const spokeLength = innerRadius * 0.5;

      const spokeGeometry = new THREE.BoxGeometry(spokeLength, thickness * 0.8, 1);
      const spokeMaterial = new THREE.MeshBasicMaterial({
        color: colors.primary,
        transparent: true,
        opacity: 0.5,
      });
      const spoke = new THREE.Mesh(spokeGeometry, spokeMaterial);

      spoke.position.x = Math.cos(angle) * (innerRadius * 0.5);
      spoke.position.y = Math.sin(angle) * (innerRadius * 0.5);
      spoke.rotation.z = angle;

      gearGroup.add(spoke);
    }

    return gearGroup;
  }

  private createGears(): void {
    if (!this.scene || !this.gearsGroup) return;

    const { gearCount, colorScheme, gearSize } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Clear existing gears
    this.gears.forEach(gear => {
      gear.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
      this.gearsGroup?.remove(gear.mesh);
    });
    this.gears = [];

    // Create interlocking gears
    const gearConfigs = [
      { x: 0, y: 0, radius: 5, teeth: 20 },
      { x: 9.5, y: 0, radius: 4, teeth: 16 },
      { x: -9.5, y: 0, radius: 4, teeth: 16 },
      { x: 4.5, y: 8, radius: 3.5, teeth: 14 },
      { x: -4.5, y: 8, radius: 3.5, teeth: 14 },
      { x: 0, y: -9, radius: 4.5, teeth: 18 },
    ];

    for (let i = 0; i < Math.min(gearCount, gearConfigs.length); i++) {
      const cfg = gearConfigs[i];
      const innerRadius = cfg.radius * 0.8 * gearSize;
      const outerRadius = cfg.radius * gearSize;

      const gearMesh = this.createGearMesh(
        innerRadius,
        outerRadius,
        cfg.teeth,
        2,
        colors
      );

      gearMesh.position.set(cfg.x * gearSize, cfg.y * gearSize, 0);

      // Alternate rotation direction
      const rotationDir = i % 2 === 0 ? 1 : -1;

      // Speed inversely proportional to size for meshing
      const baseSpeed = 0.02 / (cfg.radius / 5);

      this.gearsGroup.add(gearMesh);
      this.gears.push({
        mesh: gearMesh,
        rotationDir,
        baseSpeed,
        teeth: cfg.teeth,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.gearsGroup) return;

    const { bass, mid } = audioData;
    const { sensitivity, rotationSpeed } = this.config;

    // Smooth audio
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;

    this.time += deltaTime * 0.001;

    // Rotate gears
    const audioSpeedBoost = 1 + this.smoothedMid * 2;

    for (const gear of this.gears) {
      gear.mesh.rotation.z += gear.rotationDir * gear.baseSpeed * rotationSpeed * audioSpeedBoost * deltaTime;

      // Pulse gear scale with bass
      const pulse = 1 + this.smoothedBass * 0.1;
      gear.mesh.scale.setScalar(pulse);

      // Update opacity based on audio
      gear.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          const material = child.material as THREE.MeshBasicMaterial;
          material.opacity = 0.4 + this.smoothedBass * 0.3;
        }
      });
    }

    // Rotate entire group slowly
    this.gearsGroup.rotation.z += 0.001 * deltaTime;

    // Camera movement
    const cameraRadius = 30 - this.smoothedBass * 5;
    this.camera.position.x = Math.sin(this.time * 0.15) * 5;
    this.camera.position.y = Math.cos(this.time * 0.1) * 5;
    this.camera.position.z = cameraRadius;
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
    const oldGearCount = this.config.gearCount;
    const oldColorScheme = this.config.colorScheme;
    const oldGearSize = this.config.gearSize;

    this.config = { ...this.config, ...config } as CrushingGearsConfig;

    if (this.scene && (
      this.config.gearCount !== oldGearCount ||
      this.config.colorScheme !== oldColorScheme ||
      this.config.gearSize !== oldGearSize
    )) {
      this.createGears();
    }
  }

  destroy(): void {
    // Clean up gears
    this.gears.forEach(gear => {
      gear.mesh.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          (child.material as THREE.Material).dispose();
        }
      });
    });
    this.gears = [];

    if (this.gearsGroup) {
      this.scene?.remove(this.gearsGroup);
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
    this.gearsGroup = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      gearCount: {
        type: "number",
        label: "Gear Count",
        default: 5,
        min: 2,
        max: 6,
        step: 1,
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      gearSize: {
        type: "number",
        label: "Gear Size",
        default: 1.0,
        min: 0.5,
        max: 1.5,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "golden",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
