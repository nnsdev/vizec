import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

const COLOR_SCHEMES: Record<string, { primary: number; secondary: number; glow: number }> = {
  cyanMagenta: { primary: 0x00ffff, secondary: 0xff00ff, glow: 0x00ffff },
  darkTechno: { primary: 0x4a00e0, secondary: 0x8e2de2, glow: 0x8000ff },
  neon: { primary: 0x39ff14, secondary: 0xff073a, glow: 0xffff00 },
  fire: { primary: 0xff4500, secondary: 0xffd700, glow: 0xff6600 },
  ice: { primary: 0x00bfff, secondary: 0xe0ffff, glow: 0x87ceeb },
  acid: { primary: 0xadff2f, secondary: 0x00ff00, glow: 0x00ff00 },
  monochrome: { primary: 0xffffff, secondary: 0x888888, glow: 0xffffff },
  purpleHaze: { primary: 0x8b00ff, secondary: 0xff1493, glow: 0x9400d3 },
  sunset: { primary: 0xff6b6b, secondary: 0xfeca57, glow: 0xff9f43 },
  ocean: { primary: 0x0077be, secondary: 0x00d4aa, glow: 0x00b4d8 },
  toxic: { primary: 0x00ff41, secondary: 0x0aff0a, glow: 0x39ff14 },
  bloodMoon: { primary: 0x8b0000, secondary: 0xff4500, glow: 0xdc143c },
  synthwave: { primary: 0xff00ff, secondary: 0x00ffff, glow: 0xff00aa },
  golden: { primary: 0xffd700, secondary: 0xff8c00, glow: 0xffb347 },
};

interface AudioSphereConfig extends VisualizationConfig {
  radius: number;
  segments: number;
  colorScheme: string;
  displacementIntensity: number;
  rotationSpeed: number;
}

export class AudioSphereVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "audioSphere",
    name: "Audio Sphere",
    author: "Vizec",
    description: "Glowing wireframe sphere with frequency-based vertex displacement",
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
  private sphere: THREE.Mesh | null = null;
  private innerSphere: THREE.Mesh | null = null;
  private geometry: THREE.IcosahedronGeometry | null = null;
  private originalPositions: Float32Array | null = null;

  private config: AudioSphereConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    radius: 15,
    segments: 4,
    displacementIntensity: 1.0,
    rotationSpeed: 0.5,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 50;

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

    // Create sphere
    this.createSphere();
  }

  private createSphere(): void {
    if (!this.scene) return;

    const { radius, segments, colorScheme } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Remove existing spheres
    if (this.sphere) {
      this.scene.remove(this.sphere);
      this.geometry?.dispose();
      (this.sphere.material as THREE.Material).dispose();
    }
    if (this.innerSphere) {
      this.scene.remove(this.innerSphere);
      (this.innerSphere.material as THREE.Material).dispose();
    }

    // Create icosahedron geometry for organic look
    this.geometry = new THREE.IcosahedronGeometry(radius, segments);

    // Store original positions for displacement
    const positions = this.geometry.attributes.position.array as Float32Array;
    this.originalPositions = new Float32Array(positions);

    // Create primary wireframe sphere
    const material = new THREE.MeshBasicMaterial({
      color: colors.primary,
      wireframe: true,
      transparent: true,
      opacity: 0.8,
    });

    this.sphere = new THREE.Mesh(this.geometry, material);
    this.scene.add(this.sphere);

    // Create inner glow sphere
    const innerGeometry = new THREE.IcosahedronGeometry(radius * 0.95, segments);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: colors.secondary,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });

    this.innerSphere = new THREE.Mesh(innerGeometry, innerMaterial);
    this.scene.add(this.innerSphere);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (
      !this.scene ||
      !this.camera ||
      !this.rendererThree ||
      !this.sphere ||
      !this.geometry ||
      !this.originalPositions
    )
      return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, displacementIntensity, rotationSpeed } = this.config;

    this.time += deltaTime;

    // Rotation based on audio
    const bassBoost = Math.pow(bass, 0.7) * 2;
    const midBoost = Math.pow(mid, 0.7) * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * 1.5;

    this.sphere.rotation.y += rotationSpeed * 0.01 * (1 + midBoost * sensitivity);
    this.sphere.rotation.x += rotationSpeed * 0.005 * (1 + trebleBoost * sensitivity * 0.5);
    this.sphere.rotation.z += rotationSpeed * 0.003 * Math.sin(this.time);

    if (this.innerSphere) {
      this.innerSphere.rotation.y = -this.sphere.rotation.y * 0.8;
      this.innerSphere.rotation.x = -this.sphere.rotation.x * 0.8;
    }

    // Get positions for displacement
    const positions = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = positions.length / 3;

    // Bass affects overall scale
    const baseScale = 1 + bassBoost * sensitivity * 0.15;
    this.sphere.scale.setScalar(baseScale);
    if (this.innerSphere) {
      this.innerSphere.scale.setScalar(baseScale * 0.95);
    }

    // Displace vertices based on frequency data
    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;

      // Get original position
      const ox = this.originalPositions[i3];
      const oy = this.originalPositions[i3 + 1];
      const oz = this.originalPositions[i3 + 2];

      // Calculate spherical coordinates for frequency mapping
      const phi = Math.acos(oy / Math.sqrt(ox * ox + oy * oy + oz * oz));

      // Map vertex position to frequency bin
      // Use phi (latitude) to determine bass/mid/treble regions
      const normalizedPhi = phi / Math.PI; // 0 to 1
      const freqIndex = Math.floor(normalizedPhi * frequencyData.length * 0.75);
      const freqValue = frequencyData[Math.min(freqIndex, frequencyData.length - 1)] / 255;

      // Higher frequencies cause more displacement
      const trebleWeight = normalizedPhi; // More treble effect at poles
      const bassWeight = 1 - normalizedPhi;

      // Calculate displacement
      const displacement = freqValue * displacementIntensity * sensitivity * 3;
      const trebleDisplacement =
        trebleBoost * trebleWeight * displacementIntensity * sensitivity * 2;
      const bassDisplacement = bassBoost * bassWeight * displacementIntensity * sensitivity * 1.5;

      // Total displacement
      const totalDisplacement =
        1 + displacement + trebleDisplacement * 0.3 + bassDisplacement * 0.2;

      // Apply displacement along vertex normal (outward)
      const length = Math.sqrt(ox * ox + oy * oy + oz * oz);
      const nx = ox / length;
      const ny = oy / length;
      const nz = oz / length;

      positions[i3] = ox + nx * (totalDisplacement - 1) * 5;
      positions[i3 + 1] = oy + ny * (totalDisplacement - 1) * 5;
      positions[i3 + 2] = oz + nz * (totalDisplacement - 1) * 5;
    }

    this.geometry.attributes.position.needsUpdate = true;

    // Update material opacity based on volume
    const material = this.sphere.material as THREE.MeshBasicMaterial;
    material.opacity = 0.6 + volume * 0.4;

    if (this.innerSphere) {
      const innerMaterial = this.innerSphere.material as THREE.MeshBasicMaterial;
      innerMaterial.opacity = 0.2 + volume * 0.3;
    }

    // Camera pulse based on bass
    const targetZ = 50 - bassBoost * sensitivity * 5;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.05;

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
    const oldRadius = this.config.radius;
    const oldSegments = this.config.segments;

    this.config = { ...this.config, ...config } as AudioSphereConfig;

    // Recreate sphere if relevant settings changed
    if (
      this.scene &&
      (this.config.colorScheme !== oldColorScheme ||
        this.config.radius !== oldRadius ||
        this.config.segments !== oldSegments)
    ) {
      this.createSphere();
    }
  }

  destroy(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }

    if (this.sphere) {
      (this.sphere.material as THREE.Material).dispose();
    }

    if (this.innerSphere) {
      (this.innerSphere.material as THREE.Material).dispose();
      (this.innerSphere.geometry as THREE.BufferGeometry).dispose();
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
    this.sphere = null;
    this.innerSphere = null;
    this.geometry = null;
    this.originalPositions = null;
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
        options: [
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "darkTechno", label: "Dark Techno" },
          { value: "neon", label: "Neon" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
          { value: "acid", label: "Acid" },
          { value: "monochrome", label: "Monochrome" },
          { value: "purpleHaze", label: "Purple Haze" },
          { value: "sunset", label: "Sunset" },
          { value: "ocean", label: "Ocean" },
          { value: "toxic", label: "Toxic" },
          { value: "bloodMoon", label: "Blood Moon" },
          { value: "synthwave", label: "Synthwave" },
          { value: "golden", label: "Golden" },
        ],
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      radius: { type: "number", min: 5, max: 30, step: 1, default: 15, label: "Sphere Radius" },
      segments: { type: "number", min: 1, max: 6, step: 1, default: 4, label: "Detail Level" },
      displacementIntensity: {
        type: "number",
        min: 0,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Displacement",
      },
      rotationSpeed: {
        type: "number",
        min: 0,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Rotation Speed",
      },
    };
  }
}
