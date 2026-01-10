import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_ARRAY,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  trail: { x: number; y: number }[];
}

interface Firework {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
  exploded: boolean;
}

interface FireworksConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  particleCount: number;
  gravity: number;
  trailLength: number;
  beatThreshold: number;
}

export class FireworksVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "fireworks",
    name: "Fireworks",
    author: "Vizec",
    description: "Fireworks that launch and explode on beats",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: FireworksConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    particleCount: 80,
    gravity: 0.15,
    trailLength: 5,
    beatThreshold: 0.3,
  };

  private fireworks: Firework[] = [];
  private particles: Particle[] = [];
  private lastBass = 0;
  private beatCooldown = 0;

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
  }

  private launchFirework(): void {
    const { colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ARRAY, colorScheme).colors;

    this.fireworks.push({
      x: Math.random() * this.width * 0.8 + this.width * 0.1,
      y: this.height,
      vy: -12 - Math.random() * 5,
      targetY: this.height * 0.2 + Math.random() * this.height * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      exploded: false,
    });
  }

  private explode(firework: Firework): void {
    const { particleCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ARRAY, colorScheme).colors;

    // Main explosion
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.2;
      const speed = 3 + Math.random() * 5;

      this.particles.push({
        x: firework.x,
        y: firework.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1,
        color:
          Math.random() < 0.7 ? firework.color : colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 2,
        trail: [],
      });
    }

    // Inner burst
    for (let i = 0; i < particleCount / 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 2;

      this.particles.push({
        x: firework.x,
        y: firework.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.8,
        maxLife: 0.8,
        color: "#ffffff",
        size: 1.5,
        trail: [],
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid } = audioData;
    void mid; // Used for random launches
    const { sensitivity, gravity, trailLength, beatThreshold } = this.config;

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Beat detection - launch firework
    this.beatCooldown -= deltaTime;
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const bassIncrease = bassBoost - this.lastBass;

    if (bassIncrease > beatThreshold && this.beatCooldown <= 0) {
      this.launchFirework();
      // Sometimes launch multiple
      if (bassBoost > 0.6) {
        this.launchFirework();
      }
      if (bassBoost > 0.8) {
        this.launchFirework();
      }
      this.beatCooldown = 0.15;
    }
    this.lastBass = bassBoost;

    // Random launches based on mid frequencies
    if (Math.random() < mid * sensitivity * 0.02) {
      this.launchFirework();
    }

    // Update and draw fireworks (rising)
    this.ctx.globalAlpha = 0.9;
    for (let i = this.fireworks.length - 1; i >= 0; i--) {
      const fw = this.fireworks[i];

      // Move firework up
      fw.y += fw.vy;
      fw.vy += gravity * 0.5; // Slight gravity on ascent

      // Check if reached target
      if (fw.y <= fw.targetY || fw.vy >= 0) {
        this.explode(fw);
        this.fireworks.splice(i, 1);
        continue;
      }

      // Draw firework trail
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = fw.color;
      this.ctx.fillStyle = fw.color;
      this.ctx.beginPath();
      this.ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
      this.ctx.fill();

      // Trail
      this.ctx.strokeStyle = fw.color + "80";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(fw.x, fw.y);
      this.ctx.lineTo(fw.x, fw.y + 20);
      this.ctx.stroke();
    }

    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Store trail position
      if (trailLength > 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > trailLength) {
          p.trail.shift();
        }
      }

      // Physics
      p.x += p.vx;
      p.y += p.vy;
      p.vy += gravity;
      p.vx *= 0.98; // Air resistance
      p.vy *= 0.98;
      p.life -= deltaTime * 1.2;

      // Remove dead particles
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      const alpha = p.life / p.maxLife;

      // Draw trail
      if (p.trail.length > 1) {
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = p.size * alpha * 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (let j = 1; j < p.trail.length; j++) {
          const trailAlpha = (j / p.trail.length) * alpha * 0.5;
          this.ctx.globalAlpha = trailAlpha * 0.7;
          this.ctx.lineTo(p.trail[j].x, p.trail[j].y);
        }
        this.ctx.stroke();
      }

      // Draw particle
      this.ctx.globalAlpha = alpha * 0.7;
      this.ctx.shadowBlur = 8 * alpha;
      this.ctx.shadowColor = p.color;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Limit particles for performance
    while (this.particles.length > 1000) {
      this.particles.shift();
    }

    // Reset
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as FireworksConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.fireworks = [];
    this.particles = [];
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
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      particleCount: {
        type: "number",
        min: 40,
        max: 150,
        step: 10,
        default: 80,
        label: "Particle Count",
      },
      gravity: { type: "number", min: 0.05, max: 0.3, step: 0.05, default: 0.15, label: "Gravity" },
      trailLength: { type: "number", min: 0, max: 10, step: 1, default: 5, label: "Trail Length" },
      beatThreshold: {
        type: "number",
        min: 0.1,
        max: 0.6,
        step: 0.05,
        default: 0.3,
        label: "Beat Threshold",
      },
    };
  }
}
