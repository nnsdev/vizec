import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface CausticsConfig extends VisualizationConfig {
  lightCount: number;
  rayDensity: number;
  distortion: number;
  brightness: number;
}

const COLOR_SCHEMES: Record<
  string,
  {
    water: number;
    light: number;
    deep: number;
    surface: number;
  }
> = {
  tropical: { water: 0x00ced1, light: 0xffffff, deep: 0x006994, surface: 0x87ceeb },
  temperate: { water: 0x4682b4, light: 0xfffaf0, deep: 0x1e3a5f, surface: 0x5f9ea0 },
  arctic: { water: 0x5f9ea0, light: 0xe8f4f8, deep: 0x2f4f4f, surface: 0xb0c4de },
  sunset: { water: 0xcd5c5c, light: 0xffd700, deep: 0x8b0000, surface: 0xffa07a },
  pool: { water: 0x00bfff, light: 0xffffff, deep: 0x0077be, surface: 0x87cefa },
};

export class CausticsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "caustics",
    name: "Underwater Caustics",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
    description: "Pool light patterns refracting and dancing on surfaces",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: CausticsConfig = {
    sensitivity: 1.0,
    colorScheme: "tropical",
    lightCount: 5,
    rayDensity: 0.5,
    distortion: 1.0,
    brightness: 1.0,
  };

  private time = 0;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create orthographic camera for 2D effect
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.camera.position.z = 1;

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

    this.createCausticsMesh();
  }

  private createCausticsMesh(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.tropical;

    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1920, 1080) },
        waterColor: { value: new THREE.Color(colors.water) },
        lightColor: { value: new THREE.Color(colors.light) },
        deepColor: { value: new THREE.Color(colors.deep) },
        surfaceColor: { value: new THREE.Color(colors.surface) },
        lightCount: { value: this.config.lightCount },
        rayDensity: { value: this.config.rayDensity },
        distortion: { value: this.config.distortion },
        brightness: { value: this.config.brightness },
        sensitivity: { value: this.config.sensitivity },
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
        uniform vec3 waterColor;
        uniform vec3 lightColor;
        uniform vec3 deepColor;
        uniform vec3 surfaceColor;
        uniform int lightCount;
        uniform float rayDensity;
        uniform float distortion;
        uniform float brightness;
        uniform float sensitivity;

        varying vec2 vUv;

        vec2 hash(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
        }

        // Caustic pattern using overlapping sine waves
        float caustic(vec2 uv, float t) {
          float c = 0.0;
          float scale = 8.0;

          // Multiple wave layers
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            vec2 dir = vec2(cos(fi * 1.3 + t * 0.1), sin(fi * 2.1 - t * 0.15));
            float wave = sin(dot(uv * scale + distortion * t * 0.2, dir) * 2.0 + t);
            c += 0.5 + 0.5 * wave;
          }

          return pow(c / 5.0, 2.0);
        }

        // Voronoi-like pattern for light rays
        float lightRays(vec2 uv, float t) {
          vec2 grid = floor(uv * 10.0 * rayDensity);
          vec2 frac = fract(uv * 10.0 * rayDensity);

          float minDist = 1.0;
          for (int x = -1; x <= 1; x++) {
            for (int y = -1; y <= 1; y++) {
              vec2 neighbor = vec2(float(x), float(y));
              vec2 point = hash(grid + neighbor);
              point = 0.5 + 0.5 * sin(t * 0.5 + 6.2831 * point);
              vec2 diff = neighbor + point - frac;
              float dist = length(diff);
              minDist = min(minDist, dist);
            }
          }

          return 1.0 - smoothstep(0.0, 0.4, minDist);
        }

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
          vec2 centeredUv = (uv - 0.5) * aspect;

          // Audio-reactive time modifier
          float audioFactor = sensitivity;

          // Base caustic pattern
          float caustics = caustic(centeredUv, time * 0.3);

          // Light ray interference
          float rays = lightRays(centeredUv, time * 0.5);

          // Combine patterns
          float intensity = caustics * (0.5 + rays * 0.5);

          // Animate the light sources
          float lightActivity = 0.0;
          for (int i = 0; i < 5; i++) {
            float fi = float(i);
            vec2 lightPos = vec2(
              0.5 + 0.3 * sin(time * 0.2 + fi * 1.5),
              0.5 + 0.2 * cos(time * 0.15 + fi * 2.0)
            );
            float lightDist = length((uv - lightPos) * aspect);
            lightActivity += 0.1 / (lightDist + 0.1);
          }

          intensity *= (1.0 + lightActivity * 0.5);

          // Color mixing
          vec3 color = mix(deepColor, surfaceColor, intensity);
          color = mix(color, waterColor, 1.0 - intensity * 0.5);

          // Add light highlights
          color = mix(color, lightColor, intensity * intensity * 0.3 * brightness);

          // Audio-reactive brightness boost
          color *= brightness * (0.8 + sensitivity * 0.4);

          // Vignette for depth
          float vignette = 1.0 - smoothstep(0.3, 1.0, length(centeredUv / aspect) * 0.5);
          color = mix(color, deepColor, vignette * 0.3);

          // Alpha for transparency
          float alpha = 0.7 + intensity * 0.3;

          gl_FragColor = vec4(color, alpha);
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

    const { bass, mid, treble, volume } = audioData;
    const intensity = (bass + mid * 0.5 + treble * 0.3) * this.config.sensitivity;

    // Update uniforms
    this.material.uniforms.time.value = this.time;
    this.material.uniforms.sensitivity.value = 0.5 + intensity;
    this.material.uniforms.brightness.value = this.config.brightness * (0.8 + volume * 0.4);

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
    this.config = { ...this.config, ...config } as CausticsConfig;

    if (this.material) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.tropical;
      this.material.uniforms.waterColor.value.setHex(colors.water);
      this.material.uniforms.lightColor.value.setHex(colors.light);
      this.material.uniforms.deepColor.value.setHex(colors.deep);
      this.material.uniforms.surfaceColor.value.setHex(colors.surface);
      this.material.uniforms.lightCount.value = this.config.lightCount;
      this.material.uniforms.rayDensity.value = this.config.rayDensity;
      this.material.uniforms.distortion.value = this.config.distortion;
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
        default: "tropical",
        options: [
          { value: "tropical", label: "Tropical" },
          { value: "temperate", label: "Temperate" },
          { value: "arctic", label: "Arctic" },
          { value: "sunset", label: "Sunset" },
          { value: "pool", label: "Pool Blue" },
        ],
      },
      lightCount: {
        type: "number",
        label: "Light Count",
        default: 5,
        min: 1,
        max: 10,
        step: 1,
      },
      rayDensity: {
        type: "number",
        label: "Ray Density",
        default: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
      },
      distortion: {
        type: "number",
        label: "Distortion",
        default: 1.0,
        min: 0,
        max: 3,
        step: 0.1,
      },
      brightness: {
        type: "number",
        label: "Brightness",
        default: 1.0,
        min: 0.2,
        max: 2,
        step: 0.1,
      },
    };
  }
}
