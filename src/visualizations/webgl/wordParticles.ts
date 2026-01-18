import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
  WordEvent,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface WordParticle {
  sprite: THREE.Sprite;
  text: string;
  age: number;
  maxAge: number;
  velocity: THREE.Vector3;
}

interface WordParticlesConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  particleCount: number;
  size: number;
  drift: number;
}

export class WordParticlesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "wordParticles",
    name: "Word Particles",
    author: "Vizec",
    description: "Word sprites burst and drift with each lyric",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private rendererThree: THREE.WebGLRenderer | null = null;
  private particles: WordParticle[] = [];
  private config: WordParticlesConfig = {
    sensitivity: 1,
    colorScheme: "cyanMagenta",
    particleCount: 26,
    size: 1,
    drift: 1,
  };
  private width = 0;
  private height = 0;
  private time = 0;
  private seen = new Set<string>();

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    this.camera.position.z = 90;

    this.rendererThree = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.rendererThree.setClearColor(0x000000, 0);
    container.appendChild(this.rendererThree.domElement);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.rendererThree) return;

    this.time += deltaTime;

    const speech = audioData.speech;
    if (speech?.isActive) {
      this.ingestWords(speech.recentWords);
    }

    const { bass, treble, volume } = audioData;
    const beat = (bass + treble) * 0.5 * this.config.sensitivity;

    this.particles.forEach((particle) => {
      const material = particle.sprite.material as THREE.SpriteMaterial;
      particle.age += deltaTime;
      particle.sprite.position.addScaledVector(particle.velocity, deltaTime);
      particle.sprite.position.y += Math.sin(this.time * 1.5 + particle.sprite.position.x) * 0.2;
      material.opacity = this.fade(particle.age / particle.maxAge, volume);
      particle.sprite.scale.setScalar(this.config.size * (1 + beat * 0.4));
    });

    this.particles = this.particles.filter((particle) => particle.age < particle.maxAge);

    this.rendererThree.render(this.scene, this.camera);
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
      this.rendererThree.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as WordParticlesConfig;
  }

  destroy(): void {
    if (this.rendererThree && this.rendererThree.domElement.parentElement) {
      this.rendererThree.domElement.parentElement.removeChild(this.rendererThree.domElement);
    }
    this.particles.forEach((particle) => {
      particle.sprite.material.map?.dispose();
      particle.sprite.material.dispose();
    });
    this.particles = [];
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.rendererThree = null;
    this.container = null;
    this.seen.clear();
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1,
        min: 0.5,
        max: 2.5,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      particleCount: {
        type: "number",
        label: "Max Particles",
        default: 26,
        min: 8,
        max: 60,
        step: 1,
      },
      size: {
        type: "number",
        label: "Size",
        default: 1,
        min: 0.4,
        max: 2.5,
        step: 0.1,
      },
      drift: {
        type: "number",
        label: "Drift",
        default: 1,
        min: 0.2,
        max: 3,
        step: 0.1,
      },
    };
  }

  private ingestWords(words: WordEvent[]): void {
    const now = Date.now();
    const maxAge = 9000;
    const recent = words.filter((word) => now - word.timestamp < maxAge);

    for (const word of recent) {
      const key = `${word.word}-${word.timestamp}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      this.spawnWord(word.word);
    }

    if (this.seen.size > 200) {
      const trimmed = Array.from(this.seen).slice(-100);
      this.seen = new Set(trimmed);
    }
  }

  private spawnWord(text: string): void {
    if (!this.scene) return;
    if (this.particles.length >= this.config.particleCount) {
      const removed = this.particles.shift();
      if (removed) {
        removed.sprite.material.map?.dispose();
        removed.sprite.material.dispose();
      }
    }

    const colors = getColorScheme(COLOR_SCHEMES_HEX, this.config.colorScheme);
    const sprite = this.createSprite(text, colors.primary);
    const position = new THREE.Vector3(
      (Math.random() - 0.5) * this.width * 0.3,
      (Math.random() - 0.4) * this.height * 0.3,
      (Math.random() - 0.5) * 20,
    );
    sprite.position.copy(position);

    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 5,
      (Math.random() * 10 + 10) * this.config.drift,
      (Math.random() - 0.5) * 3,
    );

    sprite.scale.setScalar(this.config.size);
    this.scene.add(sprite);

    this.particles.push({
      sprite,
      text,
      age: 0,
      maxAge: 3.5,
      velocity,
    });
  }

  private createSprite(text: string, color: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return new THREE.Sprite(new THREE.SpriteMaterial({ color }));
    }

    ctx.clearRect(0, 0, size, size);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold 64px Arial`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.fillStyle = "white";
    ctx.shadowBlur = 12;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.strokeText(text, size / 2, size / 2);
    ctx.fillText(text, size / 2, size / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.95,
    });

    return new THREE.Sprite(material);
  }

  private fade(t: number, volume: number): number {
    const base = Math.max(0, 1 - t);
    const pulse = 0.7 + volume * 0.6;
    return base * pulse;
  }
}
