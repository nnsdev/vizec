import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface BlobsConfig extends VisualizationConfig {
  blobCount: number;
  metaballRadius: number;
  mergeThreshold: number;
  surfaceDetail: number;
}

const COLOR_SCHEMES: Record<
  string,
  {
    primary: number;
    secondary: number;
    accent: number;
    glow: number;
  }
> = {
  slime: { primary: 0x00ff00, secondary: 0x228b22, accent: 0x98fb98, glow: 0x90ee90 },
  magma: { primary: 0xff4500, secondary: 0x8b0000, accent: 0xffd700, glow: 0xff6347 },
  mercury: { primary: 0xc0c0c0, secondary: 0x808080, accent: 0xffffff, glow: 0xe0e0e0 },
  slime2: { primary: 0x9932cc, secondary: 0x4b0082, accent: 0xda70d6, glow: 0xba55d3 },
  oil: { primary: 0x1e90ff, secondary: 0x00008b, accent: 0x00bfff, glow: 0x4169e1 },
};

export class BlobsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "blobs",
    name: "Blobs",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
    description: "Organic gooey blobs that merge and split based on audio",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private config: BlobsConfig = {
    sensitivity: 1.0,
    colorScheme: "slime",
    blobCount: 12,
    metaballRadius: 0.3,
    mergeThreshold: 1.2,
    surfaceDetail: 0.5,
  };

  private blobs: Metaball[] = [];
  private time = 0;
  private lastSplitTime = 0;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private computeMaterial: THREE.ShaderMaterial | null = null;
  private positionsTexture: THREE.DataTexture | null = null;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    this.camera.position.set(0, 0, 15);
    this.camera.lookAt(0, 0, 0);

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

    this.initBlobs();
    this.createMetaballMesh();
  }

  private initBlobs(): void {
    this.blobs = [];

    for (let i = 0; i < this.config.blobCount; i++) {
      this.blobs.push(
        new Metaball(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          0.2 + Math.random() * 0.4,
        ),
      );
    }
  }

  private createMetaballMesh(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.slime;

    // Create shader material for metaballs
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        blobPositions: { value: null },
        blobCount: { value: this.config.blobCount },
        blobRadius: { value: this.config.metaballRadius },
        primaryColor: { value: new THREE.Color(colors.primary) },
        secondaryColor: { value: new THREE.Color(colors.secondary) },
        accentColor: { value: new THREE.Color(colors.accent) },
        glowColor: { value: new THREE.Color(colors.glow) },
        sensitivity: { value: this.config.sensitivity },
        resolution: { value: new THREE.Vector2(1920, 1080) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform sampler2D blobPositions;
        uniform int blobCount;
        uniform float blobRadius;
        uniform vec3 primaryColor;
        uniform vec3 secondaryColor;
        uniform vec3 accentColor;
        uniform vec3 glowColor;
        uniform float sensitivity;
        uniform vec2 resolution;

        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
          vec2 uv = vUv;
          vec2 aspect = vec2(resolution.x / resolution.y, 1.0);
          vec2 worldPos = (uv - 0.5) * 16.0 * aspect;

          float metaball = 0.0;
          float maxInfluence = 0.0;

          // Sample blob positions from texture
          for (int i = 0; i < 32; i++) {
            if (i >= blobCount) break;

            vec2 texCoord = vec2((float(i) + 0.5) / 32.0, 0.5);
            vec3 blobPos = texture2D(blobPositions, texCoord).xyz;

            float dist = length(worldPos - blobPos.xy);
            float influence = blobRadius / (dist + 0.001);
            metaball += influence;

            if (dist < 0.001) {
              maxInfluence = influence;
            }
          }

          // Threshold for metaball surface
          float threshold = 1.0;
          float edge = smoothstep(threshold - 0.3, threshold + 0.3, metaball);

          // Inner glow based on metaball intensity
          float innerGlow = smoothstep(threshold, threshold + 2.0, metaball);

          // Color mixing
          vec3 color = mix(secondaryColor, primaryColor, edge);
          color = mix(color, accentColor, innerGlow * 0.3);

          // Audio-reactive pulsing
          float pulse = sin(time * 2.0) * 0.1 + 0.9;
          color *= pulse * (0.8 + sensitivity * 0.4);

          // Rim glow effect
          float rim = 1.0 - smoothstep(threshold, threshold + 1.0, metaball);
          color = mix(color, glowColor, rim * 0.3 * sensitivity);

          // Alpha with soft edges
          float alpha = edge * 0.9 + innerGlow * 0.1;

          // Soften edges for organic look
          alpha = smoothstep(0.0, 0.2, alpha) * 0.9;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    // Create a full-screen quad for rendering
    const geometry = new THREE.PlaneGeometry(32, 20);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 1;
    this.scene.add(this.mesh);

    // Create positions texture
    this.updatePositionsTexture();
  }

  private updatePositionsTexture(): void {
    const size = 32;
    const data = new Float32Array(size * 4);

    for (let i = 0; i < size; i++) {
      if (i < this.blobs.length) {
        data[i * 4] = this.blobs[i].x;
        data[i * 4 + 1] = this.blobs[i].y;
        data[i * 4 + 2] = this.blobs[i].z;
        data[i * 4 + 3] = this.blobs[i].radius;
      } else {
        data[i * 4] = 0;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
        data[i * 4 + 3] = 0;
      }
    }

    this.positionsTexture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat, THREE.FloatType);
    this.positionsTexture.needsUpdate = true;

    if (this.material) {
      this.material.uniforms.blobPositions.value = this.positionsTexture;
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.material) return;

    this.time += deltaTime;

    const { bass, mid, treble, volume } = audioData;
    const intensity = (bass + mid * 0.5 + treble * 0.3) * this.config.sensitivity;

    // Manage blob splitting/merging
    this.manageBlobs(audioData, this.time, intensity);

    // Update blob positions
    for (const blob of this.blobs) {
      blob.update(bass, mid, treble, volume, this.config.sensitivity, this.time, deltaTime);
    }

    // Update texture
    this.updatePositionsTexture();

    // Update uniforms
    this.material.uniforms.time.value = this.time;
    this.material.uniforms.sensitivity.value = 0.5 + intensity;
    this.material.uniforms.blobCount.value = this.blobs.length;

    this.rendererThree.render(this.scene, this.camera);
  }

  private manageBlobs(audioData: AudioData, time: number, intensity: number): void {
    if (time - this.lastSplitTime < 0.2) return; // 200ms cooldown

    const count = this.blobs.length;

    // Merge logic: Low energy, close proximity, low velocity
    if (intensity < 0.5 && count > 4) {
      let merged = false;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const b1 = this.blobs[i];
          const b2 = this.blobs[j];
          const dx = b1.x - b2.x;
          const dy = b1.y - b2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          // Check velocities
          const v1 = Math.sqrt(b1.vx * b1.vx + b1.vy * b1.vy);
          const v2 = Math.sqrt(b2.vx * b2.vx + b2.vy * b2.vy);
          const lowVelocity = v1 < 0.05 && v2 < 0.05;

          if (lowVelocity && dist < (b1.radius + b2.radius) * 0.8) {
            // Merge b2 into b1
            b1.radius = Math.sqrt(b1.radius * b1.radius + b2.radius * b2.radius); // Area conservation
            
            // Average momentum
            b1.vx = (b1.vx + b2.vx) * 0.5;
            b1.vy = (b1.vy + b2.vy) * 0.5;
            
            this.blobs.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
      if (merged) this.lastSplitTime = time;
    }

    // Split logic: High energy, large blobs
    if (intensity > 1.2 && count < 16) {
      let split = false;
      // Find largest blob
      let maxR = 0;
      let maxIdx = -1;
      for (let i = 0; i < count; i++) {
        if (this.blobs[i].radius > maxR) {
          maxR = this.blobs[i].radius;
          maxIdx = i;
        }
      }

      if (maxIdx !== -1 && maxR > this.config.metaballRadius * 1.5) {
        const parent = this.blobs[maxIdx];
        const newRadius = parent.radius / 1.414; // Area split

        parent.radius = newRadius;

        // Spawn new blob
        const newBlob = new Metaball(parent.x, parent.y, parent.z, newRadius);

        // Velocity separation - explode outwards
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2; // Increased separation speed

        parent.vx += Math.cos(angle) * speed;
        parent.vy += Math.sin(angle) * speed;

        newBlob.vx = parent.vx - Math.cos(angle) * speed * 2;
        newBlob.vy = parent.vy - Math.sin(angle) * speed * 2;

        this.blobs.push(newBlob);
        split = true;
      }

      if (split) this.lastSplitTime = time;
    }
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
      this.material.uniforms.resolution.value.set(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    if ((config as BlobsConfig).blobCount !== undefined) {
      (config as BlobsConfig).blobCount = Math.min((config as BlobsConfig).blobCount, 16);
    }

    const needsRecreate =
      (config as BlobsConfig).blobCount !== undefined &&
      (config as BlobsConfig).blobCount !== this.config.blobCount;

    this.config = { ...this.config, ...config } as BlobsConfig;

    if (this.material) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.slime;
      this.material.uniforms.primaryColor.value.setHex(colors.primary);
      this.material.uniforms.secondaryColor.value.setHex(colors.secondary);
      this.material.uniforms.accentColor.value.setHex(colors.accent);
      this.material.uniforms.glowColor.value.setHex(colors.glow);
      this.material.uniforms.blobCount.value = this.config.blobCount;
      this.material.uniforms.blobRadius.value = this.config.metaballRadius;
    }

    if (needsRecreate) {
      this.initBlobs();
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
    if (this.positionsTexture) {
      this.positionsTexture.dispose();
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.mesh = null;
    this.material = null;
    this.positionsTexture = null;
    this.blobs = [];
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
        default: "slime",
        options: [
          { value: "slime", label: "Slime Green" },
          { value: "magma", label: "Magma" },
          { value: "mercury", label: "Mercury" },
          { value: "slime2", label: "Purple Slime" },
          { value: "oil", label: "Oil Slick" },
        ],
      },
      blobCount: {
        type: "number",
        label: "Blob Count",
        default: 12,
        min: 4,
        max: 16,
        step: 1,
      },
      metaballRadius: {
        type: "number",
        label: "Metaball Radius",
        default: 0.3,
        min: 0.1,
        max: 2,
        step: 0.1,
      },
      surfaceDetail: {
        type: "number",
        label: "Surface Detail",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}

class Metaball {
  x: number;
  y: number;
  z: number;
  baseRadius: number;
  radius: number;
  vx: number = 0;
  vy: number = 0;
  phase: number;
  phaseSpeed: number;

  constructor(x: number, y: number, z: number, radius: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.baseRadius = radius;
    this.radius = radius;
    this.phase = Math.random() * Math.PI * 2;
    this.phaseSpeed = 0.5 + Math.random() * 1.5;
  }

  update(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    sensitivity: number,
    time: number,
    deltaTime: number,
  ): void {
    this.phase += this.phaseSpeed * deltaTime;

    // Wobble movement
    this.x += Math.sin(this.phase) * 0.1;
    this.y += Math.cos(this.phase * 1.3) * 0.1;
    this.z += Math.sin(this.phase * 0.7) * 0.05;

    // Audio-reactive movement
    this.x += (Math.random() - 0.5) * bass * sensitivity * 0.5;
    this.y += (Math.random() - 0.5) * treble * sensitivity * 0.3;

    // Gentle drift
    this.vx += Math.sin(time * 0.5) * 0.01;
    this.vy += Math.cos(time * 0.3) * 0.01;
    this.x += this.vx;
    this.y += this.vy;

    // Damping
    this.vx *= 0.98;
    this.vy *= 0.98;

    // Boundary bounce
    const bounds = { x: 8, y: 5 };
    if (this.x < -bounds.x) {
      this.x = -bounds.x;
      this.vx *= -0.5;
    }
    if (this.x > bounds.x) {
      this.x = bounds.x;
      this.vx *= -0.5;
    }
    if (this.y < -bounds.y) {
      this.y = -bounds.y;
      this.vy *= -0.5;
    }
    if (this.y > bounds.y) {
      this.y = bounds.y;
      this.vy *= -0.5;
    }

    // Radius responds to bass
    const targetRadius = this.baseRadius + bass * 0.5 * sensitivity;
    this.radius += (targetRadius - this.radius) * 0.1;
  }
}
