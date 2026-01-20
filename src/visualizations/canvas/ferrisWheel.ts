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

interface FerrisWheelConfig extends VisualizationConfig {
  colorScheme: string;
  rotationSpeed: number;
  cabinCount: number;
}

interface Cabin {
  angle: number;
  swingAngle: number;
  swingVelocity: number;
  lights: boolean[];
}

interface Star {
  x: number;
  y: number;
  brightness: number;
  twinklePhase: number;
}

export class FerrisWheelVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "ferrisWheel",
    name: "Ferris Wheel",
    author: "Vizec",
    description: "Carnival ferris wheel with twinkling lights",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: FerrisWheelConfig = {
    sensitivity: 1.0,
    colorScheme: "rainbow",
    rotationSpeed: 1.0,
    cabinCount: 12,
  };

  private width = 0;
  private height = 0;
  private rotation = 0;
  private cabins: Cabin[] = [];
  private stars: Star[] = [];
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
    this.initCabins();
    this.initStars();
  }

  private initCabins(): void {
    this.cabins = [];
    for (let i = 0; i < this.config.cabinCount; i++) {
      const angle = (i / this.config.cabinCount) * Math.PI * 2;
      this.cabins.push({
        angle,
        swingAngle: 0,
        swingVelocity: 0,
        lights: [true, true, Math.random() > 0.3],
      });
    }
  }

  private initStars(): void {
    this.stars = [];
    for (let i = 0; i < 50; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height * 0.5,
        brightness: 0.3 + Math.random() * 0.7,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, rotationSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Draw stars
    for (const star of this.stars) {
      star.twinklePhase += deltaTime * 3;
      const twinkle = 0.5 + Math.sin(star.twinklePhase) * 0.5;
      const alpha = star.brightness * twinkle * (0.5 + treble * 0.5);

      this.ctx.fillStyle = `rgba(255, 255, 220, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, 1.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    const centerX = this.width * 0.5;
    const centerY = this.height * 0.55;
    const wheelRadius = Math.min(this.width, this.height) * 0.35;

    // Update rotation based on audio
    const speedMod = 0.5 + volume * 0.5;
    this.rotation += deltaTime * 0.3 * rotationSpeed * speedMod;

    // Draw wheel structure
    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(this.rotation);

    // Outer rim
    this.ctx.strokeStyle = `rgba(80, 80, 100, 0.7)`;
    this.ctx.lineWidth = 8;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Inner rim
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, wheelRadius * 0.7, 0, Math.PI * 2);
    this.ctx.stroke();

    // Spokes with lights
    const spokeCount = this.config.cabinCount;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const x1 = Math.cos(angle) * 30;
      const y1 = Math.sin(angle) * 30;
      const x2 = Math.cos(angle) * wheelRadius;
      const y2 = Math.sin(angle) * wheelRadius;

      // Spoke
      this.ctx.strokeStyle = `rgba(100, 100, 120, 0.6)`;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.stroke();

      // Lights along spoke
      const lightCount = 5;
      for (let l = 0; l < lightCount; l++) {
        const t = (l + 1) / (lightCount + 1);
        const lx = x1 + (x2 - x1) * t;
        const ly = y1 + (y2 - y1) * t;

        const hue = (i / spokeCount) * 360 + this.time * 50;
        const pulse = Math.sin(this.time * 5 + i + l) * 0.5 + 0.5;
        const brightness = 0.5 + pulse * bass * sensitivity;

        this.ctx.shadowColor = `hsl(${hue}, 100%, 60%)`;
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = `hsla(${hue}, 100%, ${50 + brightness * 30}%, ${0.7 + brightness * 0.3})`;
        this.ctx.beginPath();
        this.ctx.arc(lx, ly, 3 + bass * 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Center hub
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = `rgba(60, 60, 80, 0.8)`;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 30, 0, Math.PI * 2);
    this.ctx.fill();

    // Hub lights
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + this.time * 2;
      const pulse = Math.sin(this.time * 8 + i) > 0;
      if (pulse) {
        this.ctx.shadowColor = colors.start;
        this.ctx.shadowBlur = 8;
        this.ctx.fillStyle = colors.start;
        this.ctx.beginPath();
        this.ctx.arc(Math.cos(angle) * 20, Math.sin(angle) * 20, 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.restore();

    // Draw cabins (don't rotate with wheel, just position)
    this.ctx.shadowBlur = 0;
    for (let i = 0; i < this.cabins.length; i++) {
      const cabin = this.cabins[i];
      const worldAngle = cabin.angle + this.rotation;
      const cabinX = centerX + Math.cos(worldAngle) * wheelRadius;
      const cabinY = centerY + Math.sin(worldAngle) * wheelRadius;

      // Swing physics
      const gravity = 0.5;
      const damping = 0.98;
      const rotationForce = Math.sin(worldAngle) * bass * 0.1 * sensitivity;

      cabin.swingVelocity += rotationForce;
      cabin.swingVelocity -= Math.sin(cabin.swingAngle) * gravity * deltaTime;
      cabin.swingVelocity *= damping;
      cabin.swingAngle += cabin.swingVelocity;
      cabin.swingAngle = Math.max(-0.5, Math.min(0.5, cabin.swingAngle));

      // Draw cabin
      this.ctx.save();
      this.ctx.translate(cabinX, cabinY);
      this.ctx.rotate(cabin.swingAngle);

      // Cabin arm
      this.ctx.strokeStyle = `rgba(80, 80, 100, 0.6)`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(0, -10);
      this.ctx.lineTo(0, 15);
      this.ctx.stroke();

      // Cabin body
      const cabinWidth = 25;
      const cabinHeight = 30;
      this.ctx.fillStyle = `rgba(40, 40, 60, 0.85)`;
      this.ctx.fillRect(-cabinWidth / 2, 10, cabinWidth, cabinHeight);

      // Cabin window glow
      const windowGlow = 0.5 + mid * 0.5;
      this.ctx.shadowColor = colors.mid;
      this.ctx.shadowBlur = 15 * windowGlow;
      this.ctx.fillStyle = `rgba(255, 220, 150, ${windowGlow * 0.8})`;
      this.ctx.fillRect(-cabinWidth / 2 + 4, 14, cabinWidth - 8, 15);
      this.ctx.shadowBlur = 0;

      // Cabin roof
      this.ctx.fillStyle = `rgba(60, 60, 80, 0.8)`;
      this.ctx.beginPath();
      this.ctx.moveTo(-cabinWidth / 2 - 3, 10);
      this.ctx.lineTo(cabinWidth / 2 + 3, 10);
      this.ctx.lineTo(0, 0);
      this.ctx.closePath();
      this.ctx.fill();

      this.ctx.restore();
    }

    // Support structure
    this.ctx.strokeStyle = `rgba(70, 70, 90, 0.7)`;
    this.ctx.lineWidth = 12;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 80, this.height);
    this.ctx.lineTo(centerX, centerY + 20);
    this.ctx.lineTo(centerX + 80, this.height);
    this.ctx.stroke();

    // Cross beams
    this.ctx.lineWidth = 4;
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 6;
      const y = centerY + 20 + (this.height - centerY - 20) * t;
      const spread = 80 * t;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - spread, y);
      this.ctx.lineTo(centerX + spread, y);
      this.ctx.stroke();
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initStars();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCabinCount = this.config.cabinCount;
    this.config = { ...this.config, ...config } as FerrisWheelConfig;

    if (this.config.cabinCount !== oldCabinCount) {
      this.initCabins();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.cabins = [];
    this.stars = [];
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
        default: "rainbow",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      cabinCount: {
        type: "number",
        label: "Cabin Count",
        default: 12,
        min: 6,
        max: 20,
        step: 1,
      },
    };
  }
}
