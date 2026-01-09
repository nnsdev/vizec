import * as THREE from 'three';
import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

const COLOR_SCHEMES: Record<string, {
  inner: number;
  outer: number;
  rings: number;
  energy: number;
  stars: number;
  glow: number;
}> = {
  blueShift: { inner: 0x0066ff, outer: 0x00ccff, rings: 0x4488ff, energy: 0x00ffff, stars: 0xffffff, glow: 0x0088ff },
  redShift: { inner: 0xff3300, outer: 0xff6600, rings: 0xff4444, energy: 0xffaa00, stars: 0xffffcc, glow: 0xff4400 },
  quantum: { inner: 0xff00ff, outer: 0x8800ff, rings: 0xaa00ff, energy: 0xff00aa, stars: 0xffccff, glow: 0xcc00ff },
  emerald: { inner: 0x00ff66, outer: 0x00ff00, rings: 0x44ff88, energy: 0x88ffaa, stars: 0xccffcc, glow: 0x00ff44 },
  void: { inner: 0x220044, outer: 0x440088, rings: 0x6600aa, energy: 0x8800cc, stars: 0xccccff, glow: 0x4400aa },
  golden: { inner: 0xffaa00, outer: 0xffcc00, rings: 0xffdd44, energy: 0xffff88, stars: 0xffffee, glow: 0xffbb00 },
};

interface TunnelRing {
  z: number;
  rotation: number;
  scale: number;
  distortion: number;
  phase: number;
}

interface EnergyParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angle: number;
  radius: number;
  speed: number;
  size: number;
  life: number;
}

interface WormholeConfig extends VisualizationConfig {
  colorScheme: string;
  tunnelLength: number;
  ringCount: number;
  speed: number;
  distortion: number;
  energyParticles: number;
  spiralTightness: number;
}

export class WormholeVisualization implements Visualization {
  id = 'wormhole';
  name = 'Wormhole';
  author = 'Vizec';
  description = 'Spiraling tunnel through spacetime with camera flying through a twisting vortex';
  renderer = 'threejs' as const;
  transitionType = 'crossfade' as const;

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  // Tunnel rings
  private tunnelRings: TunnelRing[] = [];
  private ringMeshes: THREE.Mesh[] = [];
  private ringGroup: THREE.Group | null = null;

  // Energy particles
  private energyParticles: EnergyParticle[] = [];
  private energyGeometry: THREE.BufferGeometry | null = null;
  private energyMesh: THREE.Points | null = null;

  // Tunnel walls
  private tunnelMesh: THREE.Mesh | null = null;
  private tunnelGeometry: THREE.TubeGeometry | null = null;

  // Background stars
  private starField: THREE.Points | null = null;

  // Central event horizon
  private eventHorizon: THREE.Mesh | null = null;

  private config: WormholeConfig = {
    sensitivity: 1.0,
    colorScheme: 'blueShift',
    tunnelLength: 200,
    ringCount: 40,
    speed: 1.0,
    distortion: 1.0,
    energyParticles: 1500,
    spiralTightness: 2.0,
  };

  private time = 0;
  private travelDistance = 0;
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

    // Create camera inside tunnel
    this.camera = new THREE.PerspectiveCamera(90, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 50);
    this.camera.lookAt(0, 0, -100);

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

    this.createWormhole();
  }

  private createWormhole(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.blueShift;

    this.clearScene();

    // Create distant starfield
    this.createStarfield(colors);

    // Create tunnel structure
    this.createTunnel(colors);

    // Create ring markers
    this.createTunnelRings(colors);

    // Create energy particles
    this.createEnergyParticles(colors);

    // Create event horizon at far end
    this.createEventHorizon(colors);
  }

  private clearScene(): void {
    if (!this.scene) return;

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

    this.ringMeshes = [];
    this.tunnelRings = [];
    this.energyParticles = [];
    this.ringGroup = null;
  }

  private createStarfield(colors: typeof COLOR_SCHEMES['blueShift']): void {
    if (!this.scene) return;

    const starCount = 500;
    const positions: number[] = [];
    const sizes: number[] = [];

    for (let i = 0; i < starCount; i++) {
      // Stars in a cylinder around the tunnel entrance
      const angle = Math.random() * Math.PI * 2;
      const radius = 100 + Math.random() * 300;
      const z = 50 + Math.random() * 100;

      positions.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        z
      );
      sizes.push(0.5 + Math.random() * 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

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
          gl_PointSize = size * pixelRatio * (150.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          if (dist > 0.5) discard;
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          gl_FragColor = vec4(color, alpha * 0.7);
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

  private createTunnel(colors: typeof COLOR_SCHEMES['blueShift']): void {
    if (!this.scene) return;

    const { tunnelLength, spiralTightness } = this.config;

    // Create spiral path for tube
    const points: THREE.Vector3[] = [];
    const segments = 200;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const z = 50 - t * tunnelLength;

      // Spiral distortion increases toward the center
      const spiralIntensity = Math.pow(t, 1.5) * 10 * spiralTightness;
      const angle = t * Math.PI * 4 * spiralTightness;

      const x = Math.sin(angle) * spiralIntensity;
      const y = Math.cos(angle) * spiralIntensity;

      points.push(new THREE.Vector3(x, y, z));
    }

    const path = new THREE.CatmullRomCurve3(points);

    // Radius decreases toward center
    const radiusFunc = (t: number) => 30 - t * 20;

    this.tunnelGeometry = new THREE.TubeGeometry(path, 100, 30, 32, false);

    const tunnelMaterial = new THREE.ShaderMaterial({
      uniforms: {
        innerColor: { value: new THREE.Color(colors.inner) },
        outerColor: { value: new THREE.Color(colors.outer) },
        time: { value: 0 },
        distortion: { value: this.config.distortion },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          vPosition = position;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 innerColor;
        uniform vec3 outerColor;
        uniform float time;
        uniform float distortion;
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          // Energy waves along the tunnel
          float wave = sin(vUv.x * 50.0 - time * 5.0) * 0.5 + 0.5;
          wave *= sin(vUv.y * 20.0 + time * 3.0) * 0.5 + 0.5;

          // Distance-based color mixing
          float depth = vUv.x;
          vec3 color = mix(outerColor, innerColor, depth);

          // Add energy wave color
          color += color * wave * 0.5 * distortion;

          // Fresnel-like rim lighting
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
          color += color * fresnel * 0.5;

          // Alpha based on depth (more transparent near edges)
          float alpha = 0.3 + depth * 0.3 + wave * 0.2;
          alpha *= fresnel * 0.5 + 0.5;

          gl_FragColor = vec4(color, alpha * 0.6);
        }
      `,
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.tunnelMesh = new THREE.Mesh(this.tunnelGeometry, tunnelMaterial);
    this.tunnelMesh.renderOrder = 0;
    this.scene.add(this.tunnelMesh);
  }

  private createTunnelRings(colors: typeof COLOR_SCHEMES['blueShift']): void {
    if (!this.scene) return;

    const { ringCount, tunnelLength, spiralTightness } = this.config;

    this.ringGroup = new THREE.Group();
    this.tunnelRings = [];
    this.ringMeshes = [];

    const ringGeometry = new THREE.TorusGeometry(25, 0.5, 16, 64);

    for (let i = 0; i < ringCount; i++) {
      const t = i / ringCount;
      const z = 40 - t * tunnelLength;

      // Match spiral path
      const spiralIntensity = Math.pow(t, 1.5) * 10 * spiralTightness;
      const angle = t * Math.PI * 4 * spiralTightness;

      const ringData: TunnelRing = {
        z,
        rotation: angle,
        scale: 1 - t * 0.6,
        distortion: Math.random() * Math.PI * 2,
        phase: Math.random() * Math.PI * 2,
      };
      this.tunnelRings.push(ringData);

      const ringMaterial = new THREE.ShaderMaterial({
        uniforms: {
          color: { value: new THREE.Color(colors.rings) },
          glowColor: { value: new THREE.Color(colors.glow) },
          time: { value: 0 },
          intensity: { value: 1.0 },
          ringIndex: { value: t },
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
          uniform vec3 glowColor;
          uniform float time;
          uniform float intensity;
          uniform float ringIndex;
          varying vec3 vNormal;
          varying vec3 vPosition;

          void main() {
            // Pulsing glow
            float pulse = sin(time * 3.0 + ringIndex * 10.0) * 0.5 + 0.5;

            // Fresnel edge glow
            float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);

            vec3 finalColor = mix(color, glowColor, pulse * 0.5 + fresnel * 0.3);
            finalColor *= intensity * (0.5 + pulse * 0.5);

            float alpha = (0.5 + fresnel * 0.5) * intensity;

            gl_FragColor = vec4(finalColor, alpha * 0.8);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
      ringMesh.position.set(
        Math.sin(angle) * spiralIntensity,
        Math.cos(angle) * spiralIntensity,
        z
      );
      ringMesh.scale.setScalar(ringData.scale);
      ringMesh.rotation.x = Math.PI / 2;
      ringMesh.rotation.z = angle;

      this.ringMeshes.push(ringMesh);
      this.ringGroup.add(ringMesh);
    }

    this.ringGroup.renderOrder = 10;
    this.scene.add(this.ringGroup);
  }

  private createEnergyParticles(colors: typeof COLOR_SCHEMES['blueShift']): void {
    if (!this.scene) return;

    const { energyParticles, tunnelLength, spiralTightness } = this.config;
    this.energyParticles = [];

    for (let i = 0; i < energyParticles; i++) {
      const t = Math.random();
      const z = 50 - t * tunnelLength;
      const angle = Math.random() * Math.PI * 2;

      // Radius decreases with depth
      const maxRadius = 25 * (1 - t * 0.6);
      const radius = 5 + Math.random() * (maxRadius - 5);

      // Spiral offset
      const spiralIntensity = Math.pow(t, 1.5) * 10 * spiralTightness;
      const spiralAngle = t * Math.PI * 4 * spiralTightness;

      const x = Math.cos(angle) * radius + Math.sin(spiralAngle) * spiralIntensity;
      const y = Math.sin(angle) * radius + Math.cos(spiralAngle) * spiralIntensity;

      this.energyParticles.push({
        position: new THREE.Vector3(x, y, z),
        velocity: new THREE.Vector3(),
        angle,
        radius,
        speed: 1 + Math.random() * 2,
        size: 0.5 + Math.random() * 2,
        life: Math.random(),
      });
    }

    this.energyGeometry = new THREE.BufferGeometry();
    this.updateEnergyGeometry();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.energy) },
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
          vec3 finalColor = color + color * pow(alpha, 2.0) * 0.5;

          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.energyMesh = new THREE.Points(this.energyGeometry, material);
    this.energyMesh.renderOrder = 20;
    this.scene.add(this.energyMesh);
  }

  private updateEnergyGeometry(): void {
    if (!this.energyGeometry) return;

    const positions: number[] = [];
    const sizes: number[] = [];
    const alphas: number[] = [];

    for (const p of this.energyParticles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      sizes.push(p.size);
      alphas.push(p.life);
    }

    this.energyGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.energyGeometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    this.energyGeometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  }

  private createEventHorizon(colors: typeof COLOR_SCHEMES['blueShift']): void {
    if (!this.scene) return;

    const { tunnelLength, spiralTightness } = this.config;

    // Calculate end position
    const spiralIntensity = 10 * spiralTightness;
    const spiralAngle = Math.PI * 4 * spiralTightness;

    const geometry = new THREE.SphereGeometry(8, 32, 32);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        innerColor: { value: new THREE.Color(colors.inner) },
        glowColor: { value: new THREE.Color(colors.glow) },
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
        uniform vec3 innerColor;
        uniform vec3 glowColor;
        uniform float time;
        uniform float intensity;
        varying vec3 vNormal;
        varying vec3 vPosition;

        void main() {
          float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);

          // Swirling pattern
          float angle = atan(vPosition.y, vPosition.x);
          float swirl = sin(angle * 8.0 + time * 4.0) * 0.5 + 0.5;

          vec3 color = mix(innerColor, glowColor, fresnel + swirl * 0.3);
          color *= intensity * (1.0 + swirl * 0.5);

          float alpha = fresnel * 0.8 + 0.2;
          alpha *= intensity;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.eventHorizon = new THREE.Mesh(geometry, material);
    this.eventHorizon.position.set(
      Math.sin(spiralAngle) * spiralIntensity,
      Math.cos(spiralAngle) * spiralIntensity,
      50 - tunnelLength
    );
    this.eventHorizon.renderOrder = 30;
    this.scene.add(this.eventHorizon);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, speed, distortion, spiralTightness, tunnelLength } = this.config;

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

    // Travel speed based on bass
    const travelSpeed = speed * (1 + bassBoost * 2) * deltaTime * 30;
    this.travelDistance += travelSpeed;

    // Update tunnel material
    if (this.tunnelMesh) {
      const mat = this.tunnelMesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.distortion.value = distortion * (1 + bassBoost * 0.5);
    }

    // Update rings
    this.updateRings(deltaTime, bassBoost, midBoost, trebleBoost);

    // Update energy particles
    this.updateEnergyParticles(deltaTime, bassBoost, trebleBoost, volumeBoost);

    // Update event horizon
    if (this.eventHorizon) {
      const mat = this.eventHorizon.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.intensity.value = 0.8 + volumeBoost * 0.5;

      const pulseScale = 1 + bassBoost * 0.3;
      this.eventHorizon.scale.setScalar(pulseScale);
    }

    // Camera movement - fly forward with subtle motion
    const camZ = 50 - (this.travelDistance % tunnelLength);
    const camT = (this.travelDistance % tunnelLength) / tunnelLength;

    // Follow spiral path
    const spiralIntensity = Math.pow(camT, 1.5) * 10 * spiralTightness;
    const spiralAngle = camT * Math.PI * 4 * spiralTightness;

    this.camera.position.x = Math.sin(spiralAngle) * spiralIntensity + Math.sin(this.time) * 2 * (1 + bassBoost);
    this.camera.position.y = Math.cos(spiralAngle) * spiralIntensity + Math.cos(this.time * 1.3) * 2 * (1 + bassBoost);
    this.camera.position.z = camZ;

    // Look ahead in the tunnel
    const lookAheadT = Math.min(camT + 0.1, 1);
    const lookSpiralIntensity = Math.pow(lookAheadT, 1.5) * 10 * spiralTightness;
    const lookSpiralAngle = lookAheadT * Math.PI * 4 * spiralTightness;
    const lookZ = 50 - lookAheadT * tunnelLength;

    this.camera.lookAt(
      Math.sin(lookSpiralAngle) * lookSpiralIntensity,
      Math.cos(lookSpiralAngle) * lookSpiralIntensity,
      lookZ
    );

    // FOV distortion on bass
    this.camera.fov = 90 + bassBoost * 20;
    this.camera.updateProjectionMatrix();

    this.rendererThree.render(this.scene, this.camera);
  }

  private updateRings(
    deltaTime: number,
    bassBoost: number,
    midBoost: number,
    trebleBoost: number
  ): void {
    const { tunnelLength, spiralTightness } = this.config;

    for (let i = 0; i < this.ringMeshes.length; i++) {
      const ring = this.tunnelRings[i];
      const mesh = this.ringMeshes[i];

      // Move rings toward camera (creates tunnel motion)
      ring.z += deltaTime * 30 * (1 + bassBoost * 2) * this.config.speed;

      // Reset ring when it passes camera
      if (ring.z > 60) {
        ring.z = 60 - tunnelLength;
      }

      const t = (60 - ring.z) / tunnelLength;

      // Update position along spiral
      const spiralIntensity = Math.pow(t, 1.5) * 10 * spiralTightness;
      const spiralAngle = t * Math.PI * 4 * spiralTightness;

      mesh.position.set(
        Math.sin(spiralAngle) * spiralIntensity,
        Math.cos(spiralAngle) * spiralIntensity,
        ring.z
      );

      // Scale decreases with depth
      const baseScale = 1 - t * 0.6;
      mesh.scale.setScalar(baseScale * (1 + trebleBoost * 0.2));

      // Rotation
      mesh.rotation.z = spiralAngle + this.time * 0.5;

      // Distortion on bass
      const distortionAmount = 1 + Math.sin(this.time * 2 + ring.phase) * bassBoost * 0.2;
      mesh.scale.x = baseScale * distortionAmount;
      mesh.scale.y = baseScale * (2 - distortionAmount);

      // Update material
      const mat = mesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.intensity.value = 0.5 + midBoost * 0.5 + (1 - t) * 0.3;
    }
  }

  private updateEnergyParticles(
    deltaTime: number,
    bassBoost: number,
    trebleBoost: number,
    volumeBoost: number
  ): void {
    if (!this.energyGeometry) return;

    const { tunnelLength, spiralTightness, speed } = this.config;
    const travelSpeed = deltaTime * 30 * (1 + bassBoost * 2) * speed;

    for (const p of this.energyParticles) {
      // Move toward camera
      p.position.z += travelSpeed;

      // Spiral motion
      p.angle += deltaTime * p.speed * (1 + trebleBoost);

      // Calculate current depth
      const t = (60 - p.position.z) / tunnelLength;

      // Spiral offset
      const spiralIntensity = Math.pow(Math.max(0, t), 1.5) * 10 * spiralTightness;
      const spiralAngle = t * Math.PI * 4 * spiralTightness;

      // Update position
      const maxRadius = 25 * Math.max(0.4, 1 - t * 0.6);
      p.position.x = Math.cos(p.angle) * p.radius * (maxRadius / 25) + Math.sin(spiralAngle) * spiralIntensity;
      p.position.y = Math.sin(p.angle) * p.radius * (maxRadius / 25) + Math.cos(spiralAngle) * spiralIntensity;

      // Reset if passed camera
      if (p.position.z > 60) {
        p.position.z = 60 - tunnelLength + Math.random() * 20;
        p.angle = Math.random() * Math.PI * 2;
        p.radius = 5 + Math.random() * 20;
      }

      // Life based on volume and position
      p.life = volumeBoost * 0.8 + 0.2;
    }

    this.updateEnergyGeometry();
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
      (config as WormholeConfig).colorScheme !== undefined &&
      (config as WormholeConfig).colorScheme !== this.config.colorScheme ||
      (config as WormholeConfig).ringCount !== undefined &&
      (config as WormholeConfig).ringCount !== this.config.ringCount ||
      (config as WormholeConfig).tunnelLength !== undefined &&
      (config as WormholeConfig).tunnelLength !== this.config.tunnelLength ||
      (config as WormholeConfig).energyParticles !== undefined &&
      (config as WormholeConfig).energyParticles !== this.config.energyParticles ||
      (config as WormholeConfig).spiralTightness !== undefined &&
      (config as WormholeConfig).spiralTightness !== this.config.spiralTightness;

    this.config = { ...this.config, ...config } as WormholeConfig;

    if (needsRecreate && this.scene) {
      this.createWormhole();
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
    this.tunnelGeometry = null;
    this.tunnelMesh = null;
    this.energyGeometry = null;
    this.energyMesh = null;
    this.starField = null;
    this.eventHorizon = null;
    this.ringGroup = null;
    this.ringMeshes = [];
    this.tunnelRings = [];
    this.energyParticles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: { type: 'number', min: 0.1, max: 3, step: 0.1, default: 1.0, label: 'Audio Sensitivity' },
      colorScheme: {
        type: 'select',
        options: [
          { value: 'blueShift', label: 'Blue Shift' },
          { value: 'redShift', label: 'Red Shift' },
          { value: 'quantum', label: 'Quantum' },
          { value: 'emerald', label: 'Emerald' },
          { value: 'void', label: 'Void' },
          { value: 'golden', label: 'Golden' },
        ],
        default: 'blueShift',
        label: 'Color Scheme',
      },
      tunnelLength: { type: 'number', min: 100, max: 400, step: 50, default: 200, label: 'Tunnel Length' },
      ringCount: { type: 'number', min: 20, max: 80, step: 10, default: 40, label: 'Ring Count' },
      speed: { type: 'number', min: 0.3, max: 3, step: 0.1, default: 1.0, label: 'Travel Speed' },
      distortion: { type: 'number', min: 0.2, max: 2, step: 0.1, default: 1.0, label: 'Distortion' },
      energyParticles: { type: 'number', min: 500, max: 3000, step: 250, default: 1500, label: 'Energy Particles' },
      spiralTightness: { type: 'number', min: 0.5, max: 4, step: 0.5, default: 2.0, label: 'Spiral Tightness' },
    };
  }
}
