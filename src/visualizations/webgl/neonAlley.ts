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
    signCount: 50,
    speed: 1.0,
    tunnelRadius: 15,
  };

  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    // Fog for depth fading - reduced density so we can see further
    this.scene.fog = new THREE.FogExp2(0x000000, 0.012);

    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);
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
    const w = isVertical ? 160 : 640;
    const h = isVertical ? 640 : 160;
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // Transparent background
    ctx.clearRect(0, 0, w, h);

    // Glow
    ctx.shadowBlur = 4;
    ctx.shadowColor = color;

    // Border
    const padding = 16;
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.strokeRect(padding, padding, w - padding * 2, h - padding * 2);

    // Text
    ctx.fillStyle = color;
    const fontSize = Math.floor((isVertical ? w : h) * 0.68);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (isVertical) {
      // Draw characters vertically
      const chars = text.split("");
      const step = (h - padding * 2) / (chars.length + 1);
      chars.forEach((char, i) => {
        ctx.fillText(char, w / 2, padding + step * (i + 1));
      });
    } else {
      ctx.fillText(text, w / 2, h / 2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = this.rendererThree?.capabilities.getMaxAnisotropy() ?? 1;
    tex.needsUpdate = true;
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
      const r = tunnelRadius * (0.6 + Math.random() * 0.35);

      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;

      // Start distributed along the entire tunnel length for better initial visibility
      // Extended range to prevent bunching
      const startZ = -15 - Math.random() * 150;

      mesh.position.set(x, y, startZ);

      // Rotate to face inward/camera somewhat
      mesh.lookAt(0, 0, 0);
      // Add some random tilt
      mesh.rotation.z += (Math.random() - 0.5) * 0.5;

      this.signs.push({
        mesh,
        material,
        baseX: x,
        baseY: y,
        speedOffset: 0.8 + Math.random() * 0.4, // Smoother speed variance
        flickerSpeed: 3 + Math.random() * 8,
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
    const { frequencyData, volume, treble, bass } = audioData;
    const { sensitivity, speed, tunnelRadius, colorScheme } = this.config;

    // Move signs towards camera (tunnel effect) - steady flow
    // Reduced audio influence on speed to prevent lag/jitter perception
    const moveSpeed = 0.06 * speed * (1 + (volume * 0.25 + bass * 0.35) * sensitivity);
    const colors = getColorScheme(COLOR_SCHEMES_STRING_ACCENT, colorScheme);

    this.signs.forEach((s) => {
      // Move towards camera (positive Z)
      s.mesh.position.z += moveSpeed * s.speedOffset * deltaTime;

      // Loop back when passed camera - respawn far in distance
      // Camera is at 0, looking at -100. Positive Z is behind camera.
      // Wait until well past camera to avoid popping
      if (s.mesh.position.z > 20) {
        // Respawn FAR away
        s.mesh.position.z = -160 - Math.random() * 40;

        // Randomize X/Y again for better distribution
        const angle = Math.random() * Math.PI * 2;
        const r = tunnelRadius * (0.6 + Math.random() * 0.35);
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;

        s.mesh.position.x = x;
        s.mesh.position.y = y;
        s.baseX = x;
        s.baseY = y;

        // Fully refresh visual identity
        const isVertical = Math.random() > 0.5;
        const text = SIGN_WORDS[Math.floor(Math.random() * SIGN_WORDS.length)];
        const color = Math.random() > 0.5 ? colors.primary : colors.accent;

        // Dispose old resources
        s.material.map?.dispose();
        s.mesh.geometry.dispose();

        // Create new
        s.material.map = this.createSignTexture(text, color, isVertical);
        s.mesh.geometry = new THREE.PlaneGeometry(isVertical ? 1 : 4, isVertical ? 4 : 1);
        s.text = text;
        s.isVertical = isVertical;
        s.freqIndex = Math.floor(Math.random() * 100);

        // Reset orientation
        s.mesh.rotation.set(0, 0, 0);
        s.mesh.lookAt(0, 0, 0);
        s.mesh.rotation.z += (Math.random() - 0.5) * 0.5;
      }

      // Audio reactivity
      const val = frequencyData[s.freqIndex] || 0;
      const normalized = (val / 255) * sensitivity;

      // Flicker effect (bad neon connection style)
      // Driven by Treble or random + high freq
      // Reduced flicker darkness (0.4 instead of 0.2) to keep signs visible
      const flicker = 0.75 + 0.25 * Math.sin(this.time * s.flickerSpeed);

      // If loud, stabilize flicker (fully lit)
      const stability = normalized > 0.5 ? 1.0 : flicker;

      // Base opacity increased to 0.5 for better visibility
      let opacity = 0.5 + normalized * 0.5;

      // Apply flicker to opacity
      opacity *= stability;

      const targetOpacity = Math.min(1, Math.max(0.2, opacity));
      s.material.opacity += (targetOpacity - s.material.opacity) * 0.2;

      // Subtle scale pulse only on loud audio
      const targetScale = 1 + (normalized > 0.2 ? (normalized - 0.2) * 0.06 : 0);
      const scale = s.mesh.scale.x + (targetScale - s.mesh.scale.x) * 0.2;
      s.mesh.scale.setScalar(scale);
    });

    // Camera sway (reduced effect)
    this.camera.rotation.z = Math.sin(this.time * 0.2) * 0.008 * (1 + treble * sensitivity);

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
        default: 50,
        min: 20,
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
