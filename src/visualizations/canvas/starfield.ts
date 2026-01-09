import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Star {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  size: number;
  color: string;
}

export class StarfieldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "starfield",
    name: "Starfield",
    author: "Vizec",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    starCount: 400,
    baseSpeed: 2,
    trailLength: 0.8,
    colorfulStars: true,
  };

  private stars: Star[] = [];

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

    this.initStars();
  }

  private initStars(): void {
    const { starCount, colorScheme, colorfulStars } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    this.stars = [];
    for (let i = 0; i < starCount; i++) {
      let starColor: string;
      if (colorfulStars) {
        const colorChoice = Math.random();
        if (colorChoice < 0.4) {
          starColor = colors.primary;
        } else if (colorChoice < 0.7) {
          starColor = colors.secondary;
        } else {
          starColor = colors.accent;
        }
      } else {
        starColor = colors.accent;
      }

      this.stars.push({
        x: (Math.random() - 0.5) * this.width * 2,
        y: (Math.random() - 0.5) * this.height * 2,
        z: Math.random() * 1000,
        prevX: 0,
        prevY: 0,
        size: Math.random() * 2 + 1,
        color: starColor,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, volume } = audioData;
    const { sensitivity, baseSpeed, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Speed based on bass
    const speed = baseSpeed + bass * sensitivity * 20 + volume * 5;

    // Set transparency
    this.ctx.globalAlpha = 0.7;

    for (let i = 0; i < this.stars.length; i++) {
      const star = this.stars[i];

      // Store previous position for trail
      const prevScreenX = (star.x / star.z) * 500 + centerX;
      const prevScreenY = (star.y / star.z) * 500 + centerY;

      // Move star toward camera
      star.z -= speed * deltaTime * 60;

      // Reset star if it passes the camera
      if (star.z <= 1) {
        star.x = (Math.random() - 0.5) * this.width * 2;
        star.y = (Math.random() - 0.5) * this.height * 2;
        star.z = 1000;
        star.prevX = (star.x / star.z) * 500 + centerX;
        star.prevY = (star.y / star.z) * 500 + centerY;
        continue;
      }

      // Project to screen
      const screenX = (star.x / star.z) * 500 + centerX;
      const screenY = (star.y / star.z) * 500 + centerY;

      // Skip if off screen
      if (screenX < 0 || screenX > this.width || screenY < 0 || screenY > this.height) {
        continue;
      }

      // Size based on depth and audio
      const depthFactor = 1 - star.z / 1000;
      const size = (star.size + depthFactor * 3) * (1 + mid * sensitivity);

      // Draw trail
      const trailOpacity = depthFactor * 0.8;
      this.ctx.strokeStyle = star.color;
      this.ctx.globalAlpha = trailOpacity * 0.7;
      this.ctx.lineWidth = size * 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(prevScreenX, prevScreenY);
      this.ctx.lineTo(screenX, screenY);
      this.ctx.stroke();

      // Draw star
      this.ctx.globalAlpha = (0.5 + depthFactor * 0.5) * 0.7;
      this.ctx.fillStyle = star.color;
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
      this.ctx.fill();

      // Glow for close stars
      if (depthFactor > 0.7) {
        this.ctx.shadowBlur = 10 * depthFactor;
        this.ctx.shadowColor = star.color;
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, size * 0.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
      }

      star.prevX = screenX;
      star.prevY = screenY;
    }

    // Center glow based on bass
    const centerGlowSize = 50 + bass * sensitivity * 100;
    const centerGradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      centerGlowSize,
    );
    centerGradient.addColorStop(0, colors.primary + "30");
    centerGradient.addColorStop(0.5, colors.secondary + "10");
    centerGradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.5;
    this.ctx.fillStyle = centerGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, centerGlowSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Reset
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
    const oldStarCount = this.config.starCount;
    this.config = { ...this.config, ...config };

    if (config.starCount && config.starCount !== oldStarCount) {
      this.initStars();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.stars = [];
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
      starCount: {
        type: "number",
        min: 100,
        max: 800,
        step: 50,
        default: 400,
        label: "Star Count",
      },
      baseSpeed: { type: "number", min: 0.5, max: 5, step: 0.5, default: 2, label: "Base Speed" },
      trailLength: {
        type: "number",
        min: 0,
        max: 0.95,
        step: 0.05,
        default: 0.8,
        label: "Trail Length",
      },
      colorfulStars: { type: "boolean", default: true, label: "Colorful Stars" },
    };
  }
}
