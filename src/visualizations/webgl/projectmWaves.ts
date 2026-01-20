import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface ProjectmWavesConfig extends VisualizationConfig {
  waveLayers: number;
  waveSpeed: number;
  waveAmplitude: number;
  distortion: number;
  colorCycleSpeed: number;
}

const COLOR_SCHEMES: Record<
  string,
  { primary: number; secondary: number; glow: number; accent: number }
> = {
  psychedelic: { primary: 0xff00ff, secondary: 0x00ffff, glow: 0xffff00, accent: 0xff00aa },
  plasma: { primary: 0xff0066, secondary: 0x6600ff, glow: 0x00ff66, accent: 0xff6600 },
  nebula: { primary: 0x6600ff, secondary: 0xff6600, glow: 0xff00ff, accent: 0x00ffaa },
  cosmic: { primary: 0x00ffaa, secondary: 0xaa00ff, glow: 0xffffff, accent: 0xffaa00 },
  aurora: { primary: 0x00ff88, secondary: 0x0088ff, glow: 0x88ff00, accent: 0xff0088 },
  kaleidoscope: { primary: 0xff8800, secondary: 0x0088ff, glow: 0xff0088, accent: 0x00ff88 },
};

export class ProjectmWavesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "projectmWaves",
    name: "projectM Waves",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
    description:
      "Psychedelic wave patterns inspired by projectM MilkDrop visualizations with organic flowing shapes",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: ProjectmWavesConfig = {
    sensitivity: 1.0,
    colorScheme: "psychedelic",
    waveLayers: 5,
    waveSpeed: 1.0,
    waveAmplitude: 1.0,
    distortion: 1.0,
    colorCycleSpeed: 1.0,
  };

  private time = 0;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  // Smoothed audio values for organic animation
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

    this.createWavesMesh();
  }

  private createWavesMesh(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.psychedelic;

    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1920, 1080) },
        primaryColor: { value: new THREE.Color(colors.primary) },
        secondaryColor: { value: new THREE.Color(colors.secondary) },
        glowColor: { value: new THREE.Color(colors.glow) },
        accentColor: { value: new THREE.Color(colors.accent) },
        waveLayers: { value: this.config.waveLayers },
        waveSpeed: { value: this.config.waveSpeed },
        waveAmplitude: { value: this.config.waveAmplitude },
        distortion: { value: this.config.distortion },
        colorCycleSpeed: { value: this.config.colorCycleSpeed },
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
        uniform vec3 glowColor;
        uniform vec3 accentColor;
        uniform int waveLayers;
        uniform float waveSpeed;
        uniform float waveAmplitude;
        uniform float distortion;
        uniform float colorCycleSpeed;
        uniform float sensitivity;
        uniform float bass;
        uniform float mid;
        uniform float treble;

        varying vec2 vUv;

        // Rotate 2D coordinates
        vec2 rotate2D(vec2 uv, float angle) {
          float s = sin(angle);
          float c = cos(angle);
          return vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
        }

        // projectM-style wave function with multiple overlapping layers (calmer)
        float waves(vec2 uv, float t, int layers) {
          float wave = 0.0;
          float amplitude = waveAmplitude * 0.6;
          float scale = 4.0;

          for (int i = 0; i < 7; i++) {
            if (i >= layers) break;

            float fi = float(i);
            float phase = fi * 0.7 + t * 0.5 * (1.0 + fi * 0.1);

            // Create wave direction that rotates very slowly
            vec2 dir = vec2(
              cos(fi * 1.5 + t * 0.3 * waveSpeed),
              sin(fi * 2.1 - t * 0.4 * waveSpeed)
            );

            // Gentle distortion
            vec2 distortedUv = uv + distortion * 0.05 * vec2(
              sin(uv.y * 3.0 + t * 0.2),
              cos(uv.x * 3.0 + t * 0.15)
            );

            // Core wave equation - gentle interference
            float w = sin(dot(distortedUv * scale, dir) * 1.5 + phase * waveSpeed * 0.5);

            // Subtle harmonic
            w += 0.3 * sin(dot(distortedUv * scale * 1.3, dir.yx) * 2.0 + phase * 0.8);

            // Weight by layer
            wave += w * amplitude / (1.0 + fi * 0.4);
          }

          return wave / float(layers);
        }

        // Color cycling function - very slow
        vec3 cycleColor(float t, float phase, vec3 c1, vec3 c2, vec3 c3, vec3 c4) {
          float cycle = mod(t * colorCycleSpeed * 0.15 + phase, 4.0);

          if (cycle < 1.0) {
            return mix(c1, c2, cycle);
          } else if (cycle < 2.0) {
            return mix(c2, c3, cycle - 1.0);
          } else if (cycle < 3.0) {
            return mix(c3, c4, cycle - 2.0);
          } else {
            return mix(c4, c1, cycle - 3.0);
          }
        }

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
          vec2 centeredUv = (uv - 0.5) * aspect;

          // Very slow time for calm animation
          float slowTime = time * 0.08;

          // Very gentle rotation
          float rotation = slowTime * 0.3 + bass * 0.1;
          vec2 rotatedUv = rotate2D(centeredUv, rotation);

          // Calculate base wave pattern (slow)
          float w = waves(rotatedUv, slowTime, waveLayers);

          // Gentle normalize
          w = 0.5 + 0.4 * w;

          // Calculate color phase based on position
          float colorPhase = length(centeredUv) * 1.5 + atan(centeredUv.y, centeredUv.x) * 0.3;

          // Get cycling color (very slow)
          vec3 baseColor = cycleColor(
            slowTime * 0.5,
            colorPhase + w * 0.3,
            primaryColor,
            secondaryColor,
            glowColor,
            accentColor
          );

          // Gentle wave intensity
          vec3 color = baseColor * (0.4 + w * 0.4);

          // Very subtle glow
          float glowAmount = w * w * 0.15;
          color += glowColor * glowAmount * 0.1;

          // Gentle brightness
          float brightness = 0.5 + sensitivity * 0.15;
          color *= brightness;

          // Clamp to prevent any brightness spikes
          color = clamp(color, 0.0, 0.8);

          // Gentle vignette
          float vignette = 1.0 - smoothstep(0.6, 1.3, length(centeredUv / aspect));
          color *= 0.8 + vignette * 0.2;

          // Moderate transparency
          float alpha = 0.45 + w * 0.15;

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
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Apply sensitivity scaling
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
    this.config = { ...this.config, ...config } as ProjectmWavesConfig;

    if (this.material) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.psychedelic;
      this.material.uniforms.primaryColor.value.setHex(colors.primary);
      this.material.uniforms.secondaryColor.value.setHex(colors.secondary);
      this.material.uniforms.glowColor.value.setHex(colors.glow);
      this.material.uniforms.accentColor.value.setHex(colors.accent);
      this.material.uniforms.waveLayers.value = this.config.waveLayers;
      this.material.uniforms.waveSpeed.value = this.config.waveSpeed;
      this.material.uniforms.waveAmplitude.value = this.config.waveAmplitude;
      this.material.uniforms.distortion.value = this.config.distortion;
      this.material.uniforms.colorCycleSpeed.value = this.config.colorCycleSpeed;
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
          { value: "psychedelic", label: "Psychedelic" },
          { value: "plasma", label: "Plasma" },
          { value: "nebula", label: "Nebula" },
          { value: "cosmic", label: "Cosmic" },
          { value: "aurora", label: "Aurora" },
          { value: "kaleidoscope", label: "Kaleidoscope" },
        ],
      },
      waveLayers: {
        type: "number",
        label: "Wave Layers",
        default: 5,
        min: 3,
        max: 7,
        step: 1,
      },
      waveSpeed: {
        type: "number",
        label: "Wave Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      waveAmplitude: {
        type: "number",
        label: "Wave Amplitude",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
      distortion: {
        type: "number",
        label: "Distortion",
        default: 1.0,
        min: 0.0,
        max: 3.0,
        step: 0.1,
      },
      colorCycleSpeed: {
        type: "number",
        label: "Color Cycle Speed",
        default: 1.0,
        min: 0.0,
        max: 3.0,
        step: 0.1,
      },
    };
  }
}
