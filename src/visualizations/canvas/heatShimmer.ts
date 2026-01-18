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

interface HeatShimmerConfig extends VisualizationConfig {
  waveCount: number;
  distortionIntensity: number;
  colorScheme: string;
}

interface HeatWave {
  y: number;
  amplitude: number;
  frequency: number;
  speed: number;
  phase: number;
  alpha: number;
}

export class HeatShimmerVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "heatShimmer",
    name: "Heat Shimmer",
    author: "Vizec",
    description: "Wavy distortion effect like a desert mirage",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: HeatShimmerConfig = {
    sensitivity: 1.0,
    waveCount: 8,
    distortionIntensity: 1.0,
    colorScheme: "fire",
  };
  private width = 0;
  private height = 0;
  private waves: HeatWave[] = [];
  private time = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedVolume = 0;

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

  private initWaves(): void {
    this.waves = [];
    const { waveCount } = this.config;

    for (let i = 0; i < waveCount; i++) {
      const yPos = (i / waveCount) * this.height;
      this.waves.push({
        y: yPos,
        amplitude: 10 + Math.random() * 20,
        frequency: 0.005 + Math.random() * 0.01,
        speed: 0.5 + Math.random() * 1.5,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.15 + Math.random() * 0.2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, distortionIntensity } = this.config;
    const { volume, bass, mid, treble } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Clear canvas (transparent background)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate distortion multipliers
    const bassEffect = this.smoothedBass * sensitivity;
    const midEffect = this.smoothedMid * sensitivity;
    const distortMult = (1 + bassEffect * 2) * distortionIntensity;

    // Draw heat shimmer waves
    this.drawShimmerWaves(colors, distortMult, midEffect);

    // Draw horizontal heat bands
    this.drawHeatBands(colors, bassEffect, treble * sensitivity);

    // Draw rising heat wisps
    this.drawHeatWisps(colors, this.smoothedVolume);
  }

  private drawShimmerWaves(
    colors: { start: string; end: string; glow: string },
    distortMult: number,
    midEffect: number
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;

    this.waves.forEach((wave, index) => {
      const waveAlpha = wave.alpha * (0.3 + this.smoothedVolume * 0.5);

      // Draw wavy distortion line
      ctx.beginPath();

      for (let x = 0; x <= this.width; x += 3) {
        const phaseOffset = this.time * wave.speed + wave.phase;
        const amplitude = wave.amplitude * distortMult * (1 + midEffect);

        // Multiple sine waves combined for more organic look
        const y1 = Math.sin(x * wave.frequency + phaseOffset) * amplitude;
        const y2 = Math.sin(x * wave.frequency * 1.5 + phaseOffset * 0.7) * amplitude * 0.5;
        const y3 = Math.sin(x * wave.frequency * 0.5 + phaseOffset * 1.3) * amplitude * 0.3;

        const yOffset = y1 + y2 + y3;
        const finalY = wave.y + yOffset;

        if (x === 0) {
          ctx.moveTo(x, finalY);
        } else {
          ctx.lineTo(x, finalY);
        }
      }

      // Create gradient for wave
      const gradient = ctx.createLinearGradient(0, wave.y - 30, 0, wave.y + 30);
      gradient.addColorStop(0, this.hexToRgba(colors.start, 0));
      gradient.addColorStop(0.5, this.hexToRgba(colors.glow, waveAlpha));
      gradient.addColorStop(1, this.hexToRgba(colors.end, 0));

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 2 + midEffect * 3;
      ctx.stroke();

      // Draw glow around wave
      if (index % 2 === 0) {
        ctx.strokeStyle = this.hexToRgba(colors.glow, waveAlpha * 0.3);
        ctx.lineWidth = 8 + midEffect * 5;
        ctx.stroke();
      }
    });
  }

  private drawHeatBands(
    colors: { start: string; end: string; glow: string },
    bassEffect: number,
    trebleEffect: number
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const bandCount = 5;
    const bandHeight = this.height / bandCount;

    for (let i = 0; i < bandCount; i++) {
      const yBase = i * bandHeight;
      const progress = i / bandCount;

      // Shimmer effect based on audio and time
      const shimmer = Math.sin(this.time * 3 + progress * Math.PI * 2) * 0.5 + 0.5;
      const bandAlpha = 0.02 + shimmer * 0.03 + bassEffect * 0.02;

      // Create vertical gradient for heat band
      const gradient = ctx.createLinearGradient(0, yBase, 0, yBase + bandHeight);

      // Interpolate between colors based on vertical position
      const colorT = progress;
      const bandColor = this.interpolateColor(colors.start, colors.end, colorT);

      gradient.addColorStop(0, this.hexToRgba(bandColor, 0));
      gradient.addColorStop(0.3, this.hexToRgba(bandColor, bandAlpha));
      gradient.addColorStop(0.7, this.hexToRgba(bandColor, bandAlpha));
      gradient.addColorStop(1, this.hexToRgba(bandColor, 0));

      ctx.fillStyle = gradient;
      ctx.fillRect(0, yBase, this.width, bandHeight);

      // Add sparkle on high treble
      if (trebleEffect > 0.5 && Math.random() < trebleEffect * 0.3) {
        const sparkleX = Math.random() * this.width;
        const sparkleY = yBase + Math.random() * bandHeight;
        const sparkleSize = 2 + Math.random() * 3;

        const sparkleGradient = ctx.createRadialGradient(
          sparkleX, sparkleY, 0,
          sparkleX, sparkleY, sparkleSize * 3
        );
        sparkleGradient.addColorStop(0, this.hexToRgba(colors.glow, 0.5));
        sparkleGradient.addColorStop(1, this.hexToRgba(colors.glow, 0));

        ctx.fillStyle = sparkleGradient;
        ctx.fillRect(sparkleX - sparkleSize * 3, sparkleY - sparkleSize * 3, sparkleSize * 6, sparkleSize * 6);
      }
    }
  }

  private drawHeatWisps(
    colors: { start: string; end: string; glow: string },
    volumeLevel: number
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const wispCount = 6;

    for (let i = 0; i < wispCount; i++) {
      const xBase = (i / wispCount) * this.width + this.width / (wispCount * 2);
      const phase = i * 0.5 + this.time * 0.5;

      // Rising wavy path
      ctx.beginPath();

      const wispAlpha = 0.1 + volumeLevel * 0.15;

      for (let t = 0; t <= 1; t += 0.02) {
        const y = this.height - t * this.height;
        const sway = Math.sin(phase + t * 5) * 30 * (1 - t * 0.5);
        const x = xBase + sway;

        if (t === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      // Gradient from bottom to top (hot to cool)
      const gradient = ctx.createLinearGradient(xBase, this.height, xBase, 0);
      gradient.addColorStop(0, this.hexToRgba(colors.start, wispAlpha));
      gradient.addColorStop(0.5, this.hexToRgba(colors.glow, wispAlpha * 0.5));
      gradient.addColorStop(1, this.hexToRgba(colors.end, 0));

      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3 + volumeLevel * 2;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  private interpolateColor(color1: string, color2: string, t: number): string {
    const r1 = parseInt(color1.slice(1, 3), 16);
    const g1 = parseInt(color1.slice(3, 5), 16);
    const b1 = parseInt(color1.slice(5, 7), 16);

    const r2 = parseInt(color2.slice(1, 3), 16);
    const g2 = parseInt(color2.slice(3, 5), 16);
    const b2 = parseInt(color2.slice(5, 7), 16);

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initWaves();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.waveCount;
    this.config = { ...this.config, ...config } as HeatShimmerConfig;

    if (this.config.waveCount !== oldCount && this.width > 0) {
      this.initWaves();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.waves = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "fire",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      waveCount: {
        type: "number",
        label: "Wave Layers",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      distortionIntensity: {
        type: "number",
        label: "Distortion",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
