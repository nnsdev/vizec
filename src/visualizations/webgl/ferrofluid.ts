import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface FerrofluidConfig extends VisualizationConfig {
  spikeIntensity: number;
  blobCount: number;
  colorScheme: string;
  glowStrength: number;
  smoothness: number;
}

const COLOR_SCHEMES: Record<
  string,
  { core: [number, number, number]; mid: [number, number, number]; tip: [number, number, number]; glow: [number, number, number] }
> = {
  magma: {
    core: [1.0, 0.15, 0.0],
    mid: [1.0, 0.4, 0.05],
    tip: [1.0, 0.85, 0.3],
    glow: [1.0, 0.3, 0.0],
  },
  electric: {
    core: [0.0, 0.3, 1.0],
    mid: [0.2, 0.5, 1.0],
    tip: [0.6, 0.9, 1.0],
    glow: [0.1, 0.4, 1.0],
  },
  plasma: {
    core: [0.6, 0.0, 1.0],
    mid: [0.8, 0.2, 1.0],
    tip: [1.0, 0.6, 1.0],
    glow: [0.7, 0.1, 1.0],
  },
  mercury: {
    core: [0.7, 0.75, 0.8],
    mid: [0.85, 0.88, 0.92],
    tip: [1.0, 1.0, 1.0],
    glow: [0.8, 0.85, 0.95],
  },
  toxic: {
    core: [0.0, 0.8, 0.1],
    mid: [0.2, 1.0, 0.3],
    tip: [0.7, 1.0, 0.4],
    glow: [0.1, 0.9, 0.2],
  },
};

const MAX_BLOBS = 16;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uBass;
  uniform float uMid;
  uniform float uTreble;
  uniform float uVolume;
  uniform float uSpikeIntensity;
  uniform float uGlowStrength;
  uniform float uSmoothness;
  uniform float uSensitivity;
  uniform vec2 uResolution;
  uniform vec3 uCoreColor;
  uniform vec3 uMidColor;
  uniform vec3 uTipColor;
  uniform vec3 uGlowColor;
  uniform int uBlobCount;
  uniform sampler2D uBlobData;

  varying vec2 vUv;

  // Noise functions for organic displacement
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
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

    vec4 x2_ = x_ * ns.x + ns.yyyy;
    vec4 y2_ = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x2_) - abs(y2_);

    vec4 b0 = vec4(x2_.xy, y2_.xy);
    vec4 b1 = vec4(x2_.zw, y2_.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  // Smooth minimum for organic blending
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }

  // SDF sphere
  float sdSphere(vec3 p, float r) {
    return length(p) - r;
  }

  // Spike displacement using noise - sharp tips, smooth base
  float spikeDisplacement(vec3 p, vec3 center, float radius, float intensity) {
    vec3 dir = normalize(p - center);
    float baseNoise = snoise(dir * 3.0 + uTime * 0.5) * 0.5 + 0.5;
    float detailNoise = snoise(dir * 7.0 - uTime * 0.3) * 0.3;
    float spike = baseNoise + detailNoise;

    // Sharpen the spikes: raise to a power for sharp tips
    spike = pow(spike, 2.0 + intensity * 2.0);

    // Scale by audio intensity
    return spike * intensity * radius * 1.5;
  }

  // Scene SDF
  float sceneSDF(vec3 p) {
    float result = 1e10;
    float blendK = uSmoothness * 0.5 + 0.3;

    for (int i = 0; i < 16; i++) {
      if (i >= uBlobCount) break;

      // Sample blob data: x,y,z,radius from texture
      vec2 texCoord = vec2((float(i) + 0.5) / float(${MAX_BLOBS}), 0.5);
      vec4 blobData = texture2D(uBlobData, texCoord);
      vec3 blobPos = blobData.xyz;
      float blobRadius = blobData.w;

      if (blobRadius < 0.01) continue;

      vec3 localP = p - blobPos;
      float baseDist = sdSphere(localP, blobRadius);

      // Audio-driven spike displacement
      float audioIntensity = uBass * uSpikeIntensity * uSensitivity;
      float displacement = spikeDisplacement(p, blobPos, blobRadius, audioIntensity);

      float dist = baseDist - displacement;

      // Smooth union of all blobs
      result = smin(result, dist, blendK);
    }

    return result;
  }

  // Estimate normal via central differences
  vec3 estimateNormal(vec3 p) {
    float e = 0.005;
    return normalize(vec3(
      sceneSDF(vec3(p.x + e, p.y, p.z)) - sceneSDF(vec3(p.x - e, p.y, p.z)),
      sceneSDF(vec3(p.x, p.y + e, p.z)) - sceneSDF(vec3(p.x, p.y - e, p.z)),
      sceneSDF(vec3(p.x, p.y, p.z + e)) - sceneSDF(vec3(p.x, p.y, p.z - e))
    ));
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 screenPos = (uv - 0.5) * 2.0;
    screenPos.x *= aspect;

    // Camera setup
    vec3 ro = vec3(0.0, 0.0, 6.0);
    vec3 rd = normalize(vec3(screenPos, -2.0));

    // Raymarch
    float t = 0.0;
    float minDist = 1e10;
    bool hit = false;

    for (int i = 0; i < 80; i++) {
      vec3 p = ro + rd * t;
      float d = sceneSDF(p);

      minDist = min(minDist, d);

      if (d < 0.005) {
        hit = true;
        break;
      }

      if (t > 20.0) break;

      t += d * 0.8; // Slight understepping for safety
    }

    if (!hit) {
      // Outer glow based on proximity
      float glowFactor = exp(-minDist * 3.0) * uGlowStrength;
      float audioGlow = glowFactor * (0.3 + uVolume * 0.7);
      vec3 glow = uGlowColor * audioGlow;
      gl_FragColor = vec4(glow, audioGlow * 0.6);
      return;
    }

    vec3 hitPos = ro + rd * t;
    vec3 normal = estimateNormal(hitPos);

    // Lighting
    vec3 lightDir1 = normalize(vec3(1.0, 1.0, 1.0));
    vec3 lightDir2 = normalize(vec3(-0.5, 0.5, -0.3));
    vec3 viewDir = normalize(ro - hitPos);

    float diff1 = max(dot(normal, lightDir1), 0.0);
    float diff2 = max(dot(normal, lightDir2), 0.0) * 0.5;

    // Fresnel for rim glow
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);

    // Specular highlights for molten metal look
    vec3 halfDir = normalize(lightDir1 + viewDir);
    float spec = pow(max(dot(normal, halfDir), 0.0), 64.0);

    // Spike detection: use normal deviation for coloring
    // Tips of spikes have normals pointing more outward (radial)
    float spikeAmount = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uBlobCount) break;
      vec2 texCoord = vec2((float(i) + 0.5) / float(${MAX_BLOBS}), 0.5);
      vec4 blobData = texture2D(uBlobData, texCoord);
      vec3 blobPos = blobData.xyz;
      float blobRadius = blobData.w;
      if (blobRadius < 0.01) continue;

      float dist = length(hitPos - blobPos);
      float outsideAmount = max(0.0, dist - blobRadius) / (blobRadius * 2.0);
      float influence = exp(-dist * 0.5);
      spikeAmount = max(spikeAmount, outsideAmount * influence);
    }
    spikeAmount = clamp(spikeAmount * 2.0, 0.0, 1.0);

    // Color: core -> mid -> tip based on spike amount
    vec3 color = mix(uCoreColor, uMidColor, smoothstep(0.0, 0.4, spikeAmount));
    color = mix(color, uTipColor, smoothstep(0.4, 0.9, spikeAmount));

    // Apply lighting
    float diffuse = diff1 + diff2;
    color *= 0.4 + diffuse * 0.6;

    // Emissive glow - brighter at tips and with audio
    float emissive = 0.5 + spikeAmount * 0.5 + uBass * uSensitivity * 0.3;
    color *= emissive;

    // Specular
    color += vec3(spec) * 0.8 * (1.0 + uTreble * uSensitivity);

    // Fresnel rim glow
    vec3 rimColor = uGlowColor * fresnel * uGlowStrength * (1.0 + uVolume);
    color += rimColor;

    // Alpha: solid at center, softer at edges
    float alpha = 0.85 + fresnel * 0.15;
    alpha *= 0.7 + uVolume * 0.3;

    // Add subtle pulsing
    color *= 0.95 + sin(uTime * 2.0) * 0.05 * uBass;

    gl_FragColor = vec4(color, alpha);
  }
`;

// Blob state managed on CPU
class FerroBlob {
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  radius: number;
  vx = 0;
  vy = 0;
  vz = 0;
  phase: number;
  orbitSpeed: number;
  orbitRadius: number;

  constructor(x: number, y: number, z: number, radius: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.baseRadius = radius;
    this.radius = radius;
    this.phase = Math.random() * Math.PI * 2;
    this.orbitSpeed = 0.3 + Math.random() * 0.7;
    this.orbitRadius = 0.5 + Math.random() * 1.5;
  }

  update(bass: number, mid: number, treble: number, volume: number, sensitivity: number, time: number, dt: number): void {
    this.phase += this.orbitSpeed * dt;

    // Orbital motion
    const targetX = Math.sin(this.phase) * this.orbitRadius;
    const targetY = Math.cos(this.phase * 1.3) * this.orbitRadius * 0.6;
    const targetZ = Math.sin(this.phase * 0.7) * this.orbitRadius * 0.3;

    // Spring toward orbit with audio disturbance
    const spring = 1.5;
    const damping = 0.92;

    this.vx += (targetX - this.x) * spring * dt;
    this.vy += (targetY - this.y) * spring * dt;
    this.vz += (targetZ - this.z) * spring * dt;

    // Audio pushes blobs outward
    const pushStrength = bass * sensitivity * 2.0;
    const angle = this.phase;
    this.vx += Math.cos(angle) * pushStrength * dt;
    this.vy += Math.sin(angle) * pushStrength * dt;
    this.vz += Math.sin(angle * 0.5) * pushStrength * dt * 0.5;

    // Treble jitter
    this.vx += (Math.random() - 0.5) * treble * sensitivity * 0.5 * dt;
    this.vy += (Math.random() - 0.5) * treble * sensitivity * 0.5 * dt;

    // Apply velocity with damping
    const dampFactor = Math.pow(damping, dt * 60);
    this.vx *= dampFactor;
    this.vy *= dampFactor;
    this.vz *= dampFactor;

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.z += this.vz * dt * 60;

    // Bounds
    const bound = 3.0;
    if (this.x < -bound) { this.x = -bound; this.vx *= -0.5; }
    if (this.x > bound) { this.x = bound; this.vx *= -0.5; }
    if (this.y < -bound) { this.y = -bound; this.vy *= -0.5; }
    if (this.y > bound) { this.y = bound; this.vy *= -0.5; }
    if (this.z < -2.0) { this.z = -2.0; this.vz *= -0.5; }
    if (this.z > 2.0) { this.z = 2.0; this.vz *= -0.5; }

    // Radius responds to bass for pulsing
    const targetRadius = this.baseRadius * (1.0 + bass * sensitivity * 0.5);
    this.radius += (targetRadius - this.radius) * Math.min(1.0, 5.0 * dt);
  }
}

export class FerrofluidVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "ferrofluid",
    name: "Ferrofluid",
    author: "Vizec",
    description:
      "Glowing ferrofluid that spikes aggressively on bass and settles into smooth domes during quiet moments",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private blobDataTexture: THREE.DataTexture | null = null;
  private blobs: FerroBlob[] = [];
  private time = 0;

  private config: FerrofluidConfig = {
    sensitivity: 1.0,
    colorScheme: "magma",
    spikeIntensity: 1.0,
    blobCount: 6,
    glowStrength: 1.0,
    smoothness: 0.5,
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 15);

    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.initBlobs();
    this.createMesh(width, height);
  }

  private initBlobs(): void {
    this.blobs = [];
    const count = this.config.blobCount;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const r = 0.5 + Math.random() * 1.0;
      this.blobs.push(
        new FerroBlob(
          Math.cos(angle) * r,
          Math.sin(angle) * r,
          (Math.random() - 0.5) * 0.5,
          0.6 + Math.random() * 0.4,
        ),
      );
    }
  }

  private createMesh(width: number, height: number): void {
    if (!this.scene) return;

    // Clean up old mesh
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.blobDataTexture) {
      this.blobDataTexture.dispose();
    }

    const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.magma;

    // Create blob data texture
    const texData = new Float32Array(MAX_BLOBS * 4);
    this.blobDataTexture = new THREE.DataTexture(
      texData,
      MAX_BLOBS,
      1,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.blobDataTexture.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uVolume: { value: 0 },
        uSpikeIntensity: { value: this.config.spikeIntensity },
        uGlowStrength: { value: this.config.glowStrength },
        uSmoothness: { value: this.config.smoothness },
        uSensitivity: { value: this.config.sensitivity },
        uResolution: { value: new THREE.Vector2(width, height) },
        uCoreColor: { value: new THREE.Vector3(...scheme.core) },
        uMidColor: { value: new THREE.Vector3(...scheme.mid) },
        uTipColor: { value: new THREE.Vector3(...scheme.tip) },
        uGlowColor: { value: new THREE.Vector3(...scheme.glow) },
        uBlobCount: { value: this.config.blobCount },
        uBlobData: { value: this.blobDataTexture },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const geometry = new THREE.PlaneGeometry(32, 20);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;
    this.scene.add(this.mesh);
  }

  private updateBlobTexture(): void {
    if (!this.blobDataTexture) return;
    const data = this.blobDataTexture.image.data as Float32Array;
    for (let i = 0; i < MAX_BLOBS; i++) {
      const idx = i * 4;
      if (i < this.blobs.length) {
        data[idx] = this.blobs[i].x;
        data[idx + 1] = this.blobs[i].y;
        data[idx + 2] = this.blobs[i].z;
        data[idx + 3] = this.blobs[i].radius;
      } else {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
    this.blobDataTexture.needsUpdate = true;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.material) return;

    const dt = deltaTime * 0.001; // ms → seconds
    this.time += dt;

    const { bass, mid, treble, volume } = audioData;

    // Update blob physics
    for (const blob of this.blobs) {
      blob.update(bass, mid, treble, volume, this.config.sensitivity, this.time, dt);
    }

    // Upload blob positions to texture
    this.updateBlobTexture();

    // Update uniforms
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = this.time;
    uniforms.uBass.value = bass;
    uniforms.uMid.value = mid;
    uniforms.uTreble.value = treble;
    uniforms.uVolume.value = volume;
    uniforms.uSpikeIntensity.value = this.config.spikeIntensity;
    uniforms.uGlowStrength.value = this.config.glowStrength;
    uniforms.uSmoothness.value = this.config.smoothness;
    uniforms.uSensitivity.value = this.config.sensitivity;

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
    if (this.material) {
      this.material.uniforms.uResolution.value.set(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldScheme = this.config.colorScheme;
    const oldBlobCount = this.config.blobCount;
    this.config = { ...this.config, ...config } as FerrofluidConfig;

    // Clamp blob count
    this.config.blobCount = Math.min(this.config.blobCount, MAX_BLOBS);

    if (this.material) {
      // Update colors if scheme changed
      if (this.config.colorScheme !== oldScheme) {
        const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.magma;
        this.material.uniforms.uCoreColor.value.set(...scheme.core);
        this.material.uniforms.uMidColor.value.set(...scheme.mid);
        this.material.uniforms.uTipColor.value.set(...scheme.tip);
        this.material.uniforms.uGlowColor.value.set(...scheme.glow);
      }

      this.material.uniforms.uBlobCount.value = this.config.blobCount;
    }

    // Reinit blobs if count changed
    if (this.config.blobCount !== oldBlobCount && this.scene) {
      this.initBlobs();
    }
  }

  destroy(): void {
    if (this.mesh && this.mesh.geometry) {
      this.mesh.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.blobDataTexture) {
      this.blobDataTexture.dispose();
    }
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(
          this.rendererThree.domElement,
        );
      }
    }
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.mesh = null;
    this.material = null;
    this.blobDataTexture = null;
    this.blobs = [];
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
        default: "magma",
        options: [
          { value: "magma", label: "Magma" },
          { value: "electric", label: "Electric" },
          { value: "plasma", label: "Plasma" },
          { value: "mercury", label: "Mercury" },
          { value: "toxic", label: "Toxic" },
        ],
      },
      spikeIntensity: {
        type: "number",
        label: "Spike Intensity",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      blobCount: {
        type: "number",
        label: "Blob Count",
        default: 6,
        min: 2,
        max: 12,
        step: 1,
      },
      glowStrength: {
        type: "number",
        label: "Glow Strength",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      smoothness: {
        type: "number",
        label: "Smoothness",
        default: 0.5,
        min: 0.1,
        max: 1.0,
        step: 0.05,
      },
    };
  }
}
