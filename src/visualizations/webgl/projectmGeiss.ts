import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface ProjectmGeissConfig extends VisualizationConfig {
  complexity: number;
  morphSpeed: number;
  glowIntensity: number;
  detail: number;
}

const COLOR_SCHEMES: Record<
  string,
  { primary: number; secondary: number; tertiary: number; glow: number }
> = {
  geissClassic: { primary: 0xff0088, secondary: 0x00ff88, tertiary: 0x8800ff, glow: 0xffffff },
  electricDream: { primary: 0x00ffff, secondary: 0xff00ff, tertiary: 0xffff00, glow: 0x88ffff },
  fireAndIce: { primary: 0xff4400, secondary: 0x0044ff, tertiary: 0xff00ff, glow: 0xffaa00 },
  toxicNebula: { primary: 0x00ff44, secondary: 0xff0044, tertiary: 0x4400ff, glow: 0xaaff00 },
  cosmicVoid: { primary: 0x6600ff, secondary: 0xff0066, tertiary: 0x00ff66, glow: 0xcc88ff },
  solarFlare: { primary: 0xffaa00, secondary: 0xff0000, tertiary: 0xffff00, glow: 0xffcc00 },
};

export class ProjectmGeissVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "projectmGeiss",
    name: "projectM Geiss",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
    description:
      "Complex wave interference patterns inspired by Ryan Geiss' MilkDrop visualizer with organic morphing shapes",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: ProjectmGeissConfig = {
    sensitivity: 1.0,
    colorScheme: "geissClassic",
    complexity: 5,
    morphSpeed: 1.0,
    glowIntensity: 1.0,
    detail: 1.0,
  };

  private time = 0;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  // Smoothed audio values
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera for 2D shader effect
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;

    // Create renderer
    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createGeissMesh();
  }

  private createGeissMesh(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.geissClassic;

    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1920, 1080) },
        primaryColor: { value: new THREE.Color(colors.primary) },
        secondaryColor: { value: new THREE.Color(colors.secondary) },
        tertiaryColor: { value: new THREE.Color(colors.tertiary) },
        glowColor: { value: new THREE.Color(colors.glow) },
        complexity: { value: this.config.complexity },
        morphSpeed: { value: this.config.morphSpeed },
        glowIntensity: { value: this.config.glowIntensity },
        detail: { value: this.config.detail },
        sensitivity: { value: this.config.sensitivity },
        bass: { value: 0.0 },
        mid: { value: 0.0 },
        treble: { value: 0.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec2 resolution;
        uniform vec3 primaryColor;
        uniform vec3 secondaryColor;
        uniform vec3 tertiaryColor;
        uniform vec3 glowColor;
        uniform int complexity;
        uniform float morphSpeed;
        uniform float glowIntensity;
        uniform float detail;
        uniform float sensitivity;
        uniform float bass;
        uniform float mid;
        uniform float treble;

        varying vec2 vUv;

        #define PI 3.14159265359
        #define TAU 6.28318530718

        // Rotation matrix
        mat2 rot2(float a) {
          float s = sin(a), c = cos(a);
          return mat2(c, -s, s, c);
        }

        // Smooth noise-like function
        float smoothNoise(vec2 uv) {
          return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
        }

        // Complex wave interference pattern - calmer version
        float geissWave(vec2 uv, float t, int layers) {
          float wave = 0.0;
          float amplitude = 0.8;
          float frequency = 0.8;

          // Very slow morphing
          float slowT = t * morphSpeed * 0.3;

          for (int i = 0; i < 8; i++) {
            if (i >= layers) break;

            float fi = float(i);
            float phase = fi * 0.618033988749 * TAU;

            // Very slow wave direction changes
            float dirAngle = slowT * 0.3 * (1.0 + fi * 0.05) + phase;
            vec2 dir = vec2(cos(dirAngle), sin(dirAngle));

            // Gentle rotation
            vec2 rotUv = uv * rot2(slowT * 0.15 + fi * 0.2);

            // Gentle overlapping waves
            float w1 = sin(dot(rotUv * frequency * 3.0, dir) + slowT * (0.3 + fi * 0.05));
            float w2 = sin(length(rotUv) * frequency * 5.0 - slowT * 0.2 + phase);
            float w3 = sin((rotUv.x + rotUv.y) * frequency * 2.5 + slowT * 0.25);

            // Gentle interference
            float interference = w1 * 0.4 + w2 * 0.35 + w3 * 0.25;

            wave += interference * amplitude;

            amplitude *= 0.75;
            frequency *= 1.2;
          }

          return wave;
        }

        // Gentle coordinate distortion
        vec2 geissDistort(vec2 uv, float t) {
          float distortAmount = 0.08;

          float angle = atan(uv.y, uv.x);
          float dist = length(uv);

          // Very gentle distortion waves
          float dx = sin(uv.y * 4.0 * detail + t * 0.15) * distortAmount;
          dx += sin(dist * 6.0 - t * 0.2) * distortAmount * 0.4;

          float dy = sin(uv.x * 3.5 * detail + t * 0.12) * distortAmount;
          dy += cos(angle * 3.0 + t * 0.1) * distortAmount * 0.3;

          return uv + vec2(dx, dy);
        }

        // Hue cycling for color morphing
        vec3 hueShift(vec3 color, float shift) {
          vec3 p = vec3(0.55735) * dot(vec3(0.55735), color);
          vec3 u = color - p;
          vec3 v = cross(vec3(0.55735), u);
          return u * cos(shift * TAU) + v * sin(shift * TAU) + p;
        }

        // Gentle color mixing function
        vec3 geissColor(float v, float t, vec2 uv) {
          // Normalize wave value
          float nv = v * 0.4 + 0.5;

          // Very slow color cycling
          float colorCycle = t * 0.015;

          // Gentle position-based variation
          float posPhase = atan(uv.y, uv.x) / TAU + 0.5;
          float distPhase = length(uv) * 0.3;

          // Smooth gradient
          float phase = mod(nv + colorCycle + posPhase * 0.2, 1.0);

          vec3 col;
          if (phase < 0.33) {
            col = mix(primaryColor, secondaryColor, phase * 3.0);
          } else if (phase < 0.66) {
            col = mix(secondaryColor, tertiaryColor, (phase - 0.33) * 3.0);
          } else {
            col = mix(tertiaryColor, primaryColor, (phase - 0.66) * 3.0);
          }

          // Very subtle hue shift
          col = hueShift(col, distPhase * 0.1 + colorCycle * 0.5);

          return col;
        }

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
          vec2 centeredUv = (uv - 0.5) * aspect;

          // Very slow time for calm animation
          float slowTime = time * 0.08;

          // Apply gentle per-pixel distortion
          vec2 distortedUv = geissDistort(centeredUv, slowTime);

          // Calculate wave patterns at different scales (very slow)
          float wave1 = geissWave(distortedUv, slowTime, complexity);
          float wave2 = geissWave(distortedUv * 1.5, slowTime * 0.8, max(complexity - 2, 3));

          // Combine waves gently
          float combinedWave = wave1 * 0.6 + wave2 * 0.4;
          combinedWave *= 0.7; // Reduce overall intensity

          // Get base color with very slow cycling
          vec3 color = geissColor(combinedWave, slowTime, distortedUv);

          // Gentle brightness variation
          float brightness = 0.5 + combinedWave * 0.2;
          brightness = clamp(brightness, 0.3, 0.8);
          color *= brightness;

          // Very subtle glow
          float glowAmount = pow(max(0.0, brightness - 0.4), 2.0) * glowIntensity * 0.3;
          color += glowColor * glowAmount * 0.1;

          // Apply sensitivity (reduced impact)
          color *= sensitivity * 0.6;

          // Clamp colors to prevent any brightness spikes
          color = clamp(color, 0.0, 0.85);

          // Gentle vignette
          float vignette = 1.0 - smoothstep(0.6, 1.4, length(centeredUv / aspect));
          color *= 0.8 + vignette * 0.2;

          // Moderate transparency
          float alpha = 0.5 + brightness * 0.15;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.material) return;

    this.time += deltaTime;

    const { bass, mid, treble } = audioData;

    // Smooth audio values for organic motion
    const smoothing = 0.1;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Apply sensitivity
    const sensitivityScale = this.config.sensitivity;
    const scaledBass = Math.pow(this.bassSmooth, 0.7) * sensitivityScale;
    const scaledMid = Math.pow(this.midSmooth, 0.8) * sensitivityScale;
    const scaledTreble = Math.pow(this.trebleSmooth, 0.9) * sensitivityScale;

    // Update shader uniforms
    this.material.uniforms.time.value = this.time;
    this.material.uniforms.bass.value = scaledBass;
    this.material.uniforms.mid.value = scaledMid;
    this.material.uniforms.treble.value = scaledTreble;
    this.material.uniforms.sensitivity.value = sensitivityScale;

    this.rendererThree.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      const aspect = width / height;
      this.camera.left = -1;
      this.camera.right = 1;
      this.camera.top = 1 / aspect;
      this.camera.bottom = -1 / aspect;
      this.camera.updateProjectionMatrix();
    }

    if (this.rendererThree) {
      this.rendererThree.setSize(width, height);
    }

    if (this.material) {
      this.material.uniforms.resolution.value.set(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as ProjectmGeissConfig;

    if (this.material) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.geissClassic;
      this.material.uniforms.primaryColor.value.setHex(colors.primary);
      this.material.uniforms.secondaryColor.value.setHex(colors.secondary);
      this.material.uniforms.tertiaryColor.value.setHex(colors.tertiary);
      this.material.uniforms.glowColor.value.setHex(colors.glow);
      this.material.uniforms.complexity.value = this.config.complexity;
      this.material.uniforms.morphSpeed.value = this.config.morphSpeed;
      this.material.uniforms.glowIntensity.value = this.config.glowIntensity;
      this.material.uniforms.detail.value = this.config.detail;
    }
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    if (this.mesh && this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.mesh = null;
    this.material = null;
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
        default: "geissClassic",
        options: [
          { value: "geissClassic", label: "Geiss Classic" },
          { value: "electricDream", label: "Electric Dream" },
          { value: "fireAndIce", label: "Fire & Ice" },
          { value: "toxicNebula", label: "Toxic Nebula" },
          { value: "cosmicVoid", label: "Cosmic Void" },
          { value: "solarFlare", label: "Solar Flare" },
        ],
      },
      complexity: {
        type: "number",
        label: "Complexity",
        default: 5,
        min: 3,
        max: 8,
        step: 1,
      },
      morphSpeed: {
        type: "number",
        label: "Morph Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      detail: {
        type: "number",
        label: "Detail",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
