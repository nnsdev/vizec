import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface ChampagneConfig extends VisualizationConfig {
  bubbleCount: number;
  effervescence: number;
  sparkleIntensity: number;
  glassWidth: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  champagne: { primary: "#f5e6c8", secondary: "#e6d5a8", accent: "#fff8dc" },
  prosecco: { primary: "#ffeaa7", secondary: "#fdcb6e", accent: "#fff5cc" },
  rose: { primary: "#ffb6c1", secondary: "#ffc0cb", accent: "#ffe4e1" },
  mojito: { primary: "#98fb98", secondary: "#90ee90", accent: "#f0fff0" },
  cosmopolitan: { primary: "#ff6b81", secondary: "#ff4757", accent: "#ffe4e6" },
};

export class ChampagneVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "champagne",
    name: "Champagne Bubbles",
    author: "Vizec",
    renderer: "canvas2d",
    transitionType: "crossfade",
    description: "Rising champagne bubbles with sparkle effects",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: ChampagneConfig = {
    sensitivity: 1.0,
    colorScheme: "champagne",
    bubbleCount: 150,
    effervescence: 1.0,
    sparkleIntensity: 0.8,
    glassWidth: 0.6,
  };

  private bubbles: ChampagneBubble[] = [];
  private sparkles: Sparkle[] = [];
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

    this.initBubbles();
  }

  private initBubbles(): void {
    this.bubbles = [];
    for (let i = 0; i < this.config.bubbleCount; i++) {
      this.bubbles.push(this.createBubble());
    }
  }

  private createBubble(): ChampagneBubble {
    const glassLeft = (1 - this.config.glassWidth) * 0.5 * this.width;
    const glassRight = (1 + this.config.glassWidth) * 0.5 * this.width;
    const x = glassLeft + Math.random() * (glassRight - glassLeft);
    const baseSpeed = 0.5 + Math.random() * 1.5;
    const size = 1 + Math.random() * 4;

    return new ChampagneBubble(x, this.height + Math.random() * 50, size, baseSpeed);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime;
    const { bass, treble, volume } = audioData;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.champagne;

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw glass outline
    this.drawGlass(colors);

    // Spawn new bubbles based on treble (effervescence)
    const spawnChance = treble * this.config.effervescence * 0.1 * this.config.sensitivity;
    for (let i = 0; i < Math.floor(spawnChance * 10); i++) {
      if (this.bubbles.length < this.config.bubbleCount * 2) {
        this.bubbles.push(this.createBubble());
      }
    }

    // Update and draw bubbles
    this.ctx.globalAlpha = 0.8;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];
      bubble.update(bass, treble, volume, this.config.sensitivity, this.height);

      // Sparkle effect on bass hits
      if (bass > 0.7 && Math.random() < 0.05 * this.config.sparkleIntensity) {
        this.sparkles.push(
          new Sparkle(bubble.x + (Math.random() - 0.5) * 10, bubble.y, bubble.size),
        );
      }

      bubble.draw(this.ctx!, colors);

      if (bubble.y < -bubble.size) {
        this.bubbles.splice(i, 1);
      }
    }

    // Update and draw sparkles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const sparkle = this.sparkles[i];
      sparkle.update();
      sparkle.draw(this.ctx!, colors);

      if (sparkle.life <= 0) {
        this.sparkles.splice(i, 1);
      }
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawGlass(colors: { primary: string; secondary: string; accent: string }): void {
    if (!this.ctx) return;

    const glassLeft = (1 - this.config.glassWidth) * 0.5 * this.width;
    const glassRight = (1 + this.config.glassWidth) * 0.5 * this.width;
    const glassTop = this.height * 0.15;
    const glassBottom = this.height * 0.9;

    // Glass tint
    this.ctx.globalAlpha = 0.1;
    const glassGradient = this.ctx.createLinearGradient(glassLeft, 0, glassRight, 0);
    glassGradient.addColorStop(0, colors.secondary + "20");
    glassGradient.addColorStop(0.5, colors.primary + "30");
    glassGradient.addColorStop(1, colors.secondary + "20");
    this.ctx.fillStyle = glassGradient;
    this.ctx.fillRect(glassLeft, glassTop, glassRight - glassLeft, glassBottom - glassTop);

    // Glass rim
    this.ctx.globalAlpha = 0.3;
    this.ctx.strokeStyle = colors.accent;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(glassLeft, glassTop);
    this.ctx.lineTo(glassRight, glassTop);
    this.ctx.stroke();

    // Glass base
    this.ctx.beginPath();
    this.ctx.moveTo(glassLeft * 0.7 + glassRight * 0.3, glassBottom);
    this.ctx.lineTo(glassLeft * 0.3 + glassRight * 0.7, glassBottom);
    this.ctx.stroke();

    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initBubbles();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.bubbleCount;
    this.config = { ...this.config, ...config } as ChampagneConfig;

    if (config.bubbleCount && config.bubbleCount !== oldCount) {
      this.initBubbles();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.bubbles = [];
    this.sparkles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "champagne",
        options: [
          { value: "champagne", label: "Champagne" },
          { value: "prosecco", label: "Prosecco" },
          { value: "rose", label: "Rosé" },
          { value: "mojito", label: "Mojito" },
          { value: "cosmopolitan", label: "Cosmopolitan" },
        ],
      },
      bubbleCount: {
        type: "number",
        label: "Bubble Count",
        default: 150,
        min: 50,
        max: 500,
        step: 25,
      },
      effervescence: {
        type: "number",
        label: "Effervescence",
        default: 1.0,
        min: 0.1,
        max: 2,
        step: 0.1,
      },
      sparkleIntensity: {
        type: "number",
        label: "Sparkle Intensity",
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
      },
      glassWidth: {
        type: "number",
        label: "Glass Width",
        default: 0.6,
        min: 0.3,
        max: 0.9,
        step: 0.05,
      },
    };
  }
}

class ChampagneBubble {
  x: number;
  y: number;
  size: number;
  baseSpeed: number;
  wobblePhase: number = Math.random() * Math.PI * 2;
  wobbleSpeed: number = 0.05 + Math.random() * 0.05;
  wobbleAmount: number = 0.5 + Math.random() * 1;

  constructor(x: number, y: number, size: number, baseSpeed: number) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.baseSpeed = baseSpeed;
  }

  update(bass: number, treble: number, volume: number, sensitivity: number, _height: number): void {
    // Rising speed affected by bass
    const speedMultiplier = 1 + bass * sensitivity * 2;
    const speed = this.baseSpeed * speedMultiplier;

    this.y -= speed;

    // Wobble effect
    this.wobblePhase += this.wobbleSpeed + treble * 0.01;
    this.x += Math.sin(this.wobblePhase) * this.wobbleAmount;

    // Size pulsation
    this.size += Math.sin(this.wobblePhase * 2) * 0.1;
    // Prevent negative radius which causes IndexSizeError
    if (this.size < 0.5) this.size = 0.5;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    colors: { primary: string; secondary: string; accent: string },
  ): void {
    // Outer glow
    const glowGradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 2);
    glowGradient.addColorStop(0, colors.primary + "60");
    glowGradient.addColorStop(0.5, colors.secondary + "30");
    glowGradient.addColorStop(1, "transparent");

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
    ctx.fill();

    // Bubble body
    const bodyGradient = ctx.createRadialGradient(
      this.x - this.size * 0.3,
      this.y - this.size * 0.3,
      0,
      this.x,
      this.y,
      this.size,
    );
    bodyGradient.addColorStop(0, colors.accent + "cc");
    bodyGradient.addColorStop(0.5, colors.primary + "aa");
    bodyGradient.addColorStop(1, colors.secondary + "80");

    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.beginPath();
    ctx.arc(this.x - this.size * 0.3, this.y - this.size * 0.3, this.size * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

class Sparkle {
  x: number;
  y: number;
  size: number;
  life: number = 1;
  decay: number = 0.03 + Math.random() * 0.02;
  rotation: number = Math.random() * Math.PI;
  rotationSpeed: number = (Math.random() - 0.5) * 0.2;

  constructor(x: number, y: number, size: number) {
    this.x = x;
    this.y = y;
    this.size = size * (2 + Math.random() * 3);
  }

  update(): void {
    this.life -= this.decay;
    this.rotation += this.rotationSpeed;
  }

  draw(ctx: CanvasRenderingContext2D, colors: { accent: string }): void {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    ctx.globalAlpha = this.life;
    ctx.fillStyle = colors.accent;

    // Draw 4-pointed star
    ctx.beginPath();
    ctx.moveTo(0, -this.size);
    ctx.lineTo(this.size * 0.2, 0);
    ctx.lineTo(0, this.size);
    ctx.lineTo(-this.size * 0.2, 0);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1.0;
  }
}
