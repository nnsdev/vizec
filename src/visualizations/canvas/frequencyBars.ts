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

interface FrequencyBarsConfig extends VisualizationConfig {
  barCount: number;
  glow: boolean;
  mirror: boolean;
  gap: number;
}

export class FrequencyBarsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "frequencyBars",
    name: "Frequency Bars",
    author: "Vizec",
    description: "Classic frequency spectrum with vertical bars",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: FrequencyBarsConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    barCount: 64,
    glow: true,
    mirror: true,
    gap: 2,
  };
  private width = 0;
  private height = 0;
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

    // Initial resize - use window dimensions if container has no size yet
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    // Initialize smoothed data
    this.smoothedData = Array.from({ length: this.config.barCount }, () => 0);

    console.log("FrequencyBars initialized:", {
      width: this.width,
      height: this.height,
    });
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData } = audioData;
    const { barCount, glow, mirror, gap, sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate bar dimensions
    const totalBars = mirror ? barCount / 2 : barCount;
    const barWidth = (this.width - (totalBars - 1) * gap) / totalBars;
    const centerY = this.height / 2;

    // Sample frequency data to match bar count
    const step = Math.floor(frequencyData.length / totalBars);

    for (let i = 0; i < totalBars; i++) {
      // Average the frequency data for this bar
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += frequencyData[i * step + j];
      }

      // Apply frequency-dependent scaling to balance bass vs treble
      // Higher frequencies naturally have less energy, so boost them more
      const freqPosition = i / totalBars; // 0 = bass, 1 = treble
      const freqCompensation = 1 + freqPosition * 2.5; // Boost highs by up to 3.5x
      const bassAttenuation = freqPosition < 0.2 ? 0.5 + freqPosition * 2.5 : 1; // Reduce bass by up to 50%

      const rawValue = (sum / step) * freqCompensation * bassAttenuation;
      const normalizedValue = Math.min(1, rawValue / 180);
      const boostedValue = Math.pow(normalizedValue, 0.4) * sensitivity;
      const value = boostedValue;

      // Smooth the value
      const smoothing = 0.7;
      this.smoothedData[i] = this.smoothedData[i] * smoothing + value * (1 - smoothing);
      const smoothedValue = this.smoothedData[i];

      // Calculate bar height - no additional bass boost since we balanced it above
      const barHeight = smoothedValue * this.height * 0.2;

      // Calculate x position
      const x = i * (barWidth + gap);

      // Create gradient
      const gradient = this.ctx.createLinearGradient(
        x,
        centerY - barHeight,
        x,
        centerY + barHeight,
      );
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(0.5, colors.end);
      gradient.addColorStop(1, colors.start);

      // Draw glow effect
      if (glow && smoothedValue > 0.3) {
        this.ctx.shadowBlur = 20 * smoothedValue;
        this.ctx.shadowColor = colors.glow;
      } else {
        this.ctx.shadowBlur = 0;
      }

      // Set transparency for overlay mode (70% opacity)
      this.ctx.globalAlpha = 0.5;
      this.ctx.fillStyle = gradient;

      if (mirror) {
        // Draw mirrored bars from center
        this.ctx.fillRect(x, centerY - barHeight, barWidth, barHeight);
        this.ctx.fillRect(x, centerY, barWidth, barHeight);

        // Mirror on the right side
        const mirrorX = this.width - x - barWidth;
        this.ctx.fillRect(mirrorX, centerY - barHeight, barWidth, barHeight);
        this.ctx.fillRect(mirrorX, centerY, barWidth, barHeight);
      } else {
        // Draw from bottom
        this.ctx.fillRect(x, this.height - barHeight * 2, barWidth, barHeight * 2);
      }
    }

    // Reset shadow and alpha
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
    this.config = { ...this.config, ...config } as FrequencyBarsConfig;

    // Reinitialize smoothed data if bar count changed
    if (this.smoothedData.length !== this.config.barCount) {
      this.smoothedData = Array.from({ length: this.config.barCount }, () => 0);
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
      barCount: {
        type: "number",
        label: "Bar Count",
        default: 64,
        min: 16,
        max: 256,
        step: 8,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      glow: {
        type: "boolean",
        label: "Glow Effect",
        default: true,
      },
      mirror: {
        type: "boolean",
        label: "Mirror Mode",
        default: true,
      },
      gap: {
        type: "number",
        label: "Bar Gap",
        default: 2,
        min: 0,
        max: 10,
        step: 1,
      },
    };
  }
}
