import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_STRING, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface DigitalRainConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  streamCount: number;
  dropSpeed: number;
  glyphDensity: number;
}

export class DigitalRainVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "digitalRain",
    name: "Digital Rain",
    author: "Vizec",
    description: "Vertical flowing data streams pulsing with bass",
    renderer: "canvas2d",
    transitionType: "cut",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: DigitalRainConfig = {
    sensitivity: 1.0,
    colorScheme: "neon",
    streamCount: 50,
    dropSpeed: 3,
    glyphDensity: 0.5,
  };

  private streams: DigitalStream[] = [];
  private glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;:,.<>?";
  private chars: string[] = [];

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");

    // Initialize chars array from glyphs
    this.initChars();

    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    this.initStreams();
  }

  private initChars(): void {
    const density = this.config.glyphDensity;
    this.chars = [];
    const charCount = Math.floor(this.glyphs.length * density);
    for (let i = 0; i < charCount; i++) {
      const index = Math.floor((i / charCount) * this.glyphs.length);
      this.chars.push(this.glyphs[index]);
    }
  }

  private initStreams(): void {
    this.streams = [];
    const { streamCount } = this.config;

    for (let i = 0; i < streamCount; i++) {
      this.streams.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height - this.height,
        speed: 1 + Math.random() * 2,
        length: 10 + Math.floor(Math.random() * 20),
        active: Math.random() > 0.3,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, treble, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, dropSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate audio reactivity
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;
    const volumeBoost = volume;

    // Update and draw each stream
    this.ctx.font = "14px monospace";
    this.ctx.textBaseline = "top";

    for (const stream of this.streams) {
      // Calculate stream speed based on audio
      const streamSpeed = dropSpeed * stream.speed * (1 + bassBoost * 0.5);
      stream.y += streamSpeed * deltaTime * 60;

      // Reset stream position when it goes off screen
      if (stream.y > this.height) {
        stream.y = -stream.length * 15;
        stream.x = Math.random() * this.width;
        stream.length = 10 + Math.floor(Math.random() * 20);
        // Keep base activity level, boost with volume
        stream.active = Math.random() < 0.5 + volumeBoost * 0.5;
      }

      if (!stream.active) continue;

      // Draw the stream
      for (let i = 0; i < stream.length; i++) {
        const charY = stream.y + i * 15;
        if (charY < 0 || charY > this.height) continue;

        // Get frequency data for this character position
        const freqIndex = Math.floor((stream.x / this.width) * frequencyData.length * 0.3);
        const freqValue = frequencyData[freqIndex] / 255;

        // Calculate character properties
        const isHead = i === 0;
        const charOpacity = isHead
          ? 0.8 + volumeBoost * 0.2
          : Math.max(0.1, 0.6 - i * 0.05 * (1 + freqValue * 0.5));

        // Select glyph
        const charIndex = Math.floor(Math.random() * this.chars.length);
        const char =
          this.chars[charIndex] || this.glyphs[Math.floor(Math.random() * this.glyphs.length)];

        // Determine color
        let charColor: string;
        if (isHead) {
          // Head is brighter, reacts to treble
          charColor = trebleBoost > 0.5 ? colors.glow : colors.primary;
        } else {
          // Tail fades to secondary
          charColor = colors.secondary;
        }

        // Draw character
        this.ctx.save();
        this.ctx.globalAlpha = charOpacity;

        if (isHead) {
          // Head glow effect
          this.ctx.shadowBlur = 5 + trebleBoost * 10;
          this.ctx.shadowColor = charColor;
        }

        this.ctx.fillStyle = charColor;
        this.ctx.fillText(char, stream.x, charY);
        this.ctx.restore();

        // Add glow trail for heads based on volume
        if (isHead && volume > 0.1) {
          this.ctx.save();
          this.ctx.globalAlpha = volume * 0.3;
          this.ctx.shadowBlur = 10 + bassBoost * 15;
          this.ctx.shadowColor = colors.glow;
          this.ctx.fillStyle = colors.glow;
          this.ctx.fillText(char, stream.x, charY);
          this.ctx.restore();
        }
      }
    }

    // Draw ambient background effect based on bass
    if (bass > 0.3) {
      this.ctx.save();
      this.ctx.globalAlpha = bass * 0.05;
      this.ctx.fillStyle = colors.primary;
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Reinitialize streams on resize
    if (this.streams.length > 0) {
      this.initStreams();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as DigitalRainConfig;

    // Reinitialize chars array if glyph density changed
    if (config.glyphDensity !== undefined) {
      this.initChars();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.streams = [];
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
        default: "neon",
        label: "Color Scheme",
      },
      streamCount: {
        type: "number",
        min: 20,
        max: 100,
        step: 5,
        default: 50,
        label: "Stream Count",
      },
      dropSpeed: {
        type: "number",
        min: 1,
        max: 10,
        step: 0.5,
        default: 3,
        label: "Drop Speed",
      },
      glyphDensity: {
        type: "number",
        min: 0.1,
        max: 1.0,
        step: 0.1,
        default: 0.5,
        label: "Glyph Density",
      },
    };
  }
}

interface DigitalStream {
  x: number;
  y: number;
  speed: number;
  length: number;
  active: boolean;
}
