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

interface CubeFieldConfig extends VisualizationConfig {
  gridSize: number;
  spacing: number;
  colorScheme: string;
  maxHeight: number;
  rotateWithAudio: boolean;
}

interface CubeData {
  mesh: THREE.Mesh;
  baseY: number;
  freqIndex: number;
}

export class CubeFieldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "cubeField",
    name: "Cube Field",
    author: "Vizec",
    description: "Grid of cubes that react to frequency data",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private cubes: CubeData[] = [];
  private cubeGroup: THREE.Group | null = null;

  private config: CubeFieldConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    gridSize: 8,
    spacing: 3,
    maxHeight: 20,
    rotateWithAudio: true,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera - angled view looking down at the grid
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(30, 40, 30);
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

    // Create cube field
    this.createCubeField();
  }

  private createCubeField(): void {
    if (!this.scene) return;

    const { gridSize, spacing, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    // Remove existing cubes
    if (this.cubeGroup) {
      this.scene.remove(this.cubeGroup);
      this.cubes.forEach((cubeData) => {
        cubeData.mesh.geometry.dispose();
        (cubeData.mesh.material as THREE.Material).dispose();
      });
      this.cubes = [];
    }

    this.cubeGroup = new THREE.Group();
    this.cubes = [];

    const halfGrid = ((gridSize - 1) * spacing) / 2;

    // Create cubes
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        // Create cube geometry
        const geometry = new THREE.BoxGeometry(spacing * 0.8, 1, spacing * 0.8);

        // Interpolate color based on position
        const posRatio = (i + j) / (gridSize * 2 - 2);
        const color = new THREE.Color(colors.primary).lerp(
          new THREE.Color(colors.secondary),
          posRatio,
        );

        const material = new THREE.MeshBasicMaterial({
          color: color,
          transparent: true,
          opacity: 0.7,
          wireframe: false,
        });

        const cube = new THREE.Mesh(geometry, material);

        // Position cube in grid
        const x = i * spacing - halfGrid;
        const z = j * spacing - halfGrid;
        cube.position.set(x, 0.5, z);

        // Map cube to frequency bin
        // Center cubes get bass, edges get treble
        const centerDist = Math.sqrt(Math.pow(i - gridSize / 2, 2) + Math.pow(j - gridSize / 2, 2));
        const maxDist = (Math.sqrt(2) * gridSize) / 2;
        const freqIndex = Math.floor((centerDist / maxDist) * 0.7 * 255);

        this.cubes.push({
          mesh: cube,
          baseY: 0.5,
          freqIndex: Math.min(freqIndex, 254),
        });

        this.cubeGroup.add(cube);
      }
    }

    this.scene.add(this.cubeGroup);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.cubeGroup) return;

    const { bass, mid, frequencyData } = audioData;
    const { sensitivity, maxHeight, rotateWithAudio, gridSize } = this.config;

    this.time += deltaTime;

    const bassBoost = Math.pow(bass, 0.7) * 2;
    const midBoost = Math.pow(mid, 0.7) * 1.5;

    // Rotate entire grid based on audio
    if (rotateWithAudio) {
      this.cubeGroup.rotation.y += 0.18 * (1 + midBoost * sensitivity * 0.5) * deltaTime;
    } else {
      this.cubeGroup.rotation.y += 0.12 * deltaTime;
    }

    // Update each cube
    for (let i = 0; i < this.cubes.length; i++) {
      const cubeData = this.cubes[i];
      const { mesh, freqIndex } = cubeData;

      // Get frequency value for this cube
      const freqValue = frequencyData[freqIndex] / 255;
      const boostedValue = Math.pow(freqValue, 0.8) * sensitivity;

      // Calculate target height
      const targetHeight = 0.5 + boostedValue * maxHeight;

      // Smooth height transition
      const currentScale = mesh.scale.y;
      const newScale = currentScale + (targetHeight - currentScale) * 0.15;
      mesh.scale.y = newScale;

      // Adjust Y position so cubes grow from bottom
      mesh.position.y = newScale / 2;

      // Rotate cubes based on audio if enabled
      if (rotateWithAudio && boostedValue > 0.3) {
        const gridX = Math.floor(i / gridSize);
        const gridZ = i % gridSize;
        const rotationFactor = (gridX + gridZ) * 0.1;

        mesh.rotation.y += boostedValue * 0.1 * sensitivity;
        mesh.rotation.x = Math.sin(this.time * 2 + rotationFactor) * boostedValue * 0.2;
        mesh.rotation.z = Math.cos(this.time * 2 + rotationFactor) * boostedValue * 0.2;
      } else {
        // Smoothly return to neutral rotation
        mesh.rotation.x *= 0.95;
        mesh.rotation.z *= 0.95;
      }

      // Update opacity based on height
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 + boostedValue * 0.5;
    }

    // Camera movement based on audio
    const baseDistance = 45;
    const targetDistance = baseDistance - bassBoost * sensitivity * 8;

    // Orbit camera slightly
    const cameraAngle = this.time * 0.1;
    const targetX = Math.sin(cameraAngle) * targetDistance;
    const targetZ = Math.cos(cameraAngle) * targetDistance;
    const targetY = 30 + midBoost * sensitivity * 5;

    this.camera.position.x += (targetX - this.camera.position.x) * 0.02;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.02;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.05;
    this.camera.lookAt(0, maxHeight * 0.3, 0);

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
    const oldGridSize = this.config.gridSize;
    const oldSpacing = this.config.spacing;

    this.config = { ...this.config, ...config } as CubeFieldConfig;

    // Recreate cube field if relevant settings changed
    if (
      this.scene &&
      (this.config.colorScheme !== oldColorScheme ||
        this.config.gridSize !== oldGridSize ||
        this.config.spacing !== oldSpacing)
    ) {
      this.createCubeField();
    }
  }

  destroy(): void {
    // Clean up cubes
    this.cubes.forEach((cubeData) => {
      cubeData.mesh.geometry.dispose();
      (cubeData.mesh.material as THREE.Material).dispose();
    });
    this.cubes = [];

    if (this.cubeGroup) {
      this.scene?.remove(this.cubeGroup);
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
    this.cubeGroup = null;
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
      gridSize: { type: "number", min: 4, max: 16, step: 1, default: 8, label: "Grid Size" },
      spacing: { type: "number", min: 2, max: 6, step: 0.5, default: 3, label: "Cube Spacing" },
      maxHeight: { type: "number", min: 5, max: 40, step: 1, default: 20, label: "Max Height" },
      rotateWithAudio: { type: "boolean", default: true, label: "Rotate with Audio" },
    };
  }
}
