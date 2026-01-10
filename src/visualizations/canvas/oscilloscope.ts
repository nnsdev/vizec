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

interface OscilloscopeConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  lineWidth: number;
  glow: boolean;
  stereo: boolean;
  filled: boolean;
}

export class OscilloscopeVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "oscilloscope",
    name: "Oscilloscope",
    author: "Vizec",
    description: "Classic oscilloscope waveform display",
    renderer: "canvas2d",
    transitionType: "cut",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: OscilloscopeConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    lineWidth: 2,
    glow: true,
    stereo: false,
    filled: false,
  };

  // Trail effect - store previous frames
  private trailFrames: ImageData[] = [];
  private maxTrailFrames = 5;

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

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { timeDomainData, bass, volume } = audioData;
    const { sensitivity, colorScheme, lineWidth, glow, stereo, filled } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Set transparency for overlay mode
    this.ctx.globalAlpha = 0.7;

    const centerY = this.height / 2;
    const amplitudeScale = (this.height / 5) * sensitivity;

    // Draw waveform
    this.ctx.beginPath();
    this.ctx.lineWidth = lineWidth + bass * 2;
    this.ctx.strokeStyle = colors.primary;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // Glow effect
    if (glow) {
      this.ctx.shadowBlur = 15 + volume * 10;
      this.ctx.shadowColor = colors.glow;
    }

    const sliceWidth = this.width / timeDomainData.length;
    let x = 0;

    for (let i = 0; i < timeDomainData.length; i++) {
      // Normalize to -1 to 1 range
      const v = timeDomainData[i] / 128.0 - 1;
      const y = centerY + v * amplitudeScale;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    this.ctx.stroke();

    // Draw filled area if enabled
    if (filled) {
      this.ctx.lineTo(this.width, centerY);
      this.ctx.lineTo(0, centerY);
      this.ctx.closePath();

      const gradient = this.ctx.createLinearGradient(
        0,
        centerY - amplitudeScale,
        0,
        centerY + amplitudeScale,
      );
      gradient.addColorStop(0, colors.primary + "40");
      gradient.addColorStop(0.5, colors.secondary + "20");
      gradient.addColorStop(1, colors.primary + "40");

      this.ctx.fillStyle = gradient;
      this.ctx.globalAlpha = 0.3;
      this.ctx.fill();
    }

    // Draw secondary mirrored waveform if stereo mode
    if (stereo) {
      this.ctx.beginPath();
      this.ctx.strokeStyle = colors.secondary;
      this.ctx.globalAlpha = 0.5;

      x = 0;
      for (let i = 0; i < timeDomainData.length; i++) {
        const v = timeDomainData[i] / 128.0 - 1;
        // Invert and offset slightly
        const y = centerY - v * amplitudeScale * 0.8;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }
      this.ctx.stroke();
    }

    // Draw center line
    this.ctx.beginPath();
    this.ctx.strokeStyle = colors.primary + "30";
    this.ctx.lineWidth = 1;
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 0.3;
    this.ctx.moveTo(0, centerY);
    this.ctx.lineTo(this.width, centerY);
    this.ctx.stroke();

    // Draw bass indicator dots on the sides
    const dotSize = Math.max(1, 5 + bass * 15);
    const dotGradient = this.ctx.createRadialGradient(30, centerY, 0, 30, centerY, dotSize);
    dotGradient.addColorStop(0, colors.primary);
    dotGradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = dotGradient;
    this.ctx.beginPath();
    this.ctx.arc(30, centerY, dotSize, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(this.width - 30, centerY, dotSize, 0, Math.PI * 2);
    this.ctx.fill();

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
    this.config = { ...this.config, ...config } as OscilloscopeConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.trailFrames = [];
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
      lineWidth: { type: "number", min: 1, max: 8, step: 0.5, default: 2, label: "Line Width" },
      glow: { type: "boolean", default: true, label: "Glow Effect" },
      stereo: { type: "boolean", default: false, label: "Stereo Mode" },
      filled: { type: "boolean", default: false, label: "Filled Waveform" },
    };
  }
}
