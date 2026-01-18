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

interface DotWaveConfig extends VisualizationConfig {
  gridSize: number;
  dotSize: number;
  waveAmplitude: number;
}

export class DotWaveVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "dotWave",
    name: "Dot Wave",
    author: "Vizec",
    description: "Minimal dot grid creating wave patterns from sound",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: DotWaveConfig = {
    sensitivity: 1.0,
    colorScheme: "monochrome",
    gridSize: 25,
    dotSize: 4,
    waveAmplitude: 1.0,
  };
  private width = 0;
  private height = 0;
  private smoothedData: number[] = [];
  private time = 0;

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

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { timeDomainData, volume } = audioData;
    const { sensitivity, colorScheme, gridSize, dotSize, waveAmplitude } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate grid dimensions
    const cols = Math.floor(this.width / gridSize);
    const rows = Math.floor(this.height / gridSize);

    // Ensure smoothed data array is sized correctly
    if (this.smoothedData.length !== cols) {
      this.smoothedData = new Array(cols).fill(0);
    }

    // Sample waveform data for each column
    const step = Math.floor(timeDomainData.length / cols);

    for (let col = 0; col < cols; col++) {
      // Get waveform value for this column
      let sum = 0;
      for (let i = 0; i < step; i++) {
        const index = col * step + i;
        if (index < timeDomainData.length) {
          sum += (timeDomainData[index] - 128) / 128;
        }
      }
      const value = sum / step;

      // Smooth the value
      const smoothing = 0.3;
      this.smoothedData[col] = this.smoothedData[col] * smoothing + value * (1 - smoothing);
    }

    // Draw dots
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const baseX = col * gridSize + gridSize / 2;
        const baseY = row * gridSize + gridSize / 2;

        // Get displacement from waveform
        const waveValue = this.smoothedData[col] * sensitivity * waveAmplitude;

        // Distance from center row affects wave propagation
        const centerRow = rows / 2;
        const rowFactor = 1 - Math.abs(row - centerRow) / centerRow * 0.5;

        // Y displacement based on waveform
        const displacement = waveValue * gridSize * 2 * rowFactor;

        // Final position
        const x = baseX;
        const y = baseY + displacement;

        // Calculate dot properties
        const distFromCenter = Math.abs(row - centerRow) / centerRow;
        const alpha = 0.3 + (1 - distFromCenter) * 0.4 + Math.abs(waveValue) * 0.3;
        const size = dotSize * (0.5 + Math.abs(waveValue) * 0.5 + (1 - distFromCenter) * 0.5);

        // Color based on displacement
        const useGlow = Math.abs(waveValue) > 0.3;

        this.ctx.globalAlpha = Math.min(alpha, 0.7);
        this.ctx.fillStyle = useGlow ? colors.glow : colors.start;

        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Draw subtle connecting lines for adjacent dots in motion
    this.ctx.globalAlpha = 0.15;
    this.ctx.strokeStyle = colors.end;
    this.ctx.lineWidth = 0.5;

    for (let col = 0; col < cols - 1; col++) {
      const centerRow = Math.floor(rows / 2);
      const val1 = this.smoothedData[col] * sensitivity * waveAmplitude;
      const val2 = this.smoothedData[col + 1] * sensitivity * waveAmplitude;

      if (Math.abs(val1) > 0.1 || Math.abs(val2) > 0.1) {
        const x1 = col * gridSize + gridSize / 2;
        const x2 = (col + 1) * gridSize + gridSize / 2;
        const y1 = centerRow * gridSize + gridSize / 2 + val1 * gridSize * 2;
        const y2 = centerRow * gridSize + gridSize / 2 + val2 * gridSize * 2;

        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
      }
    }

    // Reset context
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Reset smoothed data for new width
    const cols = Math.floor(width / this.config.gridSize);
    this.smoothedData = new Array(cols).fill(0);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as DotWaveConfig;

    // Reinitialize smoothed data if grid size changed
    if (this.width > 0) {
      const cols = Math.floor(this.width / this.config.gridSize);
      if (this.smoothedData.length !== cols) {
        this.smoothedData = new Array(cols).fill(0);
      }
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.smoothedData = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      gridSize: {
        type: "number",
        label: "Grid Size",
        default: 25,
        min: 15,
        max: 50,
        step: 5,
      },
      dotSize: {
        type: "number",
        label: "Dot Size",
        default: 4,
        min: 2,
        max: 8,
        step: 0.5,
      },
      waveAmplitude: {
        type: "number",
        label: "Wave Amplitude",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "monochrome",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
