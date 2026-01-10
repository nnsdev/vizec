import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface LavaLampConfig extends VisualizationConfig {
  blobCount: number;
  heatSpeed: number;
  viscosity: number;
  blendMode: string;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  classic: { primary: "#ff0000", secondary: "#ff6a00", accent: "#ff8c00" },
  ocean: { primary: "#0066ff", secondary: "#00ccff", accent: "#66ffff" },
  forest: { primary: "#00ff00", secondary: "#33ff33", accent: "#66ff66" },
  purple: { primary: "#9900ff", secondary: "#cc33ff", accent: "#ff66ff" },
  matrix: { primary: "#00ff00", secondary: "#33ff00", accent: "#66ff00" },
};

export class LavaLampVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "lavaLamp",
    name: "Lava Lamp",
    author: "Vizec",
    renderer: "canvas2d",
    transitionType: "crossfade",
    description: "Blobs rising and falling like a lava lamp",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: LavaLampConfig = {
    sensitivity: 1.0,
    colorScheme: "classic",
    blobCount: 12,
    heatSpeed: 0.5,
    viscosity: 0.98,
    blendMode: "screen",
  };

  private blobs: LavaBlob[] = [];
  private currentAudioData: AudioData | null = null;

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

    this.initBlobs();
  }

  private initBlobs(): void {
    this.blobs = [];

    for (let i = 0; i < this.config.blobCount; i++) {
      const isHeavy = i < this.config.blobCount * 0.3;
      this.blobs.push(
        new LavaBlob(
          this.width * (0.2 + (i / this.config.blobCount) * 0.6),
          this.height * (0.3 + Math.random() * 0.4),
          30 + Math.random() * 50,
          isHeavy,
        ),
      );
    }
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.currentAudioData = audioData;
    const { bass, mid, treble, volume } = audioData;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.classic;

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Apply blend mode
    this.ctx.globalCompositeOperation = "source-over";

    // Draw subtle background gradient
    const bgGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    bgGradient.addColorStop(0, colors.primary + "10");
    bgGradient.addColorStop(0.5, colors.secondary + "05");
    bgGradient.addColorStop(1, colors.primary + "10");
    this.ctx.fillStyle = bgGradient;
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Set blend mode for glow effect
    this.ctx.globalCompositeOperation = "screen";

    // Update and draw blobs
    for (const blob of this.blobs) {
      blob.update(
        bass,
        mid,
        treble,
        volume,
        this.config.sensitivity,
        this.config.heatSpeed,
        this.config.viscosity,
        this.height,
        this.width,
      );
      blob.draw(this.ctx!, colors);
    }

    // Reset blend mode
    this.ctx.globalCompositeOperation = "source-over";
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
    const oldCount = this.config.blobCount;
    this.config = { ...this.config, ...config } as LavaLampConfig;

    if (config.blobCount && config.blobCount !== oldCount) {
      this.initBlobs();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.blobs = [];
    this.currentAudioData = null;
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
        default: "classic",
        options: [
          { value: "classic", label: "Classic Red" },
          { value: "ocean", label: "Ocean Blue" },
          { value: "forest", label: "Forest Green" },
          { value: "purple", label: "Purple Dream" },
          { value: "matrix", label: "Matrix" },
        ],
      },
      blobCount: {
        type: "number",
        label: "Blob Count",
        default: 12,
        min: 5,
        max: 25,
        step: 1,
      },
      heatSpeed: {
        type: "number",
        label: "Heat Speed",
        default: 0.5,
        min: 0.1,
        max: 1.5,
        step: 0.1,
      },
      viscosity: {
        type: "number",
        label: "Viscosity",
        default: 0.98,
        min: 0.9,
        max: 0.999,
        step: 0.005,
      },
    };
  }
}

class LavaBlob {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  isHeavy: boolean;
  vy: number = 0;
  targetY: number;
  phase: number;
  phaseSpeed: number;

  constructor(x: number, y: number, radius: number, isHeavy: boolean) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.isHeavy = isHeavy;
    this.targetY = y;
    this.phase = Math.random() * Math.PI * 2;
    this.phaseSpeed = 0.02 + Math.random() * 0.02;
  }

  update(
    bass: number,
    _mid: number,
    treble: number,
    _volume: number,
    sensitivity: number,
    heatSpeed: number,
    viscosity: number,
    height: number,
    _width: number,
  ): void {
    this.phase += this.phaseSpeed;

    // Heat convection - heavy blobs sink, light blobs rise
    const heat = this.isHeavy ? -1 : 1;
    const heatForce = heat * heatSpeed * 0.3;

    // Audio influence
    const audioForce = bass * sensitivity * 0.5;
    const randomWobble = Math.sin(this.phase) * 0.5;

    // Apply forces
    this.vy += heatForce * 0.01 + audioForce * 0.02;
    this.vy += randomWobble * 0.1;

    // Viscosity damping
    this.vy *= viscosity;

    // Update position
    this.y += this.vy;

    // Wrap around
    if (this.y < -this.radius * 2) {
      this.y = height + this.radius;
      this.vy = Math.abs(this.vy) * 0.5;
    }
    if (this.y > height + this.radius * 2) {
      this.y = -this.radius;
      this.vy = -Math.abs(this.vy) * 0.5;
    }

    // Radius responds to bass
    const targetRadius = this.baseRadius + bass * 20 * sensitivity;
    this.radius += (targetRadius - this.radius) * 0.1;

    // Horizontal wobble
    this.x += Math.sin(this.phase) * (0.2 + treble * sensitivity * 0.3);
  }

  draw(ctx: CanvasRenderingContext2D, colors: { primary: string; secondary: string; accent: string }): void {
    // Glow layers
    for (let i = 4; i >= 0; i--) {
      const glowRadius = this.radius * (1 + i * 0.4);
      const alpha = 0.15 - i * 0.03;

      const gradient = ctx.createRadialGradient(
        this.x, this.y, 0,
        this.x, this.y, glowRadius,
      );
      gradient.addColorStop(0, colors.primary + Math.floor(alpha * 255).toString(16).padStart(2, "0"));
      gradient.addColorStop(0.5, colors.secondary + Math.floor((alpha * 0.5) * 255).toString(16).padStart(2, "0"));
      gradient.addColorStop(1, "transparent");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, glowRadius, glowRadius * 1.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main blob body
    const bodyGradient = ctx.createRadialGradient(
      this.x - this.radius * 0.3, this.y - this.radius * 0.3, 0,
      this.x, this.y, this.radius,
    );
    bodyGradient.addColorStop(0, colors.accent);
    bodyGradient.addColorStop(0.3, colors.primary);
    bodyGradient.addColorStop(1, colors.secondary);

    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(this.x, this.y, this.radius, this.radius * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.beginPath();
    ctx.ellipse(this.x - this.radius * 0.3, this.y - this.radius * 0.4, this.radius * 0.25, this.radius * 0.35, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
}
