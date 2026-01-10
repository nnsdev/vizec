import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_STRING,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface SpectrumCircleConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  barCount: number;
  innerRadius: number;
  barWidth: number;
  glow: boolean;
  mirror: boolean;
  rotate: boolean;
}

export class SpectrumCircleVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "spectrumCircle",
    name: "Spectrum Circle",
    author: "Vizec",
    description: "Frequency bars arranged in a circle like a sun",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: SpectrumCircleConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    barCount: 180,
    innerRadius: 100,
    barWidth: 3,
    glow: true,
    mirror: true,
    rotate: true,
  };

  private rotation = 0;
  private smoothedData: number[] = [];

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

    this.smoothedData = Array.from({ length: this.config.barCount }, () => 0);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass, volume } = audioData;
    const { sensitivity, colorScheme, barCount, innerRadius, barWidth, glow, mirror, rotate } =
      this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxBarLength = Math.min(this.width, this.height) / 3;

    // Rotate based on audio
    if (rotate) {
      this.rotation += deltaTime * 0.2 * (1 + bass * sensitivity);
    }

    // Set transparency
    this.ctx.globalAlpha = 0.7;

    // Glow effect
    if (glow) {
      this.ctx.shadowBlur = 15 + volume * 10;
      this.ctx.shadowColor = colors.glow;
    }

    const barsToRender = mirror ? barCount / 2 : barCount;
    const angleStep = (Math.PI * 2) / barCount;
    const freqStep = Math.floor(frequencyData.length / barsToRender);

    for (let i = 0; i < barsToRender; i++) {
      // Get frequency value with compensation for higher frequencies
      const freqIndex = i * freqStep;
      const freqCompensation = 1 + (i / barsToRender) * 2;
      const rawValue = (frequencyData[freqIndex] / 255) * freqCompensation;
      const normalizedValue = Math.min(1, rawValue) * sensitivity;

      // Smooth the data
      this.smoothedData[i] = this.smoothedData[i] * 0.7 + normalizedValue * 0.3;
      const value = this.smoothedData[i];

      const barLength = value * maxBarLength;

      // Calculate angle
      const angle = i * angleStep + this.rotation;
      const mirrorAngle = -i * angleStep + this.rotation;

      // Create gradient for bar
      const gradient = this.ctx.createLinearGradient(
        centerX + Math.cos(angle) * innerRadius,
        centerY + Math.sin(angle) * innerRadius,
        centerX + Math.cos(angle) * (innerRadius + barLength),
        centerY + Math.sin(angle) * (innerRadius + barLength),
      );
      gradient.addColorStop(0, colors.primary);
      gradient.addColorStop(1, colors.secondary);

      // Draw bar
      this.drawBar(centerX, centerY, angle, innerRadius, barLength, barWidth + value * 2, gradient);

      // Draw mirrored bar
      if (mirror) {
        this.drawBar(
          centerX,
          centerY,
          mirrorAngle,
          innerRadius,
          barLength,
          barWidth + value * 2,
          gradient,
        );
      }
    }

    // Draw center circle
    const centerRadius = innerRadius * 0.3 + bass * sensitivity * 30;
    const centerGradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      centerRadius,
    );
    centerGradient.addColorStop(0, colors.primary + "80");
    centerGradient.addColorStop(0.5, colors.secondary + "40");
    centerGradient.addColorStop(1, "transparent");

    this.ctx.fillStyle = centerGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw inner ring
    this.ctx.strokeStyle = colors.primary + "60";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, innerRadius - 5, 0, Math.PI * 2);
    this.ctx.stroke();

    // Reset
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;
  }

  private drawBar(
    cx: number,
    cy: number,
    angle: number,
    innerR: number,
    length: number,
    width: number,
    style: CanvasGradient,
  ): void {
    if (!this.ctx || length < 1) return;

    const x1 = cx + Math.cos(angle) * innerR;
    const y1 = cy + Math.sin(angle) * innerR;
    const x2 = cx + Math.cos(angle) * (innerR + length);
    const y2 = cy + Math.sin(angle) * (innerR + length);

    this.ctx.strokeStyle = style;
    this.ctx.lineWidth = width;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1);
    this.ctx.lineTo(x2, y2);
    this.ctx.stroke();
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
    this.config = { ...this.config, ...config } as SpectrumCircleConfig;
    if (config.barCount && config.barCount !== this.smoothedData.length) {
      this.smoothedData = Array.from({ length: this.config.barCount }, () => 0);
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.smoothedData = [];
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
      barCount: { type: "number", min: 60, max: 360, step: 30, default: 180, label: "Bar Count" },
      innerRadius: {
        type: "number",
        min: 50,
        max: 200,
        step: 10,
        default: 100,
        label: "Inner Radius",
      },
      glow: { type: "boolean", default: true, label: "Glow Effect" },
      mirror: { type: "boolean", default: true, label: "Mirror Mode" },
      rotate: { type: "boolean", default: true, label: "Auto Rotate" },
    };
  }
}
