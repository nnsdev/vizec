import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface AuroraBorealisConfig extends VisualizationConfig {
  curtainCount: number;
  colorScheme: string;
  flowSpeed: number;
  waveIntensity: number;
  verticalSpread: number;
}

const COLOR_PALETTES: Record<string, { colors: number[]; emissive: number }> = {
  classic: {
    colors: [0x00ff88, 0x00ffcc, 0x00ccff, 0x8800ff],
    emissive: 0x00ff66,
  },
  polar: {
    colors: [0x00ffaa, 0x00ddff, 0x0088ff, 0xaa00ff],
    emissive: 0x00ffcc,
  },
  solarStorm: {
    colors: [0xff0044, 0xff4400, 0xffaa00, 0xff00aa],
    emissive: 0xff2200,
  },
  ethereal: {
    colors: [0x8800ff, 0xff00ff, 0x00ffff, 0x00ff88],
    emissive: 0xaa00ff,
  },
  arctic: {
    colors: [0x00ffff, 0x00aaff, 0x0066ff, 0x00ffaa],
    emissive: 0x00ccff,
  },
};

export class AuroraBorealisVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "auroraBorealis",
    name: "Aurora Borealis",
    author: "Vizec",
    description: "Flowing curtains of northern lights that dance to audio",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private curtains: THREE.Mesh[] = [];
  private curtainGeometries: THREE.PlaneGeometry[] = [];

  private config: AuroraBorealisConfig = {
    sensitivity: 1.0,
    colorScheme: "classic",
    curtainCount: 5,
    flowSpeed: 0.4,
    waveIntensity: 1.0,
    verticalSpread: 1.0,
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private bassHistory: number[] = [];
  private readonly BASS_HISTORY_SIZE = 8;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Scene setup
    this.scene = new THREE.Scene();

    // Camera - positioned to look up at aurora
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, -30, 20);
    this.camera.lookAt(0, 0, 40);

    // Renderer with transparency
    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Create aurora curtains
    this.createCurtains();

    // Initial resize
    this.resize(container.clientWidth, container.clientHeight);

    // Initialize bass history
    this.bassHistory = Array.from({ length: this.BASS_HISTORY_SIZE }, () => 0);
  }

  private createCurtains(): void {
    if (!this.scene) return;

    // Clear existing
    for (const curtain of this.curtains) {
      this.scene.remove(curtain);
      curtain.geometry.dispose();
      (curtain.material as THREE.Material).dispose();
    }
    this.curtains = [];
    this.curtainGeometries = [];

    const { curtainCount, colorScheme } = this.config;
    const palette = COLOR_PALETTES[colorScheme] || COLOR_PALETTES.classic;

    for (let i = 0; i < curtainCount; i++) {
      // Create high-resolution plane for wave deformation
      const segmentsX = 128;
      const segmentsY = 64;
      const geometry = new THREE.PlaneGeometry(120, 60, segmentsX, segmentsY);
      this.curtainGeometries.push(geometry);

      // Pick color from palette
      const colorIndex = i % palette.colors.length;
      const curtainColor = new THREE.Color(palette.colors[colorIndex]);

      // Create shader material for aurora effect
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBass: { value: 0 },
          uMid: { value: 0 },
          uTreble: { value: 0 },
          uVolume: { value: 0 },
          uColor: { value: curtainColor },
          uEmissive: { value: new THREE.Color(palette.emissive) },
          uCurtainIndex: { value: i },
          uCurtainCount: { value: curtainCount },
          uWaveIntensity: { value: this.config.waveIntensity },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uBass;
          uniform float uMid;
          uniform float uTreble;
          uniform float uCurtainIndex;
          uniform float uCurtainCount;
          uniform float uWaveIntensity;
          
          varying vec2 vUv;
          varying float vWave;
          varying float vHeight;
          
          // Simplex noise functions
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
          vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
          
          float snoise(vec3 v) {
            const vec2 C = vec2(1.0/6.0, 1.0/3.0);
            const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
            
            vec3 i  = floor(v + dot(v, C.yyy));
            vec3 x0 = v - i + dot(i, C.xxx);
            
            vec3 g = step(x0.yzx, x0.xyz);
            vec3 l = 1.0 - g;
            vec3 i1 = min(g.xyz, l.zxy);
            vec3 i2 = max(g.xyz, l.zxy);
            
            vec3 x1 = x0 - i1 + C.xxx;
            vec3 x2 = x0 - i2 + C.yyy;
            vec3 x3 = x0 - D.yyy;
            
            i = mod289(i);
            vec4 p = permute(permute(permute(
                     i.z + vec4(0.0, i1.z, i2.z, 1.0))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0));
            
            float n_ = 0.142857142857;
            vec3 ns = n_ * D.wyz - D.xzx;
            
            vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
            
            vec4 x_ = floor(j * ns.z);
            vec4 y_ = floor(j - 7.0 * x_);
            
            vec4 x = x_ *ns.x + ns.yyyy;
            vec4 y = y_ *ns.x + ns.yyyy;
            vec4 h = 1.0 - abs(x) - abs(y);
            
            vec4 b0 = vec4(x.xy, y.xy);
            vec4 b1 = vec4(x.zw, y.zw);
            
            vec4 s0 = floor(b0)*2.0 + 1.0;
            vec4 s1 = floor(b1)*2.0 + 1.0;
            vec4 sh = -step(h, vec4(0.0));
            
            vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
            vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
            
            vec3 p0 = vec3(a0.xy, h.x);
            vec3 p1 = vec3(a0.zw, h.y);
            vec3 p2 = vec3(a1.xy, h.z);
            vec3 p3 = vec3(a1.zw, h.w);
            
            vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
            p0 *= norm.x;
            p1 *= norm.y;
            p2 *= norm.z;
            p3 *= norm.w;
            
            vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
            m = m * m;
            return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
          }
          
          void main() {
            vUv = uv;
            
            vec3 pos = position;
            
            // Offset each curtain in Z
            float zOffset = uCurtainIndex * 15.0 - (uCurtainCount * 7.5);
            pos.z += zOffset;
            
            // Horizontal wave motion - flowing curtain effect (slowed down)
            float phaseOffset = uCurtainIndex * 1.5;
            float wave1 = sin(pos.x * 0.05 + uTime * 0.25 + phaseOffset) * 8.0;
            float wave2 = sin(pos.x * 0.1 + uTime * 0.4 + phaseOffset * 0.7) * 4.0;
            float wave3 = snoise(vec3(pos.x * 0.02, pos.y * 0.02, uTime * 0.1 + phaseOffset)) * 12.0;

            // Bass creates vertical pulses (slowed)
            float bassWave = sin(pos.x * 0.03 + uTime * 0.6) * uBass * 15.0;

            // Mid frequencies add shimmer (slowed)
            float midShimmer = snoise(vec3(pos.x * 0.1, pos.y * 0.1, uTime * 0.6)) * uMid * 5.0;

            // Treble adds fine detail (slowed)
            float trebleDetail = snoise(vec3(pos.x * 0.3, pos.y * 0.3, uTime * 1.2)) * uTreble * 3.0;
            
            // Combine waves
            float totalWave = (wave1 + wave2 + wave3 + bassWave + midShimmer + trebleDetail) * uWaveIntensity;
            
            // Apply to Z position (forward/backward movement)
            pos.z += totalWave;
            
            // Vertical ripple effect (slowed)
            float verticalWave = sin(pos.y * 0.1 + uTime * 0.5) * 3.0 * uWaveIntensity;
            pos.z += verticalWave * (1.0 + uBass);
            
            // Height varies based on audio - more dramatic at top
            float heightFactor = smoothstep(0.0, 1.0, uv.y);
            pos.y += heightFactor * uBass * 10.0;
            
            vWave = totalWave * 0.02;
            vHeight = uv.y;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uBass;
          uniform float uMid;
          uniform float uVolume;
          uniform vec3 uColor;
          uniform vec3 uEmissive;
          uniform float uCurtainIndex;
          
          varying vec2 vUv;
          varying float vWave;
          varying float vHeight;
          
          void main() {
            // Vertical gradient - bright at bottom, fading to top
            float verticalGradient = 1.0 - pow(vUv.y, 0.5);

            // Horizontal variation (slowed)
            float horizontalVar = sin(vUv.x * 20.0 + uTime * 0.6) * 0.1 + 0.9;

            // Shimmer effect (slowed)
            float shimmer = sin(vUv.x * 50.0 + vUv.y * 30.0 + uTime * 1.5) * 0.1 + 0.9;
            
            // Color mixing based on height and wave
            vec3 baseColor = mix(uColor, uEmissive, vHeight * 0.5 + vWave);
            
            // Add brightness pulse from bass
            float bassPulse = 1.0 + uBass * 0.8;
            
            // Calculate alpha - fade at edges and top
            float edgeFade = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
            float topFade = 1.0 - pow(vUv.y, 1.5);
            float alpha = verticalGradient * edgeFade * topFade * horizontalVar * shimmer;
            
            // Boost alpha with volume
            alpha *= 0.4 + uVolume * 0.4;
            alpha *= bassPulse;
            
            // Final color with glow
            vec3 finalColor = baseColor * bassPulse;
            finalColor += uEmissive * uMid * 0.3; // Mid frequency glow
            
            gl_FragColor = vec4(finalColor, alpha * 0.7);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const curtain = new THREE.Mesh(geometry, material);
      curtain.position.y = 20 + i * 5; // Stagger heights
      curtain.rotation.x = -0.3; // Tilt slightly toward camera

      this.scene.add(curtain);
      this.curtains.push(curtain);
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    // Normalize deltaTime to seconds
    let dt = deltaTime || 0.016;
    if (dt > 1) dt = dt / 1000;
    dt = Math.max(0.001, Math.min(0.1, dt));

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, flowSpeed } = this.config;

    this.time += dt * flowSpeed;

    // Update bass history for smoothing
    this.bassHistory.push(bass);
    if (this.bassHistory.length > this.BASS_HISTORY_SIZE) {
      this.bassHistory.shift();
    }
    const smoothBass = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;

    // Update each curtain's shader uniforms
    for (const curtain of this.curtains) {
      const material = curtain.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value = this.time;
      material.uniforms.uBass.value = smoothBass * sensitivity;
      material.uniforms.uMid.value = mid * sensitivity;
      material.uniforms.uTreble.value = treble * sensitivity;
      material.uniforms.uVolume.value = volume * sensitivity;
      material.uniforms.uWaveIntensity.value = this.config.waveIntensity;
    }

    // Subtle camera movement based on audio
    this.camera.position.x = Math.sin(this.time * 0.2) * 5 * (1 + smoothBass);
    this.camera.position.y = -30 + Math.sin(this.time * 0.15) * 3;
    this.camera.lookAt(0, 0, 40);

    this.rendererThree.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    if (this.rendererThree) {
      this.rendererThree.setSize(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.curtainCount;
    const oldScheme = this.config.colorScheme;

    this.config = { ...this.config, ...config } as AuroraBorealisConfig;

    // Recreate curtains if count or colors changed
    if (
      this.scene &&
      (this.config.curtainCount !== oldCount || this.config.colorScheme !== oldScheme)
    ) {
      this.createCurtains();
    }
  }

  destroy(): void {
    for (const curtain of this.curtains) {
      this.scene?.remove(curtain);
      curtain.geometry.dispose();
      (curtain.material as THREE.Material).dispose();
    }

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }

    this.curtains = [];
    this.curtainGeometries = [];
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.container = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      curtainCount: {
        type: "number",
        label: "Curtain Layers",
        default: 5,
        min: 1,
        max: 8,
        step: 1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "classic",
        options: [
          { value: "classic", label: "Classic Green" },
          { value: "polar", label: "Polar Blue" },
          { value: "solarStorm", label: "Solar Storm" },
          { value: "ethereal", label: "Ethereal Purple" },
          { value: "arctic", label: "Arctic Cyan" },
        ],
      },
      flowSpeed: {
        type: "number",
        label: "Flow Speed",
        default: 0.4,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      waveIntensity: {
        type: "number",
        label: "Wave Intensity",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
      verticalSpread: {
        type: "number",
        label: "Vertical Spread",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
