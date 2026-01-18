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

interface ClockworkGearsConfig extends VisualizationConfig {
  gearCount: number;
  rotationSpeed: number;
  colorScheme: string;
  wobbleIntensity: number;
}

interface Gear {
  mesh: THREE.Group;
  radius: number;
  teeth: number;
  rotationDirection: number;
  rotationOffset: number;
  baseRotation: number;
}

export class ClockworkGearsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "clockworkGears",
    name: "Clockwork Gears",
    author: "Vizec",
    description: "Interlocking brass gears that rotate with audio",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private gears: Gear[] = [];
  private ambientLight: THREE.AmbientLight | null = null;
  private directionalLight: THREE.DirectionalLight | null = null;

  private config: ClockworkGearsConfig = {
    sensitivity: 1.0,
    colorScheme: "golden",
    gearCount: 7,
    rotationSpeed: 0.5,
    wobbleIntensity: 0.5,
  };

  private time = 0;
  private smoothedBass = 0;
  private smoothedTreble = 0;
  private smoothedVolume = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
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

    // Add lighting
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.directionalLight.position.set(5, 10, 10);
    this.scene.add(this.directionalLight);

    // Create gears
    this.createGears();
  }

  private createGears(): void {
    if (!this.scene) return;

    const { gearCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    // Remove existing gears
    this.gears.forEach((gear) => {
      this.scene!.remove(gear.mesh);
      gear.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.gears = [];

    // Create gear configurations
    const gearConfigs = this.generateGearLayout(gearCount);

    gearConfigs.forEach((gearConfig, index) => {
      const gear = this.createSingleGear(
        gearConfig.radius,
        gearConfig.teeth,
        gearConfig.x,
        gearConfig.y,
        gearConfig.direction,
        colors,
        index
      );
      this.gears.push(gear);
      this.scene!.add(gear.mesh);
    });
  }

  private generateGearLayout(count: number): Array<{
    radius: number;
    teeth: number;
    x: number;
    y: number;
    direction: number;
  }> {
    const layouts: Array<{ radius: number; teeth: number; x: number; y: number; direction: number }> = [];

    // Central gear
    const centerRadius = 4;
    const centerTeeth = 20;
    layouts.push({
      radius: centerRadius,
      teeth: centerTeeth,
      x: 0,
      y: 0,
      direction: 1,
    });

    // Surrounding gears that mesh with center
    const surroundingCount = Math.min(count - 1, 6);
    for (let i = 0; i < surroundingCount; i++) {
      const angle = (i / surroundingCount) * Math.PI * 2 + Math.PI / 6;
      const radius = 2.5 + (i % 2) * 0.5;
      const teeth = Math.round(radius * 5);

      // Calculate position for meshing
      const distance = centerRadius + radius + 0.3; // Small gap for visual clarity
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      layouts.push({
        radius,
        teeth,
        x,
        y,
        direction: -1, // Opposite direction to mesh properly
      });
    }

    // Add a few decorative smaller gears on the periphery
    if (count > 7) {
      const extraCount = count - 7;
      for (let i = 0; i < extraCount; i++) {
        const parentIndex = (i % surroundingCount) + 1;
        const parent = layouts[parentIndex];
        const angle = (i / extraCount) * Math.PI * 2 + Math.PI / 3;
        const radius = 1.5;
        const teeth = 8;

        const distance = parent.radius + radius + 0.2;
        const x = parent.x + Math.cos(angle) * distance;
        const y = parent.y + Math.sin(angle) * distance;

        layouts.push({
          radius,
          teeth,
          x,
          y,
          direction: parent.direction * -1,
        });
      }
    }

    return layouts.slice(0, count);
  }

  private createSingleGear(
    radius: number,
    teeth: number,
    x: number,
    y: number,
    direction: number,
    colors: { primary: number; secondary: number; glow: number },
    index: number
  ): Gear {
    const group = new THREE.Group();

    // Gear body material (metallic brass look)
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: colors.primary,
      metalness: 0.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.85,
    });

    // Create gear body
    const gearShape = this.createGearShape(radius, teeth);
    const extrudeSettings = {
      steps: 1,
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.05,
      bevelSegments: 2,
    };
    const gearGeometry = new THREE.ExtrudeGeometry(gearShape, extrudeSettings);
    const gearMesh = new THREE.Mesh(gearGeometry, bodyMaterial);
    gearMesh.position.z = -0.25;
    group.add(gearMesh);

    // Create center hub
    const hubGeometry = new THREE.CylinderGeometry(radius * 0.25, radius * 0.25, 1, 16);
    const hubMaterial = new THREE.MeshStandardMaterial({
      color: colors.secondary,
      metalness: 0.9,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    });
    const hubMesh = new THREE.Mesh(hubGeometry, hubMaterial);
    hubMesh.rotation.x = Math.PI / 2;
    group.add(hubMesh);

    // Create center axle hole
    const holeGeometry = new THREE.CylinderGeometry(radius * 0.1, radius * 0.1, 1.2, 16);
    const holeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.8,
    });
    const holeMesh = new THREE.Mesh(holeGeometry, holeMaterial);
    holeMesh.rotation.x = Math.PI / 2;
    group.add(holeMesh);

    // Add decorative spokes for larger gears
    if (radius > 2.5) {
      const spokeCount = Math.floor(teeth / 5);
      for (let i = 0; i < spokeCount; i++) {
        const angle = (i / spokeCount) * Math.PI * 2;
        const spokeGeometry = new THREE.BoxGeometry(radius * 0.6, 0.2, 0.3);
        const spokeMaterial = new THREE.MeshStandardMaterial({
          color: colors.glow,
          metalness: 0.7,
          roughness: 0.4,
          transparent: true,
          opacity: 0.8,
        });
        const spokeMesh = new THREE.Mesh(spokeGeometry, spokeMaterial);
        spokeMesh.position.x = Math.cos(angle) * radius * 0.45;
        spokeMesh.position.y = Math.sin(angle) * radius * 0.45;
        spokeMesh.rotation.z = angle;
        group.add(spokeMesh);
      }
    }

    // Position the gear group
    group.position.set(x, y, 0);

    // Calculate rotation offset for proper meshing
    const rotationOffset = index * (Math.PI / teeth);

    return {
      mesh: group,
      radius,
      teeth,
      rotationDirection: direction,
      rotationOffset,
      baseRotation: 0,
    };
  }

  private createGearShape(radius: number, teeth: number): THREE.Shape {
    const shape = new THREE.Shape();
    const toothHeight = radius * 0.15;
    const toothWidth = (Math.PI * 2) / teeth / 2;
    const innerRadius = radius - toothHeight;

    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
      const midAngle = (angle + nextAngle) / 2;

      // Tooth base (inner radius)
      const x1 = Math.cos(angle) * innerRadius;
      const y1 = Math.sin(angle) * innerRadius;

      // Tooth tip left
      const x2 = Math.cos(angle + toothWidth * 0.3) * radius;
      const y2 = Math.sin(angle + toothWidth * 0.3) * radius;

      // Tooth tip right
      const x3 = Math.cos(midAngle - toothWidth * 0.3) * radius;
      const y3 = Math.sin(midAngle - toothWidth * 0.3) * radius;

      // Next tooth base
      const x4 = Math.cos(midAngle) * innerRadius;
      const y4 = Math.sin(midAngle) * innerRadius;

      if (i === 0) {
        shape.moveTo(x1, y1);
      } else {
        shape.lineTo(x1, y1);
      }
      shape.lineTo(x2, y2);
      shape.lineTo(x3, y3);
      shape.lineTo(x4, y4);
    }

    shape.closePath();
    return shape;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, rotationSpeed, wobbleIntensity } = this.config;
    const { bass, treble, volume } = audioData;

    // Smooth audio values
    const smoothing = 0.15;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Calculate rotation speed based on bass
    const bassBoost = 1 + this.smoothedBass * sensitivity * 2;
    const baseRotationDelta = rotationSpeed * 0.01 * bassBoost;

    // Update each gear
    this.gears.forEach((gear, index) => {
      // Calculate rotation based on gear ratio (teeth count)
      const gearRatio = this.gears[0].teeth / gear.teeth;
      const rotationDelta = baseRotationDelta * gearRatio * gear.rotationDirection;
      gear.baseRotation += rotationDelta;

      // Apply rotation with meshing offset
      gear.mesh.rotation.z = gear.baseRotation + gear.rotationOffset;

      // Add wobble effect on treble
      if (wobbleIntensity > 0) {
        const wobblePhase = this.time * 3 + index * 0.5;
        const wobbleAmount = this.smoothedTreble * sensitivity * wobbleIntensity * 0.03;
        gear.mesh.rotation.x = Math.sin(wobblePhase) * wobbleAmount;
        gear.mesh.rotation.y = Math.cos(wobblePhase * 0.7) * wobbleAmount;
      } else {
        gear.mesh.rotation.x = 0;
        gear.mesh.rotation.y = 0;
      }

      // Pulse scale with volume
      const scalePulse = 1 + this.smoothedVolume * sensitivity * 0.05;
      gear.mesh.scale.setScalar(scalePulse);

      // Update material opacity based on volume
      gear.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
          child.material.opacity = 0.7 + this.smoothedVolume * 0.2;
        }
      });
    });

    // Subtle camera movement
    const cameraZ = 30 + Math.sin(this.time * 0.3) * 2;
    this.camera.position.z = cameraZ;

    // Update directional light intensity with volume
    if (this.directionalLight) {
      this.directionalLight.intensity = 0.6 + this.smoothedVolume * 0.6;
    }

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
    const oldGearCount = this.config.gearCount;

    this.config = { ...this.config, ...config } as ClockworkGearsConfig;

    // Recreate gears if relevant settings changed
    if (
      this.scene &&
      (this.config.colorScheme !== oldColorScheme || this.config.gearCount !== oldGearCount)
    ) {
      this.createGears();
    }
  }

  destroy(): void {
    // Dispose gears
    this.gears.forEach((gear) => {
      gear.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });

    // Dispose lights
    if (this.ambientLight) {
      this.ambientLight.dispose();
    }
    if (this.directionalLight) {
      this.directionalLight.dispose();
    }

    // Dispose renderer
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.gears = [];
    this.ambientLight = null;
    this.directionalLight = null;
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
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
        default: "golden",
        label: "Color Scheme",
      },
      gearCount: {
        type: "number",
        min: 3,
        max: 10,
        step: 1,
        default: 7,
        label: "Gear Count",
      },
      rotationSpeed: {
        type: "number",
        min: 0.1,
        max: 2.0,
        step: 0.1,
        default: 0.5,
        label: "Rotation Speed",
      },
      wobbleIntensity: {
        type: "number",
        min: 0,
        max: 1.0,
        step: 0.1,
        default: 0.5,
        label: "Wobble Intensity",
      },
    };
  }
}
