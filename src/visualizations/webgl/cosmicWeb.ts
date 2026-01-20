import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

const COLOR_SCHEMES: Record<
  string,
  {
    nodes: number;
    filaments: number;
    glow: number;
    background: number;
    accent: number;
    bright: number;
  }
> = {
  deepSpace: {
    nodes: 0xffaa00,
    filaments: 0x4488ff,
    glow: 0x00aaff,
    background: 0x000022,
    accent: 0xff6600,
    bright: 0xffffff,
  },
  darkMatter: {
    nodes: 0x8800ff,
    filaments: 0x4400aa,
    glow: 0xaa00ff,
    background: 0x110022,
    accent: 0xff00ff,
    bright: 0xffccff,
  },
  hotGas: {
    nodes: 0xff3300,
    filaments: 0xff6600,
    glow: 0xffaa00,
    background: 0x110000,
    accent: 0xffcc00,
    bright: 0xffffff,
  },
  coldDark: {
    nodes: 0x00ffff,
    filaments: 0x0066aa,
    glow: 0x00aaff,
    background: 0x000011,
    accent: 0x00ff88,
    bright: 0xffffff,
  },
  primordial: {
    nodes: 0x00ff66,
    filaments: 0x008844,
    glow: 0x00ff44,
    background: 0x001100,
    accent: 0xaaff00,
    bright: 0xffffff,
  },
  reionization: {
    nodes: 0xffff00,
    filaments: 0xff8800,
    glow: 0xffaa44,
    background: 0x111100,
    accent: 0xff6600,
    bright: 0xffffff,
  },
};

interface GalaxyNode {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mass: number;
  brightness: number;
  pulsePhase: number;
  pulseSpeed: number;
  connections: number[];
  baseSize: number;
}

interface Filament {
  startIndex: number;
  endIndex: number;
  strength: number;
  pulsePhase: number;
}

interface CosmicWebConfig extends VisualizationConfig {
  colorScheme: string;
  nodeCount: number;
  connectionDistance: number;
  nodeSize: number;
  filamentOpacity: number;
  pulseIntensity: number;
  rotation: number;
}

export class CosmicWebVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "cosmicWeb",
    name: "Cosmic Web",
    author: "Vizec",
    description: "Large-scale universe structure with glowing galaxy nodes connected by filaments",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  // Nodes (galaxies/clusters)
  private nodes: GalaxyNode[] = [];
  private nodeGeometry: THREE.BufferGeometry | null = null;
  private nodeMesh: THREE.Points | null = null;

  // Node glow spheres
  private glowMeshes: THREE.Mesh[] = [];

  // Filaments (connections)
  private filaments: Filament[] = [];
  private filamentGeometry: THREE.BufferGeometry | null = null;
  private filamentMesh: THREE.LineSegments | null = null;

  // Background distant nodes
  private backgroundNodes: THREE.Points | null = null;

  private config: CosmicWebConfig = {
    sensitivity: 1.0,
    colorScheme: "deepSpace",
    nodeCount: 80,
    connectionDistance: 40,
    nodeSize: 1.0,
    filamentOpacity: 1.0,
    pulseIntensity: 1.0,
    rotation: 1.0,
  };

  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private volumeSmooth = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    this.camera.position.set(0, 0, 150);
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
    this.rendererThree.sortObjects = true;
    container.appendChild(this.rendererThree.domElement);

    this.createCosmicWeb();
  }

  private createCosmicWeb(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.deepSpace;

    this.clearScene();

    // Create background distant nodes
    this.createBackgroundNodes(colors);

    // Create galaxy nodes
    this.createNodes(colors);

    // Create filament connections
    this.createFilaments(colors);

    // Create glow effects for nodes
    this.createNodeGlows(colors);
  }

  private clearScene(): void {
    if (!this.scene) return;

    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      if ((obj as THREE.Mesh).geometry) {
        ((obj as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
      }
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          (mat as THREE.Material).dispose();
        }
      }
      this.scene.remove(obj);
    }

    this.nodes = [];
    this.filaments = [];
    this.glowMeshes = [];
  }

  private createBackgroundNodes(colors: (typeof COLOR_SCHEMES)["deepSpace"]): void {
    if (!this.scene) return;

    const count = 500;
    const positions: number[] = [];
    const sizes: number[] = [];

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 300 + Math.random() * 500;

      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      );
      sizes.push(0.3 + Math.random() * 1);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.nodes).multiplyScalar(0.3) },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        uniform float pixelRatio;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (200.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          gl_FragColor = vec4(color, alpha * 0.5);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.backgroundNodes = new THREE.Points(geometry, material);
    this.backgroundNodes.renderOrder = -100;
    this.scene.add(this.backgroundNodes);
  }

  private createNodes(colors: (typeof COLOR_SCHEMES)["deepSpace"]): void {
    if (!this.scene) return;

    const { nodeCount, connectionDistance } = this.config;
    this.nodes = [];

    // Generate nodes with cosmic web-like clustering
    // Use a lattice with noise for web-like structure

    for (let i = 0; i < nodeCount; i++) {
      // Random position with clustering tendency
      let x: number, y: number, z: number;

      if (Math.random() > 0.3 && this.nodes.length > 0) {
        // Cluster near existing node
        const nearNode = this.nodes[Math.floor(Math.random() * this.nodes.length)];
        const offset = 20 + Math.random() * 30;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        x = nearNode.position.x + offset * Math.sin(phi) * Math.cos(theta);
        y = nearNode.position.y + offset * Math.sin(phi) * Math.sin(theta);
        z = nearNode.position.z + offset * Math.cos(phi);
      } else {
        // Random position
        x = (Math.random() - 0.5) * 150;
        y = (Math.random() - 0.5) * 150;
        z = (Math.random() - 0.5) * 150;
      }

      const mass = 0.5 + Math.random() * 1.5;

      this.nodes.push({
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ),
        mass,
        brightness: 0.5 + Math.random() * 0.5,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.5 + Math.random() * 2,
        connections: [],
        baseSize: 2 + mass * 3,
      });
    }

    // Find connections
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const dist = this.nodes[i].position.distanceTo(this.nodes[j].position);
        if (dist < connectionDistance) {
          this.nodes[i].connections.push(j);
          this.nodes[j].connections.push(i);
        }
      }
    }

    // Create node geometry
    this.nodeGeometry = new THREE.BufferGeometry();
    this.updateNodeGeometry(colors);

    const nodeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        baseColor: { value: new THREE.Color(colors.nodes) },
        brightColor: { value: new THREE.Color(colors.bright) },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float brightness;
        attribute float pulse;
        varying float vBrightness;
        varying float vPulse;
        uniform float pixelRatio;

        void main() {
          vBrightness = brightness;
          vPulse = pulse;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (200.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 brightColor;
        uniform float time;
        varying float vBrightness;
        varying float vPulse;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 1.2);

          // Pulse brightness
          float pulseBrightness = vBrightness * (0.8 + vPulse * 0.4);

          vec3 color = mix(baseColor, brightColor, pulseBrightness * (1.0 - dist));
          color *= pulseBrightness;

          gl_FragColor = vec4(color, alpha * 0.9);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.nodeMesh = new THREE.Points(this.nodeGeometry, nodeMaterial);
    this.nodeMesh.renderOrder = 20;
    this.scene.add(this.nodeMesh);
  }

  private updateNodeGeometry(_colors: (typeof COLOR_SCHEMES)["deepSpace"]): void {
    if (!this.nodeGeometry) return;

    const positions: number[] = [];
    const sizes: number[] = [];
    const brightnesses: number[] = [];
    const pulses: number[] = [];

    for (const node of this.nodes) {
      positions.push(node.position.x, node.position.y, node.position.z);
      sizes.push(node.baseSize * this.config.nodeSize);
      brightnesses.push(node.brightness);

      // Calculate pulse value
      const pulse = Math.sin(this.time * node.pulseSpeed + node.pulsePhase) * 0.5 + 0.5;
      pulses.push(pulse);
    }

    this.nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.nodeGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.nodeGeometry.setAttribute("brightness", new THREE.Float32BufferAttribute(brightnesses, 1));
    this.nodeGeometry.setAttribute("pulse", new THREE.Float32BufferAttribute(pulses, 1));
  }

  private createFilaments(colors: (typeof COLOR_SCHEMES)["deepSpace"]): void {
    if (!this.scene) return;

    this.filaments = [];

    // Create filaments between connected nodes
    for (let i = 0; i < this.nodes.length; i++) {
      for (const j of this.nodes[i].connections) {
        if (j > i) {
          // Avoid duplicates
          const dist = this.nodes[i].position.distanceTo(this.nodes[j].position);
          const strength = 1 - dist / this.config.connectionDistance;

          this.filaments.push({
            startIndex: i,
            endIndex: j,
            strength: Math.max(0.2, strength),
            pulsePhase: Math.random() * Math.PI * 2,
          });
        }
      }
    }

    this.filamentGeometry = new THREE.BufferGeometry();
    this.updateFilamentGeometry();

    const filamentMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.filaments) },
        glowColor: { value: new THREE.Color(colors.glow) },
        time: { value: 0 },
        opacity: { value: this.config.filamentOpacity },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;

        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform vec3 glowColor;
        uniform float time;
        uniform float opacity;
        varying float vAlpha;

        void main() {
          vec3 finalColor = mix(color, glowColor, vAlpha * 0.5);
          gl_FragColor = vec4(finalColor, vAlpha * opacity * 0.7);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.filamentMesh = new THREE.LineSegments(this.filamentGeometry, filamentMaterial);
    this.filamentMesh.renderOrder = 10;
    this.scene.add(this.filamentMesh);
  }

  private updateFilamentGeometry(): void {
    if (!this.filamentGeometry) return;

    const positions: number[] = [];
    const alphas: number[] = [];

    for (const filament of this.filaments) {
      const start = this.nodes[filament.startIndex].position;
      const end = this.nodes[filament.endIndex].position;

      positions.push(start.x, start.y, start.z);
      positions.push(end.x, end.y, end.z);

      // Alpha based on strength and pulse
      const pulse = Math.sin(this.time * 2 + filament.pulsePhase) * 0.3 + 0.7;
      const alpha = filament.strength * pulse;
      alphas.push(alpha, alpha);
    }

    this.filamentGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.filamentGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  }

  private createNodeGlows(colors: (typeof COLOR_SCHEMES)["deepSpace"]): void {
    if (!this.scene) return;

    this.glowMeshes = [];

    // Create glow sphere for larger nodes
    const glowGeometry = new THREE.SphereGeometry(1, 16, 16);

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      if (node.mass > 1.2) {
        // Only larger nodes get glows
        const glowMaterial = new THREE.ShaderMaterial({
          uniforms: {
            glowColor: { value: new THREE.Color(colors.glow) },
            intensity: { value: 0.5 },
          },
          vertexShader: `
            varying vec3 vNormal;
            void main() {
              vNormal = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform vec3 glowColor;
            uniform float intensity;
            varying vec3 vNormal;

            void main() {
              float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.5);
              vec3 color = glowColor * fresnel * intensity;
              float alpha = fresnel * 0.4 * intensity;
              gl_FragColor = vec4(color, alpha);
            }
          `,
          transparent: true,
          side: THREE.BackSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });

        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.position.copy(node.position);
        glowMesh.scale.setScalar(node.baseSize * 3 * this.config.nodeSize);
        glowMesh.renderOrder = 15;
        glowMesh.userData.nodeIndex = i;

        this.glowMeshes.push(glowMesh);
        this.scene.add(glowMesh);
      }
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, rotation, filamentOpacity } = this.config;

    this.time += deltaTime;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;
    this.volumeSmooth += (volume - this.volumeSmooth) * smoothing;

    const bassBoost = Math.pow(this.bassSmooth, 0.7) * sensitivity;
    const midBoost = Math.pow(this.midSmooth, 0.7) * sensitivity;
    const trebleBoost = Math.pow(this.trebleSmooth, 0.7) * sensitivity;
    const volumeBoost = Math.pow(this.volumeSmooth, 0.5) * sensitivity;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.deepSpace;

    // Update nodes
    this.updateNodes(
      deltaTime,
      bassBoost,
      midBoost,
      trebleBoost,
      volumeBoost,
      frequencyData,
      colors,
    );

    // Update filaments
    this.updateFilaments(bassBoost);

    // Update glow meshes
    this.updateGlowMeshes(bassBoost, volumeBoost);

    // Update materials
    if (this.nodeMesh) {
      const mat = this.nodeMesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
    }

    if (this.filamentMesh) {
      const mat = this.filamentMesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.opacity.value = filamentOpacity * (0.5 + bassBoost * 0.5);
    }

    // Rotate background
    if (this.backgroundNodes) {
      this.backgroundNodes.rotation.y += deltaTime * 0.02 * rotation;
      this.backgroundNodes.rotation.x += deltaTime * 0.01 * rotation;
    }

    // Camera orbit
    const cameraAngle = this.time * 0.1 * rotation;
    const cameraRadius = 150 - bassBoost * 20;
    this.camera.position.x = Math.sin(cameraAngle) * cameraRadius;
    this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
    this.camera.position.y = Math.sin(this.time * 0.05) * 30;
    this.camera.lookAt(0, 0, 0);

    this.rendererThree.render(this.scene, this.camera);
  }

  private updateNodes(
    deltaTime: number,
    bassBoost: number,
    midBoost: number,
    trebleBoost: number,
    volumeBoost: number,
    frequencyData: Uint8Array,
    colors: (typeof COLOR_SCHEMES)["deepSpace"],
  ): void {
    if (!this.nodeGeometry) return;

    const freqBands = Math.floor(frequencyData.length / this.nodes.length);

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      // Map frequency band to node brightness
      const freqIndex = Math.min(i * freqBands, frequencyData.length - 1);
      const freqValue = frequencyData[freqIndex] / 255;

      // Update brightness based on frequency
      node.brightness = 0.3 + freqValue * 0.7 * this.config.pulseIntensity;

      // Gentle drift motion
      node.position.x += node.velocity.x * deltaTime * 10;
      node.position.y += node.velocity.y * deltaTime * 10;
      node.position.z += node.velocity.z * deltaTime * 10;

      // Keep nodes within bounds with soft boundary
      const maxDist = 80;
      const dist = node.position.length();
      if (dist > maxDist) {
        const pushBack = (dist - maxDist) * 0.01;
        node.position.normalize().multiplyScalar(dist - pushBack);
        node.velocity.multiplyScalar(-0.5);
      }
    }

    this.updateNodeGeometry(colors);
  }

  private updateFilaments(bassBoost: number): void {
    if (!this.filamentGeometry) return;

    // Update filament alphas based on bass
    const positions: number[] = [];
    const alphas: number[] = [];

    for (const filament of this.filaments) {
      const start = this.nodes[filament.startIndex].position;
      const end = this.nodes[filament.endIndex].position;

      positions.push(start.x, start.y, start.z);
      positions.push(end.x, end.y, end.z);

      // Enhanced pulse on bass
      const pulse = Math.sin(this.time * 2 + filament.pulsePhase) * 0.3 + 0.7;
      const alpha = filament.strength * pulse * (0.5 + bassBoost * 0.5);
      alphas.push(alpha, alpha);
    }

    this.filamentGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.filamentGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  }

  private updateGlowMeshes(bassBoost: number, volumeBoost: number): void {
    for (const glowMesh of this.glowMeshes) {
      const nodeIndex = glowMesh.userData.nodeIndex;
      const node = this.nodes[nodeIndex];

      // Update position
      glowMesh.position.copy(node.position);

      // Scale pulse
      const pulseFactor =
        1 + bassBoost * 0.5 + Math.sin(this.time * node.pulseSpeed + node.pulsePhase) * 0.2;
      glowMesh.scale.setScalar(node.baseSize * 3 * this.config.nodeSize * pulseFactor);

      // Update intensity
      const mat = glowMesh.material as THREE.ShaderMaterial;
      mat.uniforms.intensity.value = 0.3 + volumeBoost * 0.7 + node.brightness * 0.3;
    }
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
    const needsRecreate =
      ((config as CosmicWebConfig).colorScheme !== undefined &&
        (config as CosmicWebConfig).colorScheme !== this.config.colorScheme) ||
      ((config as CosmicWebConfig).nodeCount !== undefined &&
        (config as CosmicWebConfig).nodeCount !== this.config.nodeCount) ||
      ((config as CosmicWebConfig).connectionDistance !== undefined &&
        (config as CosmicWebConfig).connectionDistance !== this.config.connectionDistance);

    this.config = { ...this.config, ...config } as CosmicWebConfig;

    if (needsRecreate && this.scene) {
      this.createCosmicWeb();
    }
  }

  destroy(): void {
    this.clearScene();

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.nodeGeometry = null;
    this.nodeMesh = null;
    this.filamentGeometry = null;
    this.filamentMesh = null;
    this.backgroundNodes = null;
    this.nodes = [];
    this.filaments = [];
    this.glowMeshes = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Audio Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [
          { value: "deepSpace", label: "Deep Space" },
          { value: "darkMatter", label: "Dark Matter" },
          { value: "hotGas", label: "Hot Gas" },
          { value: "coldDark", label: "Cold Dark" },
          { value: "primordial", label: "Primordial" },
          { value: "reionization", label: "Reionization" },
        ],
        default: "deepSpace",
        label: "Color Scheme",
      },
      nodeCount: {
        type: "number",
        min: 30,
        max: 150,
        step: 10,
        default: 80,
        label: "Galaxy Count",
      },
      connectionDistance: {
        type: "number",
        min: 20,
        max: 60,
        step: 5,
        default: 40,
        label: "Connection Distance",
      },
      nodeSize: { type: "number", min: 0.5, max: 2, step: 0.1, default: 1.0, label: "Node Size" },
      filamentOpacity: {
        type: "number",
        min: 0.2,
        max: 1.5,
        step: 0.1,
        default: 1.0,
        label: "Filament Opacity",
      },
      pulseIntensity: {
        type: "number",
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Pulse Intensity",
      },
      rotation: {
        type: "number",
        min: 0,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Rotation Speed",
      },
    };
  }
}
