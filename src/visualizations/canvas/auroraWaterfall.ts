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

interface AuroraWaterfallConfig extends VisualizationConfig {
  ribbonCount: number;
  flowSpeed: number;
  glowIntensity: number;
}

interface Ribbon {
  x: number;
  y: number;
  width: number;
  hue: number;
  speed: number;
  amplitude: number;
  phase: number;
  length: number;
}

export class AuroraWaterfallVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "auroraWaterfall",
    name: "Aurora Waterfall",
    author: "Vizec",
    description: "Cascading aurora-like light streams that flow with the music",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: AuroraWaterfallConfig = {
    sensitivity: 1.0,
    colorScheme: "nature",
    ribbonCount: 8,
    flowSpeed: 1.0,
    glowIntensity: 1.0,
  };
  private width = 0;
  private height = 0;
  private ribbons: Ribbon[] = [];
  private time = 0;
  private smoothedBass = 0;
  private smoothedTreble = 0;

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

    this.initRibbons();
  }

  private initRibbons(): void {
    this.ribbons = [];
    const { ribbonCount } = this.config;

    for (let i = 0; i < ribbonCount; i++) {
      this.ribbons.push({
        x: (this.width / (ribbonCount + 1)) * (i + 1),
        y: -Math.random() * this.height * 0.5,
        width: 30 + Math.random() * 50,
        hue: (i / ribbonCount) * 60 + 120, // Green to cyan range
        speed: 0.5 + Math.random() * 0.5,
        amplitude: 20 + Math.random() * 40,
        phase: Math.random() * Math.PI * 2,
        length: this.height * 0.3 + Math.random() * this.height * 0.4,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, treble, volume } = audioData;
    const { sensitivity, colorScheme, flowSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update time based on bass (flow speed)
    const baseSpeed = flowSpeed * 2;
    const audioSpeedBoost = 1 + this.smoothedBass * 2;
    this.time += deltaTime * 0.001 * baseSpeed * audioSpeedBoost;

    // Draw each ribbon
    for (const ribbon of this.ribbons) {
      this.drawRibbon(ribbon, volume, colors);

      // Update ribbon position
      ribbon.y += ribbon.speed * flowSpeed * audioSpeedBoost * deltaTime * 0.1;
      ribbon.phase += deltaTime * 0.002;

      // Reset ribbon when it goes off screen
      if (ribbon.y > this.height + ribbon.length) {
        ribbon.y = -ribbon.length;
        ribbon.x = Math.random() * this.width;
      }
    }

    // Reset context state
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  private drawRibbon(ribbon: Ribbon, volume: number, colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const segments = 30;
    const segmentHeight = ribbon.length / segments;
    const brightnessBoost = 0.5 + this.smoothedTreble * 0.5;

    // Set up glow effect
    this.ctx.shadowBlur = 20 * this.config.glowIntensity * brightnessBoost;
    this.ctx.shadowColor = colors.glow;

    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const y = ribbon.y + i * segmentHeight;

      // Skip if off screen
      if (y < -50 || y > this.height + 50) continue;

      // Horizontal wave motion
      const waveX = Math.sin(ribbon.phase + t * Math.PI * 2 + this.time) * ribbon.amplitude;
      const x = ribbon.x + waveX;

      // Width varies along ribbon
      const widthFactor = Math.sin(t * Math.PI) * (0.5 + this.smoothedBass * 0.5);
      const currentWidth = ribbon.width * widthFactor;

      // Alpha fades at ends
      const alphaFade = Math.sin(t * Math.PI);
      const alpha = 0.6 * alphaFade * brightnessBoost;

      // Color gradient along ribbon
      const gradient = this.ctx.createLinearGradient(
        x - currentWidth / 2, y,
        x + currentWidth / 2, y
      );

      // Parse colors and apply alpha
      gradient.addColorStop(0, this.colorWithAlpha(colors.start, 0));
      gradient.addColorStop(0.3, this.colorWithAlpha(colors.start, alpha * 0.7));
      gradient.addColorStop(0.5, this.colorWithAlpha(colors.end, alpha));
      gradient.addColorStop(0.7, this.colorWithAlpha(colors.start, alpha * 0.7));
      gradient.addColorStop(1, this.colorWithAlpha(colors.start, 0));

      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(x - currentWidth / 2, y, currentWidth, segmentHeight + 1);
    }
  }

  private colorWithAlpha(hexColor: string, alpha: number): string {
    // Convert hex to rgba
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

    // Reinitialize ribbons for new size
    if (this.ribbons.length > 0) {
      this.initRibbons();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevRibbonCount = this.config.ribbonCount;
    this.config = { ...this.config, ...config } as AuroraWaterfallConfig;

    if (this.config.ribbonCount !== prevRibbonCount && this.width > 0) {
      this.initRibbons();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.ribbons = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      ribbonCount: {
        type: "number",
        label: "Ribbon Count",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      flowSpeed: {
        type: "number",
        label: "Flow Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.0,
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
