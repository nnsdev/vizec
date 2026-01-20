import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_HEX, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface GeometricFlowerConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  petalCount: number;
  layerCount: number;
  bloomSpeed: number;
}

export class GeometricFlowerVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "geometricFlower",
    name: "Geometric Flower",
    author: "Vizec",
    description: "Parametric 3D flower with audio-reactive petals",
    renderer: "threejs",
    transitionType: "zoom",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private flowerGroup: THREE.Group | null = null;
  private petalMeshes: THREE.Mesh[] = [];

  private config: GeometricFlowerConfig = {
    sensitivity: 1.0,
    colorScheme: "sunset",
    petalCount: 12,
    layerCount: 4,
    bloomSpeed: 0.5,
  };

  private width = 0;
  private height = 0;
  private bloomPhase = 0;

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
    this.camera.position.z = 40;

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createFlower();

    this.resize(container.clientWidth, container.clientHeight);
  }

  private createFlower(): void {
    if (!this.scene) return;

    // Remove existing
    if (this.flowerGroup) {
      this.scene.remove(this.flowerGroup);
      for (const mesh of this.petalMeshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    }
    this.petalMeshes = [];

    this.flowerGroup = new THREE.Group();
    this.scene.add(this.flowerGroup);

    const { petalCount, layerCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    // Create petals for each layer
    for (let layer = 0; layer < layerCount; layer++) {
      const layerT = layer / (layerCount - 1);
      const color =
        layerT < 0.5
          ? new THREE.Color(colors.primary).lerp(new THREE.Color(colors.secondary), layerT * 2)
          : new THREE.Color(colors.secondary).lerp(
              new THREE.Color(colors.glow),
              (layerT - 0.5) * 2,
            );

      const material = new THREE.MeshPhongMaterial({
        color,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        emissive: color,
        emissiveIntensity: 0.2,
      });

      const petalLength = 8 + layer * 3;
      const petalWidth = 2 + layer * 0.5;

      // Create petal shape
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(petalWidth, petalLength * 0.3, petalWidth * 0.5, petalLength * 0.6);
      shape.quadraticCurveTo(0, petalLength, 0, petalLength);
      shape.quadraticCurveTo(0, petalLength, -petalWidth * 0.5, petalLength * 0.6);
      shape.quadraticCurveTo(-petalWidth, petalLength * 0.3, 0, 0);

      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: 0.1,
        bevelEnabled: false,
      });

      geometry.rotateX(Math.PI / 2);

      // Create petals in a circle
      for (let i = 0; i < petalCount; i++) {
        const angle = (i / petalCount) * Math.PI * 2;
        const mesh = new THREE.Mesh(geometry, material);

        mesh.position.x = Math.cos(angle) * (layer * 1.5);
        mesh.position.z = Math.sin(angle) * (layer * 1.5);
        mesh.position.y = layer * 0.5;
        mesh.rotation.y = angle;

        mesh.userData = {
          layer,
          petalIndex: i,
          baseAngle: angle,
          baseScale: 1,
        };

        this.flowerGroup.add(mesh);
        this.petalMeshes.push(mesh);
      }
    }

    // Create center
    const centerGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    const centerMaterial = new THREE.MeshPhongMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.9,
      emissive: colors.glow,
      emissiveIntensity: 0.5,
    });
    const center = new THREE.Mesh(centerGeometry, centerMaterial);
    center.userData = { isCenter: true };
    this.flowerGroup.add(center);
    this.petalMeshes.push(center);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.flowerGroup) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, bloomSpeed } = this.config;

    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;
    const volumeBoost = volume * sensitivity;

    // Update bloom phase
    this.bloomPhase += ((bloomSpeed * 0.01 + volumeBoost * 0.02) * deltaTime) / 16.67;

    // Update each petal
    for (const mesh of this.petalMeshes) {
      if (mesh.userData.isCenter) {
        // Update center
        const scale = 1 + bassBoost * 0.3 + Math.sin(this.bloomPhase) * 0.1;
        mesh.scale.set(scale, scale, scale);

        if (mesh.material instanceof THREE.MeshPhongMaterial) {
          mesh.material.emissiveIntensity = 0.3 + volumeBoost * 0.5 + trebleBoost * 0.2;
        }
        continue;
      }

      const { layer, petalIndex, baseAngle } = mesh.userData;

      // Get frequency data for this petal
      const freqIndex = Math.floor(
        (petalIndex / this.petalMeshes.length) * frequencyData.length * 0.3,
      );
      const freqValue = frequencyData[freqIndex] / 255;

      // Calculate petal expansion based on layer and audio
      const layerExpand = layer * 1.5;
      const audioExpand = freqValue * 3 * sensitivity;
      const pulseExpand = Math.sin(this.bloomPhase + layer * 0.5) * 0.5;

      const targetX = Math.cos(baseAngle) * (layerExpand + audioExpand + pulseExpand);
      const targetZ = Math.sin(baseAngle) * (layerExpand + audioExpand + pulseExpand);

      mesh.position.x += (targetX - mesh.position.x) * 0.1;
      mesh.position.z += (targetZ - mesh.position.z) * 0.1;

      // Petal rotation and scaling
      const rotationAmount = Math.sin(this.bloomPhase * 2 + petalIndex * 0.5) * 0.2;
      mesh.rotation.y = baseAngle + rotationAmount;

      const scale = 1 + freqValue * 0.5 * sensitivity + midBoost * 0.2;
      mesh.scale.set(scale, scale, scale);

      // Update material
      if (mesh.material instanceof THREE.MeshPhongMaterial) {
        mesh.material.opacity = 0.6 + freqValue * 0.3;
        mesh.material.emissiveIntensity = 0.2 + trebleBoost * 0.1;
      }
    }

    // Whole flower rotation
    this.flowerGroup.rotation.y += 0.005 * (1 + volumeBoost);

    // Camera movement
    this.camera.position.x = Math.sin(Date.now() * 0.0003) * 5;
    this.camera.position.y = Math.cos(Date.now() * 0.0002) * 3;
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
    this.config = { ...this.config, ...config } as GeometricFlowerConfig;

    if (
      config.petalCount !== undefined ||
      config.layerCount !== undefined ||
      config.colorScheme !== undefined
    ) {
      this.createFlower();
    }
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.container && this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    for (const mesh of this.petalMeshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
    }

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.flowerGroup = null;
    this.petalMeshes = [];
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
        default: "sunset",
        label: "Color Scheme",
      },
      petalCount: {
        type: "number",
        min: 5,
        max: 20,
        step: 1,
        default: 12,
        label: "Petal Count",
      },
      layerCount: {
        type: "number",
        min: 2,
        max: 8,
        step: 1,
        default: 4,
        label: "Layer Count",
      },
      bloomSpeed: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Bloom Speed",
      },
    };
  }
}
