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

interface RetroScopeConfig extends VisualizationConfig {
  phosphorTrail: number;
  scanLines: boolean;
  crtCurvature: number;
}

export class RetroScopeVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "retroScope",
    name: "Retro Scope",
    author: "Vizec",
    description: "Vintage CRT oscilloscope with phosphor glow and scan lines",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private trailCanvas: HTMLCanvasElement | null = null;
  private trailCtx: CanvasRenderingContext2D | null = null;
  private config: RetroScopeConfig = {
    sensitivity: 1.0,
    colorScheme: "acid",
    phosphorTrail: 0.85,
    scanLines: true,
    crtCurvature: 0.5,
  };
  private width = 0;
  private height = 0;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    // Main canvas
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");

    // Trail canvas for phosphor effect
    this.trailCanvas = document.createElement("canvas");
    this.trailCtx = this.trailCanvas.getContext("2d");

    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas || !this.trailCtx || !this.trailCanvas) return;

    const { timeDomainData } = audioData;
    const { sensitivity, colorScheme, phosphorTrail, scanLines, crtCurvature } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.time += deltaTime * 0.001;

    // For phosphor decay with transparency: copy current trail, clear, redraw faded, then add new
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.width;
    tempCanvas.height = this.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      tempCtx.drawImage(this.trailCanvas, 0, 0);
      this.trailCtx.clearRect(0, 0, this.width, this.height);
      this.trailCtx.globalAlpha = phosphorTrail;
      this.trailCtx.drawImage(tempCanvas, 0, 0);
      this.trailCtx.globalAlpha = 1.0;
    }

    // Draw waveform on trail canvas
    this.drawWaveform(this.trailCtx, timeDomainData, sensitivity, colors);

    // Clear main canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw CRT bezel/frame
    this.drawCRTFrame(colors, crtCurvature);

    // Copy trail canvas to main canvas with glow
    this.ctx.globalAlpha = 0.6;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = colors.glow;
    this.ctx.drawImage(this.trailCanvas, 0, 0);
    this.ctx.shadowBlur = 0;

    // Draw scan lines
    if (scanLines) {
      this.drawScanLines();
    }

    // Draw CRT vignette effect
    this.drawVignette();

    // Reset context
    this.ctx.globalAlpha = 1.0;
  }

  private drawWaveform(
    ctx: CanvasRenderingContext2D,
    timeDomainData: Uint8Array,
    sensitivity: number,
    colors: { start: string; end: string; glow: string }
  ): void {
    const margin = 50;
    const displayWidth = this.width - margin * 2;
    const displayHeight = this.height - margin * 2;
    const centerY = this.height / 2;

    // Draw main waveform line
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 20;
    ctx.shadowColor = colors.glow;

    ctx.beginPath();

    // Use full timeDomainData length and map to displayWidth
    const dataLength = timeDomainData.length;

    for (let i = 0; i < displayWidth; i++) {
      // Map display position to data index
      const dataIndex = Math.floor((i / displayWidth) * dataLength);
      const value = timeDomainData[dataIndex] ?? 128;

      const x = margin + i;
      // Moderate amplification
      const normalizedValue = (value - 128) / 128;
      const amplifiedValue = normalizedValue * sensitivity * 1.5;
      const y = centerY + amplifiedValue * (displayHeight / 2);

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();

    // Draw bright core line
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 5;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Draw horizontal center grid line
    ctx.strokeStyle = colors.start;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;

    // Center line
    ctx.beginPath();
    ctx.moveTo(margin, centerY);
    ctx.lineTo(this.width - margin, centerY);
    ctx.stroke();

    // Grid lines
    const gridCount = 8;
    for (let i = 1; i < gridCount; i++) {
      const y = margin + (displayHeight / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(this.width - margin, y);
      ctx.stroke();
    }

    for (let i = 1; i < gridCount; i++) {
      const x = margin + (displayWidth / gridCount) * i;
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, this.height - margin);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  private drawCRTFrame(colors: { start: string; end: string; glow: string }, curvature: number): void {
    if (!this.ctx) return;

    const margin = 30;

    // Inner glow border
    this.ctx.globalAlpha = 0.3;
    this.ctx.strokeStyle = colors.start;
    this.ctx.lineWidth = 3;

    this.ctx.beginPath();
    this.ctx.roundRect(margin, margin, this.width - margin * 2, this.height - margin * 2, 10 * curvature);
    this.ctx.stroke();

    // Corner accent dots
    const corners = [
      [margin + 15, margin + 15],
      [this.width - margin - 15, margin + 15],
      [margin + 15, this.height - margin - 15],
      [this.width - margin - 15, this.height - margin - 15],
    ];

    this.ctx.fillStyle = colors.glow;
    this.ctx.globalAlpha = 0.4;

    for (const [cx, cy] of corners) {
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawScanLines(): void {
    if (!this.ctx) return;

    this.ctx.globalAlpha = 0.08;
    this.ctx.fillStyle = "#000000";

    for (let y = 0; y < this.height; y += 3) {
      this.ctx.fillRect(0, y, this.width, 1);
    }

    // Occasional scan line glitch
    if (Math.random() > 0.98) {
      const glitchY = Math.random() * this.height;
      this.ctx.globalAlpha = 0.15;
      this.ctx.fillRect(0, glitchY, this.width, 2);
    }
  }

  private drawVignette(): void {
    if (!this.ctx) return;

    const gradient = this.ctx.createRadialGradient(
      this.width / 2, this.height / 2, 0,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.7
    );

    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.7, "transparent");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.4)");

    this.ctx.globalAlpha = 0.5;
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.trailCanvas) {
      this.trailCanvas.width = width;
      this.trailCanvas.height = height;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as RetroScopeConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.trailCanvas = null;
    this.trailCtx = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      phosphorTrail: {
        type: "number",
        label: "Phosphor Trail",
        default: 0.85,
        min: 0.5,
        max: 0.98,
        step: 0.01,
      },
      scanLines: {
        type: "boolean",
        label: "Scan Lines",
        default: true,
      },
      crtCurvature: {
        type: "number",
        label: "CRT Curvature",
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "acid",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
