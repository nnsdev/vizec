import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface IsometricMetropolisConfig extends VisualizationConfig {
  gridSize: number;
  buildingSpacing: number;
  maxHeight: number;
  colorScheme: string;
  rotationSpeed: number;
}

interface BuildingData {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments; // Wireframe overlay for "blueprint/tron" look
  freqIndex: number;
  baseHeight: number;
}

export class IsometricMetropolisVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "isometricMetropolis",
    name: "Isometric Metropolis",
    author: "Vizec",
    description: "SimCity-style grid where buildings grow with music",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private cityGroup: THREE.Group | null = null;
  private buildings: BuildingData[] = [];

  private config: IsometricMetropolisConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    gridSize: 10,
    buildingSpacing: 4,
    maxHeight: 30,
    rotationSpeed: 0.2,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    // Isometric view requires Orthographic camera
    // Frustum size
    const frustumSize = 100;
    const aspect = width / height;
    this.camera = new THREE.OrthographicCamera(
      (frustumSize * aspect) / -2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      frustumSize / -2,
      1,
      1000,
    );

    // Isometric angle: Look from corner
    this.camera.position.set(100, 100, 100);
    this.camera.lookAt(0, 0, 0);

    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createCity();
  }

  private createCity(): void {
    if (!this.scene) return;

    // Clean up old
    if (this.cityGroup) {
      this.scene.remove(this.cityGroup);
      this.buildings.forEach((b) => {
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        b.edges.geometry.dispose();
        (b.edges.material as THREE.Material).dispose();
      });
      this.buildings = [];
    }

    this.cityGroup = new THREE.Group();
    const { gridSize, buildingSpacing, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, colorScheme);

    const offset = (gridSize * buildingSpacing) / 2;

    // Building geometry reused? No, height changes.
    // Actually we scale Y, so we can reuse geometry?
    // Box geometry centered at origin makes scaling from center.
    // We want scaling from bottom.
    // So we translate geometry up by 0.5.
    const geometry = new THREE.BoxGeometry(buildingSpacing * 0.8, 1, buildingSpacing * 0.8);
    geometry.translate(0, 0.5, 0); // Pivot at bottom

    // Wireframe geometry
    const edgeGeometry = new THREE.EdgesGeometry(geometry);

    for (let x = 0; x < gridSize; x++) {
      for (let z = 0; z < gridSize; z++) {
        // Material
        // We want semi-transparent walls
        const material = new THREE.MeshBasicMaterial({
          color: colors.primary,
          transparent: true,
          opacity: 0.6,
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Wireframe edges for definition
        const edgesMaterial = new THREE.LineBasicMaterial({
          color: colors.accent,
          transparent: true,
          opacity: 0.8,
        });
        const edges = new THREE.LineSegments(edgeGeometry, edgesMaterial);

        mesh.add(edges);

        // Position
        mesh.position.set(x * buildingSpacing - offset, 0, z * buildingSpacing - offset);

        // Freq mapping
        // Center = Bass (Low freq), Edges = High freq?
        // Or diagonal?
        // Let's do center-out.
        const cx = gridSize / 2;
        const cz = gridSize / 2;
        const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(z - cz, 2));
        const maxDist = Math.sqrt(Math.pow(cx, 2) + Math.pow(cz, 2));

        // Map 0..maxDist to 0..255 (but usually low freqs are at 0)
        // Let's put Bass (index 0) at center.
        const freqIndex = Math.floor((dist / maxDist) * 100); // Use first ~40% of spectrum

        // Base height variance for "City" look
        const baseHeight = 5 + Math.random() * 10;

        this.buildings.push({
          mesh,
          edges,
          freqIndex,
          baseHeight,
        });

        this.cityGroup.add(mesh);
      }
    }

    this.scene.add(this.cityGroup);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.cityGroup) return;

    this.time += deltaTime;
    const { frequencyData, bass } = audioData;
    const { sensitivity, maxHeight, rotationSpeed } = this.config;

    // Rotate city slowly (reduced by 4x from original)
    this.cityGroup.rotation.y = Math.sin(this.time * rotationSpeed * 0.125) * 0.5;

    // Beat pulse on camera zoom? (reduced by 6x)
    const zoomPulse = 1 + bass * 0.0167 * sensitivity;
    this.camera.zoom = 1 * zoomPulse;
    this.camera.updateProjectionMatrix();

    this.buildings.forEach((b) => {
      const val = frequencyData[b.freqIndex] || 0;
      const normalized = (val / 255) * sensitivity;

      // Height calculation
      // Base + Audio
      // Use power curve for snappy response
      const audioHeight = Math.pow(normalized, 1.5) * maxHeight * 0.5;
      const targetScale = b.baseHeight + audioHeight;

      // Lerp for smoothness
      const currentScale = b.mesh.scale.y;
      b.mesh.scale.y = currentScale + (targetScale - currentScale) * 0.2;

      // Color / Opacity modulation
      // Light up when loud
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      const edgeMat = b.edges.material as THREE.LineBasicMaterial;

        if (normalized > 0.4) {
          mat.opacity = 0.6 + normalized * 0.05; // Brighter
          edgeMat.opacity = 0.8 + normalized * 0.033;

        // Maybe shift color towards white/bright?
        // Keeping it simple for performance.
      } else {
        mat.opacity = 0.4;
        edgeMat.opacity = 0.3;
      }
    });

    this.rendererThree.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      const frustumSize = 100;
      const aspect = width / height;
      this.camera.left = (-frustumSize * aspect) / 2;
      this.camera.right = (frustumSize * aspect) / 2;
      this.camera.top = frustumSize / 2;
      this.camera.bottom = -frustumSize / 2;
      this.camera.updateProjectionMatrix();
    }
    this.rendererThree?.setSize(width, height);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldScheme = this.config.colorScheme;
    const oldGrid = this.config.gridSize;

    this.config = { ...this.config, ...config } as IsometricMetropolisConfig;

    if (this.config.colorScheme !== oldScheme || this.config.gridSize !== oldGrid) {
      this.createCity();
    }
  }

  destroy(): void {
    if (this.cityGroup) {
      this.scene?.remove(this.cityGroup);
      this.buildings.forEach((b) => {
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        b.edges.geometry.dispose();
        (b.edges.material as THREE.Material).dispose();
      });
    }
    this.rendererThree?.dispose();
    this.rendererThree?.domElement.remove();
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      gridSize: {
        type: "number",
        label: "City Size",
        default: 10,
        min: 4,
        max: 20,
        step: 1,
      },
      buildingSpacing: {
        type: "number",
        label: "Spacing",
        default: 4,
        min: 2,
        max: 10,
        step: 1,
      },
      maxHeight: {
        type: "number",
        label: "Max Height",
        default: 30,
        min: 10,
        max: 60,
        step: 5,
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 0.2,
        min: 0,
        max: 1.0,
        step: 0.1,
      },
    };
  }
}
