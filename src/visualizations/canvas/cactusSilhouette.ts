import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface CactusSilhouetteConfig extends VisualizationConfig {
  cactusCount: number;
  horizonGlow: number;
  pulseIntensity: number;
}

interface Cactus {
  x: number;
  baseHeight: number;
  width: number;
  arms: Array<{
    side: "left" | "right";
    heightRatio: number;
    length: number;
    angle: number;
  }>;
  type: "saguaro" | "barrel" | "pricklyPear";
}

export class CactusSilhouetteVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "cactusSilhouette",
    name: "Cactus Silhouette",
    author: "Vizec",
    description: "Desert landscape with pulsing cactus silhouettes",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: CactusSilhouetteConfig = {
    sensitivity: 1.0,
    colorScheme: "sunset",
    cactusCount: 8,
    horizonGlow: 1.0,
    pulseIntensity: 1.0,
  };
  private width = 0;
  private height = 0;
  private cacti: Cactus[] = [];
  private smoothedBass = 0;
  private smoothedMid = 0;
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

    this.initCacti();
  }

  private initCacti(): void {
    this.cacti = [];
    const { cactusCount } = this.config;
    const types: Array<"saguaro" | "barrel" | "pricklyPear"> = ["saguaro", "barrel", "pricklyPear"];

    for (let i = 0; i < cactusCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const cactus: Cactus = {
        x: (this.width / (cactusCount + 1)) * (i + 1) + (Math.random() - 0.5) * 50,
        baseHeight: 80 + Math.random() * 120,
        width: type === "barrel" ? 40 + Math.random() * 20 : 20 + Math.random() * 15,
        arms: [],
        type,
      };

      // Add arms for saguaro type
      if (type === "saguaro") {
        const armCount = 1 + Math.floor(Math.random() * 3);
        for (let j = 0; j < armCount; j++) {
          cactus.arms.push({
            side: Math.random() > 0.5 ? "left" : "right",
            heightRatio: 0.3 + Math.random() * 0.4,
            length: 30 + Math.random() * 40,
            angle: 0.2 + Math.random() * 0.4,
          });
        }
      }

      this.cacti.push(cactus);
    }

    // Sort by x position for proper layering
    this.cacti.sort((a, b) => a.x - b.x);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid } = audioData;
    const { sensitivity, colorScheme, horizonGlow, pulseIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw horizon glow
    this.drawHorizonGlow(colors, horizonGlow);

    // Draw ground
    this.drawGround(colors);

    // Draw cacti
    for (const cactus of this.cacti) {
      this.drawCactus(cactus, colors, pulseIntensity);
    }

    // Reset context
    this.ctx.globalAlpha = 1.0;
  }

  private drawHorizonGlow(
    colors: { start: string; end: string; glow: string },
    intensity: number,
  ): void {
    if (!this.ctx) return;

    const horizonY = this.height * 0.7;
    const glowHeight = this.height * 0.4;
    const glowIntensity = 0.3 + this.smoothedMid * 0.4 * intensity;

    const gradient = this.ctx.createRadialGradient(
      this.width / 2,
      horizonY,
      0,
      this.width / 2,
      horizonY,
      this.width * 0.6,
    );

    gradient.addColorStop(0, this.colorWithAlpha(colors.glow, glowIntensity * 0.6));
    gradient.addColorStop(0.3, this.colorWithAlpha(colors.end, glowIntensity * 0.4));
    gradient.addColorStop(0.6, this.colorWithAlpha(colors.start, glowIntensity * 0.2));
    gradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, horizonY - glowHeight, this.width, glowHeight * 2);
  }

  private drawGround(colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const groundY = this.height * 0.75;

    // Ground gradient
    const gradient = this.ctx.createLinearGradient(0, groundY, 0, this.height);
    gradient.addColorStop(0, this.colorWithAlpha(colors.start, 0.1));
    gradient.addColorStop(1, this.colorWithAlpha(colors.start, 0.05));

    this.ctx.globalAlpha = 0.5;
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, groundY, this.width, this.height - groundY);
  }

  private drawCactus(
    cactus: Cactus,
    colors: { start: string; end: string; glow: string },
    pulseIntensity: number,
  ): void {
    if (!this.ctx) return;

    const groundY = this.height * 0.75;
    const bassPulse = 1 + this.smoothedBass * 0.2 * pulseIntensity;
    const height = cactus.baseHeight * bassPulse;

    this.ctx.globalAlpha = 0.55;
    this.ctx.fillStyle = colors.start;

    if (cactus.type === "saguaro") {
      // Main body
      const bodyWidth = cactus.width;
      this.ctx.beginPath();
      this.ctx.moveTo(cactus.x - bodyWidth / 2, groundY);
      this.ctx.lineTo(cactus.x - bodyWidth / 2, groundY - height);
      this.ctx.quadraticCurveTo(
        cactus.x,
        groundY - height - bodyWidth / 2,
        cactus.x + bodyWidth / 2,
        groundY - height,
      );
      this.ctx.lineTo(cactus.x + bodyWidth / 2, groundY);
      this.ctx.closePath();
      this.ctx.fill();

      // Arms
      for (const arm of cactus.arms) {
        const armY = groundY - height * arm.heightRatio;
        const direction = arm.side === "left" ? -1 : 1;
        const armLength = arm.length * bassPulse;

        this.ctx.beginPath();
        // Horizontal part
        const startX = cactus.x + (direction * bodyWidth) / 2;
        const endX = startX + direction * armLength * 0.6;

        this.ctx.moveTo(startX, armY);
        this.ctx.lineTo(endX, armY);
        // Vertical part going up
        this.ctx.lineTo(endX, armY - armLength * 0.4);
        this.ctx.quadraticCurveTo(
          endX + direction * 5,
          armY - armLength * 0.5,
          endX,
          armY - armLength * 0.4,
        );
        this.ctx.lineWidth = bodyWidth * 0.6;
        this.ctx.strokeStyle = colors.start;
        this.ctx.stroke();

        // Rounded end
        this.ctx.beginPath();
        this.ctx.arc(endX, armY - armLength * 0.4, bodyWidth * 0.3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    } else if (cactus.type === "barrel") {
      // Barrel cactus - short and round
      const radius = cactus.width * 0.5;
      const barrelHeight = height * 0.4;

      this.ctx.beginPath();
      this.ctx.ellipse(
        cactus.x,
        groundY - barrelHeight / 2,
        radius,
        barrelHeight / 2,
        0,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    } else {
      // Prickly pear - stacked pads
      const padWidth = cactus.width * 1.2;
      const padHeight = cactus.width * 0.8;

      // Bottom pad
      this.ctx.beginPath();
      this.ctx.ellipse(
        cactus.x,
        groundY - padHeight / 2,
        padWidth / 2,
        padHeight / 2,
        0,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();

      // Top pads
      this.ctx.beginPath();
      this.ctx.ellipse(
        cactus.x - padWidth * 0.3,
        groundY - padHeight * 1.2,
        padWidth * 0.4,
        padHeight * 0.4,
        -0.3,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();

      this.ctx.beginPath();
      this.ctx.ellipse(
        cactus.x + padWidth * 0.25,
        groundY - padHeight * 1.3,
        padWidth * 0.35,
        padHeight * 0.35,
        0.2,
        0,
        Math.PI * 2,
      );
      this.ctx.fill();
    }
  }

  private colorWithAlpha(hexColor: string, alpha: number): string {
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.cacti.length > 0) {
      this.initCacti();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevCount = this.config.cactusCount;
    this.config = { ...this.config, ...config } as CactusSilhouetteConfig;

    if (this.config.cactusCount !== prevCount && this.width > 0) {
      this.initCacti();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.cacti = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      cactusCount: {
        type: "number",
        label: "Cactus Count",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      horizonGlow: {
        type: "number",
        label: "Horizon Glow",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      pulseIntensity: {
        type: "number",
        label: "Pulse Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "sunset",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
