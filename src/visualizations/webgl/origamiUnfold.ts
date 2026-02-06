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

interface OrigamiUnfoldConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  foldSpeed: number;
  paperColor: string;
}

/** A fold joint connecting two triangular panels that rotate around a shared edge. */
interface FoldJoint {
  /** The mesh that rotates */
  mesh: THREE.Mesh;
  /** Pivot group whose rotation drives the fold */
  pivot: THREE.Group;
  /** Local rotation axis (always around x for simplicity) */
  axis: "x" | "z";
  /** Angle when fully folded (quiet) */
  foldedAngle: number;
  /** Angle when fully unfolded (loud) */
  unfoldedAngle: number;
  /** Current interpolated angle */
  currentAngle: number;
  /** Which audio band drives this joint */
  driver: "bass" | "mid" | "treble" | "volume";
}

export class OrigamiUnfoldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "origamiUnfold",
    name: "Origami Unfold",
    author: "Vizec",
    description:
      "Paper crane that folds/unfolds with the music — quiet=folded, loud=spread",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private craneGroup: THREE.Group | null = null;
  private joints: FoldJoint[] = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private lights: THREE.Light[] = [];

  private config: OrigamiUnfoldConfig = {
    sensitivity: 1.0,
    colorScheme: "ice",
    foldSpeed: 0.5,
    paperColor: "#e8ddd3",
  };

  private smoothVolume = 0;
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothTreble = 0;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    );
    this.camera.position.set(0, 6, 28);
    this.camera.lookAt(0, 0, 0);

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    this.rendererThree.shadowMap.enabled = true;
    this.rendererThree.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.rendererThree.domElement);

    this.setupLights();
    this.buildCrane();

    this.resize(container.clientWidth, container.clientHeight);
  }

  private setupLights(): void {
    if (!this.scene) return;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    this.lights.push(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(5, 10, 7);
    dir.castShadow = true;
    this.scene.add(dir);
    this.lights.push(dir);

    const fill = new THREE.DirectionalLight(0x8899bb, 0.3);
    fill.position.set(-5, 3, -5);
    this.scene.add(fill);
    this.lights.push(fill);
  }

  /** Create a paper-like material with translucency */
  private makePaperMaterial(color: THREE.Color, accent: THREE.Color): THREE.MeshPhysicalMaterial {
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.0,
      transmission: 0.15,
      thickness: 0.05,
      emissive: accent,
      emissiveIntensity: 0.05,
      depthWrite: true,
    });
    this.materials.push(mat);
    return mat;
  }

  /** Build a triangular plane from 3 vertices */
  private makeTriangle(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ): THREE.BufferGeometry {
    const geom = new THREE.BufferGeometry();
    const verts = new Float32Array([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
    geom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    geom.computeVertexNormals();
    this.geometries.push(geom);
    return geom;
  }

  /** Create a fold joint: a triangular face that pivots around an edge */
  private createFoldPanel(
    parent: THREE.Object3D,
    verts: [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    pivotPos: THREE.Vector3,
    axis: "x" | "z",
    foldedAngle: number,
    unfoldedAngle: number,
    driver: FoldJoint["driver"],
    material: THREE.MeshPhysicalMaterial,
  ): FoldJoint {
    const pivot = new THREE.Group();
    pivot.position.copy(pivotPos);
    parent.add(pivot);

    const localVerts: [THREE.Vector3, THREE.Vector3, THREE.Vector3] = [
      verts[0].clone().sub(pivotPos),
      verts[1].clone().sub(pivotPos),
      verts[2].clone().sub(pivotPos),
    ];

    const geom = this.makeTriangle(localVerts[0], localVerts[1], localVerts[2]);
    const mesh = new THREE.Mesh(geom, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    pivot.add(mesh);

    // Crease line along the fold edge (first two verts are the hinge)
    const edgeGeom = new THREE.BufferGeometry().setFromPoints([localVerts[0], localVerts[1]]);
    this.geometries.push(edgeGeom);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x999999,
      transparent: true,
      opacity: 0.3,
    });
    this.materials.push(edgeMat);
    const crease = new THREE.Line(edgeGeom, edgeMat);
    pivot.add(crease);

    const joint: FoldJoint = {
      mesh,
      pivot,
      axis,
      foldedAngle,
      unfoldedAngle,
      currentAngle: foldedAngle,
      driver,
    };

    // Start folded
    if (axis === "x") {
      pivot.rotation.x = foldedAngle;
    } else {
      pivot.rotation.z = foldedAngle;
    }

    this.joints.push(joint);
    return joint;
  }

  private buildCrane(): void {
    if (!this.scene) return;

    this.craneGroup = new THREE.Group();
    this.scene.add(this.craneGroup);

    const colors = getColorScheme(COLOR_SCHEMES_HEX, this.config.colorScheme);
    const paperBase = new THREE.Color(this.config.paperColor);
    const accent = new THREE.Color(colors.primary);

    const bodyMat = this.makePaperMaterial(paperBase, accent);
    const wingMat = this.makePaperMaterial(
      paperBase.clone().lerp(new THREE.Color(colors.secondary), 0.1),
      new THREE.Color(colors.secondary),
    );
    const tailMat = this.makePaperMaterial(
      paperBase.clone().lerp(new THREE.Color(colors.glow), 0.08),
      new THREE.Color(colors.glow),
    );

    // === BODY (central diamond, two triangles forming a flat diamond) ===
    const bodyHalfLen = 3;
    const bodyHalfW = 1.2;

    // Upper body triangle
    const bodyTopGeom = this.makeTriangle(
      new THREE.Vector3(-bodyHalfW, 0, 0),
      new THREE.Vector3(bodyHalfW, 0, 0),
      new THREE.Vector3(0, 0, -bodyHalfLen),
    );
    const bodyTop = new THREE.Mesh(bodyTopGeom, bodyMat);
    bodyTop.castShadow = true;
    this.craneGroup.add(bodyTop);

    // Lower body triangle
    const bodyBotGeom = this.makeTriangle(
      new THREE.Vector3(-bodyHalfW, 0, 0),
      new THREE.Vector3(bodyHalfW, 0, 0),
      new THREE.Vector3(0, 0, bodyHalfLen),
    );
    const bodyBot = new THREE.Mesh(bodyBotGeom, bodyMat);
    bodyBot.castShadow = true;
    this.craneGroup.add(bodyBot);

    // === LEFT WING (two panels that fold upward) ===
    // Inner wing panel
    this.createFoldPanel(
      this.craneGroup,
      [
        new THREE.Vector3(-bodyHalfW, 0, -bodyHalfLen),
        new THREE.Vector3(-bodyHalfW, 0, 0),
        new THREE.Vector3(-bodyHalfW - 3, 0, -bodyHalfLen * 0.5),
      ],
      new THREE.Vector3(-bodyHalfW, 0, -bodyHalfLen * 0.5),
      "z",
      0.8,
      0.0,
      "bass",
      wingMat,
    );

    // Outer wing panel (child of inner wing pivot)
    const leftInnerPivot = this.joints[this.joints.length - 1].pivot;
    this.createFoldPanel(
      leftInnerPivot,
      [
        new THREE.Vector3(-bodyHalfW - 3, 0, -bodyHalfLen * 0.5),
        new THREE.Vector3(-bodyHalfW - 3, 0, -bodyHalfLen * 0.5 + 1.5),
        new THREE.Vector3(-bodyHalfW - 6, 0.2, -bodyHalfLen * 0.3),
      ],
      new THREE.Vector3(-bodyHalfW - 3, 0, -bodyHalfLen * 0.5).sub(
        new THREE.Vector3(-bodyHalfW, 0, -bodyHalfLen * 0.5),
      ),
      "z",
      -0.6,
      0.0,
      "mid",
      wingMat,
    );

    // === RIGHT WING (mirrors left) ===
    this.createFoldPanel(
      this.craneGroup,
      [
        new THREE.Vector3(bodyHalfW, 0, -bodyHalfLen),
        new THREE.Vector3(bodyHalfW, 0, 0),
        new THREE.Vector3(bodyHalfW + 3, 0, -bodyHalfLen * 0.5),
      ],
      new THREE.Vector3(bodyHalfW, 0, -bodyHalfLen * 0.5),
      "z",
      -0.8,
      0.0,
      "bass",
      wingMat,
    );

    const rightInnerPivot = this.joints[this.joints.length - 1].pivot;
    this.createFoldPanel(
      rightInnerPivot,
      [
        new THREE.Vector3(bodyHalfW + 3, 0, -bodyHalfLen * 0.5),
        new THREE.Vector3(bodyHalfW + 3, 0, -bodyHalfLen * 0.5 + 1.5),
        new THREE.Vector3(bodyHalfW + 6, 0.2, -bodyHalfLen * 0.3),
      ],
      new THREE.Vector3(bodyHalfW + 3, 0, -bodyHalfLen * 0.5).sub(
        new THREE.Vector3(bodyHalfW, 0, -bodyHalfLen * 0.5),
      ),
      "z",
      0.6,
      0.0,
      "mid",
      wingMat,
    );

    // === HEAD (folds down from front) ===
    this.createFoldPanel(
      this.craneGroup,
      [
        new THREE.Vector3(-0.4, 0, -bodyHalfLen),
        new THREE.Vector3(0.4, 0, -bodyHalfLen),
        new THREE.Vector3(0, 0.3, -bodyHalfLen - 2.5),
      ],
      new THREE.Vector3(0, 0, -bodyHalfLen),
      "x",
      0.7,
      0.0,
      "treble",
      tailMat,
    );

    // Head tip (beak) — child of head pivot
    const headPivot = this.joints[this.joints.length - 1].pivot;
    this.createFoldPanel(
      headPivot,
      [
        new THREE.Vector3(-0.2, 0.3, -bodyHalfLen - 2.5),
        new THREE.Vector3(0.2, 0.3, -bodyHalfLen - 2.5),
        new THREE.Vector3(0, 0.1, -bodyHalfLen - 3.5),
      ],
      new THREE.Vector3(0, 0.3, -bodyHalfLen - 2.5).sub(new THREE.Vector3(0, 0, -bodyHalfLen)),
      "x",
      -0.5,
      0.0,
      "treble",
      tailMat,
    );

    // === TAIL (folds up from back) ===
    this.createFoldPanel(
      this.craneGroup,
      [
        new THREE.Vector3(-0.5, 0, bodyHalfLen),
        new THREE.Vector3(0.5, 0, bodyHalfLen),
        new THREE.Vector3(0, 0.3, bodyHalfLen + 2.5),
      ],
      new THREE.Vector3(0, 0, bodyHalfLen),
      "x",
      -0.6,
      0.0,
      "volume",
      tailMat,
    );

    // Tail tip
    const tailPivot = this.joints[this.joints.length - 1].pivot;
    this.createFoldPanel(
      tailPivot,
      [
        new THREE.Vector3(-0.3, 0.3, bodyHalfLen + 2.5),
        new THREE.Vector3(0.3, 0.3, bodyHalfLen + 2.5),
        new THREE.Vector3(0, 0.5, bodyHalfLen + 3.8),
      ],
      new THREE.Vector3(0, 0.3, bodyHalfLen + 2.5).sub(new THREE.Vector3(0, 0, bodyHalfLen)),
      "x",
      0.4,
      0.0,
      "volume",
      tailMat,
    );

    // Additional body crease lines for visual detail
    this.addCreaseLines();
  }

  private addCreaseLines(): void {
    if (!this.craneGroup) return;

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xaaaaaa,
      transparent: true,
      opacity: 0.2,
    });
    this.materials.push(lineMat);

    const creases = [
      // Center spine
      [new THREE.Vector3(0, 0.01, -3), new THREE.Vector3(0, 0.01, 3)],
      // Diagonal folds on body
      [new THREE.Vector3(-1.2, 0.01, 0), new THREE.Vector3(0, 0.01, -3)],
      [new THREE.Vector3(1.2, 0.01, 0), new THREE.Vector3(0, 0.01, -3)],
      [new THREE.Vector3(-1.2, 0.01, 0), new THREE.Vector3(0, 0.01, 3)],
      [new THREE.Vector3(1.2, 0.01, 0), new THREE.Vector3(0, 0.01, 3)],
    ];

    for (const [a, b] of creases) {
      const geom = new THREE.BufferGeometry().setFromPoints([a, b]);
      this.geometries.push(geom);
      const line = new THREE.Line(geom, lineMat);
      this.craneGroup.add(line);
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.craneGroup) return;

    const { bass, mid, treble, volume } = audioData;
    const sens = this.config.sensitivity;
    const speed = this.config.foldSpeed;
    const dt = deltaTime * 0.001; // ms → seconds

    // Smooth audio values
    const smoothing = 1 - Math.exp(-dt * (1.0 + speed * 2));
    this.smoothVolume += (volume * sens - this.smoothVolume) * smoothing;
    this.smoothBass += (bass * sens - this.smoothBass) * smoothing;
    this.smoothMid += (mid * sens - this.smoothMid) * smoothing;
    this.smoothTreble += (treble * sens - this.smoothTreble) * smoothing;

    this.time += dt;

    // Update fold joints
    for (const joint of this.joints) {
      let driver = 0;
      switch (joint.driver) {
        case "bass":
          driver = this.smoothBass;
          break;
        case "mid":
          driver = this.smoothMid;
          break;
        case "treble":
          driver = this.smoothTreble;
          break;
        case "volume":
          driver = this.smoothVolume;
          break;
      }

      // Clamp driver
      driver = Math.min(Math.max(driver, 0), 1);

      // Target angle: lerp between folded and unfolded based on audio
      const targetAngle =
        joint.foldedAngle + (joint.unfoldedAngle - joint.foldedAngle) * driver;

      // Smooth interpolation toward target
      const lerpSpeed = 1 - Math.exp(-dt * (0.8 + speed * 3));
      joint.currentAngle += (targetAngle - joint.currentAngle) * lerpSpeed;

      if (joint.axis === "x") {
        joint.pivot.rotation.x = joint.currentAngle;
      } else {
        joint.pivot.rotation.z = joint.currentAngle;
      }
    }

    // Update paper translucency based on volume
    for (const mat of this.materials) {
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.emissiveIntensity = 0.03 + this.smoothVolume * 0.15;
        mat.transmission = 0.1 + this.smoothVolume * 0.15;
      }
    }

    // Gentle rotation of the whole crane
    this.craneGroup.rotation.y += dt * 0.15;
    this.craneGroup.rotation.x =
      Math.sin(this.time * 0.3) * 0.08 + this.smoothBass * 0.1;

    // Subtle vertical bobbing
    this.craneGroup.position.y = Math.sin(this.time * 0.5) * 0.3;

    // Camera orbit
    const camDist = 28 - this.smoothVolume * 3;
    const camAngle = this.time * 0.08;
    this.camera.position.x = Math.sin(camAngle) * camDist * 0.2;
    this.camera.position.y = 5 + Math.sin(this.time * 0.15) * 1.0;
    this.camera.position.z = Math.cos(camAngle) * camDist * 0.2 + camDist * 0.8;
    this.camera.lookAt(0, 0, 0);

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
    const needsRebuild =
      config.colorScheme !== undefined || config.paperColor !== undefined;

    this.config = { ...this.config, ...config } as OrigamiUnfoldConfig;

    if (needsRebuild && this.scene) {
      this.clearCrane();
      this.buildCrane();
    }
  }

  private clearCrane(): void {
    if (this.craneGroup && this.scene) {
      this.scene.remove(this.craneGroup);
    }
    for (const geom of this.geometries) geom.dispose();
    for (const mat of this.materials) mat.dispose();
    this.geometries = [];
    this.materials = [];
    this.joints = [];
    this.craneGroup = null;
  }

  destroy(): void {
    this.clearCrane();

    for (const light of this.lights) {
      if (this.scene) this.scene.remove(light);
      light.dispose();
    }
    this.lights = [];

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.container && this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(
          this.rendererThree.domElement,
        );
      }
    }

    this.container = null;
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
        options: [...COLOR_SCHEME_OPTIONS],
        default: "ice",
        label: "Color Scheme",
      },
      foldSpeed: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Fold Speed",
      },
      paperColor: {
        type: "color",
        default: "#e8ddd3",
        label: "Paper Color",
      },
    };
  }
}
