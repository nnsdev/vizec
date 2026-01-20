import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_HEX, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface AudioSphereConfig extends VisualizationConfig {
  radius: number;
  segments: number;
  colorScheme: string;
  displacementIntensity: number;
  rotationSpeed: number;
}

export class AudioSphereVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "audioSphere",
    name: "Audio Sphere",
    author: "Vizec",
    description: "Glowing wireframe sphere with frequency-based vertex displacement",
    renderer: "threejs",
    transitionType: "crossfade",
  };

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
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

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
        options: [...COLOR_SCHEME_OPTIONS],
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
