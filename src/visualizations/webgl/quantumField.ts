import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_HEX, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface QuantumFieldConfig extends VisualizationConfig {
  particleCount: number;
  entanglementStrength: number;
  waveSpeed: number;
  collapseIntensity: number;
  colorScheme: string;
}

interface QuantumParticle {
  position: THREE.Vector3;
  basePosition: THREE.Vector3;
  velocity: THREE.Vector3;
  phase: number; // 0 to 2PI - oscillation phase
  phaseSpeed: number;
  entangledWith: number | null; // Index of entangled partner
  waveAmplitude: number;
  probabilityRadius: number; // Uncertainty cloud size
  collapsed: boolean;
  collapseTimer: number;
}

export class QuantumFieldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "quantumField",
    name: "Quantum Field",
    author: "Vizec",
    description:
      "Probability clouds and wave functions responding to audio with entanglement effects",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  private particles: QuantumParticle[] = [];
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMesh: THREE.Points | null = null;

  // Entanglement lines
  private entanglementGeometry: THREE.BufferGeometry | null = null;
  private entanglementLines: THREE.LineSegments | null = null;

  // Wave interference pattern
  private waveGeometry: THREE.BufferGeometry | null = null;
  private waveMesh: THREE.Points | null = null;

  // Probability clouds (outer glow particles)
  private cloudGeometry: THREE.BufferGeometry | null = null;
  private cloudMesh: THREE.Points | null = null;

  private config: QuantumFieldConfig = {
    sensitivity: 1.0,
    particleCount: 3000,
    entanglementStrength: 0.7,
    waveSpeed: 1.0,
    collapseIntensity: 1.0,
    colorScheme: "cyanMagenta",
  };

  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private volumeSmooth = 0;
  private globalCollapseTimer = 0;
  private collapseActive = false;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 120);
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

    this.createQuantumField();
  }

  private createQuantumField(): void {
    if (!this.scene) return;

    this.clearScene();

    const colors = getColorScheme(COLOR_SCHEMES_HEX, this.config.colorScheme);

    this.createParticles(colors);
    this.createEntanglementLines(colors);
    this.createWavePattern(colors);
    this.createProbabilityClouds(colors);
  }

  private clearScene(): void {
    if (!this.scene) return;

    // Dispose of geometries and materials
    if (this.particleGeometry) this.particleGeometry.dispose();
    if (this.particleMesh && this.particleMesh.material) {
      (this.particleMesh.material as THREE.Material).dispose();
    }
    if (this.entanglementGeometry) this.entanglementGeometry.dispose();
    if (this.entanglementLines && this.entanglementLines.material) {
      (this.entanglementLines.material as THREE.Material).dispose();
    }
    if (this.waveGeometry) this.waveGeometry.dispose();
    if (this.waveMesh && this.waveMesh.material) {
      (this.waveMesh.material as THREE.Material).dispose();
    }
    if (this.cloudGeometry) this.cloudGeometry.dispose();
    if (this.cloudMesh && this.cloudMesh.material) {
      (this.cloudMesh.material as THREE.Material).dispose();
    }

    while (this.scene.children.length > 0) {
      this.scene.remove(this.scene.children[0]);
    }

    this.particles = [];
  }

  private createParticles(colors: { primary: number; secondary: number; glow: number }): void {
    if (!this.scene) return;

    const { particleCount } = this.config;
    this.particles = [];

    // Create particles in a spherical distribution
    for (let i = 0; i < particleCount; i++) {
      // Spherical distribution
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 20 + Math.random() * 60;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      const position = new THREE.Vector3(x, y, z);

      // Randomly entangle some particles
      let entangledWith: number | null = null;
      if (i > 0 && Math.random() < 0.15) {
        entangledWith = Math.floor(Math.random() * i);
      }

      this.particles.push({
        position: position.clone(),
        basePosition: position.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ),
        phase: Math.random() * Math.PI * 2,
        phaseSpeed: 0.5 + Math.random() * 2,
        entangledWith,
        waveAmplitude: 2 + Math.random() * 8,
        probabilityRadius: 3 + Math.random() * 5,
        collapsed: false,
        collapseTimer: 0,
      });
    }

    this.particleGeometry = new THREE.BufferGeometry();
    this.updateParticleGeometry();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        primaryColor: { value: new THREE.Color(colors.primary) },
        secondaryColor: { value: new THREE.Color(colors.secondary) },
        glowColor: { value: new THREE.Color(colors.glow) },
        time: { value: 0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float phase;
        attribute float collapsed;
        attribute vec3 customColor;

        varying vec3 vColor;
        varying float vPhase;
        varying float vCollapsed;

        uniform float pixelRatio;
        uniform float time;

        void main() {
          vColor = customColor;
          vPhase = phase;
          vCollapsed = collapsed;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;

          float pulseFactor = 1.0 + sin(phase + time * 3.0) * 0.3;
          float collapseFactor = collapsed > 0.5 ? 2.0 : 1.0;
          gl_PointSize = size * pulseFactor * collapseFactor * pixelRatio * (150.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vPhase;
        varying float vCollapsed;

        uniform float time;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);

          if (dist > 0.5) discard;

          // Create wave-like pattern inside particle
          float wave = sin(dist * 20.0 - vPhase - time * 5.0) * 0.5 + 0.5;

          // Core brightness
          float core = 1.0 - smoothstep(0.0, 0.3, dist);

          // Outer glow
          float glow = 1.0 - smoothstep(0.0, 0.5, dist);

          // Combine for quantum uncertainty look
          float alpha = glow * 0.5 + core * 0.5;
          alpha *= 0.6 + wave * 0.4;

          // Brighter when collapsed
          if (vCollapsed > 0.5) {
            alpha = min(alpha * 2.0, 1.0);
          }

          vec3 finalColor = vColor * (0.8 + wave * 0.4);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.particleMesh = new THREE.Points(this.particleGeometry, material);
    this.particleMesh.renderOrder = 10;
    this.scene.add(this.particleMesh);
  }

  private updateParticleGeometry(): void {
    if (!this.particleGeometry) return;

    const colors = getColorScheme(COLOR_SCHEMES_HEX, this.config.colorScheme);
    const primaryColor = new THREE.Color(colors.primary);
    const secondaryColor = new THREE.Color(colors.secondary);

    const positions: number[] = [];
    const sizes: number[] = [];
    const phases: number[] = [];
    const collapsedArray: number[] = [];
    const customColors: number[] = [];

    for (const p of this.particles) {
      positions.push(p.position.x, p.position.y, p.position.z);
      sizes.push(2 + p.waveAmplitude * 0.5);
      phases.push(p.phase);
      collapsedArray.push(p.collapsed ? 1.0 : 0.0);

      // Color based on whether entangled
      const color = p.entangledWith !== null ? secondaryColor : primaryColor;
      customColors.push(color.r, color.g, color.b);
    }

    this.particleGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.particleGeometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));
    this.particleGeometry.setAttribute(
      "collapsed",
      new THREE.Float32BufferAttribute(collapsedArray, 1),
    );
    this.particleGeometry.setAttribute(
      "customColor",
      new THREE.Float32BufferAttribute(customColors, 3),
    );
  }

  private createEntanglementLines(colors: {
    primary: number;
    secondary: number;
    glow: number;
  }): void {
    if (!this.scene) return;

    this.entanglementGeometry = new THREE.BufferGeometry();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.glow) },
        time: { value: 0 },
        visibility: { value: 0 },
      },
      vertexShader: `
        varying float vLinePos;
        attribute float linePos;

        void main() {
          vLinePos = linePos;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float time;
        uniform float visibility;

        varying float vLinePos;

        void main() {
          // Animated dash pattern
          float dash = sin(vLinePos * 50.0 - time * 10.0) * 0.5 + 0.5;

          float alpha = dash * visibility * 0.4;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.entanglementLines = new THREE.LineSegments(this.entanglementGeometry, material);
    this.entanglementLines.renderOrder = 5;
    this.scene.add(this.entanglementLines);

    this.updateEntanglementGeometry();
  }

  private updateEntanglementGeometry(): void {
    if (!this.entanglementGeometry) return;

    const positions: number[] = [];
    const linePos: number[] = [];

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.entangledWith !== null && p.entangledWith < this.particles.length) {
        const partner = this.particles[p.entangledWith];

        positions.push(p.position.x, p.position.y, p.position.z);
        positions.push(partner.position.x, partner.position.y, partner.position.z);

        linePos.push(0);
        linePos.push(1);
      }
    }

    this.entanglementGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.entanglementGeometry.setAttribute("linePos", new THREE.Float32BufferAttribute(linePos, 1));
  }

  private createWavePattern(colors: { primary: number; secondary: number; glow: number }): void {
    if (!this.scene) return;

    // Create interference pattern ring
    const waveCount = 500;
    const positions: number[] = [];
    const sizes: number[] = [];
    const phases: number[] = [];

    for (let i = 0; i < waveCount; i++) {
      const angle = (i / waveCount) * Math.PI * 2;
      const radius = 80 + Math.random() * 10;

      positions.push(
        Math.cos(angle) * radius,
        Math.sin(angle) * radius,
        (Math.random() - 0.5) * 10,
      );
      sizes.push(1 + Math.random() * 2);
      phases.push(angle);
    }

    this.waveGeometry = new THREE.BufferGeometry();
    this.waveGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.waveGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.waveGeometry.setAttribute("phase", new THREE.Float32BufferAttribute(phases, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.secondary) },
        time: { value: 0 },
        waveIntensity: { value: 1.0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float phase;

        varying float vPhase;

        uniform float time;
        uniform float waveIntensity;
        uniform float pixelRatio;

        void main() {
          vPhase = phase;

          vec3 pos = position;

          // Wave motion
          float wave = sin(phase * 3.0 + time * 2.0) * waveIntensity * 5.0;
          pos.z += wave;

          // Radial pulse
          float pulse = sin(time * 1.5) * 0.1;
          pos.xy *= 1.0 + pulse;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (100.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vPhase;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);

          if (dist > 0.5) discard;

          float alpha = (1.0 - dist * 2.0) * 0.3;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.waveMesh = new THREE.Points(this.waveGeometry, material);
    this.waveMesh.renderOrder = 1;
    this.scene.add(this.waveMesh);
  }

  private createProbabilityClouds(colors: {
    primary: number;
    secondary: number;
    glow: number;
  }): void {
    if (!this.scene) return;

    // Outer probability cloud particles
    const cloudCount = 1000;
    const positions: number[] = [];
    const sizes: number[] = [];
    const alphas: number[] = [];

    for (let i = 0; i < cloudCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 70 + Math.random() * 30;

      positions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi),
      );
      sizes.push(1 + Math.random() * 3);
      alphas.push(0.2 + Math.random() * 0.3);
    }

    this.cloudGeometry = new THREE.BufferGeometry();
    this.cloudGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.cloudGeometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));
    this.cloudGeometry.setAttribute("alpha", new THREE.Float32BufferAttribute(alphas, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(colors.glow) },
        time: { value: 0 },
        intensity: { value: 1.0 },
        pixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        attribute float size;
        attribute float alpha;

        varying float vAlpha;

        uniform float time;
        uniform float intensity;
        uniform float pixelRatio;

        void main() {
          vAlpha = alpha * intensity;

          vec3 pos = position;

          // Subtle drift
          pos.x += sin(time * 0.5 + position.y * 0.1) * 2.0;
          pos.y += cos(time * 0.4 + position.x * 0.1) * 2.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * pixelRatio * (80.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;

        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);

          if (dist > 0.5) discard;

          float alpha = (1.0 - dist * 2.0) * vAlpha * 0.3;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.cloudMesh = new THREE.Points(this.cloudGeometry, material);
    this.cloudMesh.renderOrder = 0;
    this.scene.add(this.cloudMesh);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, entanglementStrength, waveSpeed, collapseIntensity } = this.config;

    this.time += deltaTime * 0.001;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;
    this.volumeSmooth += (volume - this.volumeSmooth) * smoothing;

    const bassBoost = this.bassSmooth * sensitivity;
    const midBoost = this.midSmooth * sensitivity;
    const trebleBoost = this.trebleSmooth * sensitivity;

    // Check for wave function collapse trigger (on strong bass hits)
    if (bassBoost > 0.7 && !this.collapseActive) {
      this.collapseActive = true;
      this.globalCollapseTimer = 0.5;

      // Collapse some particles
      for (const p of this.particles) {
        if (Math.random() < 0.3 * collapseIntensity) {
          p.collapsed = true;
          p.collapseTimer = 0.3 + Math.random() * 0.3;
        }
      }
    }

    // Update collapse timer
    if (this.collapseActive) {
      this.globalCollapseTimer -= deltaTime * 0.001;
      if (this.globalCollapseTimer <= 0) {
        this.collapseActive = false;
      }
    }

    // Update particles
    this.updateParticles(deltaTime, bassBoost, midBoost, trebleBoost);

    // Update shader uniforms
    if (this.particleMesh) {
      const mat = this.particleMesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
    }

    if (this.entanglementLines) {
      const mat = this.entanglementLines.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.visibility.value = midBoost * entanglementStrength;
    }

    if (this.waveMesh) {
      const mat = this.waveMesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time * waveSpeed;
      mat.uniforms.waveIntensity.value = trebleBoost * 2;
      this.waveMesh.rotation.z += deltaTime * 0.0003 * waveSpeed;
    }

    if (this.cloudMesh) {
      const mat = this.cloudMesh.material as THREE.ShaderMaterial;
      mat.uniforms.time.value = this.time;
      mat.uniforms.intensity.value = 0.5 + this.volumeSmooth * sensitivity;
      this.cloudMesh.rotation.y += deltaTime * 0.0001;
    }

    // Camera movement
    const cameraAngle = this.time * 0.1;
    const cameraRadius = 120 - bassBoost * 20;
    this.camera.position.x = Math.sin(cameraAngle) * cameraRadius * 0.3;
    this.camera.position.z = Math.cos(cameraAngle) * cameraRadius;
    this.camera.position.y = Math.sin(this.time * 0.15) * 20;
    this.camera.lookAt(0, 0, 0);

    this.rendererThree.render(this.scene, this.camera);
  }

  private updateParticles(
    deltaTime: number,
    bassBoost: number,
    midBoost: number,
    trebleBoost: number,
  ): void {
    const dt = deltaTime * 0.001;

    for (const p of this.particles) {
      // Update phase (controls oscillation speed)
      p.phase += p.phaseSpeed * dt * (1 + trebleBoost * 2);
      if (p.phase > Math.PI * 2) p.phase -= Math.PI * 2;

      // Quantum uncertainty motion
      const uncertainty = p.probabilityRadius * (0.5 + midBoost);
      p.position.x = p.basePosition.x + Math.sin(p.phase) * uncertainty;
      p.position.y = p.basePosition.y + Math.cos(p.phase * 1.3) * uncertainty;
      p.position.z = p.basePosition.z + Math.sin(p.phase * 0.7) * uncertainty * 0.5;

      // Bass causes outward expansion
      if (bassBoost > 0.3) {
        const expansion = bassBoost * 0.5;
        const dist = p.basePosition.length();
        if (dist > 0) {
          p.basePosition.x += (p.basePosition.x / dist) * expansion;
          p.basePosition.y += (p.basePosition.y / dist) * expansion;
          p.basePosition.z += (p.basePosition.z / dist) * expansion;
        }
      }

      // Slowly return to original radius
      const targetRadius = 20 + Math.random() * 60;
      const currentRadius = p.basePosition.length();
      if (currentRadius > targetRadius) {
        const correction = 0.01;
        p.basePosition.multiplyScalar(1 - correction);
      }

      // Handle collapse state
      if (p.collapsed) {
        p.collapseTimer -= dt;
        if (p.collapseTimer <= 0) {
          p.collapsed = false;
        }
      }

      // Entanglement - sync phase with partner
      if (p.entangledWith !== null && p.entangledWith < this.particles.length) {
        const partner = this.particles[p.entangledWith];
        const phaseDiff = partner.phase - p.phase;
        p.phase += phaseDiff * 0.1 * this.config.entanglementStrength;
      }
    }

    this.updateParticleGeometry();
    this.updateEntanglementGeometry();
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
      ((config as QuantumFieldConfig).colorScheme !== undefined &&
        (config as QuantumFieldConfig).colorScheme !== this.config.colorScheme) ||
      ((config as QuantumFieldConfig).particleCount !== undefined &&
        (config as QuantumFieldConfig).particleCount !== this.config.particleCount);

    this.config = { ...this.config, ...config } as QuantumFieldConfig;

    if (needsRecreate && this.scene) {
      this.createQuantumField();
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
    this.particleGeometry = null;
    this.particleMesh = null;
    this.entanglementGeometry = null;
    this.entanglementLines = null;
    this.waveGeometry = null;
    this.waveMesh = null;
    this.cloudGeometry = null;
    this.cloudMesh = null;
    this.particles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Audio Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 3000,
        min: 1000,
        max: 8000,
        step: 500,
      },
      entanglementStrength: {
        type: "number",
        label: "Entanglement",
        default: 0.7,
        min: 0,
        max: 1.5,
        step: 0.1,
      },
      waveSpeed: {
        type: "number",
        label: "Wave Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      collapseIntensity: {
        type: "number",
        label: "Collapse Intensity",
        default: 1.0,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
