import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_GRID, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface NeonGridConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  gridSpeed: number;
  gridLines: number;
  showSun: boolean;
  showMountains: boolean;
}

export class NeonGridVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "neonGrid",
    name: "Neon Grid",
    author: "Vizec",
    description: "80s retro synthwave grid with audio-reactive mountains",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: NeonGridConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    gridSpeed: 2,
    gridLines: 20,
    showSun: true,
    showMountains: true,
  };

  private gridOffset = 0;
  private mountainPoints: number[] = [];

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

    this.initMountains();
  }

  private initMountains(): void {
    this.mountainPoints = [];
    const points = 50;
    for (let i = 0; i <= points; i++) {
      this.mountainPoints.push(Math.random() * 0.5 + 0.2);
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, gridSpeed, gridLines, showSun, showMountains } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRID, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const horizonY = this.height * 0.5;

    // Skip sky gradient for transparent background

    // Draw sun
    if (showSun) {
      const sunY = horizonY * 0.7;
      const sunRadius = 80 + bass * sensitivity * 30;

      // Sun glow
      const sunGlow = this.ctx.createRadialGradient(
        this.width / 2,
        sunY,
        sunRadius * 0.5,
        this.width / 2,
        sunY,
        sunRadius * 2,
      );
      sunGlow.addColorStop(0, colors.sun + "80");
      sunGlow.addColorStop(0.5, colors.sun + "20");
      sunGlow.addColorStop(1, "transparent");

      this.ctx.fillStyle = sunGlow;
      this.ctx.beginPath();
      this.ctx.arc(this.width / 2, sunY, sunRadius * 2, 0, Math.PI * 2);
      this.ctx.fill();

      // Sun body with horizontal lines
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(this.width / 2, sunY, sunRadius, 0, Math.PI * 2);
      this.ctx.clip();

      const sunBodyGradient = this.ctx.createLinearGradient(
        0,
        sunY - sunRadius,
        0,
        sunY + sunRadius,
      );
      sunBodyGradient.addColorStop(0, colors.sun);
      sunBodyGradient.addColorStop(1, colors.horizon);
      this.ctx.fillStyle = sunBodyGradient;
      this.ctx.fillRect(this.width / 2 - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius * 2);

      // Horizontal stripes on sun
      this.ctx.fillStyle = "#000000";
      for (let i = 0; i < 8; i++) {
        const stripeY = sunY - sunRadius + ((sunRadius * 2) / 8) * i + sunRadius / 8;
        const stripeHeight = 3 + i * 1.5;
        this.ctx.fillRect(this.width / 2 - sunRadius, stripeY, sunRadius * 2, stripeHeight);
      }

      this.ctx.restore();
    }

    // Draw mountains
    if (showMountains) {
      this.ctx.globalAlpha = 0.7;

      // Back mountains
      this.ctx.fillStyle = colors.horizon + "60";
      this.ctx.beginPath();
      this.ctx.moveTo(0, horizonY);

      for (let i = 0; i <= this.mountainPoints.length - 1; i++) {
        const x = (i / (this.mountainPoints.length - 1)) * this.width;
        const freqIndex = Math.floor((i / this.mountainPoints.length) * frequencyData.length * 0.3);
        const freqValue = frequencyData[freqIndex] / 255;
        const baseHeight = this.mountainPoints[i] * horizonY * 0.4;
        const audioHeight = freqValue * sensitivity * horizonY * 0.3;
        const y = horizonY - baseHeight - audioHeight;

        if (i === 0) {
          this.ctx.lineTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }

      this.ctx.lineTo(this.width, horizonY);
      this.ctx.closePath();
      this.ctx.fill();

      // Mountain outline glow
      this.ctx.strokeStyle = colors.horizon;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = colors.horizon;
      this.ctx.beginPath();
      this.ctx.moveTo(0, horizonY);

      for (let i = 0; i <= this.mountainPoints.length - 1; i++) {
        const x = (i / (this.mountainPoints.length - 1)) * this.width;
        const freqIndex = Math.floor((i / this.mountainPoints.length) * frequencyData.length * 0.3);
        const freqValue = frequencyData[freqIndex] / 255;
        const baseHeight = this.mountainPoints[i] * horizonY * 0.4;
        const audioHeight = freqValue * sensitivity * horizonY * 0.3;
        const y = horizonY - baseHeight - audioHeight;
        this.ctx.lineTo(x, y);
      }

      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1.0;
    }

    // Skip ground gradient for transparent background

    // Update grid offset
    this.gridOffset += gridSpeed * (1 + bass * sensitivity * 3) * deltaTime * 60;

    // Draw horizontal grid lines with perspective
    this.ctx.strokeStyle = colors.grid;
    this.ctx.lineWidth = 1;
    this.ctx.shadowBlur = 5 + volume * 10;
    this.ctx.shadowColor = colors.glow;
    this.ctx.globalAlpha = 0.7;

    const gridSpacing = 40;
    const totalLines = gridLines;

    for (let i = 0; i < totalLines; i++) {
      // Calculate perspective position
      const t = (i + (this.gridOffset % gridSpacing) / gridSpacing) / totalLines;
      const perspectiveY = horizonY + Math.pow(t, 1.5) * (this.height - horizonY);

      if (perspectiveY > horizonY && perspectiveY < this.height) {
        const alpha = Math.pow(t, 0.5) * 0.7;
        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.moveTo(0, perspectiveY);
        this.ctx.lineTo(this.width, perspectiveY);
        this.ctx.stroke();
      }
    }

    // Draw vertical grid lines with perspective
    this.ctx.globalAlpha = 0.7;
    const verticalLines = 30;
    const centerX = this.width / 2;

    for (let i = -verticalLines / 2; i <= verticalLines / 2; i++) {
      const bottomX = centerX + i * (this.width / verticalLines) * 2;

      this.ctx.beginPath();
      this.ctx.moveTo(centerX, horizonY);
      this.ctx.lineTo(bottomX, this.height);
      this.ctx.stroke();
    }

    // Horizon line glow
    this.ctx.globalAlpha = 0.8;
    this.ctx.strokeStyle = colors.grid;
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 15 + bass * sensitivity * 20;
    this.ctx.beginPath();
    this.ctx.moveTo(0, horizonY);
    this.ctx.lineTo(this.width, horizonY);
    this.ctx.stroke();

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
    this.config = { ...this.config, ...config } as NeonGridConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.mountainPoints = [];
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
      gridSpeed: { type: "number", min: 0.5, max: 5, step: 0.5, default: 2, label: "Grid Speed" },
      gridLines: { type: "number", min: 10, max: 40, step: 5, default: 20, label: "Grid Lines" },
      showSun: { type: "boolean", default: true, label: "Show Sun" },
      showMountains: { type: "boolean", default: true, label: "Show Mountains" },
    };
  }
}
