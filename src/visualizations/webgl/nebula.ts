import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

const COLOR_SCHEMES: Record<
  string,
  {
    core: number;
    outer: number;
    dust: number;
    stars: number;
    glow: number;
    accent: number;
  }
> = {
  orion: {
    core: 0xff6b9d,
    outer: 0x4a0080,
    dust: 0xff9ecf,
    stars: 0xffffff,
    glow: 0xff00ff,
    accent: 0x00ffff,
  },
  carina: {
    core: 0xffa500,
    outer: 0x8b0000,
    dust: 0xffd700,
    stars: 0xffffcc,
    glow: 0xff4500,
    accent: 0x00ff00,
  },
  eagle: {
    core: 0x00ff88,
    outer: 0x004466,
    dust: 0x66ffcc,
    stars: 0xe0ffff,
    glow: 0x00ffaa,
    accent: 0xff00ff,
  },
  crab: {
    core: 0x00ccff,
    outer: 0x000066,
    dust: 0x88ddff,
    stars: 0xffffff,
    glow: 0x0088ff,
    accent: 0xff6600,
  },
  helix: {
    core: 0xff0066,
    outer: 0x330066,
    dust: 0xff66aa,
    stars: 0xffccff,
    glow: 0xff00aa,
    accent: 0x00ffff,
  },
  rosette: {
    core: 0xff3366,
    outer: 0x660033,
    dust: 0xff99aa,
    stars: 0xffeeff,
    glow: 0xff0066,
    accent: 0xffff00,
  },
};

interface NebulaParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  baseRadius: number;
  angle: number;
  angleVelocity: number;
  layer: number;
  size: number;
  color: THREE.Color;
  life: number;
  phase: number;
}

interface DustParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  alpha: number;
  drift: number;
}

interface NebulaConfig extends VisualizationConfig {
  colorScheme: string;
  particleCount: number;
  dustCount: number;
  swirl: number;
  turbulence: number;
  coreIntensity: number;
  layerCount: number;
}

export class NebulaVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "nebula",
    name: "Nebula",
    author: "Vizec",
    description: "Swirling cosmic gas clouds with particle dust that reacts to audio",
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

  // Nebula cloud particles
  private nebulaParticles: NebulaParticle[] = [];
  private nebulaGeometry: THREE.BufferGeometry | null = null;
  private nebulaMesh: THREE.Points | null = null;

  // Dust particles
  private dustParticles: DustParticle[] = [];
  private dustGeometry: THREE.BufferGeometry | null = null;
  private dustMesh: THREE.Points | null = null;

  // Volumetric planes for depth
  private volumePlanes: THREE.Mesh[] = [];

  // Core glow
  private coreGlow: THREE.Mesh | null = null;
  private coreLight: THREE.PointLight | null = null;

  // Background stars
  private starField: THREE.Points | null = null;

  private config: NebulaConfig = {
    sensitivity: 1.0,
    colorScheme: "orion",
    particleCount: 5000,
    dustCount: 2000,
    swirl: 1.0,
    turbulence: 1.0,
    coreIntensity: 1.0,
    layerCount: 5,
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

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
    this.camera.position.set(0, 0, 100);
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
    this.rendererThree.sortObjects = true;
    container.appendChild(this.rendererThree.domElement);

    this.createNebula();
  }

  private createNebula(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.orion;

    this.clearScene();

    // Create background starfield
    this.createStarfield(colors);

    // Create volumetric planes for depth effect
    this.createVolumePlanes(colors);

    // Create main nebula particle cloud
    this.createNebulaCloud(colors);

    // Create dust particles
    this.createDustParticles(colors);

    // Create core glow
    this.createCoreGlow(colors);
  }

  private clearScene(): void {
    if (!this.scene) return;

    // Remove all objects
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
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
      this.scene.remove(obj);
    }

    this.volumePlanes = [];
    this.nebulaParticles = [];
    this.dustParticles = [];
  }

  private createStarfield(colors: (typeof COLOR_SCHEMES)["orion"]): void {
    if (!this.scene) return;

    const starCount = 1000;
    const positions: number[] = [];
    const sizes: number[] = [];

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 400 + Math.random() * 400;

      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      );
      sizes.push(0.5 + Math.random() * 1.5);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.stars) },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        uniform float pixelRatio;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (200.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          gl_FragColor = vec4(color, alpha * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.starField = new THREE.Points(geometry, material);
    this.starField.renderOrder = -100;
    this.scene.add(this.starField);
  }

  private createVolumePlanes(colors: (typeof COLOR_SCHEMES)["orion"]): void {
    if (!this.scene) return;

    const { layerCount } = this.config;
    const coreColor = new THREE.Color(colors.core);
    const outerColor = new THREE.Color(colors.outer);

    for (let i = 0; i < layerCount; i++) {
      const t = i / (layerCount - 1);
      const size = 60 + t * 80;
      const z = -40 + t * 80;

      const geometry = new THREE.PlaneGeometry(size, size);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          coreColor: { value: coreColor },
          outerColor: { value: outerColor },
          time: { value: 0 },
          intensity: { value: 1.0 },
          layer: { value: t },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 coreColor;
          uniform vec3 outerColor;
          uniform float time;
          uniform float intensity;
          uniform float layer;
          varying vec2 vUv;

          // Simplex noise functions
          vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
          vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

          float snoise(vec2 v) {
            const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
            vec2 i  = floor(v + dot(v, C.yy));
            vec2 x0 = v -   i + dot(i, C.xx);
            vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;
            i = mod289(i);
            vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m; m = m*m;
            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;
            m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
          }

          void main() {
            vec2 center = vUv - vec2(0.5);
            float dist = length(center) * 2.0;

            // Swirling noise pattern
            float angle = atan(center.y, center.x);
            float noise1 = snoise(vec2(dist * 3.0 + time * 0.3, angle * 2.0 + layer));
            float noise2 = snoise(vec2(dist * 5.0 - time * 0.2, angle * 3.0 - layer * 2.0));
            float noise3 = snoise(vec2(dist * 2.0 + time * 0.1, angle * 4.0 + layer * 3.0));

            float swirl = (noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2);

            // Radial falloff with swirl distortion
            float falloff = 1.0 - smoothstep(0.0, 0.7 + swirl * 0.2, dist);
            falloff = pow(falloff, 1.5);

            // Mix colors based on distance and noise
            vec3 color = mix(coreColor, outerColor, dist + swirl * 0.3);
            color = mix(color, coreColor * 1.5, (1.0 - dist) * (0.5 + swirl * 0.5));

            float alpha = falloff * intensity * (0.15 + layer * 0.1);
            alpha *= 0.5 + swirl * 0.5;

            gl_FragColor = vec4(color * intensity, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const plane = new THREE.Mesh(geometry, material);
      plane.position.z = z;
      plane.rotation.z = (i / layerCount) * Math.PI * 0.5;
      plane.renderOrder = i;
      this.volumePlanes.push(plane);
      this.scene.add(plane);
    }
  }

  private createNebulaCloud(colors: (typeof COLOR_SCHEMES)["orion"]): void {
    if (!this.scene) return;

    const { particleCount } = this.config;
    this.nebulaParticles = [];

    const coreColor = new THREE.Color(colors.core);
    const outerColor = new THREE.Color(colors.outer);
    const glowColor = new THREE.Color(colors.glow);

    for (let i = 0; i < particleCount; i++) {
      const layer = Math.floor(Math.random() * this.config.layerCount);
      const baseRadius = 5 + Math.pow(Math.random(), 0.5) * 45;
      const angle = Math.random() * Math.PI * 2;

      const t = baseRadius / 50;
      const color = new THREE.Color().lerpColors(
        coreColor,
        Math.random() > 0.7 ? glowColor : outerColor,
        t + (Math.random() - 0.5) * 0.3,
      );

      const x = Math.cos(angle) * baseRadius;
      const y = Math.sin(angle) * baseRadius;
      const z = (layer - this.config.layerCount / 2) * 15 + (Math.random() - 0.5) * 10;

      this.nebulaParticles.push({
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(),
        baseRadius,
        angle,
        angleVelocity:
          ((0.1 + Math.random() * 0.2) * (Math.random() > 0.5 ? 1 : -1)) / Math.sqrt(baseRadius),
        layer,
        size: 1 + Math.random() * 3 * (1 - t),
        color,
        life: Math.random(),
        phase: Math.random() * Math.PI * 2,
      });
    }

    this.nebulaGeometry = new THREE.BufferGeometry();
    this.updateNebulaGeometry();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        attribute float alpha;
        varying vec3 vColor;
        varying float vAlpha;
        uniform float pixelRatio;

        void main() {
          vColor = color;
          vAlpha = alpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (150.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;

          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha = pow(alpha, 1.2) * vAlpha;

          vec3 finalColor = vColor + vColor * pow(alpha, 2.0) * 0.3;
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.nebulaMesh = new THREE.Points(this.nebulaGeometry, material);
    this.nebulaMesh.renderOrder = 50;
    this.scene.add(this.nebulaMesh);
  }

  private updateNebulaGeometry(): void {
    if (!this.nebulaGeometry) return;

    const positions: number[] = [];
    const sizes: number[] = [];
    const colors: number[] = [];
    const alphas: number[] = [];

    for (const p of this.nebulaParticles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      sizes.push(p.size);
      colors.push(p.color.r, p.color.g, p.color.b);
      alphas.push(p.life);
    }

    this.nebulaGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.nebulaGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.nebulaGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.nebulaGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  }

  private createDustParticles(colors: (typeof COLOR_SCHEMES)["orion"]): void {
    if (!this.scene) return;

    const { dustCount } = this.config;
    this.dustParticles = [];

    for (let i = 0; i < dustCount; i++) {
      const radius = 10 + Math.random() * 80;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI * 0.6;

      this.dustParticles.push({
        position: new THREE.Vector3(
          Math.cos(theta) * Math.cos(phi) * radius,
          Math.sin(phi) * radius * 0.5,
          Math.sin(theta) * Math.cos(phi) * radius,
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ),
        size: 0.3 + Math.random() * 1.5,
        alpha: 0.3 + Math.random() * 0.7,
        drift: Math.random() * Math.PI * 2,
      });
    }

    this.dustGeometry = new THREE.BufferGeometry();
    this.updateDustGeometry();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.dust) },
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

          float alpha = (1.0 - dist * 2.0) * vAlpha * 0.5;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.dustMesh = new THREE.Points(this.dustGeometry, material);
    this.dustMesh.renderOrder = 40;
    this.scene.add(this.dustMesh);
  }

  private updateDustGeometry(): void {
    if (!this.dustGeometry) return;

    const positions: number[] = [];
    const sizes: number[] = [];
    const alphas: number[] = [];

    for (const p of this.dustParticles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      sizes.push(p.size);
      alphas.push(p.alpha);
    }

    this.dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.dustGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.dustGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));
  }

  private createCoreGlow(colors: (typeof COLOR_SCHEMES)["orion"]): void {
    if (!this.scene) return;

    // Central bright glow
    const glowGeometry = new THREE.SphereGeometry(15, 32, 32);
    const glowMaterial = new THREE.ShaderMaterial({
      uniforms: {
        coreColor: { value: new THREE.Color(colors.core) },
        glowColor: { value: new THREE.Color(colors.glow) },
        intensity: { value: 1.0 },
        time: { value: 0 },
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
        uniform vec3 coreColor;
        uniform vec3 glowColor;
        uniform float intensity;
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          float dist = length(vPosition) / 15.0;
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);

          vec3 color = mix(coreColor * 2.0, glowColor, fresnel);
          float alpha = (1.0 - dist) * 0.4 * intensity + fresnel * 0.3 * intensity;

          // Pulsing effect
          alpha *= 0.8 + 0.2 * sin(time * 2.0);

          gl_FragColor = vec4(color * intensity, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.coreGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.coreGlow.renderOrder = 60;
    this.scene.add(this.coreGlow);

    // Point light for illumination
    this.coreLight = new THREE.PointLight(colors.core, 1, 200);
    this.coreLight.position.set(0, 0, 0);
    this.scene.add(this.coreLight);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, swirl, turbulence, coreIntensity } = this.config;

    this.time += deltaTime;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;
    this.volumeSmooth += (volume - this.volumeSmooth) * smoothing;

    const bassBoost = Math.pow(this.bassSmooth, 0.7) * sensitivity;
    const midBoost = Math.pow(this.midSmooth, 0.7) * sensitivity;
    const trebleBoost = Math.pow(this.trebleSmooth, 0.7) * sensitivity;
    const volumeBoost = Math.pow(this.volumeSmooth, 0.5) * sensitivity;

    // Update volumetric planes
    this.volumePlanes.forEach((plane, i) => {
      const mat = plane.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time * swirl;
      mat.uniforms.intensity.value = coreIntensity * (0.8 + bassBoost * 0.5);

      // Rotation based on audio
      plane.rotation.z += deltaTime * 0.05 * swirl * (1 + midBoost * 0.5) * (i % 2 === 0 ? 1 : -1);

      // Scale pulse on bass
      const scalePulse = 1 + bassBoost * 0.1 * (i / this.volumePlanes.length);
      plane.scale.setScalar(scalePulse);
    });

    // Update nebula particles
    this.updateNebulaParticles(deltaTime, bassBoost, midBoost, trebleBoost, volumeBoost);

    // Update dust particles
    this.updateDustParticles(deltaTime, bassBoost, trebleBoost, turbulence);

    // Update core glow
    if (this.coreGlow) {
      const mat = this.coreGlow.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.intensity.value = coreIntensity * (0.7 + volumeBoost * 0.6);

      const coreScale = 1 + bassBoost * 0.3;
      this.coreGlow.scale.setScalar(coreScale);
    }

    if (this.coreLight) {
      this.coreLight.intensity = coreIntensity * (0.5 + volumeBoost * 1.0);
    }

    // Update starfield
    if (this.starField) {
      this.starField.rotation.y += deltaTime * 0.01 * swirl;
      this.starField.rotation.x += deltaTime * 0.005 * swirl;
    }

    // Camera orbit
    const cameraAngle = this.time * 0.05 * swirl;
    const cameraRadius = 100 - bassBoost * 10;
    this.camera.position.x = Math.sin(cameraAngle) * cameraRadius * 0.3;
    this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
    this.camera.position.y = Math.sin(this.time * 0.03) * 20;
    this.camera.lookAt(0, 0, 0);

    this.rendererThree.render(this.scene, this.camera);
  }

  private updateNebulaParticles(
    deltaTime: number,
    bassBoost: number,
    midBoost: number,
    trebleBoost: number,
    volumeBoost: number,
  ): void {
    if (!this.nebulaGeometry) return;

    const { swirl, turbulence } = this.config;

    for (const p of this.nebulaParticles) {
      // Swirling motion
      p.angle += p.angleVelocity * deltaTime * swirl * (1 + midBoost * 0.5);

      // Turbulence based on treble
      const turbX = Math.sin(this.time * 2 + p.phase) * turbulence * trebleBoost;
      const turbY = Math.cos(this.time * 2.5 + p.phase) * turbulence * trebleBoost;

      // Update position
      const radius = p.baseRadius * (1 + bassBoost * 0.2);
      p.position.x = Math.cos(p.angle) * radius + turbX;
      p.position.y = Math.sin(p.angle) * radius + turbY;

      // Breathing effect on z
      p.position.z += Math.sin(this.time + p.phase) * 0.1 * turbulence;

      // Update life/alpha
      p.life = 0.4 + volumeBoost * 0.6 + Math.sin(this.time * 3 + p.phase) * 0.2;
    }

    this.updateNebulaGeometry();
  }

  private updateDustParticles(
    deltaTime: number,
    bassBoost: number,
    trebleBoost: number,
    turbulence: number,
  ): void {
    if (!this.dustGeometry) return;

    for (const p of this.dustParticles) {
      // Drift motion
      p.drift += deltaTime * 0.5;
      p.position.x += Math.sin(p.drift) * 0.1 * turbulence;
      p.position.y += Math.cos(p.drift * 1.3) * 0.1 * turbulence;
      p.position.z += Math.sin(p.drift * 0.7) * 0.1 * turbulence;

      // Push outward on bass
      const dist = p.position.length();
      if (dist > 0) {
        const pushForce = bassBoost * 0.5;
        p.position.x += (p.position.x / dist) * pushForce;
        p.position.y += (p.position.y / dist) * pushForce;
        p.position.z += (p.position.z / dist) * pushForce;
      }

      // Wrap around if too far
      if (dist > 100) {
        const scale = 20 / dist;
        p.position.multiplyScalar(scale);
      }

      // Alpha modulation
      p.alpha = 0.3 + trebleBoost * 0.5;
    }

    this.updateDustGeometry();
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
      ((config as NebulaConfig).colorScheme !== undefined &&
        (config as NebulaConfig).colorScheme !== this.config.colorScheme) ||
      ((config as NebulaConfig).particleCount !== undefined &&
        (config as NebulaConfig).particleCount !== this.config.particleCount) ||
      ((config as NebulaConfig).dustCount !== undefined &&
        (config as NebulaConfig).dustCount !== this.config.dustCount) ||
      ((config as NebulaConfig).layerCount !== undefined &&
        (config as NebulaConfig).layerCount !== this.config.layerCount);

    this.config = { ...this.config, ...config } as NebulaConfig;

    if (needsRecreate && this.scene) {
      this.createNebula();
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
    this.nebulaGeometry = null;
    this.nebulaMesh = null;
    this.dustGeometry = null;
    this.dustMesh = null;
    this.coreGlow = null;
    this.coreLight = null;
    this.starField = null;
    this.volumePlanes = [];
    this.nebulaParticles = [];
    this.dustParticles = [];
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
      colorScheme: {
        type: "select",
        options: [
          { value: "orion", label: "Orion" },
          { value: "carina", label: "Carina" },
          { value: "eagle", label: "Eagle" },
          { value: "crab", label: "Crab" },
          { value: "helix", label: "Helix" },
          { value: "rosette", label: "Rosette" },
        ],
        default: "orion",
        label: "Color Scheme",
      },
      particleCount: {
        type: "number",
        min: 1000,
        max: 10000,
        step: 500,
        default: 5000,
        label: "Cloud Particles",
      },
      dustCount: {
        type: "number",
        min: 500,
        max: 5000,
        step: 250,
        default: 2000,
        label: "Dust Particles",
      },
      swirl: { type: "number", min: 0.2, max: 3, step: 0.1, default: 1.0, label: "Swirl Speed" },
      turbulence: { type: "number", min: 0, max: 3, step: 0.1, default: 1.0, label: "Turbulence" },
      coreIntensity: {
        type: "number",
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Core Intensity",
      },
      layerCount: { type: "number", min: 3, max: 8, step: 1, default: 5, label: "Volume Layers" },
    };
  }
}
