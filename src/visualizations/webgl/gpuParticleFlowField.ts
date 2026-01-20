import * as THREE from "three";
import { BaseVisualization } from "../base";
import type { AudioData, VisualizationConfig, VisualizationMeta, ConfigSchema } from "../types";

/**
 * GPU Particle Flow Field Visualization
 *
 * Millions of particles flowing through 3D Perlin noise fields.
 * - Bass pulses warp the flow field
 * - Treble creates turbulence
 * - Particles fade with alpha trails
 * - Optimized for GPU with instanced rendering
 */
export class GPUParticleFlowFieldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "gpuParticleFlowField",
    name: "GPU Particle Flow Field",
    author: "Vizec",
    description:
      "Millions of particles flowing through audio-reactive 3D noise fields with GPU acceleration",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  // Particle system
  private particles: THREE.Points | null = null;
  private particleCount = 200000; // Reduced for better performance
  private positions: Float32Array | null = null;
  private velocities: Float32Array | null = null;
  private colors: Float32Array | null = null;
  private sizes: Float32Array | null = null;
  private lifetimes: Float32Array | null = null;

  // Flow field
  private flowFieldSize = 24; // Reduced for better performance
  private flowField: THREE.Vector3[][][] | null = null;
  private flowFieldTime = 0;

  // Audio reactivity
  private bassEnergy = 0;
  private midEnergy = 0;
  private trebleEnergy = 0;
  private volumeLevel = 0;

  // Configuration
  private baseSpeed = 2.0;
  private turbulence = 0.5;
  private colorScheme: "neon" | "fire" | "ice" | "rainbow" = "neon";
  private trailLength = 0.95;
  private fieldScale = 0.008;

  // Color palettes
  private readonly colorPalettes = {
    neon: [
      new THREE.Color(0x00ffff), // Cyan
      new THREE.Color(0xff00ff), // Magenta
      new THREE.Color(0x00ff00), // Green
      new THREE.Color(0xffff00), // Yellow
    ],
    fire: [
      new THREE.Color(0xff4500), // Orange red
      new THREE.Color(0xff6600), // Orange
      new THREE.Color(0xffcc00), // Gold
      new THREE.Color(0xff0000), // Red
    ],
    ice: [
      new THREE.Color(0x00bfff), // Deep sky blue
      new THREE.Color(0x87ceeb), // Sky blue
      new THREE.Color(0xe0ffff), // Light cyan
      new THREE.Color(0xffffff), // White
    ],
    rainbow: [
      new THREE.Color(0xff0000), // Red
      new THREE.Color(0x00ff00), // Green
      new THREE.Color(0x0000ff), // Blue
      new THREE.Color(0xffff00), // Yellow
    ],
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Scene
    this.scene = new THREE.Scene();

    // Camera - positioned to see the 3D flow
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      2000,
    );
    this.camera.position.z = 400;

    // Renderer with transparency
    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(container.clientWidth, container.clientHeight);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Initialize flow field
    this.initFlowField();

    // Initialize particles
    this.initParticles();
  }

  private initFlowField(): void {
    const size = this.flowFieldSize;
    this.flowField = [];

    for (let x = 0; x < size; x++) {
      this.flowField[x] = [];
      for (let y = 0; y < size; y++) {
        this.flowField[x][y] = [];
        for (let z = 0; z < size; z++) {
          this.flowField[x][y][z] = new THREE.Vector3();
        }
      }
    }

    this.updateFlowField(0);
  }

  private updateFlowField(time: number): void {
    if (!this.flowField) return;

    const size = this.flowFieldSize;
    const scale = 0.1;
    // Treble creates noticeable turbulence
    const turbulenceScale = this.turbulence * (1 + this.trebleEnergy * 4);
    // Bass warps the field more dramatically
    const bassWarp = this.bassEnergy * 1.5;
    // Mid affects the overall flow rotation
    const midRotation = this.midEnergy * 0.5;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          // 3D Perlin-like noise using sin combinations
          const nx = x * scale + time * 0.1 + bassWarp * Math.sin(time + y * 0.1);
          const ny = y * scale + time * 0.15 + midRotation;
          const nz = z * scale + time * 0.12;

          // Generate flow direction from noise - more dramatic angles
          const angle1 = Math.sin(nx) * Math.cos(ny * 1.3) * Math.PI * 2 * turbulenceScale;
          const angle2 = Math.cos(nz * 1.1) * Math.sin(nx * 0.9) * Math.PI * turbulenceScale;

          const vec = this.flowField[x][y][z];
          vec.x = Math.cos(angle1) * Math.cos(angle2);
          vec.y = Math.sin(angle1);
          vec.z = Math.cos(angle1) * Math.sin(angle2);

          // Bass pulse - radial force from center (lower threshold, stronger effect)
          if (this.bassEnergy > 0.15) {
            const centerX = size / 2;
            const centerY = size / 2;
            const centerZ = size / 2;
            const dx = x - centerX;
            const dy = y - centerY;
            const dz = z - centerZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
            // Stronger pulse that scales with bass intensity
            const pulse = this.bassEnergy * 0.8;
            vec.x += (dx / dist) * pulse;
            vec.y += (dy / dist) * pulse;
            vec.z += (dz / dist) * pulse;
          }

          // Treble adds swirl/vortex effect
          if (this.trebleEnergy > 0.2) {
            const centerX = size / 2;
            const centerZ = size / 2;
            const dx = x - centerX;
            const dz = z - centerZ;
            const swirl = this.trebleEnergy * 0.4;
            vec.x += -dz * swirl * 0.1;
            vec.z += dx * swirl * 0.1;
          }

          vec.normalize();
        }
      }
    }
  }

  private initParticles(): void {
    if (!this.scene) return;

    this.positions = new Float32Array(this.particleCount * 3);
    this.velocities = new Float32Array(this.particleCount * 3);
    this.colors = new Float32Array(this.particleCount * 3);
    this.sizes = new Float32Array(this.particleCount);
    this.lifetimes = new Float32Array(this.particleCount);

    const bounds = 300;
    const palette = this.colorPalettes[this.colorScheme];

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      // Random position in 3D space
      this.positions[i3] = (Math.random() - 0.5) * bounds * 2;
      this.positions[i3 + 1] = (Math.random() - 0.5) * bounds * 2;
      this.positions[i3 + 2] = (Math.random() - 0.5) * bounds * 2;

      // Initial velocity
      this.velocities[i3] = 0;
      this.velocities[i3 + 1] = 0;
      this.velocities[i3 + 2] = 0;

      // Random color from palette
      const color = palette[Math.floor(Math.random() * palette.length)];
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;

      // Random size
      this.sizes[i] = Math.random() * 2 + 1;

      // Random lifetime phase
      this.lifetimes[i] = Math.random();
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(this.sizes, 1));

    // Custom shader material for particles
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        volumeLevel: { value: 0 },
        bassLevel: { value: 0 },
        pixelRatio: { value: window.devicePixelRatio },
      },
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vBass;
        uniform float time;
        uniform float volumeLevel;
        uniform float bassLevel;
        uniform float pixelRatio;

        void main() {
          vColor = color.rgb;
          vBass = bassLevel;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

          // Size based on distance, volume, and bass
          float sizeScale = 1.0 + volumeLevel * 0.8 + bassLevel * 0.5;
          gl_PointSize = size * sizeScale * pixelRatio * (300.0 / -mvPosition.z);
          gl_PointSize = clamp(gl_PointSize, 1.0, 25.0);

          // Alpha based on depth - brighter with volume
          float depth = -mvPosition.z;
          vAlpha = smoothstep(800.0, 100.0, depth) * (0.7 + volumeLevel * 0.3);

          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vBass;

        void main() {
          // Circular particle with soft edge
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);

          if (dist > 0.5) discard;

          // Soft glow falloff
          float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;

          // Add glow - intensify on bass
          float glowIntensity = 1.0 + (0.5 - dist) * 2.0 + vBass * 1.5;
          vec3 glow = vColor * glowIntensity;

          // Boost alpha slightly on bass hits
          alpha *= 1.0 + vBass * 0.3;

          gl_FragColor = vec4(glow, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  private sampleFlowField(x: number, y: number, z: number): THREE.Vector3 {
    if (!this.flowField) return new THREE.Vector3(0, 1, 0);

    const size = this.flowFieldSize;
    const scale = this.fieldScale;

    // Map world position to flow field coordinates
    let fx = ((x * scale + 0.5) * size) % size;
    let fy = ((y * scale + 0.5) * size) % size;
    let fz = ((z * scale + 0.5) * size) % size;

    // Wrap negative values
    if (fx < 0) fx += size;
    if (fy < 0) fy += size;
    if (fz < 0) fz += size;

    // Trilinear interpolation
    const x0 = Math.floor(fx) % size;
    const y0 = Math.floor(fy) % size;
    const z0 = Math.floor(fz) % size;
    const x1 = (x0 + 1) % size;
    const y1 = (y0 + 1) % size;
    const z1 = (z0 + 1) % size;

    const xf = fx - Math.floor(fx);
    const yf = fy - Math.floor(fy);
    const zf = fz - Math.floor(fz);

    // Sample 8 corners
    const c000 = this.flowField[x0][y0][z0];
    const c100 = this.flowField[x1][y0][z0];
    const c010 = this.flowField[x0][y1][z0];
    const c110 = this.flowField[x1][y1][z0];
    const c001 = this.flowField[x0][y0][z1];
    const c101 = this.flowField[x1][y0][z1];
    const c011 = this.flowField[x0][y1][z1];
    const c111 = this.flowField[x1][y1][z1];

    // Interpolate
    const result = new THREE.Vector3();
    result.x =
      c000.x * (1 - xf) * (1 - yf) * (1 - zf) +
      c100.x * xf * (1 - yf) * (1 - zf) +
      c010.x * (1 - xf) * yf * (1 - zf) +
      c110.x * xf * yf * (1 - zf) +
      c001.x * (1 - xf) * (1 - yf) * zf +
      c101.x * xf * (1 - yf) * zf +
      c011.x * (1 - xf) * yf * zf +
      c111.x * xf * yf * zf;

    result.y =
      c000.y * (1 - xf) * (1 - yf) * (1 - zf) +
      c100.y * xf * (1 - yf) * (1 - zf) +
      c010.y * (1 - xf) * yf * (1 - zf) +
      c110.y * xf * yf * (1 - zf) +
      c001.y * (1 - xf) * (1 - yf) * zf +
      c101.y * xf * (1 - yf) * zf +
      c011.y * (1 - xf) * yf * zf +
      c111.y * xf * yf * zf;

    result.z =
      c000.z * (1 - xf) * (1 - yf) * (1 - zf) +
      c100.z * xf * (1 - yf) * (1 - zf) +
      c010.z * (1 - xf) * yf * (1 - zf) +
      c110.z * xf * yf * (1 - zf) +
      c001.z * (1 - xf) * (1 - yf) * zf +
      c101.z * xf * (1 - yf) * zf +
      c011.z * (1 - xf) * yf * zf +
      c111.z * xf * yf * zf;

    return result;
  }

  private updateParticles(deltaTime: number): void {
    if (!this.positions || !this.velocities || !this.particles || !this.colors) return;

    const bounds = 300;
    // More dramatic speed response to volume
    const speed = this.baseSpeed * (1 + this.volumeLevel * 4) * Math.min(deltaTime * 60, 2);
    const damping = this.trailLength;
    const palette = this.colorPalettes[this.colorScheme];

    // Bass creates burst effect - temporarily reduce damping
    const effectiveDamping =
      this.bassEnergy > 0.3 ? damping * (1 - this.bassEnergy * 0.3) : damping;

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;

      const x = this.positions[i3];
      const y = this.positions[i3 + 1];
      const z = this.positions[i3 + 2];

      // Sample flow field at particle position
      const flow = this.sampleFlowField(x, y, z);

      // Apply flow field force with stronger audio modulation
      const forceMultiplier = 1 + this.midEnergy * 3;
      this.velocities[i3] =
        this.velocities[i3] * effectiveDamping + flow.x * speed * forceMultiplier;
      this.velocities[i3 + 1] =
        this.velocities[i3 + 1] * effectiveDamping + flow.y * speed * forceMultiplier;
      this.velocities[i3 + 2] =
        this.velocities[i3 + 2] * effectiveDamping + flow.z * speed * forceMultiplier;

      // Update position
      this.positions[i3] += this.velocities[i3];
      this.positions[i3 + 1] += this.velocities[i3 + 1];
      this.positions[i3 + 2] += this.velocities[i3 + 2];

      // Wrap around bounds
      if (this.positions[i3] > bounds) this.positions[i3] = -bounds;
      if (this.positions[i3] < -bounds) this.positions[i3] = bounds;
      if (this.positions[i3 + 1] > bounds) this.positions[i3 + 1] = -bounds;
      if (this.positions[i3 + 1] < -bounds) this.positions[i3 + 1] = bounds;
      if (this.positions[i3 + 2] > bounds) this.positions[i3 + 2] = -bounds;
      if (this.positions[i3 + 2] < -bounds) this.positions[i3 + 2] = bounds;

      // More frequent color shifts on bass hits
      if (this.bassEnergy > 0.3 && Math.random() < 0.03) {
        const newColor = palette[Math.floor(Math.random() * palette.length)];
        this.colors[i3] = newColor.r;
        this.colors[i3 + 1] = newColor.g;
        this.colors[i3 + 2] = newColor.b;
      }
    }

    // Update geometry
    const geometry = this.particles.geometry;
    const positionAttr = geometry.getAttribute("position");
    const colorAttr = geometry.getAttribute("color");
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.particles) return;

    // Smooth audio values - faster response for better reactivity
    const smoothing = 0.25;
    this.bassEnergy += (audioData.bass - this.bassEnergy) * smoothing;
    this.midEnergy += (audioData.mid - this.midEnergy) * smoothing;
    this.trebleEnergy += (audioData.treble - this.trebleEnergy) * smoothing;
    this.volumeLevel += (audioData.volume - this.volumeLevel) * smoothing;

    // Update flow field less frequently for better performance
    this.flowFieldTime += deltaTime;
    if (this.flowFieldTime > 0.066) {
      // ~15fps for flow field updates
      this.updateFlowField(performance.now() * 0.001);
      this.flowFieldTime = 0;
    }

    // Update particles
    this.updateParticles(deltaTime);

    // Update shader uniforms
    const material = this.particles.material as THREE.ShaderMaterial;
    material.uniforms.time.value = performance.now() * 0.001;
    material.uniforms.volumeLevel.value = this.volumeLevel;
    material.uniforms.bassLevel.value = this.bassEnergy;

    // Subtle camera movement
    const time = performance.now() * 0.0001;
    this.camera.position.x = Math.sin(time) * 50;
    this.camera.position.y = Math.cos(time * 0.7) * 30;
    this.camera.lookAt(0, 0, 0);

    // Render
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

    // Update pixel ratio uniform
    if (this.particles) {
      const material = this.particles.material as THREE.ShaderMaterial;
      material.uniforms.pixelRatio.value = window.devicePixelRatio;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    if (config.speed !== undefined && config.speed !== null) {
      this.baseSpeed = (config.speed as number) * 3;
    }
    if (config.intensity !== undefined && config.intensity !== null) {
      this.turbulence = config.intensity as number;
    }
    if (config.colorScheme !== undefined) {
      const scheme = config.colorScheme as "neon" | "fire" | "ice" | "rainbow";
      if (this.colorPalettes[scheme]) {
        this.colorScheme = scheme;
        this.recolorParticles();
      }
    }
    if (config.particleCount !== undefined) {
      // Would require reinitializing particles - skip for now
    }
  }

  private recolorParticles(): void {
    if (!this.colors || !this.particles) return;

    const palette = this.colorPalettes[this.colorScheme];

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      const color = palette[Math.floor(Math.random() * palette.length)];
      this.colors[i3] = color.r;
      this.colors[i3 + 1] = color.g;
      this.colors[i3 + 2] = color.b;
    }

    const colorAttr = this.particles.geometry.getAttribute("color");
    colorAttr.needsUpdate = true;
  }

  destroy(): void {
    if (this.particles) {
      this.particles.geometry.dispose();
      (this.particles.material as THREE.Material).dispose();
      this.scene?.remove(this.particles);
    }

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }

    this.flowField = null;
    this.positions = null;
    this.velocities = null;
    this.colors = null;
    this.sizes = null;
    this.lifetimes = null;
    this.particles = null;
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.container = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      speed: {
        type: "number",
        label: "Flow Speed",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1,
      },
      intensity: {
        type: "number",
        label: "Turbulence",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        options: [
          { value: "neon", label: "Neon" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
          { value: "rainbow", label: "Rainbow" },
        ],
        default: "neon",
      },
    };
  }
}
