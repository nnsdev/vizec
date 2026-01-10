import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  ColorSchemeId,
  COLOR_SCHEMES_HEX_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface FresnelGlowConfig extends VisualizationConfig {
  colorScheme: string;
  baseColor: number;
  edgeColor: number;
  fresnelPower: number;
  glow: number;
  rotationSpeed: number;
  audioSensitivity: number;
}

export class FresnelGlowVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "fresnelGlow",
    name: "Fresnel Pulse",
    author: "Vizec",
    description: "Transparent fresnel-edged form that glows on loud audio bursts",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private sphere: THREE.Mesh | null = null;
  private halo: THREE.Mesh | null = null;
  private time = 0;

  private config: FresnelGlowConfig = {
    sensitivity: 1,
    colorScheme: "synthwave",
    baseColor: 0x5af2ff,
    edgeColor: 0xff6be3,
    fresnelPower: 2.5,
    glow: 0.55,
    rotationSpeed: 0.25,
    audioSensitivity: 2,
  };

  private uniforms: Record<string, THREE.IUniform> | null = null;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 60);
    this.camera.lookAt(0, 0, 0);

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createGeometry();
  }

  private createGeometry(): void {
    if (!this.scene) return;

    const scheme = getColorScheme(
      COLOR_SCHEMES_HEX_ACCENT,
      this.config.colorScheme as ColorSchemeId,
      "synthwave",
    );
    const colors = { base: scheme.primary, edge: scheme.accent, glow: scheme.glow };
    this.config.baseColor = colors.base;
    this.config.edgeColor = colors.edge;

    const material = this.createFresnelMaterial(colors);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: colors.glow,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 0.4,
      depthWrite: false,
    });

    const sphereGeometry = new THREE.IcosahedronGeometry(15, 4);
    this.sphere = new THREE.Mesh(sphereGeometry, material);
    this.scene.add(this.sphere);

    const haloGeometry = new THREE.RingGeometry(18, 35, 64);
    this.halo = new THREE.Mesh(haloGeometry, haloMaterial);
    this.halo.rotation.x = Math.PI / 2;
    this.halo.renderOrder = -1;
    this.scene.add(this.halo);
  }

  private createFresnelMaterial(colors: {
    base: number;
    edge: number;
    glow: number;
  }): THREE.ShaderMaterial {
    this.uniforms = {
      baseColor: { value: new THREE.Color(colors.base) },
      edgeColor: { value: new THREE.Color(colors.edge) },
      fresnelPower: { value: this.config.fresnelPower },
      intensity: { value: this.config.glow },
      time: { value: 0 },
    };

    return new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: this.uniforms,
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mPosition = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mPosition.xyz);
          gl_Position = projectionMatrix * mPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;
        uniform vec3 edgeColor;
        uniform float fresnelPower;
        uniform float intensity;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float fresnel = pow(1.0 - max(0.0, dot(vNormal, vView)), fresnelPower);
          vec3 color = mix(baseColor, edgeColor, fresnel);
          float pulse = 0.5 + 0.5 * sin(time * 1.6);
          float alpha = clamp(fresnel * intensity + pulse * 0.2, 0.0, 1.0);
          gl_FragColor = vec4(color * (0.8 + pulse * 0.2), alpha);
        }
      `,
    });
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.rendererThree || !this.scene || !this.camera || !this.sphere || !this.uniforms)
      return;

    this.time += deltaTime;
    this.uniforms.time.value = this.time;

    const { bass, mid, treble, volume } = audioData;
    const intensityBoost = Math.min(1, volume * this.config.audioSensitivity);
    const rotationBoost = (bass + treble) * 0.5;

    this.sphere.rotation.y += (this.config.rotationSpeed + rotationBoost * 0.5) * deltaTime * 0.2;
    this.sphere.rotation.x += (this.config.rotationSpeed * 0.5 + mid * 0.4) * deltaTime * 0.2;

    if (this.halo) {
      this.halo.rotation.z += deltaTime * 0.1;
      (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.2 + intensityBoost * 0.5;
    }

    this.uniforms.intensity.value = 0.25 + intensityBoost * this.config.glow;
    this.uniforms.fresnelPower.value = this.config.fresnelPower + intensityBoost;

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
    this.config = { ...this.config, ...config } as FresnelGlowConfig;
    if (this.sphere && this.uniforms) {
      const scheme = getColorScheme(
        COLOR_SCHEMES_HEX_ACCENT,
        this.config.colorScheme as ColorSchemeId,
        "synthwave",
      );
      this.uniforms.baseColor.value.set(scheme.primary);
      this.uniforms.edgeColor.value.set(scheme.accent);
    }
  }

  destroy(): void {
    if (this.scene && this.sphere) {
      this.scene.remove(this.sphere);
    }
    if (this.scene && this.halo) {
      this.scene.remove(this.halo);
    }
    this.rendererThree?.dispose();
    if (this.rendererThree?.domElement.parentElement) {
      this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
    }
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.sphere = null;
    this.halo = null;
    this.uniforms = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      fresnelPower: {
        type: "number",
        label: "Fresnel Power",
        default: 2.5,
        min: 1,
        max: 5,
        step: 0.1,
      },
      glow: {
        type: "number",
        label: "Glow Intensity",
        default: 0.55,
        min: 0,
        max: 1,
        step: 0.05,
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 0.25,
        min: 0,
        max: 1,
        step: 0.05,
      },
      audioSensitivity: {
        type: "number",
        label: "Audio Sensitivity",
        default: 2,
        min: 0.5,
        max: 4,
        step: 0.1,
      },
    };
  }
}
