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

interface GalaxyConfig extends VisualizationConfig {
  starCount: number;
  armCount: number;
  colorScheme: string;
  rotationSpeed: number;
  spread: number;
}

export class GalaxyVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "galaxy",
    name: "Galaxy",
    author: "Vizec",
    description: "Spiral galaxy made of particles with audio-reactive rotation and brightness",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private stars: THREE.Points | null = null;
  private coreGlow: THREE.Mesh | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private starSizes: Float32Array | null = null;
  private originalSizes: Float32Array | null = null;

  private config: GalaxyConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    starCount: 15000,
    armCount: 4,
    rotationSpeed: 0.3,
    spread: 30,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera - looking down at an angle
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 40, 50);
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

    // Create galaxy
    this.createGalaxy();
  }

  private createGalaxy(): void {
    if (!this.scene) return;

    const { starCount, armCount, colorScheme, spread } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    // Remove existing elements
    if (this.stars) {
      this.scene.remove(this.stars);
      this.geometry?.dispose();
      (this.stars.material as THREE.Material).dispose();
    }
    if (this.coreGlow) {
      this.scene.remove(this.coreGlow);
      (this.coreGlow.material as THREE.Material).dispose();
      (this.coreGlow.geometry as THREE.BufferGeometry).dispose();
    }

    // Create star geometry
    this.geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    this.starSizes = new Float32Array(starCount);
    this.originalSizes = new Float32Array(starCount);

    const primaryColor = new THREE.Color(colors.primary);
    const secondaryColor = new THREE.Color(colors.secondary);
    const glowColor = new THREE.Color(colors.glow);

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;

      // Determine which arm this star belongs to
      const armIndex = i % armCount;
      const armAngle = (armIndex / armCount) * Math.PI * 2;

      // Distance from center with exponential falloff for density
      const radius = Math.random() * spread;
      const radiusNormalized = radius / spread;

      // Spiral arm offset - tighter at center, looser at edge
      const spiralAngle = radiusNormalized * Math.PI * 3;
      const angle = armAngle + spiralAngle;

      // Add randomness that increases with distance (spread)
      const randomSpread = radiusNormalized * spread * 0.3;
      const randomX = (Math.random() - 0.5) * randomSpread;
      const randomZ = (Math.random() - 0.5) * randomSpread;
      const randomY = (Math.random() - 0.5) * 2 * (1 - radiusNormalized * 0.5);

      positions[i3] = Math.cos(angle) * radius + randomX;
      positions[i3 + 1] = randomY;
      positions[i3 + 2] = Math.sin(angle) * radius + randomZ;

      // Color gradient from core to edge
      const mixFactor = radiusNormalized;
      const starColor = new THREE.Color().lerpColors(
        glowColor,
        mixFactor < 0.5 ? primaryColor : secondaryColor,
        mixFactor,
      );
      starColors[i3] = starColor.r;
      starColors[i3 + 1] = starColor.g;
      starColors[i3 + 2] = starColor.b;

      // Star sizes - brighter/bigger near core
      const size = (1 - radiusNormalized * 0.7) * 3 + Math.random() * 2;
      this.starSizes[i] = size;
      this.originalSizes[i] = size;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
    this.geometry.setAttribute("size", new THREE.BufferAttribute(this.starSizes, 1));

    // Create custom shader material for stars
    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.createStarTexture() },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D pointTexture;
        varying vec3 vColor;
        void main() {
          vec4 texColor = texture2D(pointTexture, gl_PointCoord);
          gl_FragColor = vec4(vColor, texColor.a);
          if (gl_FragColor.a < 0.1) discard;
        }
      `,
      transparent: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.stars = new THREE.Points(this.geometry, starMaterial);
    this.scene.add(this.stars);

    // Create core glow
    const coreGeometry = new THREE.SphereGeometry(2, 32, 32);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      opacity: 0.6,
    });
    this.coreGlow = new THREE.Mesh(coreGeometry, coreMaterial);
    this.scene.add(this.coreGlow);
  }

  private createStarTexture(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    // Create radial gradient for soft star
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.8)");
    gradient.addColorStop(0.6, "rgba(255, 255, 255, 0.3)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.stars || !this.geometry) return;
    if (!this.starSizes || !this.originalSizes) return;

    const { bass, volume, frequencyData } = audioData;
    const { sensitivity, rotationSpeed } = this.config;

    this.time += deltaTime;

    // Rotation speed affected by bass
    const bassBoost = Math.pow(bass, 0.7) * 2;
    const rotationMultiplier = 1 + bassBoost * sensitivity * 0.5;
    this.stars.rotation.y += rotationSpeed * 0.01 * rotationMultiplier;

    // Star brightness pulses with frequency data
    const positions = this.geometry.attributes.position.array as Float32Array;
    const starCount = this.starSizes.length;

    for (let i = 0; i < starCount; i++) {
      const i3 = i * 3;
      const x = positions[i3];
      const z = positions[i3 + 2];
      const radius = Math.sqrt(x * x + z * z);
      const normalizedRadius = Math.min(radius / this.config.spread, 1);

      // Map radius to frequency bin
      const freqIndex = Math.floor(normalizedRadius * frequencyData.length * 0.8);
      const freqValue = frequencyData[Math.min(freqIndex, frequencyData.length - 1)] / 255;

      // Pulse star size based on frequency
      const pulseFactor = 1 + freqValue * sensitivity * 1.5;
      this.starSizes[i] = this.originalSizes[i] * pulseFactor;
    }

    this.geometry.attributes.size.needsUpdate = true;

    // Core glow brighter with volume
    if (this.coreGlow) {
      const coreMaterial = this.coreGlow.material as THREE.MeshBasicMaterial;
      coreMaterial.opacity = 0.4 + volume * 0.6 * sensitivity;

      // Pulse core size
      const coreScale = 1 + bassBoost * sensitivity * 0.3;
      this.coreGlow.scale.setScalar(coreScale);

      // Slow counter-rotation
      this.coreGlow.rotation.y -= rotationSpeed * 0.005;
    }

    // Subtle camera movement
    const targetY = 40 + Math.sin(this.time * 0.5) * 5;
    this.camera.position.y += (targetY - this.camera.position.y) * 0.02;
    this.camera.lookAt(0, 0, 0);

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
    const oldStarCount = this.config.starCount;
    const oldArmCount = this.config.armCount;
    const oldSpread = this.config.spread;

    this.config = { ...this.config, ...config } as GalaxyConfig;

    // Recreate galaxy if relevant settings changed
    if (
      this.scene &&
      (this.config.colorScheme !== oldColorScheme ||
        this.config.starCount !== oldStarCount ||
        this.config.armCount !== oldArmCount ||
        this.config.spread !== oldSpread)
    ) {
      this.createGalaxy();
    }
  }

  destroy(): void {
    if (this.geometry) {
      this.geometry.dispose();
    }

    if (this.stars) {
      (this.stars.material as THREE.Material).dispose();
    }

    if (this.coreGlow) {
      (this.coreGlow.material as THREE.Material).dispose();
      (this.coreGlow.geometry as THREE.BufferGeometry).dispose();
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
    this.stars = null;
    this.coreGlow = null;
    this.geometry = null;
    this.starSizes = null;
    this.originalSizes = null;
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
      starCount: {
        type: "number",
        min: 5000,
        max: 30000,
        step: 1000,
        default: 15000,
        label: "Star Count",
      },
      armCount: { type: "number", min: 2, max: 8, step: 1, default: 4, label: "Spiral Arms" },
      rotationSpeed: {
        type: "number",
        min: 0,
        max: 2,
        step: 0.1,
        default: 0.3,
        label: "Rotation Speed",
      },
      spread: { type: "number", min: 15, max: 50, step: 5, default: 30, label: "Galaxy Spread" },
    };
  }
}
