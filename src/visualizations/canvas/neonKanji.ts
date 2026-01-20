import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface NeonKanjiConfig extends VisualizationConfig {
  colorScheme: string;
  glowIntensity: number;
  animationSpeed: number;
}

interface KanjiSign {
  x: number;
  y: number;
  characters: string;
  color: string;
  size: number;
  brightness: number;
  flickerPhase: number;
  vertical: boolean;
}

export class NeonKanjiVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "neonKanji",
    name: "Neon Kanji",
    author: "Vizec",
    description: "Glowing Japanese neon signs in cyberpunk style",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: NeonKanjiConfig = {
    sensitivity: 1.0,
    colorScheme: "neonCity",
    glowIntensity: 1.0,
    animationSpeed: 1.0,
  };

  private width = 0;
  private height = 0;
  private signs: KanjiSign[] = [];
  private time = 0;

  // Common kanji/katakana for signs
  private signTexts = [
    "居酒屋", // Izakaya (bar)
    "ラーメン", // Ramen
    "カラオケ", // Karaoke
    "薬", // Medicine/Pharmacy
    "酒", // Sake
    "営業中", // Open for business
    "喫茶", // Coffee shop
    "食堂", // Cafeteria
    "寿司", // Sushi
    "焼肉", // BBQ
    "電気", // Electric
    "東京", // Tokyo
    "夢", // Dream
    "愛", // Love
    "光", // Light
    "音", // Sound
    "夜", // Night
  ];

  private signColors = [
    "#ff0066",
    "#00ffcc",
    "#ff6600",
    "#ff00ff",
    "#00ccff",
    "#ffcc00",
    "#ff3366",
    "#66ff66",
  ];

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
    this.initSigns();
  }

  private initSigns(): void {
    this.signs = [];
    const signCount = 6 + Math.floor(this.width / 300);

    for (let i = 0; i < signCount; i++) {
      const text = this.signTexts[Math.floor(Math.random() * this.signTexts.length)];
      const vertical = Math.random() > 0.4;
      const size = 30 + Math.random() * 30;

      // Position to avoid too much overlap
      const x = (this.width / (signCount + 1)) * (i + 1) + (Math.random() - 0.5) * 150;
      const y = 50 + Math.random() * (this.height - 200);

      this.signs.push({
        x,
        y,
        characters: text,
        color: this.signColors[Math.floor(Math.random() * this.signColors.length)],
        size,
        brightness: 0.7 + Math.random() * 0.3,
        flickerPhase: Math.random() * Math.PI * 2,
        vertical,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, treble, volume } = audioData;
    const { sensitivity, colorScheme, glowIntensity, animationSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime * animationSpeed;

    // Rain effect in background
    this.ctx.globalAlpha = 0.3 * treble;
    this.ctx.strokeStyle = "rgba(100, 150, 200, 0.4)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 50; i++) {
      const rx = (i * 37 + this.time * 200) % this.width;
      const ry = (this.time * 400 + i * 67) % this.height;
      this.ctx.beginPath();
      this.ctx.moveTo(rx, ry);
      this.ctx.lineTo(rx - 3, ry + 20);
      this.ctx.stroke();
    }
    this.ctx.globalAlpha = 1;

    for (const sign of this.signs) {
      sign.flickerPhase += deltaTime * (5 + treble * 10);

      // Complex flicker pattern
      const flicker1 = Math.sin(sign.flickerPhase) * 0.15;
      const flicker2 = Math.sin(sign.flickerPhase * 2.3) * 0.1;
      const randomFlicker = Math.random() < 0.02 ? -0.4 : 0;

      const brightness = sign.brightness * (0.85 + flicker1 + flicker2 + randomFlicker);
      const audioBrightness = brightness * (0.6 + volume * 0.4 * sensitivity);

      if (audioBrightness < 0.1) continue;

      this.ctx.save();
      this.ctx.translate(sign.x, sign.y);

      // Sign backing (slight transparency)
      const chars = sign.characters.split("");
      let totalWidth = 0;
      let totalHeight = 0;

      this.ctx.font = `bold ${sign.size}px "MS Gothic", "Yu Gothic", sans-serif`;

      if (sign.vertical) {
        totalWidth = sign.size + 20;
        totalHeight = chars.length * (sign.size + 5) + 20;
      } else {
        for (const char of chars) {
          totalWidth += this.ctx.measureText(char).width + 5;
        }
        totalWidth += 20;
        totalHeight = sign.size + 20;
      }

      // Sign background
      this.ctx.fillStyle = "rgba(20, 20, 30, 0.7)";
      this.ctx.fillRect(-10, -10, totalWidth, totalHeight);

      // Border
      this.ctx.strokeStyle = `rgba(${this.hexToRgb(sign.color)}, ${audioBrightness * 0.5})`;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(-10, -10, totalWidth, totalHeight);

      // Draw characters
      this.ctx.textBaseline = "top";

      let charX = 5;
      let charY = 5;

      for (let i = 0; i < chars.length; i++) {
        const char = chars[i];

        // Per-character brightness variation
        const charFlicker = Math.sin(this.time * 8 + i * 2) * 0.1 + 0.9;
        const charBrightness = audioBrightness * charFlicker;

        // Outer glow
        this.ctx.shadowColor = sign.color;
        this.ctx.shadowBlur = 25 * glowIntensity * charBrightness;

        // Main character
        this.ctx.fillStyle = sign.color;
        this.ctx.globalAlpha = charBrightness;
        this.ctx.fillText(char, charX, charY);

        // Inner glow (white core)
        this.ctx.shadowBlur = 10 * glowIntensity * charBrightness;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${charBrightness * 0.5})`;
        this.ctx.fillText(char, charX, charY);

        if (sign.vertical) {
          charY += sign.size + 5;
        } else {
          charX += this.ctx.measureText(char).width + 5;
        }
      }

      this.ctx.restore();

      // Reflection on ground (if near bottom)
      if (sign.y + totalHeight > this.height * 0.6) {
        this.ctx.save();
        this.ctx.translate(sign.x, this.height);
        this.ctx.scale(1, -0.3);
        this.ctx.globalAlpha = audioBrightness * 0.15;

        this.ctx.font = `bold ${sign.size}px "MS Gothic", "Yu Gothic", sans-serif`;
        this.ctx.fillStyle = sign.color;
        this.ctx.shadowColor = sign.color;
        this.ctx.shadowBlur = 15;

        let refX = 5;
        let refY = 5;
        for (const char of chars) {
          this.ctx.fillText(char, refX, refY);
          if (sign.vertical) {
            refY += sign.size + 5;
          } else {
            refX += this.ctx.measureText(char).width + 5;
          }
        }

        this.ctx.restore();
      }
    }

    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;

    // Occasional flash on bass hit
    if (bass > 0.8 && Math.random() < 0.05) {
      this.ctx.fillStyle = `rgba(${this.hexToRgb(colors.start)}, 0.1)`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return "255, 255, 255";
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initSigns();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as NeonKanjiConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.signs = [];
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
        default: "neonCity",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      animationSpeed: {
        type: "number",
        label: "Animation Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
    };
  }
}
