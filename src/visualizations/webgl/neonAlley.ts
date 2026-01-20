import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_STRING_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";
import { SIGN_WORDS } from "../shared/words";

interface NeonAlleyConfig extends VisualizationConfig {
  signCount: number;
  speed: number;
  tunnelRadius: number;
  colorScheme: string;
}

interface SignData {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  baseX: number;
  baseY: number;
  speedOffset: number;
  flickerSpeed: number;
  text: string;
  isVertical: boolean;
  freqIndex: number; // 0-255 mapped index
}

export class NeonAlleyVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "neonAlley",
    name: "Neon Alley",
    author: "Vizec",
    description: "Floating neon signs zooming past in a dark void",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private signGroup: THREE.Group | null = null;
  private signs: SignData[] = [];

  private config: NeonAlleyConfig = {
    sensitivity: 1.0,
    colorScheme: "neon", // Default to neon for this one
    signCount: 30,
    speed: 1.0,
    tunnelRadius: 15,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    // Fog for depth fading
    this.scene.fog = new THREE.FogExp2(0x000000, 0.03);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, -100);

    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createSigns();
  }

  private createSignTexture(text: string, color: string, isVertical: boolean): THREE.Texture {
    const canvas = document.createElement("canvas");
    // High res for crisp text
    const w = isVertical ? 64 : 256;
    const h = isVertical ? 256 : 64;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Transparent background
    ctx.clearRect(0, 0, w, h);

    // Glow
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;

    // Border
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);

    // Text
    ctx.fillStyle = color;
    ctx.font = isVertical ? "bold 40px Arial" : "bold 40px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (isVertical) {
      // Draw characters vertically
      const chars = text.split("");
      const step = (h - 20) / (chars.length + 1);
      chars.forEach((char, i) => {
        ctx.fillText(char, w / 2, 20 + step * (i + 1));
      });
    } else {
      ctx.fillText(text, w / 2, h / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  private createSigns(): void {
    if (!this.scene) return;

    if (this.signGroup) {
      this.scene.remove(this.signGroup);
      this.signs.forEach((s) => {
        s.mesh.geometry.dispose();
        s.material.map?.dispose();
        s.material.dispose();
      });
      this.signs = [];
    }

    this.signGroup = new THREE.Group();
    const { signCount, tunnelRadius, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING_ACCENT, colorScheme);

    for (let i = 0; i < signCount; i++) {
      const isVertical = Math.random() > 0.5;
      const text = SIGN_WORDS[Math.floor(Math.random() * SIGN_WORDS.length)];

      // Alternate colors
      const color = Math.random() > 0.5 ? colors.primary : colors.accent;

      const texture = this.createSignTexture(text, color, isVertical);

      const geometry = new THREE.PlaneGeometry(isVertical ? 1 : 4, isVertical ? 4 : 1);

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geometry, material);

      // Random position in a tunnel around Z axis
      const angle = Math.random() * Math.PI * 2;
      // Radius varies slightly
      const r = tunnelRadius * (0.8 + Math.random() * 0.4);

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      // Start at random Z depth
      const startZ = -Math.random() * 100;

      mesh.position.set(x, y, startZ);

      // Rotate to face inward/camera somewhat
      mesh.lookAt(0, 0, startZ + 10);
      // Add some random tilt
      mesh.rotation.z += (Math.random() - 0.5) * 0.5;

      this.signs.push({
        mesh,
        material,
        baseX: x,
        baseY: y,
        speedOffset: 0.5 + Math.random() * 1.0,
        flickerSpeed: 5 + Math.random() * 20,
        text,
        isVertical,
        freqIndex: Math.floor(Math.random() * 100), // Random audio channel
      });

      this.signGroup.add(mesh);
    }

    this.scene.add(this.signGroup);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.signGroup) return;

    this.time += deltaTime;
    const { frequencyData, volume, treble } = audioData;
    const { sensitivity, speed } = this.config;

    // Move signs
    const moveSpeed = 20 * speed * (1 + volume * sensitivity * 0.5); // Music boosts speed

    this.signs.forEach((s) => {
      // Move towards camera (positive Z)
      s.mesh.position.z += moveSpeed * s.speedOffset * deltaTime;

      // Loop back
      if (s.mesh.position.z > 5) {
        s.mesh.position.z = -100;
        // Maybe randomize X/Y again for variety?
        // Keep simple for now
      }

      // Audio reactivity
      const val = frequencyData[s.freqIndex] || 0;
      const normalized = (val / 255) * sensitivity;

      // Flicker effect (bad neon connection style)
      // Driven by Treble or random + high freq
      const flicker = Math.sin(this.time * s.flickerSpeed) > 0.8 ? 0.2 : 1.0;

      // If loud, stabilize flicker (fully lit)
      const stability = normalized > 0.5 ? 1.0 : flicker;

      // Base opacity
      let opacity = 0.3 + normalized * 0.7;

      // Apply flicker to opacity
      opacity *= stability;

      s.material.opacity = Math.min(1, Math.max(0.1, opacity));

      // Scale pulse
      const scale = 1 + normalized * 0.2;
      s.mesh.scale.setScalar(scale);
    });

    // Camera sway
    this.camera.rotation.z = Math.sin(this.time * 0.2) * 0.05 * (1 + treble * sensitivity);

    this.rendererThree.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.rendererThree?.setSize(width, height);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldScheme = this.config.colorScheme;
    const oldCount = this.config.signCount;

    this.config = { ...this.config, ...config } as NeonAlleyConfig;

    if (this.config.colorScheme !== oldScheme || this.config.signCount !== oldCount) {
      this.createSigns();
    }
  }

  destroy(): void {
    if (this.signGroup) {
      this.scene?.remove(this.signGroup);
      this.signs.forEach((s) => {
        s.mesh.geometry.dispose();
        s.material.map?.dispose();
        s.material.dispose();
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
        default: "neon",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({
          label: o.label,
          value: o.value,
        })),
      },
      signCount: {
        type: "number",
        label: "Sign Count",
        default: 30,
        min: 10,
        max: 100,
        step: 5,
      },
      speed: {
        type: "number",
        label: "Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      tunnelRadius: {
        type: "number",
        label: "Tunnel Width",
        default: 15,
        min: 5,
        max: 30,
        step: 1,
      },
    };
  }
}
