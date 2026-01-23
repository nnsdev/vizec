import * as THREE from "three";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

const COLOR_SCHEMES: Record<
  string,
  {
    primary: number;
    secondary: number;
    fog: number;
    horizon: number;
    background: number;
  }
> = {
  synthwave: {
    primary: 0xff00ff,
    secondary: 0x00ffff,
    fog: 0x110022,
    horizon: 0xff6600,
    background: 0x000011,
  },
  tron: {
    primary: 0x00ffff,
    secondary: 0xffffff,
    fog: 0x001122,
    horizon: 0x00ffff,
    background: 0x000000,
  },
  vaporwave: {
    primary: 0xff71ce,
    secondary: 0x01cdfe,
    fog: 0x2d1b4e,
    horizon: 0xffc857,
    background: 0x1a0a2e,
  },
  neonNight: {
    primary: 0x39ff14,
    secondary: 0xff073a,
    fog: 0x0a0a0f,
    horizon: 0xff073a,
    background: 0x000000,
  },
  cyberPunk: {
    primary: 0xf9f002,
    secondary: 0xff00ff,
    fog: 0x1a0a2e,
    horizon: 0xf9f002,
    background: 0x0d0221,
  },
  outrun: {
    primary: 0xff2975,
    secondary: 0x00e5ff,
    fog: 0x0f0326,
    horizon: 0xf5a623,
    background: 0x0a0015,
  },
  matrix: {
    primary: 0x00ff41,
    secondary: 0x008f11,
    fog: 0x001100,
    horizon: 0x00ff00,
    background: 0x000000,
  },
  bloodMoon: {
    primary: 0xff0000,
    secondary: 0xff4500,
    fog: 0x1a0000,
    horizon: 0xff4500,
    background: 0x0a0000,
  },
};

interface SpeedParticle {
  position: THREE.Vector3;
  velocity: number;
  size: number;
}

interface AudioTerrainConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  speed: number;
  gridSize: number;
  heightScale: number;
  fogDensity: number;
  wireframe: boolean;
}

export class AudioTerrainVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "audioTerrain",
    name: "Audio Terrain",
    author: "Vizec",
    description: "Flying over mountains that ARE the music - synthwave terrain flythrough",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;

  // Terrain components
  private terrainMesh: THREE.Mesh | null = null;
  private wireframeMesh: THREE.LineSegments | null = null;
  private terrainGeometry: THREE.PlaneGeometry | null = null;

  // Horizon sun
  private horizonSun: THREE.Mesh | null = null;
  private horizonGlow: THREE.Mesh | null = null;

  // Speed particles
  private speedParticles: SpeedParticle[] = [];
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMesh: THREE.Points | null = null;

  // Audio-reactive state
  private terrainOffset = 0;
  private cameraShake = { x: 0, y: 0, z: 0 };
  private targetCameraShake = { x: 0, y: 0, z: 0 };
  private currentSpeed = 1;
  private glowIntensity = 1;

  private config: AudioTerrainConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
    speed: 1.0,
    gridSize: 80,
    heightScale: 25,
    fogDensity: 0.02,
    wireframe: true,
  };

  private time = 0;
  private frequencyHistory: Float32Array[] = [];
  private historyLength = 100;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Create scene
    this.scene = new THREE.Scene();

    const colorScheme = this.config.colorScheme as string;
    const fogDensity = this.config.fogDensity as number;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.synthwave;
    // Transparent background - don't set scene.background
    this.scene.fog = new THREE.FogExp2(colors.fog, fogDensity);

    // Create camera - low angle, looking forward over terrain
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.set(0, 15, 50);
    this.camera.lookAt(0, 10, -100);

    // Create renderer with transparency
    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      premultipliedAlpha: false,
    });
    this.rendererThree.setSize(width, height);
    this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    // Initialize frequency history
    for (let i = 0; i < this.historyLength; i++) {
      this.frequencyHistory.push(new Float32Array(128).fill(0));
    }

    // Create scene elements
    this.createTerrain();
    this.createHorizon();
    this.createSpeedParticles();
  }

  private createTerrain(): void {
    if (!this.scene) return;

    const gridSize = this.config.gridSize as number;
    const colorScheme = this.config.colorScheme as string;
    const wireframe = this.config.wireframe as boolean;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.synthwave;

    // Remove existing terrain
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainGeometry?.dispose();
      (this.terrainMesh.material as THREE.Material).dispose();
    }
    if (this.wireframeMesh) {
      this.scene.remove(this.wireframeMesh);
      (this.wireframeMesh.material as THREE.Material).dispose();
    }

    // Create plane geometry extending toward horizon
    const segmentsX = gridSize;
    const segmentsZ = this.historyLength;
    this.terrainGeometry = new THREE.PlaneGeometry(200, 400, segmentsX, segmentsZ);
    this.terrainGeometry.rotateX(-Math.PI / 2);

    // Create solid dark surface material (slightly transparent)
    const solidMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });

    this.terrainMesh = new THREE.Mesh(this.terrainGeometry, solidMaterial);
    this.terrainMesh.position.z = -150;
    this.scene.add(this.terrainMesh);

    // Create glowing wireframe overlay
    if (wireframe) {
      const wireframeGeometry = new THREE.WireframeGeometry(this.terrainGeometry);
      const wireframeMaterial = new THREE.LineBasicMaterial({
        color: colors.primary,
        transparent: true,
        opacity: 0.8,
      });
      this.wireframeMesh = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
      this.wireframeMesh.position.copy(this.terrainMesh.position);
      this.wireframeMesh.position.y += 0.1; // Slightly above solid surface
      this.scene.add(this.wireframeMesh);
    }
  }

  private createHorizon(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.synthwave;

    // Remove existing horizon elements
    if (this.horizonSun) {
      this.scene.remove(this.horizonSun);
      (this.horizonSun.material as THREE.Material).dispose();
    }
    if (this.horizonGlow) {
      this.scene.remove(this.horizonGlow);
      (this.horizonGlow.material as THREE.Material).dispose();
    }

    // Create main sun circle
    const sunGeometry = new THREE.CircleGeometry(40, 64);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: colors.horizon,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    this.horizonSun = new THREE.Mesh(sunGeometry, sunMaterial);
    this.horizonSun.position.set(0, 25, -350);
    this.scene.add(this.horizonSun);

    // Create glow ring around sun
    const glowGeometry = new THREE.RingGeometry(40, 80, 64);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: colors.horizon,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.horizonGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    this.horizonGlow.position.copy(this.horizonSun.position);
    this.horizonGlow.position.z -= 1;
    this.scene.add(this.horizonGlow);

    // Add horizontal scan lines to sun (synthwave style)
    const lineCount = 10;
    for (let i = 0; i < lineCount; i++) {
      const lineGeometry = new THREE.PlaneGeometry(80, 2);
      const lineMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.8,
      });
      const line = new THREE.Mesh(lineGeometry, lineMaterial);
      const yOffset = (i / lineCount) * 40 - 20;
      line.position.set(0, 25 + yOffset, -349);
      if (yOffset < 0) {
        // Only lines in bottom half of sun
        this.scene.add(line);
      }
    }
  }

  private createSpeedParticles(): void {
    if (!this.scene) return;

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.synthwave;
    const particleCount = 200;

    // Initialize particles
    this.speedParticles = [];
    const positions = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const particle: SpeedParticle = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          Math.random() * 30 + 5,
          (Math.random() - 0.5) * 200,
        ),
        velocity: Math.random() * 2 + 1,
        size: Math.random() * 2 + 0.5,
      };
      this.speedParticles.push(particle);

      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
      sizes[i] = particle.size;
    }

    this.particleGeometry = new THREE.BufferGeometry();
    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    const particleMaterial = new THREE.PointsMaterial({
      color: colors.secondary,
      size: 0.5,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.particleMesh = new THREE.Points(this.particleGeometry, particleMaterial);
    this.scene.add(this.particleMesh);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree || !this.terrainGeometry) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const sensitivity = this.config.sensitivity as number;
    const speed = this.config.speed as number;
    const heightScale = this.config.heightScale as number;
    const fogDensity = this.config.fogDensity as number;
    const colorScheme = this.config.colorScheme as string;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.synthwave;

    this.time += deltaTime;

    // Update current speed based on audio energy
    const audioEnergy = (bass * 0.5 + mid * 0.3 + treble * 0.2) * sensitivity;
    this.currentSpeed = speed * (0.5 + audioEnergy * 1.5);

    // Update terrain offset (scrolling effect)
    this.terrainOffset += deltaTime * this.currentSpeed * 30;

    // Shift frequency history for scrolling terrain
    this.frequencyHistory.pop();
    const currentFreq = new Float32Array(frequencyData.length);
    for (let i = 0; i < frequencyData.length; i++) {
      currentFreq[i] = frequencyData[i] / 255;
    }
    this.frequencyHistory.unshift(currentFreq);

    // Update terrain height from frequency history
    this.updateTerrainHeight(heightScale, sensitivity);

    // Camera shake on bass hits
    if (bass * sensitivity > 0.6) {
      this.targetCameraShake.x = (Math.random() - 0.5) * bass * sensitivity * 2;
      this.targetCameraShake.y = (Math.random() - 0.5) * bass * sensitivity * 2;
      this.targetCameraShake.z = (Math.random() - 0.5) * bass * sensitivity;
    }

    // Smooth camera shake decay
    this.cameraShake.x += (this.targetCameraShake.x - this.cameraShake.x) * 0.3;
    this.cameraShake.y += (this.targetCameraShake.y - this.cameraShake.y) * 0.3;
    this.cameraShake.z += (this.targetCameraShake.z - this.cameraShake.z) * 0.3;
    this.targetCameraShake.x *= 0.8;
    this.targetCameraShake.y *= 0.8;
    this.targetCameraShake.z *= 0.8;

    // Apply camera shake
    const baseY = 15 + bass * sensitivity * 5;
    this.camera.position.set(
      this.cameraShake.x,
      baseY + this.cameraShake.y,
      50 + this.cameraShake.z,
    );

    // Update glow intensity based on volume
    this.glowIntensity = 0.5 + volume * sensitivity * 0.5;

    // Update wireframe opacity and color based on audio
    if (this.wireframeMesh) {
      const wireMat = this.wireframeMesh.material as THREE.LineBasicMaterial;
      wireMat.opacity = 0.4 + mid * sensitivity * 0.6;

      // Pulse color between primary and secondary
      const colorLerp = Math.sin(this.time * 2) * 0.5 + 0.5;
      const primaryColor = new THREE.Color(colors.primary);
      const secondaryColor = new THREE.Color(colors.secondary);
      wireMat.color = primaryColor.lerp(secondaryColor, colorLerp * treble * sensitivity);
    }

    // Update fog density based on volume
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.density = fogDensity * (0.5 + volume * sensitivity);
    }

    // Update horizon sun glow
    if (this.horizonGlow) {
      const glowMat = this.horizonGlow.material as THREE.MeshBasicMaterial;
      glowMat.opacity = 0.2 + bass * sensitivity * 0.4;

      // Pulse scale
      const pulseScale = 1 + bass * sensitivity * 0.3;
      this.horizonGlow.scale.set(pulseScale, pulseScale, 1);
    }

    if (this.horizonSun) {
      const sunMat = this.horizonSun.material as THREE.MeshBasicMaterial;
      sunMat.opacity = 0.7 + volume * 0.3;
    }

    // Update speed particles
    this.updateSpeedParticles(deltaTime, audioEnergy);

    // Render
    this.rendererThree.render(this.scene, this.camera);
  }

  private updateTerrainHeight(heightScale: number, sensitivity: number): void {
    if (!this.terrainGeometry) return;

    const positions = this.terrainGeometry.attributes.position.array as Float32Array;
    const gridSizeX = (this.config.gridSize as number) + 1;
    const gridSizeZ = this.historyLength + 1;

    for (let z = 0; z < gridSizeZ; z++) {
      for (let x = 0; x < gridSizeX; x++) {
        const i = z * gridSizeX + x;
        const i3 = i * 3;

        // Get frequency data for this column (x maps to frequency)
        const historyIndex = Math.min(z, this.frequencyHistory.length - 1);
        const freqArray = this.frequencyHistory[historyIndex];

        // Map x position to frequency (left = bass, right = treble)
        const freqIndex = Math.floor((x / gridSizeX) * freqArray.length * 0.6);
        const freqValue = freqArray[freqIndex] || 0;

        // Height calculation
        // Bass creates big mountains on the left
        // Mids create ridges in the center
        // Treble adds texture on the right
        const xNormalized = x / gridSizeX;

        // Frequency-based height
        let height = freqValue * heightScale * sensitivity;

        // Add some wave motion for visual interest
        const wave = Math.sin(x * 0.1 + this.terrainOffset * 0.02) * 2;
        height += wave * (0.3 + freqValue * 0.7);

        // Edge falloff for smooth terrain edges
        const edgeFactor = 1 - Math.pow(Math.abs(xNormalized - 0.5) * 2, 2);
        height *= edgeFactor;

        // Distance falloff (terrain flattens near camera)
        const zNormalized = z / gridSizeZ;
        const distanceFactor = 0.3 + zNormalized * 0.7;
        height *= distanceFactor;

        positions[i3 + 1] = height;
      }
    }

    this.terrainGeometry.attributes.position.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();

    // Update wireframe if it exists
    if (this.wireframeMesh && this.terrainMesh) {
      const wireframeGeometry = new THREE.WireframeGeometry(this.terrainGeometry);
      this.wireframeMesh.geometry.dispose();
      this.wireframeMesh.geometry = wireframeGeometry;
    }
  }

  private updateSpeedParticles(deltaTime: number, audioEnergy: number): void {
    if (!this.particleGeometry || !this.particleMesh) return;

    const positions = this.particleGeometry.attributes.position.array as Float32Array;
    const particleSpeed = this.currentSpeed * (0.5 + audioEnergy);

    for (let i = 0; i < this.speedParticles.length; i++) {
      const particle = this.speedParticles[i];

      // Move particles toward camera (speed line effect)
      particle.position.z += particle.velocity * particleSpeed * deltaTime * 60;

      // Reset particles that pass the camera
      if (particle.position.z > 60) {
        particle.position.z = -200 + Math.random() * 50;
        particle.position.x = (Math.random() - 0.5) * 100;
        particle.position.y = Math.random() * 30 + 5;
      }

      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = particle.position.y;
      positions[i * 3 + 2] = particle.position.z;
    }

    this.particleGeometry.attributes.position.needsUpdate = true;

    // Update particle opacity based on speed
    const material = this.particleMesh.material as THREE.PointsMaterial;
    material.opacity = 0.3 + audioEnergy * 0.7;
    material.size = 0.3 + audioEnergy * 0.5;
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
    const oldColorScheme = this.config.colorScheme;
    const oldGridSize = this.config.gridSize;
    const oldWireframe = this.config.wireframe;
    const oldFogDensity = this.config.fogDensity;

    this.config = { ...this.config, ...config } as AudioTerrainConfig;

    // Update scene based on config changes
    if (this.scene) {
      const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.synthwave;

      if (config.colorScheme !== undefined && config.colorScheme !== oldColorScheme) {
        // Transparent background - don't set scene.background
        if (this.scene.fog instanceof THREE.FogExp2) {
          this.scene.fog.color = new THREE.Color(colors.fog);
        }
        this.createTerrain();
        this.createHorizon();
        this.createSpeedParticles();
      }

      if (config.gridSize !== undefined && config.gridSize !== oldGridSize) {
        this.createTerrain();
      }

      if (config.wireframe !== undefined && config.wireframe !== oldWireframe) {
        this.createTerrain();
      }

      if (config.fogDensity !== undefined && config.fogDensity !== oldFogDensity) {
        if (this.scene.fog instanceof THREE.FogExp2) {
          this.scene.fog.density = this.config.fogDensity as number;
        }
      }
    }
  }

  destroy(): void {
    if (this.terrainGeometry) {
      this.terrainGeometry.dispose();
    }

    if (this.terrainMesh) {
      (this.terrainMesh.material as THREE.Material).dispose();
    }

    if (this.wireframeMesh) {
      this.wireframeMesh.geometry.dispose();
      (this.wireframeMesh.material as THREE.Material).dispose();
    }

    if (this.horizonSun) {
      (this.horizonSun.geometry as THREE.BufferGeometry).dispose();
      (this.horizonSun.material as THREE.Material).dispose();
    }

    if (this.horizonGlow) {
      (this.horizonGlow.geometry as THREE.BufferGeometry).dispose();
      (this.horizonGlow.material as THREE.Material).dispose();
    }

    if (this.particleGeometry) {
      this.particleGeometry.dispose();
    }

    if (this.particleMesh) {
      (this.particleMesh.material as THREE.Material).dispose();
    }

    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.terrainMesh = null;
    this.wireframeMesh = null;
    this.terrainGeometry = null;
    this.horizonSun = null;
    this.horizonGlow = null;
    this.particleGeometry = null;
    this.particleMesh = null;
    this.speedParticles = [];
    this.frequencyHistory = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 1,
        step: 0.1,
        default: 0.5,
        label: "Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [
          { value: "synthwave", label: "Synthwave" },
          { value: "tron", label: "Tron" },
          { value: "vaporwave", label: "Vaporwave" },
          { value: "neonNight", label: "Neon Night" },
          { value: "cyberPunk", label: "Cyberpunk" },
          { value: "outrun", label: "Outrun" },
          { value: "matrix", label: "Matrix" },
          { value: "bloodMoon", label: "Blood Moon" },
        ],
        default: "synthwave",
        label: "Color Scheme",
      },
      speed: { type: "number", min: 0.2, max: 3, step: 0.1, default: 1.0, label: "Flight Speed" },
      gridSize: { type: "number", min: 32, max: 128, step: 16, default: 80, label: "Grid Detail" },
      heightScale: {
        type: "number",
        min: 10,
        max: 50,
        step: 5,
        default: 25,
        label: "Mountain Height",
      },
      fogDensity: {
        type: "number",
        min: 0.005,
        max: 0.05,
        step: 0.005,
        default: 0.02,
        label: "Fog Density",
      },
      wireframe: { type: "boolean", default: true, label: "Show Grid Lines" },
    };
  }
}
