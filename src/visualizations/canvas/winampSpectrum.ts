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

interface WinampSpectrumConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  barCount: number;
  peakHold: boolean;
  mirror: boolean;
  glow: boolean;
}

export class WinampSpectrumVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "winampSpectrum",
    name: "WinAMP Spectrum",
    author: "Vizec",
    description: "Classic WinAMP equalizer-style spectrum analyzer",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: WinampSpectrumConfig = {
    sensitivity: 1.0,
    colorScheme: "winampClassic",
    barCount: 18,
    peakHold: true,
    mirror: true,
    glow: true,
  };
  private width = 0;
  private height = 0;
  private smoothedData: number[] = [];
  private peakValues: number[] = [];
  private peakDecay: number[] = [];

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

    this.smoothedData = Array(this.config.barCount).fill(0);
    this.peakValues = Array(this.config.barCount).fill(0);
    this.peakDecay = Array(this.config.barCount).fill(0);
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData } = audioData;
    const { barCount, peakHold, mirror, glow, sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    const totalBars = mirror ? barCount / 2 : barCount;
    const margin = 30;
    const availableWidth = this.width - margin * 2;
    const barWidth = (availableWidth - (totalBars - 1) * 2) / totalBars;
    const centerY = this.height / 2;
    const maxBarHeight = (this.height / 2) - margin - 10;

    const step = Math.floor(frequencyData.length / barCount);

    for (let i = 0; i < totalBars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += frequencyData[i * step + j];
      }

      const freqPosition = i / totalBars;
      const freqCompensation = 1 + freqPosition * 2;

      const rawValue = (sum / step) / 255;
      const compensatedValue = Math.pow(rawValue, 0.5) * freqCompensation * sensitivity;

      const smoothing = 0.7;
      this.smoothedData[i] = this.smoothedData[i] * smoothing + compensatedValue * (1 - smoothing);

      const barHeight = this.smoothedData[i] * maxBarHeight;
      const x = margin + i * (barWidth + 2);

      const barColor = this.getBarColor(freqPosition, colors);

      if (glow && this.smoothedData[i] > 0.2) {
        this.ctx.shadowBlur = 15 * this.smoothedData[i];
        this.ctx.shadowColor = colors.glow;
      } else {
        this.ctx.shadowBlur = 0;
      }

      this.ctx.fillStyle = barColor;

      // Calculate mirrorX outside so it's available for peak hold
      const mirrorX = mirror ? this.width - margin - x - barWidth : 0;

      if (mirror) {
        this.ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
        this.ctx.fillRect(x, centerY, barWidth, barHeight);
        this.ctx.fillRect(mirrorX, centerY - barHeight, barWidth, barHeight);
        this.ctx.fillRect(mirrorX, centerY, barWidth, barHeight);
      } else {
        this.ctx.fillRect(x, this.height - margin - barHeight, barWidth, barHeight);
      }

      if (peakHold) {
        if (this.smoothedData[i] > this.peakValues[i]) {
          this.peakValues[i] = this.smoothedData[i];
          this.peakDecay[i] = 1.0;
        } else {
          this.peakDecay[i] *= 0.98;
          if (this.peakDecay[i] < 0.1) {
            this.peakValues[i] *= 0.99;
          }
        }

        const peakHeight = this.peakValues[i] * maxBarHeight;
        this.ctx.fillStyle = "#FFFFFF";
        this.ctx.globalAlpha = 0.9 * this.peakDecay[i];

        if (mirror) {
          this.ctx.fillRect(x, centerY - peakHeight - 3, barWidth, 3);
          this.ctx.fillRect(x, centerY + peakHeight, barWidth, 3);
          this.ctx.fillRect(mirrorX, centerY - peakHeight - 3, barWidth, 3);
          this.ctx.fillRect(mirrorX, centerY + peakHeight, barWidth, 3);
        } else {
          this.ctx.fillRect(x, this.height - margin - peakHeight - 3, barWidth, 3);
        }
      }
    }

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;
  }

  private getBarColor(
    freqPosition: number,
    colors: { primary: string; secondary: string; glow: string }
  ): string {
    if (freqPosition < 0.33) {
      return colors.primary;
    } else if (freqPosition < 0.66) {
      return colors.secondary;
    } else {
      return "#FF4400";
    }
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
    this.config = { ...this.config, ...config } as WinampSpectrumConfig;

    if (this.smoothedData.length !== this.config.barCount) {
      this.smoothedData = Array(this.config.barCount).fill(0);
      this.peakValues = Array(this.config.barCount).fill(0);
      this.peakDecay = Array(this.config.barCount).fill(0);
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
        default: "winampClassic",
        options: [
          { value: "winampClassic", label: "WinAMP Classic" },
          { value: "winampGreen", label: "WinAMP Green" },
          { value: "winampOrange", label: "WinAMP Orange" },
          ...COLOR_SCHEME_OPTIONS,
        ],
      },
      barCount: {
        type: "select",
        label: "Band Count",
        default: 18,
        options: [
          { value: "16", label: "16 Bands" },
          { value: "18", label: "18 Bands" },
          { value: "24", label: "24 Bands" },
          { value: "32", label: "32 Bands" },
        ],
      },
      peakHold: {
        type: "boolean",
        label: "Peak Hold",
        default: true,
      },
      mirror: {
        type: "boolean",
        label: "Mirror Mode",
        default: true,
      },
      glow: {
        type: "boolean",
        label: "Glow Effect",
        default: true,
      },
    };
  }
}
