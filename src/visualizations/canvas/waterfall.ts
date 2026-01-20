import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

// Color schemes - using gradient arrays for spectrograms
const COLOR_SCHEMES: Record<string, string[]> = {
  // Hot colormap (black -> red -> yellow -> white)
  hot: [
    "#000000",
    "#330000",
    "#660000",
    "#990000",
    "#cc0000",
    "#ff0000",
    "#ff3300",
    "#ff6600",
    "#ff9900",
    "#ffcc00",
    "#ffff00",
    "#ffff66",
    "#ffffcc",
    "#ffffff",
  ],
  // Cyan/Magenta
  cyanMagenta: [
    "#000011",
    "#000033",
    "#000066",
    "#000099",
    "#0000cc",
    "#0000ff",
    "#3300ff",
    "#6600ff",
    "#9900ff",
    "#cc00ff",
    "#ff00ff",
    "#ff00cc",
    "#ff0099",
    "#ff0066",
  ],
  // Green phosphor (like old oscilloscopes)
  phosphor: [
    "#000000",
    "#001100",
    "#002200",
    "#003300",
    "#004400",
    "#006600",
    "#008800",
    "#00aa00",
    "#00cc00",
    "#00ee00",
    "#00ff00",
    "#33ff33",
    "#66ff66",
    "#99ff99",
  ],
  // Fire
  fire: [
    "#000000",
    "#1a0000",
    "#330000",
    "#4d0000",
    "#660000",
    "#800000",
    "#993300",
    "#b34700",
    "#cc5c00",
    "#e67300",
    "#ff8c00",
    "#ffa500",
    "#ffc04d",
    "#ffdb99",
  ],
  // Ice
  ice: [
    "#000011",
    "#000022",
    "#001133",
    "#002244",
    "#003366",
    "#004488",
    "#0066aa",
    "#0088cc",
    "#00aaee",
    "#00ccff",
    "#33ddff",
    "#66eeff",
    "#99f4ff",
    "#ccfaff",
  ],
  // Viridis-like
  viridis: [
    "#440154",
    "#481567",
    "#482677",
    "#453781",
    "#3f4788",
    "#39558c",
    "#32648e",
    "#2d718e",
    "#287d8e",
    "#238a8d",
    "#1f968b",
    "#20a386",
    "#29af7f",
    "#3cbb75",
  ],
  // Plasma
  plasma: [
    "#0d0887",
    "#3a0290",
    "#5c019d",
    "#7e03a8",
    "#9c179e",
    "#b73779",
    "#cc4e52",
    "#ed7953",
    "#f89540",
    "#fdb42f",
    "#fbd524",
    "#f0f921",
    "#fcffa4",
    "#ffffcc",
  ],
  // Inferno
  inferno: [
    "#000004",
    "#0b0924",
    "#1b0c41",
    "#300a5b",
    "#4a0c6b",
    "#650d72",
    "#81196e",
    "#9a2865",
    "#b73855",
    "#cf4446",
    "#e55c30",
    "#f57d15",
    "#fca50a",
    "#fccd25",
  ],
};

interface WaterfallConfig extends VisualizationConfig {
  scrollSpeed: number;
  resolution: number;
  gain: number;
  colorScheme: string;
}

export class WaterfallVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "waterfall",
    name: "Waterfall",
    author: "Vizec",
    description: "Scrolling spectrogram/waterfall display showing frequency over time",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: WaterfallConfig = {
    sensitivity: 1.0,
    colorScheme: "hot",
    scrollSpeed: 3,
    resolution: 128,
    gain: 3.0,
  };
  private width = 0;
  private height = 0;

  // History buffer - stores rows of frequency data
  private history: number[][] = [];
  private maxHistory = 500;

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

    // Initialize history
    this.history = [];
  }

  private getColor(value: number, scheme: string[]): string {
    const idx = Math.min(scheme.length - 1, Math.floor(value * (scheme.length - 1)));
    return scheme[Math.max(0, idx)];
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData } = audioData;
    const { scrollSpeed, resolution, sensitivity, colorScheme, gain } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.hot;

    // Sample frequency data into resolution buckets
    const row: number[] = [];
    const step = Math.floor(frequencyData.length / resolution);

    for (let i = 0; i < resolution; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx < frequencyData.length) {
          sum += frequencyData[idx];
        }
      }
      // Apply gain and curve
      const rawValue = sum / step / 255;
      const boosted = Math.pow(rawValue * gain * sensitivity, 0.5); // sqrt curve
      row.push(Math.min(1, boosted));
    }

    // Add to history (multiple times based on scroll speed for thicker lines)
    for (let s = 0; s < scrollSpeed; s++) {
      this.history.unshift([...row]);
    }

    // Trim history
    if (this.history.length > this.maxHistory) {
      this.history.length = this.maxHistory;
    }

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate row height
    const rowHeight = Math.max(2, Math.ceil(this.height / this.maxHistory));
    const colWidth = this.width / resolution;

    // Draw history from top to bottom
    const rowsToDraw = Math.min(this.history.length, Math.ceil(this.height / rowHeight));

    for (let y = 0; y < rowsToDraw; y++) {
      const rowData = this.history[y];
      if (!rowData) continue;

      const yPos = y * rowHeight;

      // Fade based on position (older = dimmer) - but keep it visible!
      const ageFade = 1 - (y / rowsToDraw) * 0.3; // Only fade to 70%

      for (let x = 0; x < resolution; x++) {
        const value = rowData[x] * ageFade;
        if (value < 0.05) continue; // Skip very dark pixels

        const color = this.getColor(value, colors);
        this.ctx.fillStyle = color;
        // More transparent for darker values, more opaque for bright
        this.ctx.globalAlpha = 0.3 + value * 0.5;
        this.ctx.fillRect(x * colWidth, yPos, colWidth + 1, rowHeight);
      }
    }

    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Adjust max history based on height
    this.maxHistory = Math.max(200, height);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as WaterfallConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.history = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      gain: {
        type: "number",
        label: "Gain",
        default: 3.0,
        min: 1,
        max: 8,
        step: 0.5,
      },
      scrollSpeed: {
        type: "number",
        label: "Scroll Speed",
        default: 3,
        min: 1,
        max: 8,
        step: 1,
      },
      resolution: {
        type: "number",
        label: "Resolution",
        default: 128,
        min: 32,
        max: 256,
        step: 16,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "hot",
        options: [
          { value: "hot", label: "Hot (Classic)" },
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "phosphor", label: "Green Phosphor" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
          { value: "viridis", label: "Viridis" },
          { value: "plasma", label: "Plasma" },
          { value: "inferno", label: "Inferno" },
        ],
      },
    };
  }
}
