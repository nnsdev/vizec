import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface DataStreamConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  streamCount: number;
  packetSize: number;
  flowSpeed: number;
}

export class DataStreamVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "dataStream",
    name: "Data Stream",
    author: "Vizec",
    description: "3D streaming data particles with audio-reactive speed",
    renderer: "threejs",
    transitionType: "cut",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private particles: THREE.Points | null = null;
  private particleGeometry: THREE.BufferGeometry | null = null;
  private particleMaterial: THREE.PointsMaterial | null = null;

  private config: DataStreamConfig = {
    sensitivity: 1.0,
    colorScheme: "neon",
    streamCount: 20,
    packetSize: 10,
    flowSpeed: 1.0,
  };

  private width = 0;
  private height = 0;
  private packetData: { offset: number; speed: number; x: number; y: number }[] = [];

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.z = 50;

    this.rendererThree = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setPixelRatio(window.devicePixelRatio);
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    this.createParticles();

    this.resize(container.clientWidth, container.clientHeight);
  }

  private createParticles(): void {
    if (!this.scene) return;

    if (this.particles) {
      this.scene.remove(this.particles);
      this.particleGeometry?.dispose();
      this.particleMaterial?.dispose();
    }

    const { streamCount, packetSize, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    const totalParticles = streamCount * packetSize;
    this.particleGeometry = new THREE.BufferGeometry();

    const positions = new Float32Array(totalParticles * 3);
    const colorsArray = new Float32Array(totalParticles * 3);

    this.packetData = [];

    for (let stream = 0; stream < streamCount; stream++) {
      const baseX = (stream / streamCount) * 40 - 20;
      const speed = 0.5 + Math.random() * 0.5;
      this.packetData.push({
        offset: Math.random() * 100,
        speed,
        x: baseX,
        y: (Math.random() - 0.5) * 30,
      });

      for (let p = 0; p < packetSize; p++) {
        const i = stream * packetSize + p;
        const i3 = i * 3;

        positions[i3] = baseX;
        positions[i3 + 1] = this.packetData[stream].y + (Math.random() - 0.5) * 2;
        positions[i3 + 2] = (Math.random() - 0.5) * 10;

        const color = new THREE.Color(stream % 3 === 0
          ? colors.primary
          : stream % 3 === 1
            ? colors.secondary
            : colors.glow);

        colorsArray[i3] = color.r;
        colorsArray[i3 + 1] = color.g;
        colorsArray[i3 + 2] = color.b;
      }
    }

    this.particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.particleGeometry.setAttribute("color", new THREE.BufferAttribute(colorsArray, 3));

    this.particleMaterial = new THREE.PointsMaterial({
      size: 1.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
    this.scene.add(this.particles);
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.scene || !this.camera || !this.particleGeometry) return;

    const { bass, mid, treble, frequencyData } = audioData;
    const { sensitivity, colorScheme, packetSize, flowSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_HEX, colorScheme);

    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    const positionAttr = this.particleGeometry.attributes.position as THREE.BufferAttribute;

    // Update particle positions
    for (let stream = 0; stream < this.packetData.length; stream++) {
      const packet = this.packetData[stream];

      // Get frequency data for this stream
      const freqIndex = Math.floor((stream / this.packetData.length) * frequencyData.length * 0.3);
      const freqValue = frequencyData[freqIndex] / 255;

      // Update packet position
      packet.offset += flowSpeed * packet.speed * (1 + bassBoost) * 0.5;
      if (packet.offset > 60) packet.offset = -40;

      for (let p = 0; p < packetSize; p++) {
        const i = stream * packetSize + p;
        const i3 = i * 3;

        const z = packet.offset + p * 3;
        positionAttr.array[i3] = packet.x;
        positionAttr.array[i3 + 1] = packet.y + Math.sin(z * 0.5) * (1 + freqValue * sensitivity);
        positionAttr.array[i3 + 2] = z;
      }
    }

    positionAttr.needsUpdate = true;

    // Update material based on audio
    if (this.particleMaterial) {
      this.particleMaterial.size = 1 + trebleBoost * 0.5;
      this.particleMaterial.opacity = 0.5 + midBoost * 0.3;

      if (bassBoost > 1) {
        this.particleMaterial.color.setHex(colors.primary);
      } else if (midBoost > 1) {
        this.particleMaterial.color.setHex(colors.secondary);
      } else {
        this.particleMaterial.color.setHex(colors.glow);
      }
    }

    // Camera rotation
    this.camera.position.x = Math.sin(Date.now() * 0.0005) * 10;
    this.camera.position.y = Math.cos(Date.now() * 0.0003) * 5;
    this.camera.lookAt(0, 0, 0);

    this.rendererThree!.render(this.scene, this.camera);
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
    this.config = { ...this.config, ...config } as DataStreamConfig;

    if (config.streamCount !== undefined || config.packetSize !== undefined || config.colorScheme !== undefined) {
      this.createParticles();
    }
  }

  destroy(): void {
    if (this.rendererThree) {
      this.rendererThree.dispose();
      if (this.container && this.rendererThree.domElement.parentNode) {
        this.rendererThree.domElement.parentNode.removeChild(this.rendererThree.domElement);
      }
    }

    this.particleGeometry?.dispose();
    this.particleMaterial?.dispose();

    this.container = null;
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.particles = null;
    this.particleGeometry = null;
    this.particleMaterial = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [...COLOR_SCHEME_OPTIONS],
        default: "neon",
        label: "Color Scheme",
      },
      streamCount: {
        type: "number",
        min: 5,
        max: 50,
        step: 5,
        default: 20,
        label: "Stream Count",
      },
      packetSize: {
        type: "number",
        min: 2,
        max: 20,
        step: 2,
        default: 10,
        label: "Packet Size",
      },
      flowSpeed: {
        type: "number",
        min: 0.5,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Flow Speed",
      },
    };
  }
}
