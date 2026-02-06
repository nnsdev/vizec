import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface SmokeRingsConfig extends VisualizationConfig {
  ringSpeed: number;
  maxRings: number;
}

const COLOR_SCHEMES: Record<
  string,
  { core: number; edge: number; glow: number; trail: number }
> = {
  ether: { core: 0xaabbff, edge: 0x6688cc, glow: 0x8899dd, trail: 0x445577 },
  inferno: { core: 0xff6633, edge: 0xcc3300, glow: 0xff9944, trail: 0x661100 },
  phantom: { core: 0xbb88ff, edge: 0x7744bb, glow: 0xdd99ff, trail: 0x442266 },
  frost: { core: 0x88eeff, edge: 0x44aacc, glow: 0xaaffff, trail: 0x226688 },
  venom: { core: 0x88ff44, edge: 0x44aa22, glow: 0xbbff66, trail: 0x225511 },
};

const RING_PARTICLE_COUNT = 120;
const TORUS_TUBE_RADIUS = 0.3;

class SmokeRing {
  group: THREE.Group;
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  z: number;
  radius: number;
  baseRadius: number;
  alpha: number;
  speed: number;
  age: number;
  spin: number;
  wobblePhase: number;

  constructor(speed: number, colors: { core: number; edge: number; glow: number; trail: number }) {
    this.z = -2;
    this.baseRadius = 0.8 + Math.random() * 0.4;
    this.radius = this.baseRadius;
    this.alpha = 0;
    this.speed = speed * (0.8 + Math.random() * 0.4);
    this.age = 0;
    this.spin = (Math.random() - 0.5) * 0.4;
    this.wobblePhase = Math.random() * Math.PI * 2;

    this.group = new THREE.Group();

    // Build torus-shaped particle cloud
    const positions = new Float32Array(RING_PARTICLE_COUNT * 3);
    const randoms = new Float32Array(RING_PARTICLE_COUNT * 2);

    for (let i = 0; i < RING_PARTICLE_COUNT; i++) {
      const theta = (i / RING_PARTICLE_COUNT) * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;

      const tubeOffset = TORUS_TUBE_RADIUS * (0.5 + Math.random() * 0.5);
      const x = (this.baseRadius + tubeOffset * Math.cos(phi)) * Math.cos(theta);
      const y = (this.baseRadius + tubeOffset * Math.cos(phi)) * Math.sin(theta);
      const z = tubeOffset * Math.sin(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      randoms[i * 2] = Math.random();
      randoms[i * 2 + 1] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("aRandom", new THREE.BufferAttribute(randoms, 2));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uAlpha: { value: 0 },
        uTime: { value: 0 },
        uScale: { value: 1.0 },
        uCoreColor: { value: new THREE.Color(colors.core) },
        uEdgeColor: { value: new THREE.Color(colors.edge) },
        uGlowColor: { value: new THREE.Color(colors.glow) },
      },
      vertexShader: /* glsl */ `
        attribute vec2 aRandom;
        uniform float uAlpha;
        uniform float uTime;
        uniform float uScale;
        varying float vAlpha;
        varying vec2 vRandom;

        void main() {
          vRandom = aRandom;

          // Organic turbulence
          vec3 pos = position * uScale;
          float drift = sin(uTime * 1.5 + aRandom.x * 6.28) * 0.08 * uScale;
          pos.x += drift;
          pos.y += cos(uTime * 1.2 + aRandom.y * 6.28) * 0.06 * uScale;
          pos.z += sin(uTime * 0.8 + aRandom.x * 3.14) * 0.04;

          vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPos;

          // Size attenuation (clamp depth to prevent blowup near camera)
          float size = (25.0 + aRandom.x * 20.0) * uScale;
          float depth = max(-mvPos.z, 2.0);
          gl_PointSize = min(size * (200.0 / depth), 80.0);

          // Fade particles near the tube edge
          vAlpha = uAlpha * (0.6 + aRandom.y * 0.4);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uCoreColor;
        uniform vec3 uEdgeColor;
        uniform vec3 uGlowColor;
        varying float vAlpha;
        varying vec2 vRandom;

        void main() {
          // Soft circle
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;

          // Gaussian-ish falloff for smoke look
          float strength = exp(-dist * dist * 8.0);

          // Mix colors based on randomness
          vec3 color = mix(uEdgeColor, uCoreColor, strength);
          color = mix(color, uGlowColor, vRandom.x * strength * 0.5);

          float alpha = strength * vAlpha * 0.7;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.group.add(this.points);
  }

  update(deltaTime: number, bass: number, sensitivity: number): boolean {
    this.age += deltaTime;

    // Fade in quickly, fade out as ring travels
    const fadeIn = Math.min(this.age * 4, 1);
    const lifeProgress = Math.min(this.z / 25, 1);
    const fadeOut = 1 - lifeProgress * lifeProgress;
    this.alpha = fadeIn * fadeOut;

    // Move toward camera
    this.z += this.speed * deltaTime * (1 + bass * sensitivity * 0.5);

    // Expand as it approaches
    const expansion = 1 + this.z * 0.15;
    this.radius = this.baseRadius * Math.max(expansion, 0.5);

    // Update group position and scale
    this.group.position.z = this.z;
    const scale = Math.max(expansion, 0.5);
    this.group.scale.set(scale, scale, 1);

    // Rotation
    this.group.rotation.z += this.spin * deltaTime;

    // Slight wobble
    this.wobblePhase += deltaTime * 0.7;
    this.group.position.x = Math.sin(this.wobblePhase) * 0.3;
    this.group.position.y = Math.cos(this.wobblePhase * 0.8) * 0.2;

    // Update uniforms
    this.material.uniforms.uAlpha.value = this.alpha;
    this.material.uniforms.uTime.value = this.age;
    this.material.uniforms.uScale.value = scale;

    // Remove when fully past camera or faded
    return this.z < 30 && this.alpha > 0.01;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class SmokeRingsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "smokeRings",
    name: "Smoke Rings",
    author: "Vizec",
    description: "Toroidal vortex rings that launch outward on beat hits",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private rings: SmokeRing[] = [];
  private time = 0;
  private lastSpawnTime = 0;
  private prevBass = 0;

  private config: SmokeRingsConfig = {
    sensitivity: 1.0,
    colorScheme: "ether",
    ringSpeed: 2,
    maxRings: 12,
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 12);
    this.camera.lookAt(0, 0, 0);

    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);
  }

  private spawnRing(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.ether;
    const ring = new SmokeRing(this.config.ringSpeed, colors);
    this.scene.add(ring.group);
    this.rings.push(ring);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const dt = deltaTime * 0.001; // ms → seconds
    this.time += dt;

    const { bass, volume } = audioData;
    const sensitivity = this.config.sensitivity;

    // Beat detection: spawn ring on bass transient
    const bassRise = bass - this.prevBass;
    this.prevBass = bass;

    const cooldown = Math.max(0.4, 0.8 - bass * 0.2);
    const timeSinceSpawn = this.time - this.lastSpawnTime;

    if (
      timeSinceSpawn > cooldown &&
      this.rings.length < this.config.maxRings &&
      bassRise > 0.08 * (1 / sensitivity) &&
      bass > 0.25
    ) {
      this.spawnRing();
      this.lastSpawnTime = this.time;
    }

    // Also spawn occasionally on sustained volume for visual continuity
    if (
      timeSinceSpawn > 2.5 &&
      this.rings.length < this.config.maxRings &&
      volume > 0.15
    ) {
      this.spawnRing();
      this.lastSpawnTime = this.time;
    }

    // Update rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      const alive = ring.update(dt, bass, sensitivity);

      if (!alive) {
        this.scene.remove(ring.group);
        ring.dispose();
        this.rings.splice(i, 1);
      }
    }

    // Subtle camera breathing
    const breathe = Math.sin(this.time * 0.3) * 0.2;
    this.camera.position.y = breathe;
    this.camera.position.x = Math.sin(this.time * 0.2) * 0.15;


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
    this.config = { ...this.config, ...config } as SmokeRingsConfig;

    // Update colors on existing rings
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.ether;
    for (const ring of this.rings) {
      ring.material.uniforms.uCoreColor.value.setHex(colors.core);
      ring.material.uniforms.uEdgeColor.value.setHex(colors.edge);
      ring.material.uniforms.uGlowColor.value.setHex(colors.glow);
    }
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    for (const ring of this.rings) {
      ring.dispose();
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.rings = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "ether",
        options: [
          { value: "ether", label: "Ether" },
          { value: "inferno", label: "Inferno" },
          { value: "phantom", label: "Phantom" },
          { value: "frost", label: "Frost" },
          { value: "venom", label: "Venom" },
        ],
      },
      ringSpeed: {
        type: "number",
        label: "Ring Speed",
        default: 2,
        min: 0.5,
        max: 8,
        step: 0.5,
      },
      maxRings: {
        type: "number",
        label: "Max Rings",
        default: 12,
        min: 4,
        max: 24,
        step: 1,
      },
    };
  }
}
