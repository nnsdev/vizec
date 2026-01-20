import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEME_OPTIONS } from "../shared/colorSchemes";

interface BillboardFlickerConfig extends VisualizationConfig {
  colorScheme: string;
  flickerRate: number;
  signCount: number;
}

interface Sign {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color: string;
  brightness: number;
  flickerPhase: number;
  flickerSpeed: number;
  broken: boolean;
  brokenSegments: boolean[];
}

export class BillboardFlickerVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "billboardFlicker",
    name: "Billboard Flicker",
    author: "Vizec",
    description: "Flickering neon billboards and signs",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: BillboardFlickerConfig = {
    sensitivity: 1.0,
    colorScheme: "neonCity",
    flickerRate: 1.0,
    signCount: 5,
  };

  private width = 0;
  private height = 0;
  private signs: Sign[] = [];
  private time = 0;

  private signTexts = [
    "OPEN", "24/7", "BAR", "HOTEL", "DINER", "PIZZA", "CAFE",
    "CLUB", "SHOP", "BEER", "LIVE", "JAZZ", "TAXI", "ATM"
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
    const colors = ["#ff0066", "#00ffcc", "#ffcc00", "#ff6600", "#00ccff", "#ff00ff"];

    for (let i = 0; i < this.config.signCount; i++) {
      const text = this.signTexts[Math.floor(Math.random() * this.signTexts.length)];
      const signWidth = 80 + text.length * 25;
      const signHeight = 40 + Math.random() * 30;

      // Avoid overlap by spacing them out
      const x = (this.width / (this.config.signCount + 1)) * (i + 1) - signWidth / 2 + (Math.random() - 0.5) * 100;
      const y = 50 + Math.random() * (this.height - 150);

      const brokenSegments: boolean[] = [];
      for (let j = 0; j < text.length; j++) {
        brokenSegments.push(Math.random() < 0.15); // 15% chance each letter is broken
      }

      this.signs.push({
        x,
        y,
        width: signWidth,
        height: signHeight,
        text,
        color: colors[Math.floor(Math.random() * colors.length)],
        brightness: 0.8 + Math.random() * 0.2,
        flickerPhase: Math.random() * Math.PI * 2,
        flickerSpeed: 3 + Math.random() * 5,
        broken: Math.random() < 0.2,
        brokenSegments,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, flickerRate } = this.config;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    for (const sign of this.signs) {
      sign.flickerPhase += deltaTime * sign.flickerSpeed * flickerRate;

      // Complex flicker pattern
      let flicker = 1;
      if (sign.broken) {
        // Broken signs have erratic flicker
        const noise = Math.sin(sign.flickerPhase) * Math.cos(sign.flickerPhase * 2.3);
        flicker = noise > 0.3 ? 1 : (noise > -0.2 ? 0.3 : 0);
      } else {
        // Normal signs have subtle flicker
        flicker = 0.85 + Math.sin(sign.flickerPhase) * 0.15;
      }

      // Audio reactivity
      const audioBrightness = 0.7 + volume * 0.3 * sensitivity;
      const finalBrightness = sign.brightness * flicker * audioBrightness;

      if (finalBrightness < 0.1) continue;

      // Sign backing
      this.ctx.fillStyle = `rgba(20, 20, 30, 0.7)`;
      this.ctx.fillRect(sign.x - 10, sign.y - 5, sign.width + 20, sign.height + 10);

      // Border
      this.ctx.strokeStyle = `rgba(60, 60, 80, 0.5)`;
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(sign.x - 10, sign.y - 5, sign.width + 20, sign.height + 10);

      // Neon glow
      this.ctx.shadowColor = sign.color;
      this.ctx.shadowBlur = 20 + bass * 20 * sensitivity;

      // Draw each letter
      this.ctx.font = `bold ${sign.height * 0.7}px Arial`;
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "middle";

      let letterX = sign.x + 10;
      for (let i = 0; i < sign.text.length; i++) {
        const letter = sign.text[i];
        const letterWidth = this.ctx.measureText(letter).width;

        let letterBrightness = finalBrightness;
        if (sign.brokenSegments[i]) {
          // Broken letter flickers independently
          const letterFlicker = Math.sin(this.time * 15 + i * 2) > 0.7;
          letterBrightness = letterFlicker ? finalBrightness * 0.5 : 0;
        }

        if (letterBrightness > 0.05) {
          this.ctx.globalAlpha = letterBrightness;

          // Main glow
          this.ctx.shadowBlur = 15 + mid * 15;
          this.ctx.fillStyle = sign.color;
          this.ctx.fillText(letter, letterX, sign.y + sign.height / 2);

          // Core (brighter)
          this.ctx.shadowBlur = 5;
          this.ctx.fillStyle = `rgba(255, 255, 255, ${letterBrightness * 0.6})`;
          this.ctx.fillText(letter, letterX, sign.y + sign.height / 2);
        }

        letterX += letterWidth + 5;
      }

      this.ctx.globalAlpha = 1;

      // Occasional spark on bass hit
      if (sign.broken && bass > 0.7 && Math.random() < 0.05) {
        this.drawSpark(sign.x + Math.random() * sign.width, sign.y + sign.height / 2, sign.color);
      }
    }

    // Ambient rain effect on treble
    if (treble > 0.3) {
      this.ctx.globalAlpha = treble * 0.3;
      for (let i = 0; i < 20; i++) {
        const rx = Math.random() * this.width;
        const ry = (this.time * 500 + i * 50) % this.height;
        this.ctx.strokeStyle = `rgba(100, 150, 200, 0.3)`;
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(rx, ry);
        this.ctx.lineTo(rx - 2, ry + 15);
        this.ctx.stroke();
      }
      this.ctx.globalAlpha = 1;
    }

    this.ctx.shadowBlur = 0;
  }

  private drawSpark(x: number, y: number, color: string): void {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = 10;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;

    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const length = 5 + Math.random() * 15;

      this.ctx.globalAlpha = 0.5 + Math.random() * 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      this.ctx.stroke();
    }

    this.ctx.restore();
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
    const oldCount = this.config.signCount;
    this.config = { ...this.config, ...config } as BillboardFlickerConfig;

    if (this.config.signCount !== oldCount && this.width > 0) {
      this.initSigns();
    }
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
      flickerRate: {
        type: "number",
        label: "Flicker Rate",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      signCount: {
        type: "number",
        label: "Sign Count",
        default: 5,
        min: 2,
        max: 10,
        step: 1,
      },
    };
  }
}
