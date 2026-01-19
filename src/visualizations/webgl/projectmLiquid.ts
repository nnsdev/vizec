import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface ProjectmLiquidConfig extends VisualizationConfig {
  dropletSize: number;
  rippleSpeed: number;
  surfaceTension: number;
  layerCount: number;
}

const COLOR_SCHEMES: Record<
  string,
  { liquid: number; highlight: number; depth: number; accent: number }
> = {
  water: { liquid: 0x0088ff, highlight: 0x88ffff, depth: 0x002266, accent: 0x00ffaa },
  mercury: { liquid: 0x888899, highlight: 0xffffff, depth: 0x333344, accent: 0xccccdd },
  lava: { liquid: 0xff4400, highlight: 0xffff00, depth: 0x660000, accent: 0xff8800 },
  oil: { liquid: 0x224466, highlight: 0x6688aa, depth: 0x001122, accent: 0x446688 },
  acid: { liquid: 0x00ff44, highlight: 0xaaff00, depth: 0x004400, accent: 0x88ff00 },
  plasma: { liquid: 0xff00ff, highlight: 0xff88ff, depth: 0x440044, accent: 0x00ffff },
};

export class ProjectmLiquidVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "projectmLiquid",
    name: "projectM Liquid",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
    description:
      "Liquid distortion effects with droplet impacts and ripple propagation inspired by projectM presets",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.OrthographicCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: ProjectmLiquidConfig = {
    sensitivity: 1.0,
    colorScheme: "water",
    dropletSize: 1.0,
    rippleSpeed: 1.0,
    surfaceTension: 0.5,
    layerCount: 3,
  };

  private time = 0;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;

  // Smoothed audio values
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private bassPeak = 0;

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

    this.createLiquidMesh();
  }

  private createLiquidMesh(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.water;

    const geometry = new THREE.PlaneGeometry(2, 2);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(1920, 1080) },
        liquidColor: { value: new THREE.Color(colors.liquid) },
        highlightColor: { value: new THREE.Color(colors.highlight) },
        depthColor: { value: new THREE.Color(colors.depth) },
        accentColor: { value: new THREE.Color(colors.accent) },
        dropletSize: { value: this.config.dropletSize },
        rippleSpeed: { value: this.config.rippleSpeed },
        surfaceTension: { value: this.config.surfaceTension },
        layerCount: { value: this.config.layerCount },
        sensitivity: { value: this.config.sensitivity },
        bass: { value: 0.0 },
        mid: { value: 0.0 },
        treble: { value: 0.0 },
        bassPeak: { value: 0.0 },
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
        uniform vec3 liquidColor;
        uniform vec3 highlightColor;
        uniform vec3 depthColor;
        uniform vec3 accentColor;
        uniform float dropletSize;
        uniform float rippleSpeed;
        uniform float surfaceTension;
        uniform int layerCount;
        uniform float sensitivity;
        uniform float bass;
        uniform float mid;
        uniform float treble;
        uniform float bassPeak;

        varying vec2 vUv;

        #define PI 3.14159265359

        // Hash function for pseudo-random positions
        vec2 hash2(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
        }

        // Ripple function - concentric waves from a point
        float ripple(vec2 uv, vec2 center, float t, float phase) {
          float dist = length(uv - center);

          // Ripple expands outward over time
          float rippleTime = t * rippleSpeed + phase;

          // Multiple ripple rings with decay
          float wave = 0.0;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float offset = fi * 0.15;

            // Distance-based wave with time offset
            float d = dist - rippleTime * 0.3 + offset;

            // Sinusoidal wave that decays with distance
            float decay = 1.0 / (1.0 + dist * 4.0 * surfaceTension);
            float ring = sin(d * 25.0 * dropletSize) * decay;

            // Only show waves that have "arrived"
            ring *= smoothstep(0.0, 0.05, rippleTime - dist * 2.0);

            // Fade out old ripples
            ring *= exp(-rippleTime * 0.3);

            wave += ring;
          }

          return wave;
        }

        // Surface distortion from multiple droplet impacts
        float liquidSurface(vec2 uv, float t) {
          float surface = 0.0;

          // Background subtle motion
          surface += sin(uv.x * 3.0 + t * 0.5) * 0.1;
          surface += sin(uv.y * 2.5 + t * 0.4) * 0.1;
          surface += sin((uv.x + uv.y) * 2.0 + t * 0.3) * 0.08;

          // Droplet impacts based on layerCount
          for (int i = 0; i < 5; i++) {
            if (i >= layerCount) break;

            float fi = float(i);

            // Pseudo-random droplet position (changes over time)
            float dropletPhase = floor(t * 0.2 + fi * 0.7);
            vec2 dropletPos = hash2(vec2(fi + dropletPhase, fi * 2.3 + dropletPhase)) - 0.5;

            // Time within current droplet cycle
            float dropletTime = fract(t * 0.2 + fi * 0.7) * 5.0;

            // Trigger intensity based on bass
            float triggerIntensity = 1.0 + bassPeak * 2.0;

            // Add ripple from this droplet
            surface += ripple(uv, dropletPos * 1.5, dropletTime, fi) * triggerIntensity * 0.3;
          }

          // Bass-triggered central pulse
          float centralDist = length(uv);
          float bassPulse = sin(centralDist * 15.0 - t * rippleSpeed * 3.0) * bass * 0.4;
          bassPulse *= exp(-centralDist * 2.0);
          surface += bassPulse;

          // Mid-frequency gentle waves
          surface += sin(uv.x * 8.0 + t * mid * 3.0) * mid * 0.15;
          surface += sin(uv.y * 7.0 - t * mid * 2.5) * mid * 0.15;

          return surface;
        }

        // Refraction-like UV distortion
        vec2 refract2D(vec2 uv, float surface, float strength) {
          // Calculate surface gradient (approximate normal)
          float eps = 0.01;
          float dx = liquidSurface(uv + vec2(eps, 0.0), time) - surface;
          float dy = liquidSurface(uv + vec2(0.0, eps), time) - surface;

          // Distort UV based on surface gradient
          return uv + vec2(dx, dy) * strength;
        }

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
          vec2 centeredUv = (uv - 0.5) * aspect;

          // Calculate liquid surface height
          float surface = liquidSurface(centeredUv, time);

          // Apply refraction distortion
          vec2 distortedUv = refract2D(centeredUv, surface, 0.05 * (1.0 + bass));

          // Recalculate surface at distorted position for lighting
          float distortedSurface = liquidSurface(distortedUv, time);

          // Calculate fresnel-like effect for highlights
          float surfaceGradient = abs(surface - distortedSurface) * 10.0;
          float highlight = pow(surfaceGradient, 2.0) * (1.0 + treble * 2.0);

          // Base color mixing based on surface height
          float surfaceNorm = surface * 0.5 + 0.5; // Normalize to 0-1
          vec3 baseColor = mix(depthColor, liquidColor, surfaceNorm);

          // Add highlights on peaks
          baseColor = mix(baseColor, highlightColor, highlight * 0.5);

          // Add accent color in troughs
          baseColor = mix(baseColor, accentColor, (1.0 - surfaceNorm) * 0.3 * mid);

          // Caustic-like patterns in liquid
          float caustic = pow(max(0.0, sin(distortedUv.x * 20.0 + time) * sin(distortedUv.y * 20.0 + time * 0.7)), 4.0);
          baseColor += highlightColor * caustic * 0.2 * treble;

          // Apply brightness based on sensitivity
          baseColor *= sensitivity * (0.8 + surface * 0.3);

          // Add subtle glow
          float glow = max(0.0, surface) * 0.3 * sensitivity;
          baseColor += highlightColor * glow;

          // Edge darkening for depth
          float vignette = 1.0 - smoothstep(0.4, 1.0, length(centeredUv / aspect));
          baseColor *= 0.6 + vignette * 0.4;

          // Alpha varies with surface
          float alpha = 0.85 + surface * 0.15;

          gl_FragColor = vec4(baseColor, alpha);
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

    // Smooth audio values
    const smoothing = 0.12;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Detect bass peaks for droplet triggers
    const peakDecay = 0.92;
    if (bass > this.bassPeak) {
      this.bassPeak = bass;
    } else {
      this.bassPeak *= peakDecay;
    }

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
    this.material.uniforms.bassPeak.value = this.bassPeak * sensitivityScale;
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
    this.config = { ...this.config, ...config } as ProjectmLiquidConfig;

    if (this.material) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.water;
      this.material.uniforms.liquidColor.value.setHex(colors.liquid);
      this.material.uniforms.highlightColor.value.setHex(colors.highlight);
      this.material.uniforms.depthColor.value.setHex(colors.depth);
      this.material.uniforms.accentColor.value.setHex(colors.accent);
      this.material.uniforms.dropletSize.value = this.config.dropletSize;
      this.material.uniforms.rippleSpeed.value = this.config.rippleSpeed;
      this.material.uniforms.surfaceTension.value = this.config.surfaceTension;
      this.material.uniforms.layerCount.value = this.config.layerCount;
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
        default: "water",
        options: [
          { value: "water", label: "Water" },
          { value: "mercury", label: "Mercury" },
          { value: "lava", label: "Lava" },
          { value: "oil", label: "Oil" },
          { value: "acid", label: "Acid" },
          { value: "plasma", label: "Plasma" },
        ],
      },
      dropletSize: {
        type: "number",
        label: "Droplet Size",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      rippleSpeed: {
        type: "number",
        label: "Ripple Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      surfaceTension: {
        type: "number",
        label: "Surface Tension",
        default: 0.5,
        min: 0.1,
        max: 1.5,
        step: 0.1,
      },
      layerCount: {
        type: "number",
        label: "Droplet Layers",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
      },
    };
  }
}
