import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface ProjectmPlasmaConfig extends VisualizationConfig {
  speed: number;
  scale: number;
  intensity: number;
  complexity: number;
}

const COLOR_SCHEMES: Record<
  string,
  { color1: number; color2: number; color3: number; color4: number }
> = {
  classic: { color1: 0xff0000, color2: 0x00ff00, color3: 0x0000ff, color4: 0xffff00 },
  fire: { color1: 0xff4400, color2: 0xff8800, color3: 0xffcc00, color4: 0xff0044 },
  ocean: { color1: 0x0044ff, color2: 0x00aaff, color3: 0x00ffaa, color4: 0x004488 },
  psychedelic: { color1: 0xff00ff, color2: 0x00ffff, color3: 0xffff00, color4: 0xff00aa },
  neon: { color1: 0xff0088, color2: 0x00ff88, color3: 0x8800ff, color4: 0xff8800 },
  cosmic: { color1: 0x6600ff, color2: 0xff0066, color3: 0x00ff66, color4: 0xffaa00 },
};

export class ProjectmPlasmaVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "projectmPlasma",
    name: "projectM Plasma",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
    description:
      "Classic demoscene plasma effect with projectM-style audio reactivity and smooth color gradients",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: ProjectmPlasmaConfig = {
    sensitivity: 1.0,
    colorScheme: "psychedelic",
    speed: 1.0,
    scale: 1.0,
    intensity: 1.0,
    complexity: 4,
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

    this.createPlasmaMesh();
  }

  private createPlasmaMesh(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.psychedelic;

    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1920, 1080) },
        color1: { value: new THREE.Color(colors.color1) },
        color2: { value: new THREE.Color(colors.color2) },
        color3: { value: new THREE.Color(colors.color3) },
        color4: { value: new THREE.Color(colors.color4) },
        speed: { value: this.config.speed },
        scale: { value: this.config.scale },
        intensity: { value: this.config.intensity },
        complexity: { value: this.config.complexity },
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
        uniform vec3 color1;
        uniform vec3 color2;
        uniform vec3 color3;
        uniform vec3 color4;
        uniform float speed;
        uniform float scale;
        uniform float intensity;
        uniform int complexity;
        uniform float sensitivity;
        uniform float bass;
        uniform float mid;
        uniform float treble;

        varying vec2 vUv;

        #define PI 3.14159265359

        // Classic plasma function - calmer version
        float plasma(vec2 uv, float t) {
          float v = 0.0;

          // Very slow time and moderate scale
          float slowT = t * speed * 0.3;
          float plasmaScale = scale * 5.0;

          // Classic 4-wave plasma formula (slower)
          // Wave 1: Horizontal sine
          v += sin(uv.x * plasmaScale + slowT);

          // Wave 2: Vertical sine
          v += sin(uv.y * plasmaScale + slowT * 0.6);

          // Wave 3: Diagonal wave
          v += sin((uv.x + uv.y) * plasmaScale * 0.4 + slowT * 0.4);

          // Wave 4: Circular wave
          float dist = length(uv) * plasmaScale * 0.3;
          v += sin(dist + slowT * 0.25);

          // Additional waves based on complexity (gentler)
          if (complexity >= 5) {
            float angle = atan(uv.y, uv.x);
            v += sin(angle * 2.0 + dist * 0.3 + slowT * 0.3) * 0.4;
          }

          if (complexity >= 6) {
            v += sin(uv.x * plasmaScale * 1.2 - uv.y * plasmaScale * 0.6 + slowT * 0.35) * 0.3;
          }

          if (complexity >= 7) {
            v += sin(dist * 1.5 - slowT * 0.8) * 0.25;
          }

          // Normalize
          float waveCount = 4.0;
          if (complexity >= 5) waveCount += 0.4;
          if (complexity >= 6) waveCount += 0.3;
          if (complexity >= 7) waveCount += 0.25;

          return v / waveCount;
        }

        // Color cycling function - very slow
        vec3 plasmaColor(float v, float t) {
          // Normalize plasma value
          float nv = (v + 1.0) * 0.5;

          // Very slow color cycling
          float cycle = mod(t * 0.02 + nv, 1.0);

          // Smooth four-color gradient
          vec3 col;

          if (cycle < 0.25) {
            col = mix(color1, color2, cycle * 4.0);
          } else if (cycle < 0.5) {
            col = mix(color2, color3, (cycle - 0.25) * 4.0);
          } else if (cycle < 0.75) {
            col = mix(color3, color4, (cycle - 0.5) * 4.0);
          } else {
            col = mix(color4, color1, (cycle - 0.75) * 4.0);
          }

          return col;
        }

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
          vec2 centeredUv = (uv - 0.5) * aspect;

          // Very slow time for calm animation
          float slowTime = time * 0.08;

          // Calculate plasma value (slow)
          float v = plasma(centeredUv, slowTime);

          // Gentle intensity
          v *= intensity * 0.7;

          // Get plasma color with very slow cycling
          vec3 col = plasmaColor(v, slowTime);

          // Gentle brightness
          col *= 0.5 + v * 0.15;

          // Very subtle glow
          float glow = pow(max(0.0, (v + 1.0) * 0.5), 2.0) * 0.1;
          col += vec3(glow);

          // Apply sensitivity (reduced)
          col *= sensitivity * 0.6;

          // Clamp to prevent any brightness spikes
          col = clamp(col, 0.0, 0.75);

          // Gentle vignette
          float vignette = 1.0 - smoothstep(0.6, 1.3, length(centeredUv / aspect));
          col *= 0.8 + vignette * 0.2;

          // Moderate transparency
          float alpha = 0.45 + v * 0.1;

          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.material) return;

    this.time += deltaTime;

    const { bass, mid, treble } = audioData;

    // Smooth audio values for organic motion
    const smoothing = 0.12;
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
    this.config = { ...this.config, ...config } as ProjectmPlasmaConfig;

    if (this.material) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.psychedelic;
      this.material.uniforms.color1.value.setHex(colors.color1);
      this.material.uniforms.color2.value.setHex(colors.color2);
      this.material.uniforms.color3.value.setHex(colors.color3);
      this.material.uniforms.color4.value.setHex(colors.color4);
      this.material.uniforms.speed.value = this.config.speed;
      this.material.uniforms.scale.value = this.config.scale;
      this.material.uniforms.intensity.value = this.config.intensity;
      this.material.uniforms.complexity.value = this.config.complexity;
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
        default: "psychedelic",
        options: [
          { value: "classic", label: "Classic RGB" },
          { value: "fire", label: "Fire" },
          { value: "ocean", label: "Ocean" },
          { value: "psychedelic", label: "Psychedelic" },
          { value: "neon", label: "Neon" },
          { value: "cosmic", label: "Cosmic" },
        ],
      },
      speed: {
        type: "number",
        label: "Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      scale: {
        type: "number",
        label: "Scale",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      intensity: {
        type: "number",
        label: "Intensity",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
      complexity: {
        type: "number",
        label: "Complexity",
        default: 4,
        min: 4,
        max: 7,
        step: 1,
      },
    };
  }
}
