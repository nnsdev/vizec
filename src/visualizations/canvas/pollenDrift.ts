import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface PollenDriftConfig extends VisualizationConfig {
  particleCount: number;
  windStrength: number;
  particleSize: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  rotation: number;
  rotationSpeed: number;
  alpha: number;
  type: "pollen" | "seed" | "dandelion";
}

export class PollenDriftVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "pollenDrift",
    name: "Pollen Drift",
    author: "Vizec",
    description: "Delicate floating pollen and seeds that drift with the music",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PollenDriftConfig = {
    sensitivity: 1.0,
    colorScheme: "nature",
    particleCount: 300,
    windStrength: 1.0,
    particleSize: 1.0,
  };
  private width = 0;
  private height = 0;
  private particles: Particle[] = [];
  private smoothedTreble = 0;
  private smoothedBass = 0;
  private windAngle = 0;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    this.initParticles();
  }

  private initParticles(): void {
    this.particles = [];
    const { particleCount } = this.config;

    const types: Array<"pollen" | "seed" | "dandelion"> = ["pollen", "seed", "dandelion"];

    for (let i = 0; i < particleCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      this.particles.push(this.createParticle(type, true));
    }
  }

  private createParticle(type: "pollen" | "seed" | "dandelion", randomY = false): Particle {
    return {
      x: Math.random() * this.width,
      y: randomY ? Math.random() * this.height : -20,
      size: type === "dandelion" ? 8 + Math.random() * 6 :
            type === "seed" ? 4 + Math.random() * 3 :
            2 + Math.random() * 2,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: 0.2 + Math.random() * 0.3,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.02,
      alpha: 0.5 + Math.random() * 0.3,
      type,
    };
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { treble, bass, volume } = audioData;
    const { sensitivity, colorScheme, windStrength, particleSize } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values - faster response
    const smoothing = 0.25;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * 2 * smoothing;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * 2 * smoothing;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update wind direction slowly, with bass gusts
    this.time += deltaTime * 0.001;
    const baseWind = Math.sin(this.time * 0.2) * 0.5;
    const gustStrength = this.smoothedBass * 2;
    this.windAngle = baseWind + Math.sin(this.time * 2) * gustStrength * 0.3;

    // Draw and update particles
    for (const particle of this.particles) {
      this.drawParticle(particle, colors, particleSize);
      this.updateParticle(particle, deltaTime, windStrength, gustStrength);
    }

    // Reset context
    this.ctx.globalAlpha = 1.0;
  }

  private drawParticle(
    particle: Particle,
    colors: { start: string; end: string; glow: string },
    sizeMultiplier: number
  ): void {
    if (!this.ctx) return;

    const size = particle.size * sizeMultiplier;
    this.ctx.save();
    this.ctx.translate(particle.x, particle.y);
    this.ctx.rotate(particle.rotation);
    this.ctx.globalAlpha = particle.alpha;

    if (particle.type === "dandelion") {
      // Draw dandelion seed with fluffy head
      this.ctx.strokeStyle = colors.start;
      this.ctx.lineWidth = 0.5;

      // Stem
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(0, size * 0.6);
      this.ctx.stroke();

      // Fluffy top - multiple thin lines radiating out
      const rays = 8;
      for (let i = 0; i < rays; i++) {
        const angle = (i / rays) * Math.PI * 2;
        const rayLength = size * 0.4;
        this.ctx.beginPath();
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(
          Math.cos(angle) * rayLength,
          Math.sin(angle) * rayLength - size * 0.1
        );
        this.ctx.stroke();

        // Small dot at end
        this.ctx.beginPath();
        this.ctx.arc(
          Math.cos(angle) * rayLength,
          Math.sin(angle) * rayLength - size * 0.1,
          1,
          0,
          Math.PI * 2
        );
        this.ctx.fillStyle = colors.end;
        this.ctx.fill();
      }
    } else if (particle.type === "seed") {
      // Draw elongated seed shape
      this.ctx.fillStyle = colors.start;
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, size * 0.3, size, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Small wing
      this.ctx.strokeStyle = colors.end;
      this.ctx.lineWidth = 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -size);
      this.ctx.quadraticCurveTo(size * 0.5, -size * 1.5, size, -size * 0.8);
      this.ctx.stroke();
    } else {
      // Draw simple pollen dot
      this.ctx.fillStyle = colors.glow;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  private updateParticle(
    particle: Particle,
    deltaTime: number,
    windStrength: number,
    gustStrength: number
  ): void {
    const dt = deltaTime * 0.3;

    // Treble affects horizontal movement (fluttering) - increased effect
    const flutter = Math.sin(this.time * 5 + particle.x * 0.01) * this.smoothedTreble * 15;

    // Wind effect - much stronger base wind and gusts
    const windX = Math.cos(this.windAngle) * windStrength * 5 * (1 + gustStrength * 3);
    const windY = 0.5 + this.smoothedBass * 3; // Bass adds upward gusts

    particle.x += (particle.speedX * 2 + windX + flutter) * dt;
    particle.y += (particle.speedY * 2 - windY * gustStrength) * dt;
    particle.rotation += particle.rotationSpeed * dt * 2 * (1 + this.smoothedTreble);

    // Wrap around edges
    if (particle.x < -20) particle.x = this.width + 20;
    if (particle.x > this.width + 20) particle.x = -20;
    if (particle.y > this.height + 20) {
      // Reset from top
      particle.y = -20;
      particle.x = Math.random() * this.width;
    }
    if (particle.y < -30 && gustStrength > 0.5) {
      // Strong gusts can push some back down
      particle.speedY = Math.abs(particle.speedY);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.particles.length > 0) {
      this.initParticles();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevCount = this.config.particleCount;
    this.config = { ...this.config, ...config } as PollenDriftConfig;

    if (this.config.particleCount !== prevCount && this.width > 0) {
      this.initParticles();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 300,
        min: 100,
        max: 500,
        step: 25,
      },
      windStrength: {
        type: "number",
        label: "Wind Strength",
        default: 1.0,
        min: 0.0,
        max: 3.0,
        step: 0.1,
      },
      particleSize: {
        type: "number",
        label: "Particle Size",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "nature",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
