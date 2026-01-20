import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface TidalPoolsConfig extends VisualizationConfig {
  poolCount: number;
  waveSpeed: number;
  foamAmount: number;
  reflectionIntensity: number;
}

const COLOR_SCHEMES: Record<string, { water: string; foam: string; rock: string }> = {
  tropical: { water: "#00ced1", foam: "#ffffff", rock: "#8b7355" },
  temperate: { water: "#4682b4", foam: "#f0f8ff", rock: "#696969" },
  arctic: { water: "#5f9ea0", foam: "#fffafa", rock: "#708090" },
  sunset: { water: "#cd5c5c", foam: "#ffe4e1", rock: "#8b4513" },
  night: { water: "#191970", foam: "#e6e6fa", rock: "#2f4f4f" },
};

export class TidalPoolsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "tidalPools",
    name: "Tidal Pools",
    author: "Vizec",
    renderer: "canvas2d",
    transitionType: "crossfade",
    description: "Water ebbing in circular pools with foam edges",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: TidalPoolsConfig = {
    sensitivity: 1.0,
    colorScheme: "tropical",
    poolCount: 8,
    waveSpeed: 0.5,
    foamAmount: 0.5,
    reflectionIntensity: 0.3,
  };

  private pools: TidalPool[] = [];
  private time = 0;
  private currentAudioData: AudioData | null = null;

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

    this.initPools();
  }

  private initPools(): void {
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.tropical;
    this.pools = [];

    const cols = 3;
    const rows = Math.ceil(this.config.poolCount / cols);
    const spacingX = this.width / (cols + 1);
    const spacingY = this.height / (rows + 1);

    for (let i = 0; i < this.config.poolCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = spacingX * (col + 1) + (Math.random() - 0.5) * spacingX * 0.5;
      const y = spacingY * (row + 1) + (Math.random() - 0.5) * spacingY * 0.5;
      const radius = 50 + Math.random() * 80;

      this.pools.push(new TidalPool(x, y, radius, colors));
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime;
    this.currentAudioData = audioData;
    const { bass, mid, treble, volume } = audioData;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.tropical;

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw background hint
    const bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    bgGradient.addColorStop(0, colors.water + "10");
    bgGradient.addColorStop(1, colors.rock + "10");
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Update and draw pools
    for (const pool of this.pools) {
      pool.update(
        bass,
        mid,
        treble,
        volume,
        this.config.sensitivity,
        this.config.waveSpeed,
        this.config.foamAmount,
        this.time,
      );
      pool.draw(this.ctx!, colors);
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.pools.length > 0) {
      this.initPools();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.poolCount;
    this.config = { ...this.config, ...config } as TidalPoolsConfig;

    if (config.poolCount && config.poolCount !== oldCount) {
      this.initPools();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.pools = [];
    this.currentAudioData = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "tropical",
        options: [
          { value: "tropical", label: "Tropical" },
          { value: "temperate", label: "Temperate" },
          { value: "arctic", label: "Arctic" },
          { value: "sunset", label: "Sunset" },
          { value: "night", label: "Night" },
        ],
      },
      poolCount: {
        type: "number",
        label: "Pool Count",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      waveSpeed: {
        type: "number",
        label: "Wave Speed",
        default: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1,
      },
      foamAmount: {
        type: "number",
        label: "Foam Amount",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
      reflectionIntensity: {
        type: "number",
        label: "Reflection Intensity",
        default: 0.3,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}

class TidalPool {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  phase: number;
  phaseSpeed: number;
  colors: { water: string; foam: string; rock: string };
  wavePoints: number[] = [];
  reflectionPoints: number[] = [];

  constructor(
    x: number,
    y: number,
    radius: number,
    colors: { water: string; foam: string; rock: string },
  ) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.phase = Math.random() * Math.PI * 2;
    this.phaseSpeed = 0.5 + Math.random() * 0.5;
    this.colors = colors;
    this.wavePoints = Array(12).fill(0);
    this.reflectionPoints = Array(8).fill(0);
  }

  update(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    sensitivity: number,
    waveSpeed: number,
    foamAmount: number,
    time: number,
  ): void {
    this.phase += this.phaseSpeed * waveSpeed * 0.02;

    // Wave motion
    for (let i = 0; i < this.wavePoints.length; i++) {
      const angle = (i / this.wavePoints.length) * Math.PI * 2;
      const wave =
        Math.sin(angle * 3 + this.phase + time) * 5 + Math.sin(angle * 2 + this.phase * 0.5) * 3;
      this.wavePoints[i] = wave * (1 + bass * sensitivity);
    }

    // Reflection flicker
    for (let i = 0; i < this.reflectionPoints.length; i++) {
      this.reflectionPoints[i] = Math.random() * (volume * sensitivity * foamAmount);
    }

    // Radius breathes with audio
    const targetRadius = this.baseRadius + bass * 15 * sensitivity;
    this.radius += (targetRadius - this.radius) * 0.05;
  }

  draw(ctx: CanvasRenderingContext2D, colors: { water: string; foam: string; rock: string }): void {
    // Rock rim
    ctx.fillStyle = colors.rock + "60";
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + 15, 0, Math.PI * 2);
    ctx.fill();

    // Foam edge
    ctx.strokeStyle = colors.foam;
    ctx.lineWidth = 3 + Math.random() * 2;
    ctx.beginPath();

    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const waveOffset = this.wavePoints[i % this.wavePoints.length];
      const r = this.radius + waveOffset;
      const px = this.x + Math.cos(angle) * r;
      const py = this.y + Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();

    // Water fill with gradient
    const waterGradient = ctx.createRadialGradient(
      this.x - this.radius * 0.3,
      this.y - this.radius * 0.3,
      0,
      this.x,
      this.y,
      this.radius,
    );
    waterGradient.addColorStop(0, colors.water + "aa");
    waterGradient.addColorStop(0.7, colors.water + "80");
    waterGradient.addColorStop(1, colors.water + "40");

    ctx.fillStyle = waterGradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Light reflections
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 3; i++) {
      const angle = -Math.PI / 4 + i * 0.3;
      const length = this.radius * (0.4 + Math.random() * 0.3);
      const reflectionAlpha = this.reflectionPoints[i] || 0;

      ctx.strokeStyle =
        colors.foam +
        Math.floor(reflectionAlpha * 100)
          .toString(16)
          .padStart(2, "0");
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(
        this.x + Math.cos(angle) * this.radius * 0.2,
        this.y + Math.sin(angle) * this.radius * 0.2,
      );
      ctx.lineTo(
        this.x + Math.cos(angle) * this.radius * 0.2 + Math.cos(angle) * length,
        this.y + Math.sin(angle) * this.radius * 0.2 + Math.sin(angle) * length,
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }
}
