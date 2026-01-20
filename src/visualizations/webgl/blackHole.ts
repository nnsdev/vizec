import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

const COLOR_SCHEMES: Record<
  string,
  {
    diskInner: number;
    diskOuter: number;
    glow: number;
    stars: number;
    lensing: number;
  }
> = {
  interstellar: {
    diskInner: 0xffffcc,
    diskOuter: 0xff4400,
    glow: 0xff6600,
    stars: 0xffffff,
    lensing: 0xffaa00,
  },
  cosmic: {
    diskInner: 0x00ffff,
    diskOuter: 0x0066ff,
    glow: 0x0088ff,
    stars: 0xaaccff,
    lensing: 0x00ccff,
  },
  inferno: {
    diskInner: 0xffffff,
    diskOuter: 0xff0000,
    glow: 0xff3300,
    stars: 0xffcccc,
    lensing: 0xff6600,
  },
  void: {
    diskInner: 0xff00ff,
    diskOuter: 0x4400aa,
    glow: 0x8800ff,
    stars: 0xddccff,
    lensing: 0xaa00ff,
  },
  ice: {
    diskInner: 0xffffff,
    diskOuter: 0x00bfff,
    glow: 0x00ddff,
    stars: 0xe0ffff,
    lensing: 0x87ceeb,
  },
  golden: {
    diskInner: 0xffffff,
    diskOuter: 0xffd700,
    glow: 0xffaa00,
    stars: 0xffffee,
    lensing: 0xffcc00,
  },
};

interface AccretionParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  angle: number;
  speed: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
  size: number;
  layer: number; // For depth illusion
}

interface InfallingParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angle: number;
  radius: number;
  spiralSpeed: number;
  life: number;
  size: number;
}

interface Star {
  position: THREE.Vector3;
  originalPosition: THREE.Vector3;
  brightness: number;
  twinklePhase: number;
  twinkleSpeed: number;
  size: number;
}

interface BlackHoleConfig extends VisualizationConfig {
  holeSize: number;
  diskIntensity: number;
  colorScheme: string;
  particleCount: number;
  lensing: number;
  starCount: number;
  rotationSpeed: number;
}

export class BlackHoleVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "blackHole",
    name: "Black Hole",
    author: "Vizec",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  // Black hole core
  private eventHorizon: THREE.Mesh | null = null;
  private eventHorizonGlow: THREE.Mesh | null = null;

  // Accretion disk
  private accretionDisk: THREE.Points | null = null;
  private accretionParticles: AccretionParticle[] = [];
  private accretionGeometry: THREE.BufferGeometry | null = null;

  // Lensing ring (photon sphere)
  private lensingRing: THREE.Mesh | null = null;
  private lensingRingOuter: THREE.Mesh | null = null;

  // Particle streams
  private infallingParticles: InfallingParticle[] = [];
  private infallingPoints: THREE.Points | null = null;
  private infallingGeometry: THREE.BufferGeometry | null = null;

  // Background stars
  private stars: Star[] = [];
  private starField: THREE.Points | null = null;
  private starGeometry: THREE.BufferGeometry | null = null;

  // Disk glow planes
  private diskGlowTop: THREE.Mesh | null = null;
  private diskGlowBottom: THREE.Mesh | null = null;

  private config: BlackHoleConfig = {
    sensitivity: 1.0,
    holeSize: 8,
    diskIntensity: 1.0,
    colorScheme: "interstellar",
    particleCount: 3000,
    lensing: 1.0,
    starCount: 2000,
    rotationSpeed: 0.4,
  };

  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private volumeSmooth = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera with dramatic angle
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    this.camera.position.set(0, 25, 60);
    this.camera.lookAt(0, 0, 0);

    // Create renderer with additive-friendly settings
    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    this.rendererThree.sortObjects = true;
    container.appendChild(this.rendererThree.domElement);

    this.createBlackHole();
  }

  private createBlackHole(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.interstellar;
    const { holeSize, particleCount, starCount } = this.config;

    // Clear existing objects
    this.clearScene();

    // 1. Create background starfield FIRST (furthest back)
    this.createStarfield(starCount, colors);

    // 2. Create the accretion disk particles
    this.createAccretionDisk(particleCount, holeSize, colors);

    // 3. Create disk glow planes
    this.createDiskGlow(holeSize, colors);

    // 4. Create gravitational lensing ring (photon sphere)
    this.createLensingRing(holeSize, colors);

    // 5. Create event horizon (the actual black hole)
    this.createEventHorizon(holeSize, colors);

    // 6. Create infalling particle streams
    this.createInfallingParticles(holeSize, colors);
  }

  private clearScene(): void {
    if (!this.scene) return;

    // Dispose and remove all objects
    const objectsToRemove: THREE.Object3D[] = [];
    this.scene.traverse((obj) => objectsToRemove.push(obj));
    objectsToRemove.forEach((obj) => {
      if (obj !== this.scene) {
        if ((obj as THREE.Mesh).geometry) {
          ((obj as THREE.Mesh).geometry as THREE.BufferGeometry).dispose();
        }
        if ((obj as THREE.Mesh).material) {
          const mat = (obj as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            (mat as THREE.Material).dispose();
          }
        }
        this.scene?.remove(obj);
      }
    });
  }

  private createStarfield(count: number, colors: (typeof COLOR_SCHEMES)["interstellar"]): void {
    if (!this.scene) return;

    this.stars = [];
    const positions: number[] = [];
    const sizes: number[] = [];
    const starColors: number[] = [];

    for (let i = 0; i < count; i++) {
      // Distribute stars in a sphere around the scene
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 300 + Math.random() * 500;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      const pos = new THREE.Vector3(x, y, z);

      this.stars.push({
        position: pos.clone(),
        originalPosition: pos.clone(),
        brightness: 0.3 + Math.random() * 0.7,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2,
        size: 0.5 + Math.random() * 1.5,
      });

      positions.push(x, y, z);
      sizes.push(0.5 + Math.random() * 1.5);

      const color = new THREE.Color(colors.stars);
      // Add slight color variation
      color.r += (Math.random() - 0.5) * 0.2;
      color.g += (Math.random() - 0.5) * 0.1;
      color.b += (Math.random() - 0.5) * 0.1;
      starColors.push(color.r, color.g, color.b);
    }

    this.starGeometry = new THREE.BufferGeometry();
    this.starGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.starGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.starGeometry.setAttribute("color", new THREE.Float32BufferAttribute(starColors, 3));

    const starMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying float vSize;
        uniform float pixelRatio;

        void main() {
          vColor = color;
          vSize = size;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (300.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vSize;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 1.5);

          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starField = new THREE.Points(this.starGeometry, starMaterial);
    this.starField.renderOrder = -100;
    this.scene.add(this.starField);
  }

  private createAccretionDisk(
    count: number,
    holeSize: number,
    colors: (typeof COLOR_SCHEMES)["interstellar"],
  ): void {
    if (!this.scene) return;

    this.accretionParticles = [];
    const innerRadius = holeSize * 1.5;
    const outerRadius = holeSize * 5;

    const innerColor = new THREE.Color(colors.diskInner);
    const outerColor = new THREE.Color(colors.diskOuter);

    for (let i = 0; i < count; i++) {
      // Bias towards inner disk for more density near hole
      const t = Math.pow(Math.random(), 0.7);
      const radius = innerRadius + t * (outerRadius - innerRadius);
      const angle = Math.random() * Math.PI * 2;

      // Flatten disk with slight vertical variance
      const diskThickness = 0.5 + t * 2; // Thicker at edges
      const y = (Math.random() - 0.5) * diskThickness;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Orbital speed: faster closer to center (Keplerian)
      const orbitalSpeed = 0.8 / Math.pow(radius / innerRadius, 1.5);

      // Color based on radius (hotter = whiter near center)
      const color = new THREE.Color().lerpColors(innerColor, outerColor, t);

      // Brighten inner particles
      if (t < 0.3) {
        color.lerp(new THREE.Color(0xffffff), (0.3 - t) * 2);
      }

      this.accretionParticles.push({
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(),
        radius,
        angle,
        speed: orbitalSpeed,
        life: Math.random(),
        maxLife: 1.0,
        color,
        size: 0.5 + (1 - t) * 2, // Larger near center
        layer: Math.floor(Math.random() * 3), // For depth variation
      });
    }

    // Create geometry
    this.accretionGeometry = new THREE.BufferGeometry();
    this.updateAccretionGeometry();

    const diskMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: 1.0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float pixelRatio;
        uniform float intensity;

        void main() {
          vColor = color * intensity;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * intensity * (150.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          // Soft glow falloff
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 0.8) * vAlpha;

          // Add bloom effect
          vec3 finalColor = vColor + vColor * pow(alpha, 2.0) * 0.5;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.accretionDisk = new THREE.Points(this.accretionGeometry, diskMaterial);
    this.accretionDisk.renderOrder = 10;
    this.scene.add(this.accretionDisk);
  }

  private updateAccretionGeometry(): void {
    if (!this.accretionGeometry) return;

    const positions: number[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const alphas: number[] = [];

    for (const p of this.accretionParticles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      sizes.push(p.size);
      colors.push(p.color.r, p.color.g, p.color.b);
      alphas.push(p.life);
    }

    this.accretionGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.accretionGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.accretionGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.accretionGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  }

  private createDiskGlow(holeSize: number, colors: (typeof COLOR_SCHEMES)["interstellar"]): void {
    if (!this.scene) return;

    const glowGeometry = new THREE.RingGeometry(holeSize * 1.3, holeSize * 6, 64, 1);

    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        innerColor: { value: new THREE.Color(colors.diskInner) },
        outerColor: { value: new THREE.Color(colors.diskOuter) },
        glowIntensity: { value: 1.0 },
        innerRadius: { value: holeSize * 1.3 },
        outerRadius: { value: holeSize * 6 },
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
        uniform vec3 innerColor;
        uniform vec3 outerColor;
        uniform float glowIntensity;
        uniform float innerRadius;
        uniform float outerRadius;
        varying vec2 vUv;
        varying vec3 vPosition;

        void main() {
          float dist = length(vPosition.xz);
          float t = (dist - innerRadius) / (outerRadius - innerRadius);
          t = clamp(t, 0.0, 1.0);

          vec3 color = mix(innerColor, outerColor, sqrt(t));

          // Brighter near inner edge
          float brightness = (1.0 - t) * 0.8 + 0.2;
          color *= brightness * glowIntensity;

          // Fade out at edges
          float alpha = (1.0 - pow(t, 0.5)) * 0.6 * glowIntensity;

          // Add subtle white core
          if (t < 0.2) {
            color = mix(vec3(1.0), color, t / 0.2);
          }

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Top glow plane
    this.diskGlowTop = new THREE.Mesh(glowGeometry, glowMaterial.clone());
    this.diskGlowTop.rotation.x = -Math.PI / 2;
    this.diskGlowTop.position.y = 0.1;
    this.diskGlowTop.renderOrder = 5;
    this.scene.add(this.diskGlowTop);

    // Bottom glow plane (slightly dimmer)
    this.diskGlowBottom = new THREE.Mesh(glowGeometry.clone(), glowMaterial.clone());
    this.diskGlowBottom.rotation.x = Math.PI / 2;
    this.diskGlowBottom.position.y = -0.1;
    this.diskGlowBottom.renderOrder = 5;
    (
      (this.diskGlowBottom.material as THREE.ShaderMaterial).uniforms
        .glowIntensity as THREE.IUniform
    ).value = 0.7;
    this.scene.add(this.diskGlowBottom);
  }

  private createLensingRing(
    holeSize: number,
    colors: (typeof COLOR_SCHEMES)["interstellar"],
  ): void {
    if (!this.scene) return;

    // Main photon ring - the bright lensing effect
    const ringGeometry = new THREE.TorusGeometry(holeSize * 1.15, holeSize * 0.08, 32, 128);

    const ringMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.lensing) },
        time: { value: 0 },
        intensity: { value: 1.0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        uniform float intensity;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          // Fresnel-like effect for edge glow
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 1.0, 0.0))), 2.0);

          // Animated brightness variation
          float angle = atan(vPosition.z, vPosition.x);
          float brightness = 0.8 + 0.2 * sin(angle * 8.0 + time * 3.0);

          vec3 finalColor = color * (1.0 + fresnel * 2.0) * brightness * intensity;
          float alpha = (0.6 + fresnel * 0.4) * intensity;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.lensingRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.lensingRing.rotation.x = Math.PI / 2;
    this.lensingRing.renderOrder = 20;
    this.scene.add(this.lensingRing);

    // Outer glow ring
    const outerRingGeometry = new THREE.TorusGeometry(holeSize * 1.15, holeSize * 0.2, 16, 128);
    const outerRingMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.lensing) },
        intensity: { value: 0.3 },
      },
      vertexShader: `
        varying vec3 vNormal;

        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float intensity;
        varying vec3 vNormal;

        void main() {
          float alpha = 0.15 * intensity;
          gl_FragColor = vec4(color * intensity, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.lensingRingOuter = new THREE.Mesh(outerRingGeometry, outerRingMaterial);
    this.lensingRingOuter.rotation.x = Math.PI / 2;
    this.lensingRingOuter.renderOrder = 18;
    this.scene.add(this.lensingRingOuter);
  }

  private createEventHorizon(
    holeSize: number,
    colors: (typeof COLOR_SCHEMES)["interstellar"],
  ): void {
    if (!this.scene) return;

    // The actual black hole - pure black sphere
    const holeGeometry = new THREE.SphereGeometry(holeSize, 64, 64);
    const holeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: false,
    });

    this.eventHorizon = new THREE.Mesh(holeGeometry, holeMaterial);
    this.eventHorizon.renderOrder = 50; // Render on top to occlude
    this.scene.add(this.eventHorizon);

    // Subtle edge glow around event horizon
    const glowGeometry = new THREE.SphereGeometry(holeSize * 1.02, 64, 64);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.glow) },
        viewVector: { value: new THREE.Vector3() },
        intensity: { value: 0.5 },
      },
      vertexShader: `
        uniform vec3 viewVector;
        varying float vIntensity;

        void main() {
          vec3 vNormal = normalize(normalMatrix * normal);
          vec3 vNormel = normalize(normalMatrix * viewVector);
          vIntensity = pow(1.0 - abs(dot(vNormal, vNormel)), 3.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float intensity;
        varying float vIntensity;

        void main() {
          vec3 glow = color * vIntensity * intensity;
          float alpha = vIntensity * 0.5 * intensity;
          gl_FragColor = vec4(glow, alpha);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.eventHorizonGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.eventHorizonGlow.renderOrder = 45;
    this.scene.add(this.eventHorizonGlow);
  }

  private createInfallingParticles(
    holeSize: number,
    colors: (typeof COLOR_SCHEMES)["interstellar"],
  ): void {
    if (!this.scene) return;

    this.infallingParticles = [];
    const count = Math.floor(this.config.particleCount * 0.3);

    for (let i = 0; i < count; i++) {
      this.spawnInfallingParticle(holeSize, colors);
    }

    this.infallingGeometry = new THREE.BufferGeometry();
    this.updateInfallingGeometry();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.diskInner) },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;
        varying float vAlpha;
        uniform float pixelRatio;

        void main() {
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (100.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float alpha = (1.0 - dist * 2.0) * vAlpha;

          // Bright core with color falloff
          vec3 finalColor = mix(color, vec3(1.0), pow(1.0 - dist * 2.0, 3.0));

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.infallingPoints = new THREE.Points(this.infallingGeometry, material);
    this.infallingPoints.renderOrder = 15;
    this.scene.add(this.infallingPoints);
  }

  private spawnInfallingParticle(
    holeSize: number,
    _colors: (typeof COLOR_SCHEMES)["interstellar"],
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const startRadius = holeSize * 4 + Math.random() * holeSize * 2;
    const y = (Math.random() - 0.5) * 3;

    this.infallingParticles.push({
      position: new THREE.Vector3(Math.cos(angle) * startRadius, y, Math.sin(angle) * startRadius),
      velocity: new THREE.Vector3(),
      angle,
      radius: startRadius,
      spiralSpeed: 0.5 + Math.random() * 0.5,
      life: 1.0,
      size: 1 + Math.random() * 2,
    });
  }

  private updateInfallingGeometry(): void {
    if (!this.infallingGeometry) return;

    const positions: number[] = [];
    const sizes: number[] = [];
    const alphas: number[] = [];

    for (const p of this.infallingParticles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      sizes.push(p.size);
      alphas.push(p.life);
    }

    this.infallingGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.infallingGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.infallingGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, holeSize, diskIntensity, lensing, rotationSpeed } = this.config;

    this.time += deltaTime;

    // Smooth audio values for less jittery response
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;
    this.volumeSmooth += (volume - this.volumeSmooth) * smoothing;

    const bassBoost = Math.pow(this.bassSmooth, 0.7) * sensitivity;
    const midBoost = Math.pow(this.midSmooth, 0.7) * sensitivity;
    const trebleBoost = Math.pow(this.trebleSmooth, 0.7) * sensitivity;
    const volumeBoost = Math.pow(this.volumeSmooth, 0.5) * sensitivity;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.interstellar;

    // Update event horizon pulse
    if (this.eventHorizon) {
      const pulseScale = 1.0 + bassBoost * 0.05;
      this.eventHorizon.scale.setScalar(pulseScale);
    }

    if (this.eventHorizonGlow) {
      const mat = this.eventHorizonGlow.material as THREE.ShaderMaterial;
      mat.uniforms.viewVector.value = new THREE.Vector3().subVectors(
        this.camera.position,
        this.eventHorizonGlow.position,
      );
      mat.uniforms.intensity.value = 0.3 + bassBoost * 0.5;
      this.eventHorizonGlow.scale.setScalar(1.0 + bassBoost * 0.08);
    }

    // Update accretion disk
    this.updateAccretionDisk(
      deltaTime,
      bassBoost,
      midBoost,
      trebleBoost,
      volumeBoost,
      rotationSpeed,
    );

    // Update disk glow
    if (this.diskGlowTop) {
      const mat = this.diskGlowTop.material as THREE.ShaderMaterial;
      mat.uniforms.glowIntensity.value = diskIntensity * (0.7 + volumeBoost * 0.5);
    }
    if (this.diskGlowBottom) {
      const mat = this.diskGlowBottom.material as THREE.ShaderMaterial;
      mat.uniforms.glowIntensity.value = diskIntensity * (0.5 + volumeBoost * 0.3);
    }

    // Update lensing ring
    if (this.lensingRing) {
      const mat = this.lensingRing.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.intensity.value = lensing * (0.8 + bassBoost * 0.4);
      this.lensingRing.scale.setScalar(1.0 + bassBoost * 0.03);
    }
    if (this.lensingRingOuter) {
      const mat = this.lensingRingOuter.material as THREE.ShaderMaterial;
      mat.uniforms.intensity.value = lensing * (0.2 + bassBoost * 0.2);
      this.lensingRingOuter.scale.setScalar(1.0 + bassBoost * 0.05);
    }

    // Update infalling particles
    this.updateInfallingParticles(deltaTime, bassBoost, trebleBoost, holeSize, colors);

    // Update starfield
    this.updateStarfield(deltaTime, trebleBoost, bassBoost, holeSize);

    // Animate camera
    const cameraRadius = 65 - bassBoost * 5;
    const cameraAngle = this.time * 0.03 * rotationSpeed;
    this.camera.position.x = Math.sin(cameraAngle) * cameraRadius * 0.3;
    this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
    this.camera.position.y = 20 + Math.sin(this.time * 0.1) * 5;
    this.camera.lookAt(0, 0, 0);

    this.rendererThree.render(this.scene, this.camera);
  }

  private updateAccretionDisk(
    deltaTime: number,
    bassBoost: number,
    midBoost: number,
    trebleBoost: number,
    volumeBoost: number,
    rotationSpeed: number,
  ): void {
    if (!this.accretionDisk || !this.accretionGeometry) return;

    const innerRadius = this.config.holeSize * 1.5;
    const pullStrength = 0.5 + bassBoost * 1.5; // Bass increases pull

    for (const p of this.accretionParticles) {
      // Keplerian rotation with audio modulation
      const orbitSpeed = p.speed * (1.0 + midBoost * 0.5) * rotationSpeed;
      p.angle += orbitSpeed * deltaTime;

      // Slight inward spiral
      p.radius -= (deltaTime * 0.1 * pullStrength) / (p.radius / innerRadius);

      // Respawn if too close to center
      if (p.radius < innerRadius) {
        p.radius = this.config.holeSize * 4 + Math.random() * this.config.holeSize;
        p.angle = Math.random() * Math.PI * 2;
        p.life = 1.0;
      }

      // Update position
      p.position.x = Math.cos(p.angle) * p.radius;
      p.position.z = Math.sin(p.angle) * p.radius;

      // Vertical bobbing
      p.position.y =
        Math.sin(p.angle * 3 + this.time) * (0.5 + (p.radius / (this.config.holeSize * 5)) * 2);

      // Update life/alpha based on position and volume
      const t = (p.radius - innerRadius) / (this.config.holeSize * 3.5);
      p.life = Math.min(1.0, (0.5 + volumeBoost * 0.8) * (1 - Math.pow(t, 3)));
    }

    // Update material uniforms
    const mat = this.accretionDisk.material as THREE.ShaderMaterial;
    mat.uniforms.time.value = this.time;
    mat.uniforms.intensity.value = this.config.diskIntensity * (0.8 + volumeBoost * 0.4);

    this.updateAccretionGeometry();
  }

  private updateInfallingParticles(
    deltaTime: number,
    bassBoost: number,
    trebleBoost: number,
    holeSize: number,
    colors: (typeof COLOR_SCHEMES)["interstellar"],
  ): void {
    if (!this.infallingGeometry) return;

    const pullStrength = 1.0 + bassBoost * 2.0;
    const spawnRate = 0.5 + trebleBoost * 2.0;

    for (let i = this.infallingParticles.length - 1; i >= 0; i--) {
      const p = this.infallingParticles[i];

      // Spiral inward
      p.angle += p.spiralSpeed * deltaTime * (1 + (holeSize * 3) / p.radius);
      p.radius -= deltaTime * pullStrength * (1 + (holeSize * 2) / p.radius);

      // Update position
      p.position.x = Math.cos(p.angle) * p.radius;
      p.position.z = Math.sin(p.angle) * p.radius;

      // Flatten toward disk plane as approaching
      p.position.y *= 0.995;

      // Fade as approaching event horizon
      const distToHorizon = p.radius - holeSize;
      p.life = Math.min(1.0, distToHorizon / (holeSize * 2));

      // Remove if past event horizon
      if (p.radius < holeSize * 0.9) {
        this.infallingParticles.splice(i, 1);
      }
    }

    // Spawn new particles based on treble
    const targetCount = Math.floor(this.config.particleCount * 0.3 * (0.5 + spawnRate * 0.5));
    while (this.infallingParticles.length < targetCount) {
      this.spawnInfallingParticle(holeSize, colors);
    }

    this.updateInfallingGeometry();
  }

  private updateStarfield(
    deltaTime: number,
    trebleBoost: number,
    bassBoost: number,
    holeSize: number,
  ): void {
    if (!this.starGeometry || !this.starField) return;

    const positions = this.starGeometry.attributes.position.array as Float32Array;
    const sizes = this.starGeometry.attributes.size.array as Float32Array;

    const lensingRadius = holeSize * 8;
    const lensingStrength = this.config.lensing * (1 + bassBoost * 0.5);

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];

      // Twinkle effect modulated by treble
      star.twinklePhase += star.twinkleSpeed * deltaTime * (1 + trebleBoost * 2);
      const twinkle = 0.6 + 0.4 * Math.sin(star.twinklePhase);

      // Gravitational lensing - warp star positions near the black hole
      const dist = star.originalPosition.length();

      if (dist < lensingRadius * 2) {
        const dir = star.originalPosition.clone().normalize();
        const lensFactor =
          Math.pow(1 - Math.min(dist / (lensingRadius * 2), 1), 2) * lensingStrength;

        // Warp outward (simulating light bending around the hole)
        const warpedPos = star.originalPosition
          .clone()
          .add(dir.multiplyScalar(lensFactor * holeSize * 2));

        // Rotate slightly around the hole
        const warpAngle = lensFactor * 0.3 * Math.sin(this.time * 0.5);
        const cos = Math.cos(warpAngle);
        const sin = Math.sin(warpAngle);
        const x = warpedPos.x * cos - warpedPos.z * sin;
        const z = warpedPos.x * sin + warpedPos.z * cos;

        positions[i * 3] = x;
        positions[i * 3 + 1] = warpedPos.y;
        positions[i * 3 + 2] = z;
      }

      // Update size with twinkle
      sizes[i] = star.size * twinkle * (0.8 + trebleBoost * 0.4);
    }

    this.starGeometry.attributes.position.needsUpdate = true;
    this.starGeometry.attributes.size.needsUpdate = true;

    // Slow rotation of entire starfield
    this.starField.rotation.y += deltaTime * 0.005 * this.config.rotationSpeed;
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }

    if (this.rendererThree) {
      this.rendererThree.setSize(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const needsRecreate =
      ((config as BlackHoleConfig).colorScheme !== undefined &&
        (config as BlackHoleConfig).colorScheme !== this.config.colorScheme) ||
      ((config as BlackHoleConfig).holeSize !== undefined &&
        (config as BlackHoleConfig).holeSize !== this.config.holeSize) ||
      ((config as BlackHoleConfig).particleCount !== undefined &&
        (config as BlackHoleConfig).particleCount !== this.config.particleCount) ||
      ((config as BlackHoleConfig).starCount !== undefined &&
        (config as BlackHoleConfig).starCount !== this.config.starCount);

    this.config = { ...this.config, ...config } as BlackHoleConfig;

    if (needsRecreate && this.scene) {
      this.createBlackHole();
    }
  }

  destroy(): void {
    this.clearScene();

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.eventHorizon = null;
    this.eventHorizonGlow = null;
    this.accretionDisk = null;
    this.accretionGeometry = null;
    this.accretionParticles = [];
    this.lensingRing = null;
    this.lensingRingOuter = null;
    this.infallingPoints = null;
    this.infallingGeometry = null;
    this.infallingParticles = [];
    this.starField = null;
    this.starGeometry = null;
    this.stars = [];
    this.diskGlowTop = null;
    this.diskGlowBottom = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Audio Sensitivity",
      },
      holeSize: { type: "number", min: 4, max: 15, step: 1, default: 8, label: "Black Hole Size" },
      diskIntensity: {
        type: "number",
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Disk Intensity",
      },
      colorScheme: {
        type: "select",
        options: [
          { value: "interstellar", label: "Interstellar" },
          { value: "cosmic", label: "Cosmic Blue" },
          { value: "inferno", label: "Inferno" },
          { value: "void", label: "Void Purple" },
          { value: "ice", label: "Ice" },
          { value: "golden", label: "Golden" },
        ],
        default: "interstellar",
        label: "Color Scheme",
      },
      particleCount: {
        type: "number",
        min: 1000,
        max: 8000,
        step: 500,
        default: 3000,
        label: "Particle Count",
      },
      lensing: {
        type: "number",
        min: 0,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Lensing Intensity",
      },
      starCount: {
        type: "number",
        min: 500,
        max: 5000,
        step: 250,
        default: 2000,
        label: "Star Count",
      },
      rotationSpeed: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.4,
        label: "Rotation Speed",
      },
    };
  }
}
