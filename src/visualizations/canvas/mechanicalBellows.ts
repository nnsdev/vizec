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

interface MechanicalBellowsConfig extends VisualizationConfig {
  bellowsCount: number;
  steamIntensity: number;
  mechanicalDetail: number;
}

interface SteamParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface Bellows {
  x: number;
  y: number;
  width: number;
  height: number;
  compression: number;
  targetCompression: number;
  phase: number;
}

export class MechanicalBellowsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "mechanicalBellows",
    name: "Mechanical Bellows",
    author: "Vizec",
    description: "Industrial bellows pumping to the beat with steam particles",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: MechanicalBellowsConfig = {
    sensitivity: 1.0,
    colorScheme: "golden",
    bellowsCount: 3,
    steamIntensity: 1.0,
    mechanicalDetail: 1.0,
  };
  private width = 0;
  private height = 0;
  private bellows: Bellows[] = [];
  private steamParticles: SteamParticle[] = [];
  private smoothedBass = 0;
  private smoothedTreble = 0;
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

    this.initBellows();
  }

  private initBellows(): void {
    this.bellows = [];
    const { bellowsCount } = this.config;

    for (let i = 0; i < bellowsCount; i++) {
      this.bellows.push({
        x: (this.width / (bellowsCount + 1)) * (i + 1),
        y: this.height * 0.6,
        width: Math.min(150, this.width / (bellowsCount + 1) * 0.7),
        height: 120,
        compression: 0.5,
        targetCompression: 0.5,
        phase: (i / bellowsCount) * Math.PI * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, treble } = audioData;
    const { sensitivity, colorScheme, steamIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values - increased smoothing factor and doubled sensitivity multiplier
    const smoothing = 0.35;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * 2 * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * 2 * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update and draw bellows
    for (let i = 0; i < this.bellows.length; i++) {
      const bellows = this.bellows[i];

      // Update compression based on bass - clamp to prevent going underground
      const clampedBass = Math.min(this.smoothedBass, 1.0);
      bellows.targetCompression = 0.2 + clampedBass * 0.7;
      bellows.targetCompression = Math.min(bellows.targetCompression, 0.95); // Max compression limit
      bellows.compression += (bellows.targetCompression - bellows.compression) * 0.15;

      // Emit steam - much more aggressive
      const steamCount = Math.floor((0.3 + bellows.compression) * steamIntensity * 25);
      for (let j = 0; j < steamCount; j++) {
        this.emitSteam(bellows);
      }

      this.drawBellows(bellows, colors, i);
    }

    // Update and draw steam
    this.updateSteamParticles(deltaTime);
    this.drawSteamParticles(colors);

    // Reset context
    this.ctx.globalAlpha = 1.0;
  }

  private emitSteam(bellows: Bellows): void {
    if (this.steamParticles.length > 500) return;

    const side = Math.random() > 0.5 ? 1 : -1;
    this.steamParticles.push({
      x: bellows.x + side * bellows.width * 0.4,
      y: bellows.y - bellows.height * (1 - bellows.compression) * 0.5,
      vx: side * (2 + Math.random() * 4),
      vy: -3 - Math.random() * 5,
      size: 10 + Math.random() * 20,
      alpha: 0.6 + Math.random() * 0.3,
      life: 1.5,
      maxLife: 1.5,
    });
  }

  private updateSteamParticles(deltaTime: number): void {
    const dt = deltaTime * 0.001;

    for (let i = this.steamParticles.length - 1; i >= 0; i--) {
      const p = this.steamParticles[i];

      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy -= 0.05 * dt * 60; // Float upward
      p.size += 0.3 * dt * 60;
      p.life -= dt * 0.8;
      p.alpha = p.life * 0.5;

      if (p.life <= 0) {
        this.steamParticles.splice(i, 1);
      }
    }
  }

  private drawSteamParticles(colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    for (const p of this.steamParticles) {
      const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      gradient.addColorStop(0, this.colorWithAlpha("#ffffff", p.alpha * 0.5));
      gradient.addColorStop(0.5, this.colorWithAlpha(colors.glow, p.alpha * 0.3));
      gradient.addColorStop(1, "transparent");

      this.ctx.globalAlpha = p.alpha;
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawBellows(bellows: Bellows, colors: { start: string; end: string; glow: string }, index: number): void {
    if (!this.ctx) return;

    const { x, y, width, height, compression } = bellows;
    const compressedHeight = height * (0.3 + (1 - compression) * 0.7);

    this.ctx.globalAlpha = 0.6;

    // Draw base plate
    this.ctx.fillStyle = colors.start;
    this.ctx.fillRect(x - width * 0.6, y, width * 1.2, 15);

    // Draw accordion pleats
    const pleats = 6;
    const pleatHeight = compressedHeight / pleats;

    for (let i = 0; i < pleats; i++) {
      const py = y - (i + 1) * pleatHeight;
      const isEven = i % 2 === 0;
      const inset = isEven ? 0 : width * 0.1;

      // Pleat gradient
      const gradient = this.ctx.createLinearGradient(x - width / 2, py, x + width / 2, py);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(0.5, colors.end);
      gradient.addColorStop(1, colors.start);

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.moveTo(x - width / 2 + inset, py);
      this.ctx.lineTo(x + width / 2 - inset, py);
      this.ctx.lineTo(x + width / 2 - (isEven ? width * 0.1 : 0), py - pleatHeight);
      this.ctx.lineTo(x - width / 2 + (isEven ? width * 0.1 : 0), py - pleatHeight);
      this.ctx.closePath();
      this.ctx.fill();

      // Pleat edge line
      this.ctx.strokeStyle = colors.glow;
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = 0.4;
      this.ctx.beginPath();
      this.ctx.moveTo(x - width / 2 + inset, py);
      this.ctx.lineTo(x + width / 2 - inset, py);
      this.ctx.stroke();
    }

    // Draw top handle
    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = colors.end;
    const topY = y - compressedHeight;
    this.ctx.fillRect(x - width * 0.4, topY - 10, width * 0.8, 10);

    // Handle grip
    this.ctx.fillStyle = colors.start;
    this.ctx.beginPath();
    this.ctx.arc(x, topY - 10, 15, Math.PI, 0);
    this.ctx.fill();

    // Draw rivets
    this.ctx.fillStyle = colors.glow;
    this.ctx.globalAlpha = 0.5;
    const rivetPositions = [-0.4, -0.2, 0.2, 0.4];
    for (const pos of rivetPositions) {
      this.ctx.beginPath();
      this.ctx.arc(x + width * pos, y + 7, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Steam outlet nozzles
    this.ctx.fillStyle = colors.start;
    this.ctx.globalAlpha = 0.55;
    this.ctx.fillRect(x - width * 0.5 - 10, y - compressedHeight * 0.3, 12, 8);
    this.ctx.fillRect(x + width * 0.5 - 2, y - compressedHeight * 0.3, 12, 8);
  }

  private colorWithAlpha(hexColor: string, alpha: number): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.bellows.length > 0) {
      this.initBellows();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevCount = this.config.bellowsCount;
    this.config = { ...this.config, ...config } as MechanicalBellowsConfig;

    if (this.config.bellowsCount !== prevCount && this.width > 0) {
      this.initBellows();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.bellows = [];
    this.steamParticles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      bellowsCount: {
        type: "number",
        label: "Bellows Count",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
      },
      steamIntensity: {
        type: "number",
        label: "Steam Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      mechanicalDetail: {
        type: "number",
        label: "Detail Level",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "golden",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
