import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

interface SupernovaConfig extends VisualizationConfig {
  particleCount: number;
  explosionIntensity: number;
  colorScheme: string;
  coreSize: number;
  trailLength: number;
}

// Color schemes for the supernova effect
const COLOR_SCHEMES: Record<string, { core: number; gradient: number[] }> = {
  classic: {
    core: 0xffffff,
    gradient: [0xffffff, 0xffffaa, 0xffaa00, 0xff4400, 0xaa0044, 0x4400aa, 0x0044ff],
  },
  solar: {
    core: 0xffffa0,
    gradient: [0xffffff, 0xffff44, 0xffcc00, 0xff6600, 0xff2200, 0x880000, 0x440000],
  },
  cosmic: {
    core: 0xaaffff,
    gradient: [0xffffff, 0x88ffff, 0x00ffff, 0x00aaff, 0x0066ff, 0x8800ff, 0xff00ff],
  },
  nuclear: {
    core: 0x88ff88,
    gradient: [0xffffff, 0xaaffaa, 0x44ff44, 0x00ff00, 0x00aa00, 0x006600, 0x003300],
  },
  ethereal: {
    core: 0xffffff,
    gradient: [0xffffff, 0xffccff, 0xff88ff, 0xcc44ff, 0x8800ff, 0x4400aa, 0x000066],
  },
};

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  originalPosition: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  colorIndex: number;
  trail: THREE.Vector3[];
  explosionWave: number; // Which shockwave layer this particle belongs to
  isDebris: boolean;
}

interface ShockwaveRing {
  radius: number;
  speed: number;
  opacity: number;
  mesh: THREE.Mesh;
}

interface NebulaCloud {
  mesh: THREE.Points;
  life: number;
  maxLife: number;
  position: THREE.Vector3;
}

export class SupernovaVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "supernova",
    name: "Supernova",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  readonly id = (this.constructor as any).meta.id;
  readonly name = (this.constructor as any).meta.name;
  readonly author = (this.constructor as any).meta.author;
  readonly description = (this.constructor as any).meta.description;
  readonly renderer = (this.constructor as any).meta.renderer;
  readonly transitionType = (this.constructor as any).meta.transitionType;

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  // Core star
  private core: THREE.Mesh | null = null;
  private coreGlow: THREE.Mesh | null = null;
  private coreMaterial: THREE.MeshBasicMaterial | null = null;
  private glowMaterial: THREE.ShaderMaterial | null = null;

  // Explosion particles
  private particles: Particle[] = [];
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;
  private particleSystem: THREE.Points | null = null;

  // Debris field
  private debrisParticles: Particle[] = [];
  private debrisGeometry: THREE.BufferGeometry | null = null;
  private debrisMaterial: THREE.PointsMaterial | null = null;
  private debrisSystem: THREE.Points | null = null;

  // Shockwave rings
  private shockwaveRings: ShockwaveRing[] = [];
  private pendingShockwaves: number = 0;

  // Nebula clouds
  private nebulaClouds: NebulaCloud[] = [];

  private config: SupernovaConfig = {
    sensitivity: 1.0,
    colorScheme: "classic",
    particleCount: 15000,
    explosionIntensity: 1.5,
    coreSize: 3.0,
    trailLength: 5,
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private lastBassHit = 0;
  private bassHitThreshold = 0.65;
  private explosionCooldown = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      2000,
    );
    this.camera.position.z = 100;

    // Create renderer with additive blending support
    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Create core star
    this.createCore();

    // Create particle systems
    this.createParticleSystem();
    this.createDebrisSystem();

    // Initial resize
    this.resize(container.clientWidth, container.clientHeight);
  }

  private createCore(): void {
    if (!this.scene) return;

    const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.classic;

    // Inner core - bright solid sphere
    const coreGeometry = new THREE.SphereGeometry(this.config.coreSize, 32, 32);
    this.coreMaterial = new THREE.MeshBasicMaterial({
      color: scheme.core,
      transparent: true,
      opacity: 1.0,
    });
    this.core = new THREE.Mesh(coreGeometry, this.coreMaterial);
    this.scene.add(this.core);

    // Outer glow - custom shader for volumetric effect
    const glowGeometry = new THREE.SphereGeometry(this.config.coreSize * 2.5, 32, 32);
    this.glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color(scheme.gradient[1]) },
        intensity: { value: 1.0 },
        viewVector: { value: new THREE.Vector3(0, 0, 1) },
      },
      vertexShader: `
        uniform vec3 viewVector;
        varying float intensity;
        void main() {
          vec3 vNormal = normalize(normalMatrix * normal);
          vec3 vNormel = normalize(normalMatrix * viewVector);
          intensity = pow(0.7 - dot(vNormal, vNormel), 2.5);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying float intensity;
        void main() {
          gl_FragColor = vec4(glowColor, 1.0) * intensity * intensity;
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.coreGlow = new THREE.Mesh(glowGeometry, this.glowMaterial);
    this.scene.add(this.coreGlow);
  }

  private createParticleSystem(): void {
    if (!this.scene) return;

    // Initialize particle array
    this.particles = [];
    const positions = new Float32Array(this.config.particleCount * 3);
    const colors = new Float32Array(this.config.particleCount * 3);
    const sizes = new Float32Array(this.config.particleCount);

    // Create dormant particles
    for (let i = 0; i < this.config.particleCount; i++) {
      const particle: Particle = {
        position: new THREE.Vector3(0, 0, 0),
        velocity: new THREE.Vector3(0, 0, 0),
        originalPosition: new THREE.Vector3(0, 0, 0),
        life: 0,
        maxLife: 0,
        size: 0,
        colorIndex: 0,
        trail: [],
        explosionWave: 0,
        isDebris: false,
      };
      this.particles.push(particle);

      const i3 = i * 3;
      positions[i3] = 0;
      positions[i3 + 1] = 0;
      positions[i3 + 2] = 0;
      colors[i3] = 1;
      colors[i3 + 1] = 1;
      colors[i3 + 2] = 1;
      sizes[i] = 0;
    }

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.particleGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Custom shader material for particles with trails
    this.particleMaterial = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.particleSystem = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.scene.add(this.particleSystem);
  }

  private createDebrisSystem(): void {
    if (!this.scene) return;

    const debrisCount = Math.floor(this.config.particleCount * 0.3);
    this.debrisParticles = [];
    const positions = new Float32Array(debrisCount * 3);
    const colors = new Float32Array(debrisCount * 3);

    for (let i = 0; i < debrisCount; i++) {
      const particle: Particle = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 200,
          (Math.random() - 0.5) * 200,
          (Math.random() - 0.5) * 200,
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ),
        originalPosition: new THREE.Vector3(0, 0, 0),
        life: 1,
        maxLife: 1,
        size: 0.3 + Math.random() * 0.5,
        colorIndex: Math.floor(Math.random() * 7),
        trail: [],
        explosionWave: 0,
        isDebris: true,
      };
      this.debrisParticles.push(particle);

      const i3 = i * 3;
      positions[i3] = particle.position.x;
      positions[i3 + 1] = particle.position.y;
      positions[i3 + 2] = particle.position.z;
      colors[i3] = 0.3;
      colors[i3 + 1] = 0.2;
      colors[i3 + 2] = 0.4;
    }

    this.debrisGeometry = new THREE.BufferGeometry();
    this.debrisGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.debrisGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    this.debrisMaterial = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false,
    });

    this.debrisSystem = new THREE.Points(this.debrisGeometry, this.debrisMaterial);
    this.scene.add(this.debrisSystem);
  }

  private triggerExplosion(intensity: number): void {
    if (!this.particles || !this.scene) return;

    const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.classic;
    const numWaves = 3 + Math.floor(intensity * 2); // Multiple shockwave layers
    const particlesPerWave = Math.floor(
      ((this.config.particleCount * 0.7) / numWaves) * this.config.explosionIntensity,
    );

    let particleIndex = 0;

    // Create multiple shockwave layers with different speeds
    for (let wave = 0; wave < numWaves; wave++) {
      const waveSpeed = (0.5 + wave * 0.3) * intensity * this.config.explosionIntensity;

      for (let i = 0; i < particlesPerWave && particleIndex < this.particles.length; i++) {
        const particle = this.particles[particleIndex];

        // Skip already active particles
        if (particle.life > 0) {
          particleIndex++;
          i--;
          continue;
        }

        // Spherical explosion direction
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = (1 + Math.random() * 2) * waveSpeed;

        particle.position.set(0, 0, 0);
        particle.velocity.set(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.sin(phi) * Math.sin(theta) * speed,
          Math.cos(phi) * speed,
        );
        particle.life = 2 + Math.random() * 2;
        particle.maxLife = particle.life;
        particle.size = 0.5 + Math.random() * 1.5;
        particle.colorIndex = 0;
        particle.explosionWave = wave;
        particle.trail = [];

        particleIndex++;
      }
    }

    // Create shockwave rings
    for (let i = 0; i < numWaves; i++) {
      this.createShockwaveRing(intensity * (1 - i * 0.15), scheme.gradient[2]);
    }

    // Create nebula cloud
    this.createNebulaCloud(intensity, scheme);
  }

  private createShockwaveRing(intensity: number, color: number): void {
    if (!this.scene) return;

    const ringGeometry = new THREE.RingGeometry(this.config.coreSize, this.config.coreSize + 1, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8 * intensity,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);

    // Random rotation for 3D effect
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.y = Math.random() * Math.PI;

    this.scene.add(ring);

    this.shockwaveRings.push({
      radius: this.config.coreSize,
      speed: 2 + intensity * 3,
      opacity: 0.8 * intensity,
      mesh: ring,
    });
  }

  private createNebulaCloud(intensity: number, scheme: { core: number; gradient: number[] }): void {
    if (!this.scene) return;

    const cloudParticleCount = 500 + Math.floor(intensity * 500);
    const positions = new Float32Array(cloudParticleCount * 3);
    const colors = new Float32Array(cloudParticleCount * 3);

    const cloudCenter = new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 20,
    );

    for (let i = 0; i < cloudParticleCount; i++) {
      const i3 = i * 3;
      // Gaussian distribution for cloud shape
      const radius = Math.abs(this.gaussianRandom() * 15);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = cloudCenter.x + Math.sin(phi) * Math.cos(theta) * radius;
      positions[i3 + 1] = cloudCenter.y + Math.sin(phi) * Math.sin(theta) * radius;
      positions[i3 + 2] = cloudCenter.z + Math.cos(phi) * radius;

      // Color gradient based on distance from center
      const colorIdx = Math.min(6, Math.floor((radius / 15) * 6));
      const color = new THREE.Color(scheme.gradient[colorIdx]);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    const cloudGeometry = new THREE.BufferGeometry();
    cloudGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    cloudGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const cloudMaterial = new THREE.PointsMaterial({
      size: 1.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.4 * intensity,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const cloud = new THREE.Points(cloudGeometry, cloudMaterial);
    this.scene.add(cloud);

    this.nebulaClouds.push({
      mesh: cloud,
      life: 3 + intensity * 2,
      maxLife: 3 + intensity * 2,
      position: cloudCenter,
    });
  }

  private gaussianRandom(): number {
    let u = 0,
      v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (
      !this.scene ||
      !this.camera ||
      !this.rendererThree ||
      !this.particleGeometry ||
      !this.particleSystem
    )
      return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, explosionIntensity } = this.config;

    this.time += deltaTime;
    this.explosionCooldown = Math.max(0, this.explosionCooldown - deltaTime);

    // Detect bass hits for explosions
    const bassBoost = Math.pow(bass, 0.6) * sensitivity;
    const isBassHit = bassBoost > this.bassHitThreshold && this.explosionCooldown <= 0;

    if (isBassHit) {
      const explosionPower = (bassBoost - this.bassHitThreshold) / (1 - this.bassHitThreshold);
      this.triggerExplosion(explosionPower * explosionIntensity);
      this.explosionCooldown = 0.15; // Prevent too rapid explosions
      this.lastBassHit = this.time;
    }

    // Update core
    this.updateCore(bass, volume, sensitivity);

    // Update explosion particles
    this.updateParticles(deltaTime, mid, treble, sensitivity);

    // Update debris field
    this.updateDebris(deltaTime, mid, treble, sensitivity);

    // Update shockwave rings
    this.updateShockwaves(deltaTime);

    // Update nebula clouds
    this.updateNebulaClouds(deltaTime);

    // Camera effects
    this.updateCamera(bass, volume, sensitivity);

    // Render
    this.rendererThree.render(this.scene, this.camera);
  }

  private updateCore(bass: number, volume: number, sensitivity: number): void {
    if (!this.core || !this.coreGlow || !this.coreMaterial || !this.glowMaterial) return;

    const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.classic;
    const bassBoost = Math.pow(bass, 0.5) * sensitivity;

    // Core pulsing
    const pulseScale = 1 + bassBoost * 0.5 + Math.sin(this.time * 5) * 0.05;
    this.core.scale.setScalar(pulseScale);
    this.coreGlow.scale.setScalar(pulseScale * 2.5);

    // Core brightness
    const brightness = 0.8 + volume * 0.2 + bassBoost * 0.3;
    const coreColor = new THREE.Color(scheme.core);
    coreColor.multiplyScalar(brightness);
    this.coreMaterial.color = coreColor;

    // Glow intensity
    this.glowMaterial.uniforms.intensity.value = 0.5 + bassBoost * 0.5;

    // Glow color shift based on intensity
    const glowColorIdx = Math.min(3, Math.floor(bassBoost * 4));
    this.glowMaterial.uniforms.glowColor.value = new THREE.Color(scheme.gradient[glowColorIdx]);
  }

  private updateParticles(
    deltaTime: number,
    mid: number,
    treble: number,
    sensitivity: number,
  ): void {
    if (!this.particleGeometry) return;

    const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.classic;
    const positions = this.particleGeometry.attributes.position.array as Float32Array;
    const colors = this.particleGeometry.attributes.color.array as Float32Array;

    const midBoost = Math.pow(mid, 0.7) * sensitivity;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i];
      const i3 = i * 3;

      if (particle.life <= 0) {
        positions[i3] = 0;
        positions[i3 + 1] = 0;
        positions[i3 + 2] = -1000; // Hide inactive particles
        continue;
      }

      // Update life
      particle.life -= deltaTime;
      const lifeRatio = particle.life / particle.maxLife;

      // Apply velocity with mid-frequency drift
      const driftFactor = 1 + midBoost * 0.3;
      particle.position.x += particle.velocity.x * deltaTime * 60 * driftFactor;
      particle.position.y += particle.velocity.y * deltaTime * 60 * driftFactor;
      particle.position.z += particle.velocity.z * deltaTime * 60 * driftFactor;

      // Slow down over time
      const drag = 0.98;
      particle.velocity.multiplyScalar(drag);

      // Update position buffer
      positions[i3] = particle.position.x;
      positions[i3 + 1] = particle.position.y;
      positions[i3 + 2] = particle.position.z;

      // Color gradient based on distance from center (temperature)
      const distance = particle.position.length();
      const maxDist = 150;
      const colorIdx = Math.min(6, Math.floor((distance / maxDist) * 6));
      const color = new THREE.Color(scheme.gradient[colorIdx]);

      // Sparkle/twinkle on treble
      const sparkle = trebleBoost > 0.3 ? 1 + Math.sin(this.time * 50 + i) * trebleBoost * 0.5 : 1;

      // Fade out
      const fade = lifeRatio;
      colors[i3] = color.r * fade * sparkle;
      colors[i3 + 1] = color.g * fade * sparkle;
      colors[i3 + 2] = color.b * fade * sparkle;
    }

    this.particleGeometry.attributes.position.needsUpdate = true;
    this.particleGeometry.attributes.color.needsUpdate = true;

    // Update material size based on volume
    if (this.particleMaterial) {
      this.particleMaterial.size = 1.2 + midBoost * 0.8;
    }
  }

  private updateDebris(deltaTime: number, mid: number, treble: number, sensitivity: number): void {
    if (!this.debrisGeometry || !this.debrisMaterial) return;

    const positions = this.debrisGeometry.attributes.position.array as Float32Array;
    const colors = this.debrisGeometry.attributes.color.array as Float32Array;
    const scheme = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.classic;

    const midBoost = Math.pow(mid, 0.7) * sensitivity;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    for (let i = 0; i < this.debrisParticles.length; i++) {
      const particle = this.debrisParticles[i];
      const i3 = i * 3;

      // Slow drift with mid-frequency influence
      particle.position.x += particle.velocity.x * (1 + midBoost) * 60 * deltaTime;
      particle.position.y += particle.velocity.y * (1 + midBoost) * 60 * deltaTime;
      particle.position.z += particle.velocity.z * (1 + midBoost) * 60 * deltaTime;

      // Wrap around boundaries
      const boundary = 150;
      if (Math.abs(particle.position.x) > boundary)
        particle.position.x = -Math.sign(particle.position.x) * boundary;
      if (Math.abs(particle.position.y) > boundary)
        particle.position.y = -Math.sign(particle.position.y) * boundary;
      if (Math.abs(particle.position.z) > boundary)
        particle.position.z = -Math.sign(particle.position.z) * boundary;

      positions[i3] = particle.position.x;
      positions[i3 + 1] = particle.position.y;
      positions[i3 + 2] = particle.position.z;

      // Twinkle on treble
      const twinkle = 0.2 + trebleBoost * 0.3 + Math.sin(this.time * 3 + i * 0.1) * 0.1;
      const color = new THREE.Color(scheme.gradient[5]);
      colors[i3] = color.r * twinkle;
      colors[i3 + 1] = color.g * twinkle;
      colors[i3 + 2] = color.b * twinkle;
    }

    this.debrisGeometry.attributes.position.needsUpdate = true;
    this.debrisGeometry.attributes.color.needsUpdate = true;
    this.debrisMaterial.opacity = 0.3 + midBoost * 0.2;
  }

  private updateShockwaves(deltaTime: number): void {
    if (!this.scene) return;

    for (let i = this.shockwaveRings.length - 1; i >= 0; i--) {
      const ring = this.shockwaveRings[i];

      // Expand ring
      ring.radius += ring.speed * deltaTime * 60;

      // Update geometry
      const innerRadius = ring.radius;
      const outerRadius = ring.radius + 2 + ring.speed * 0.5;

      ring.mesh.geometry.dispose();
      ring.mesh.geometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);

      // Fade out
      ring.opacity *= 0.96;
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = ring.opacity;

      // Remove when faded or too large
      if (ring.opacity < 0.01 || ring.radius > 200) {
        this.scene.remove(ring.mesh);
        ring.mesh.geometry.dispose();
        (ring.mesh.material as THREE.Material).dispose();
        this.shockwaveRings.splice(i, 1);
      }
    }
  }

  private updateNebulaClouds(deltaTime: number): void {
    if (!this.scene) return;

    for (let i = this.nebulaClouds.length - 1; i >= 0; i--) {
      const cloud = this.nebulaClouds[i];

      cloud.life -= deltaTime;
      const lifeRatio = cloud.life / cloud.maxLife;

      // Expand cloud slowly
      cloud.mesh.scale.multiplyScalar(1 + deltaTime * 0.3);

      // Fade out
      (cloud.mesh.material as THREE.PointsMaterial).opacity = 0.4 * lifeRatio;

      // Remove when expired
      if (cloud.life <= 0) {
        this.scene.remove(cloud.mesh);
        cloud.mesh.geometry.dispose();
        (cloud.mesh.material as THREE.Material).dispose();
        this.nebulaClouds.splice(i, 1);
      }
    }
  }

  private updateCamera(bass: number, volume: number, sensitivity: number): void {
    if (!this.camera) return;

    const bassBoost = Math.pow(bass, 0.5) * sensitivity;

    // Camera shake on explosions
    const timeSinceExplosion = this.time - this.lastBassHit;
    if (timeSinceExplosion < 0.3) {
      const shakeIntensity = (0.3 - timeSinceExplosion) * 2;
      this.camera.position.x = (Math.random() - 0.5) * shakeIntensity;
      this.camera.position.y = (Math.random() - 0.5) * shakeIntensity;
    } else {
      // Smooth return to center
      this.camera.position.x *= 0.9;
      this.camera.position.y *= 0.9;
    }

    // Zoom based on bass intensity
    const targetZ = 100 - bassBoost * 20 - volume * sensitivity * 10;
    this.camera.position.z += (targetZ - this.camera.position.z) * 0.1;

    // Subtle rotation
    this.camera.rotation.z = Math.sin(this.time * 0.5) * 0.02;
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
    const oldParticleCount = this.config.particleCount;
    const oldColorScheme = this.config.colorScheme;
    const oldCoreSize = this.config.coreSize;

    this.config = { ...this.config, ...config } as SupernovaConfig;

    // Recreate systems if needed
    if (this.scene) {
      if (this.config.particleCount !== oldParticleCount) {
        this.recreateParticleSystems();
      }
      if (this.config.colorScheme !== oldColorScheme || this.config.coreSize !== oldCoreSize) {
        this.recreateCore();
      }
    }
  }

  private recreateParticleSystems(): void {
    if (this.particleSystem && this.scene) {
      this.scene.remove(this.particleSystem);
      this.particleGeometry?.dispose();
      this.particleMaterial?.dispose();
    }
    if (this.debrisSystem && this.scene) {
      this.scene.remove(this.debrisSystem);
      this.debrisGeometry?.dispose();
      this.debrisMaterial?.dispose();
    }
    this.createParticleSystem();
    this.createDebrisSystem();
  }

  private recreateCore(): void {
    if (this.core && this.scene) {
      this.scene.remove(this.core);
      this.core.geometry.dispose();
      this.coreMaterial?.dispose();
    }
    if (this.coreGlow && this.scene) {
      this.scene.remove(this.coreGlow);
      this.coreGlow.geometry.dispose();
      this.glowMaterial?.dispose();
    }
    this.createCore();
  }

  destroy(): void {
    // Clean up particles
    if (this.particleSystem && this.scene) {
      this.scene.remove(this.particleSystem);
      this.particleGeometry?.dispose();
      this.particleMaterial?.dispose();
    }

    // Clean up debris
    if (this.debrisSystem && this.scene) {
      this.scene.remove(this.debrisSystem);
      this.debrisGeometry?.dispose();
      this.debrisMaterial?.dispose();
    }

    // Clean up core
    if (this.core && this.scene) {
      this.scene.remove(this.core);
      this.core.geometry.dispose();
      this.coreMaterial?.dispose();
    }
    if (this.coreGlow && this.scene) {
      this.scene.remove(this.coreGlow);
      this.coreGlow.geometry.dispose();
      this.glowMaterial?.dispose();
    }

    // Clean up shockwaves
    for (const ring of this.shockwaveRings) {
      if (this.scene) this.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
    this.shockwaveRings = [];

    // Clean up nebulae
    for (const cloud of this.nebulaClouds) {
      if (this.scene) this.scene.remove(cloud.mesh);
      cloud.mesh.geometry.dispose();
      (cloud.mesh.material as THREE.Material).dispose();
    }
    this.nebulaClouds = [];

    // Clean up renderer
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentElement) {
        this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.particles = [];
    this.debrisParticles = [];
    this.container = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 15000,
        min: 5000,
        max: 50000,
        step: 1000,
      },
      explosionIntensity: {
        type: "number",
        label: "Explosion Intensity",
        default: 1.5,
        min: 0.5,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "classic",
        options: [
          { value: "classic", label: "Classic (White to Blue)" },
          { value: "solar", label: "Solar Flare (Yellow to Red)" },
          { value: "cosmic", label: "Cosmic (Cyan to Magenta)" },
          { value: "nuclear", label: "Nuclear (Green Burst)" },
          { value: "ethereal", label: "Ethereal (Pink to Purple)" },
        ],
      },
      coreSize: {
        type: "number",
        label: "Core Size",
        default: 3.0,
        min: 1.0,
        max: 8.0,
        step: 0.5,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 5,
        min: 0,
        max: 15,
        step: 1,
      },
    };
  }
}
