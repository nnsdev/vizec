import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface ElectricArcConfig extends VisualizationConfig {
  arcCount: number;
  intensity: number;
  branchiness: number;
}

const COLOR_SCHEMES: Record<string, { primary: number; secondary: number; glow: number }> = {
  electric: { primary: 0x00ccff, secondary: 0xffffff, glow: 0x0066ff },
  plasma: { primary: 0xff00ff, secondary: 0xffaaff, glow: 0x8800ff },
  fire: { primary: 0xff6600, secondary: 0xffff00, glow: 0xff3300 },
  matrix: { primary: 0x00ff00, secondary: 0xaaffaa, glow: 0x008800 },
  ice: { primary: 0x88ffff, secondary: 0xffffff, glow: 0x00aaff },
};

export class ElectricArcVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "electricArc",
    name: "Electric Arc",
    author: "Vizec",
    description: "Tesla coil style electric arcs reacting to audio",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: ElectricArcConfig = {
    sensitivity: 1.0,
    colorScheme: "electric",
    arcCount: 5,
    intensity: 1.0,
    branchiness: 0.5,
  };

  private time = 0;
  private arcLines: THREE.Line[] = [];
  private glowMeshes: THREE.Mesh[] = [];
  private nodePositions: THREE.Vector3[] = [];

  // Smoothed audio
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.z = 5;

    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.initNodes();
    this.createArcs();
  }

  private initNodes(): void {
    this.nodePositions = [];
    const nodeCount = 6;

    // Create nodes in a circle arrangement
    for (let i = 0; i < nodeCount; i++) {
      const angle = (i / nodeCount) * Math.PI * 2;
      const radius = 3;
      this.nodePositions.push(new THREE.Vector3(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        0
      ));
    }

    // Add center node
    this.nodePositions.push(new THREE.Vector3(0, 0, 0));

    // Create node spheres (electrodes)
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.electric;
    for (const pos of this.nodePositions) {
      const geometry = new THREE.SphereGeometry(0.1, 16, 16);
      const material = new THREE.MeshBasicMaterial({
        color: colors.secondary,
        transparent: true,
        opacity: 0.8,
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(pos);
      this.scene!.add(sphere);
      this.glowMeshes.push(sphere);
    }
  }

  private createArcs(): void {
    if (!this.scene) return;

    // Clear existing arcs
    for (const line of this.arcLines) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.arcLines = [];

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.electric;
    const centerNode = this.nodePositions[this.nodePositions.length - 1];

    // Create arcs from center to outer nodes using TubeGeometry for thickness
    for (let i = 0; i < Math.min(this.config.arcCount, this.nodePositions.length - 1); i++) {
      const points = this.generateArcPoints(centerNode, this.nodePositions[i], 30);
      const curve = new THREE.CatmullRomCurve3(points);

      // Create tube geometry for thick arc
      const tubeGeometry = new THREE.TubeGeometry(curve, 30, 0.04, 8, false);
      const material = new THREE.MeshBasicMaterial({
        color: colors.primary,
        transparent: true,
        opacity: 0.9,
      });

      const tube = new THREE.Mesh(tubeGeometry, material);
      this.scene.add(tube);
      this.arcLines.push(tube as unknown as THREE.Line);

      // Add glow layer (slightly larger, more transparent)
      const glowGeometry = new THREE.TubeGeometry(curve, 30, 0.08, 8, false);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: colors.glow,
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      this.scene.add(glow);
      this.arcLines.push(glow as unknown as THREE.Line);
    }
  }

  private generateArcPoints(start: THREE.Vector3, end: THREE.Vector3, segments: number): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const direction = end.clone().sub(start);
    const length = direction.length();
    const perpendicular = new THREE.Vector3(-direction.y, direction.x, 0).normalize();

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = start.clone().lerp(end, t);

      // Add jaggedness that increases toward middle
      const jitter = Math.sin(t * Math.PI) * length * 0.2 * this.config.branchiness;
      const offsetAmount = (Math.random() - 0.5) * jitter;

      point.add(perpendicular.clone().multiplyScalar(offsetAmount));
      point.z += (Math.random() - 0.5) * jitter * 0.5;

      points.push(point);
    }

    return points;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, intensity } = this.config;

    this.time += deltaTime;

    // Smooth audio values
    const smoothing = 0.1;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.electric;

    // Update arcs - regenerate tube geometries
    const centerNode = this.nodePositions[this.nodePositions.length - 1];

    // Each arc has 2 meshes (main + glow), so step by 2
    for (let i = 0; i < this.arcLines.length; i += 2) {
      const tube = this.arcLines[i] as unknown as THREE.Mesh;
      const glow = this.arcLines[i + 1] as unknown as THREE.Mesh;
      const nodeIndex = Math.floor(i / 2) % (this.nodePositions.length - 1);
      const targetNode = this.nodePositions[nodeIndex];

      // Regenerate arc geometry based on audio
      if (Math.random() < 0.3 + this.bassSmooth * sensitivity * 0.5) {
        const segments = 25 + Math.floor(this.trebleSmooth * 15);
        const points = this.generateArcPointsAnimated(
          centerNode,
          targetNode,
          segments,
          this.time,
          this.bassSmooth * sensitivity * intensity
        );

        const curve = new THREE.CatmullRomCurve3(points);

        // Update main tube
        tube.geometry.dispose();
        tube.geometry = new THREE.TubeGeometry(curve, 30, 0.04 + this.bassSmooth * 0.02, 8, false);

        // Update glow tube
        if (glow) {
          glow.geometry.dispose();
          glow.geometry = new THREE.TubeGeometry(curve, 30, 0.1 + this.bassSmooth * 0.05, 8, false);
        }
      }

      // Update opacity based on audio
      const material = tube.material as THREE.MeshBasicMaterial;
      material.opacity = 0.6 + this.midSmooth * 0.4 * intensity;

      // Color intensity
      const intensityMod = 0.6 + volume * 0.4 * sensitivity;
      const color = new THREE.Color(colors.primary);
      color.multiplyScalar(intensityMod);
      material.color = color;

      // Update glow
      if (glow) {
        const glowMat = glow.material as THREE.MeshBasicMaterial;
        glowMat.opacity = 0.2 + this.bassSmooth * 0.3;
      }
    }

    // Update node glow
    for (let i = 0; i < this.glowMeshes.length; i++) {
      const mesh = this.glowMeshes[i];
      const pulse = Math.sin(this.time * 5 + i) * 0.3 + 0.7;
      const scale = 1 + this.bassSmooth * 0.5 * sensitivity * intensity;

      mesh.scale.setScalar(scale * pulse);

      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.5 + this.trebleSmooth * 0.5;
    }

    // Camera subtle movement
    this.camera.position.x = Math.sin(this.time * 0.3) * 0.3;
    this.camera.position.y = Math.cos(this.time * 0.2) * 0.2;
    this.camera.lookAt(0, 0, 0);

    // Add occasional bright flash on bass hit
    if (bass > 0.8 && Math.random() < 0.3) {
      // Create temporary flash
      const flashGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const flashMaterial = new THREE.MeshBasicMaterial({
        color: colors.glow,
        transparent: true,
        opacity: 0.5 * bass,
      });
      const flash = new THREE.Mesh(flashGeometry, flashMaterial);
      flash.position.copy(centerNode);
      this.scene.add(flash);

      // Remove after short delay
      setTimeout(() => {
        if (this.scene) {
          this.scene.remove(flash);
          flashGeometry.dispose();
          flashMaterial.dispose();
        }
      }, 50);
    }

    this.rendererThree.render(this.scene, this.camera);
  }

  private generateArcPointsAnimated(
    start: THREE.Vector3,
    end: THREE.Vector3,
    segments: number,
    time: number,
    audioIntensity: number
  ): THREE.Vector3[] {
    const points: THREE.Vector3[] = [];
    const direction = end.clone().sub(start);
    const length = direction.length();

    // Perpendicular vectors for displacement
    const perpX = new THREE.Vector3(-direction.y, direction.x, 0).normalize();
    const perpZ = new THREE.Vector3(0, 0, 1);

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = start.clone().lerp(end, t);

      // Base jaggedness
      const jitterBase = Math.sin(t * Math.PI) * length * 0.15 * this.config.branchiness;

      // Time-varying noise
      const noise1 = Math.sin(t * 10 + time * 20) * jitterBase;
      const noise2 = Math.cos(t * 7 + time * 15) * jitterBase * 0.5;
      const noise3 = Math.sin(t * 15 + time * 25 + i) * jitterBase * 0.3;

      // Audio-reactive displacement
      const audioDisplacement = audioIntensity * jitterBase;

      const totalDisplacementX = noise1 + audioDisplacement * Math.sin(time * 10 + i);
      const totalDisplacementZ = noise2 + noise3;

      point.add(perpX.clone().multiplyScalar(totalDisplacementX));
      point.add(perpZ.clone().multiplyScalar(totalDisplacementZ));

      points.push(point);
    }

    return points;
  }

  resize(width: number, height: number): void {
    if (!this.camera || !this.rendererThree) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.rendererThree.setSize(width, height);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldArcCount = this.config.arcCount;
    const oldColorScheme = this.config.colorScheme;

    this.config = { ...this.config, ...config } as ElectricArcConfig;

    if (this.scene && (this.config.arcCount !== oldArcCount || this.config.colorScheme !== oldColorScheme)) {
      this.createArcs();
    }
  }

  destroy(): void {
    // Clean up arcs
    for (const line of this.arcLines) {
      if (this.scene) this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.arcLines = [];

    // Clean up glow meshes
    for (const mesh of this.glowMeshes) {
      if (this.scene) this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.glowMeshes = [];

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.container = null;
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
        default: "electric",
        options: [
          { label: "Electric Blue", value: "electric" },
          { label: "Plasma Purple", value: "plasma" },
          { label: "Fire", value: "fire" },
          { label: "Matrix Green", value: "matrix" },
          { label: "Ice", value: "ice" },
        ],
      },
      arcCount: {
        type: "number",
        label: "Arc Count",
        default: 5,
        min: 2,
        max: 8,
        step: 1,
      },
      intensity: {
        type: "number",
        label: "Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      branchiness: {
        type: "number",
        label: "Branchiness",
        default: 0.5,
        min: 0.1,
        max: 1.5,
        step: 0.1,
      },
    };
  }
}
