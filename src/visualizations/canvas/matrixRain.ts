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

interface Drop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
  brightness: number;
}

// Characters for the matrix effect
const MATRIX_CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface MatrixRainConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  fontSize: number;
  density: number;
  baseSpeed: number;
  trailLength: number;
}

export class MatrixRainVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "matrixRain",
    name: "Matrix Rain",
    author: "Vizec",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: MatrixRainConfig = {
    sensitivity: 1.0,
    colorScheme: "neon",
    fontSize: 16,
    density: 0.95,
    baseSpeed: 3,
    trailLength: 0.92,
  };

  private drops: Drop[] = [];
  private columns = 0;

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

    this.initDrops();
  }

  private initDrops(): void {
    const { fontSize, density } = this.config;
    this.columns = Math.floor(this.width / fontSize);
    this.drops = [];

    for (let i = 0; i < this.columns; i++) {
      if (Math.random() < density) {
        this.drops.push(this.createDrop(i * fontSize));
      }
    }
  }

  private createDrop(x: number): Drop {
    const length = 5 + Math.floor(Math.random() * 20);
    const chars: string[] = [];

    for (let i = 0; i < length; i++) {
      chars.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]);
    }

    return {
      x,
      y: -Math.random() * this.height,
      speed: 2 + Math.random() * 3,
      chars,
      length,
      brightness: 0.5 + Math.random() * 0.5,
    };
  }

  private getRandomChar(): string {
    return MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, fontSize, baseSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Set font
    this.ctx.font = `${fontSize}px monospace`;
    this.ctx.textAlign = "center";

    // Speed multiplier based on audio
    const speedMultiplier = 1 + bass * sensitivity * 2 + volume;

    // Spawn new drops on beats
    if (bass * sensitivity > 0.4 && Math.random() < bass * 0.3) {
      const x = Math.floor(Math.random() * this.columns) * fontSize;
      this.drops.push(this.createDrop(x));
    }

    // Update and draw drops
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];

      // Move drop
      drop.y += drop.speed * baseSpeed * speedMultiplier * deltaTime * 60;

      // Get frequency data for this column
      const colIndex = Math.floor(drop.x / fontSize);
      const freqIndex = Math.floor((colIndex / this.columns) * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIndex] / 255;

      // Randomly change characters
      if (Math.random() < 0.05) {
        const charIndex = Math.floor(Math.random() * drop.chars.length);
        drop.chars[charIndex] = this.getRandomChar();
      }

      // Draw characters
      for (let j = 0; j < drop.length; j++) {
        const charY = drop.y - j * fontSize;

        if (charY < -fontSize || charY > this.height + fontSize) continue;

        // Calculate opacity (head is brightest)
        let opacity: number;
        if (j === 0) {
          opacity = 1;
        } else {
          opacity = (1 - j / drop.length) * drop.brightness * (0.5 + freqValue * 0.5);
        }

        // Head character is white/bright
        if (j === 0) {
          this.ctx.fillStyle = "#ffffff";
          this.ctx.shadowBlur = 10 + freqValue * 10;
          this.ctx.shadowColor = colors.glow;
        } else {
          // Parse color and apply opacity
          const r = parseInt(colors.primary.slice(1, 3), 16);
          const g = parseInt(colors.primary.slice(3, 5), 16);
          const b = parseInt(colors.primary.slice(5, 7), 16);
          this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${opacity * 0.7})`;
          this.ctx.shadowBlur = freqValue * 5;
          this.ctx.shadowColor = colors.glow;
        }

        this.ctx.fillText(drop.chars[j], drop.x + fontSize / 2, charY);
      }

      // Reset shadow
      this.ctx.shadowBlur = 0;

      // Remove drop if off screen
      if (drop.y - drop.length * fontSize > this.height) {
        this.drops.splice(i, 1);
        // Spawn new drop at top
        if (Math.random() < 0.8) {
          this.drops.push(this.createDrop(drop.x));
        }
      }
    }

    // Limit max drops for performance
    while (this.drops.length > this.columns * 1.5) {
      this.drops.shift();
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initDrops();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as MatrixRainConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.drops = [];
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
      fontSize: { type: "number", min: 10, max: 24, step: 2, default: 16, label: "Font Size" },
      density: { type: "number", min: 0.5, max: 1, step: 0.05, default: 0.95, label: "Density" },
      baseSpeed: { type: "number", min: 1, max: 6, step: 0.5, default: 3, label: "Base Speed" },
      trailLength: {
        type: "number",
        min: 0.8,
        max: 0.98,
        step: 0.02,
        default: 0.92,
        label: "Trail Length",
      },
    };
  }
}
