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

interface SunFlareConfig extends VisualizationConfig {
  rayCount: number;
  sunSize: number;
  rayLength: number;
}

export class SunFlareVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "sunFlare",
    name: "Sun Flare",
    author: "Vizec",
    description: "Harsh desert sun with rays that intensify with audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: SunFlareConfig = {
    sensitivity: 1.0,
    colorScheme: "golden",
    rayCount: 24,
    sunSize: 1.0,
    rayLength: 1.0,
  };
  private width = 0;
  private height = 0;
  private smoothedVolume = 0;
  private smoothedBass = 0;
  private smoothedTreble = 0;
  private time = 0;
  private rayPhases: number[] = [];

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

    this.initRayPhases();
  }

  private initRayPhases(): void {
    this.rayPhases = [];
    for (let i = 0; i < this.config.rayCount; i++) {
      this.rayPhases.push(Math.random() * Math.PI * 2);
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { volume, bass, treble, frequencyData } = audioData;
    const { sensitivity, colorScheme, rayCount, sunSize, rayLength } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.15;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * sensitivity * smoothing;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Sun position - upper center
    const sunX = this.width / 2;
    const sunY = this.height * 0.25;

    // Calculate sun radius with bass pulse
    const baseRadius = Math.min(this.width, this.height) * 0.08 * sunSize;
    const pulsedRadius = baseRadius * (1 + this.smoothedBass * 0.3);

    // Draw outer glow halo
    this.drawGlow(sunX, sunY, pulsedRadius * 3, colors);

    // Draw rays
    this.drawRays(sunX, sunY, pulsedRadius, rayCount, rayLength, colors, frequencyData);

    // Draw sun corona
    this.drawCorona(sunX, sunY, pulsedRadius, colors);

    // Draw sun core
    this.drawSunCore(sunX, sunY, pulsedRadius, colors);

    // Reset context
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  private drawGlow(x: number, y: number, radius: number, colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, this.colorWithAlpha(colors.glow, 0.3));
    gradient.addColorStop(0.3, this.colorWithAlpha(colors.end, 0.15));
    gradient.addColorStop(0.7, this.colorWithAlpha(colors.start, 0.05));
    gradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.5 + this.smoothedVolume * 0.3;
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawRays(
    x: number,
    y: number,
    sunRadius: number,
    rayCount: number,
    rayLengthMultiplier: number,
    colors: { start: string; end: string; glow: string },
    frequencyData: Uint8Array
  ): void {
    if (!this.ctx) return;

    const maxRayLength = Math.min(this.width, this.height) * 0.5 * rayLengthMultiplier;
    const step = Math.floor(frequencyData.length / rayCount);

    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 - Math.PI / 2; // Start from top

      // Get frequency value for this ray
      const freqValue = frequencyData[i * step] / 255;
      const volumeBoost = this.smoothedVolume;

      // Calculate ray length based on volume and individual frequency
      const baseLength = sunRadius * 1.5;
      const audioLength = maxRayLength * (0.3 + freqValue * 0.7) * (0.5 + volumeBoost);
      const rayLength = baseLength + audioLength;

      // Ray oscillation
      const oscillation = Math.sin(this.time * 2 + this.rayPhases[i]) * 0.1;
      const finalLength = rayLength * (1 + oscillation);

      // Calculate ray width - narrower at tip
      const baseWidth = Math.PI / rayCount * 0.4;
      const rayWidth = baseWidth * (0.5 + freqValue * 0.5);

      // Draw ray
      const startRadius = sunRadius * 0.9;
      const endRadius = startRadius + finalLength;

      const gradient = this.ctx.createRadialGradient(x, y, startRadius, x, y, endRadius);
      gradient.addColorStop(0, this.colorWithAlpha(colors.glow, 0.5));
      gradient.addColorStop(0.3, this.colorWithAlpha(colors.end, 0.3));
      gradient.addColorStop(0.7, this.colorWithAlpha(colors.start, 0.15));
      gradient.addColorStop(1, "transparent");

      this.ctx.globalAlpha = 0.4 + freqValue * 0.2;
      this.ctx.fillStyle = gradient;

      this.ctx.beginPath();
      this.ctx.moveTo(
        x + Math.cos(angle - rayWidth) * startRadius,
        y + Math.sin(angle - rayWidth) * startRadius
      );
      this.ctx.lineTo(
        x + Math.cos(angle) * endRadius,
        y + Math.sin(angle) * endRadius
      );
      this.ctx.lineTo(
        x + Math.cos(angle + rayWidth) * startRadius,
        y + Math.sin(angle + rayWidth) * startRadius
      );
      this.ctx.closePath();
      this.ctx.fill();
    }
  }

  private drawCorona(
    x: number,
    y: number,
    radius: number,
    colors: { start: string; end: string; glow: string }
  ): void {
    if (!this.ctx) return;

    const coronaRadius = radius * 1.3;
    const gradient = this.ctx.createRadialGradient(x, y, radius * 0.8, x, y, coronaRadius);
    gradient.addColorStop(0, this.colorWithAlpha(colors.glow, 0.8));
    gradient.addColorStop(0.5, this.colorWithAlpha(colors.end, 0.4));
    gradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, coronaRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawSunCore(
    x: number,
    y: number,
    radius: number,
    colors: { start: string; end: string; glow: string }
  ): void {
    if (!this.ctx) return;

    // Inner glow
    const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.3, colors.glow);
    gradient.addColorStop(0.7, colors.end);
    gradient.addColorStop(1, colors.start);

    this.ctx.globalAlpha = 0.7;
    this.ctx.shadowBlur = 30;
    this.ctx.shadowColor = colors.glow;
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Bright center
    this.ctx.globalAlpha = 0.9;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
    this.ctx.fill();
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevRayCount = this.config.rayCount;
    this.config = { ...this.config, ...config } as SunFlareConfig;

    if (this.config.rayCount !== prevRayCount) {
      this.initRayPhases();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      rayCount: {
        type: "number",
        label: "Ray Count",
        default: 24,
        min: 8,
        max: 48,
        step: 4,
      },
      sunSize: {
        type: "number",
        label: "Sun Size",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      rayLength: {
        type: "number",
        label: "Ray Length",
        default: 1.0,
        min: 0.3,
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
