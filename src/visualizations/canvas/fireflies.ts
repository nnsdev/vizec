import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface FirefliesConfig extends VisualizationConfig {
  fireflyCount: number;
  swarmSpeed: number;
  colorScheme: string;
}

interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  targetX?: number;
  targetY?: number;
}

export class FirefliesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "fireflies",
    name: "Fireflies",
    author: "Vizec",
    description: "Swarm of lights that dance to the treble",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: FirefliesConfig = {
    sensitivity: 1.0,
    fireflyCount: 50,
    swarmSpeed: 1.0,
    colorScheme: "nature",
  };
  private width = 0;
  private height = 0;
  private fireflies: Firefly[] = [];
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
  }

  private initFireflies(): void {
    this.fireflies = [];
    const { fireflyCount } = this.config;

    for (let i = 0; i < fireflyCount; i++) {
      this.fireflies.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: 2 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, swarmSpeed } = this.config;
    const { volume, treble, mid } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    const excitement = (mid + treble) * sensitivity;
    const moveSpeed = (1 + excitement * 2) * swarmSpeed;

    this.ctx.globalCompositeOperation = "lighter";

    this.fireflies.forEach((f) => {
      f.vx += (Math.random() - 0.5) * 0.1;
      f.vy += (Math.random() - 0.5) * 0.1;

      if (excitement > 0.8) {
        const dx = this.width / 2 - f.x;
        const dy = this.height / 2 - f.y;
        f.vx += dx * 0.001;
        f.vy += dy * 0.001;
      }

      f.vx *= 0.99;
      f.vy *= 0.99;
      f.x += f.vx * moveSpeed;
      f.y += f.vy * moveSpeed;

      if (f.x < 0) f.x = this.width;
      if (f.x > this.width) f.x = 0;
      if (f.y < 0) f.y = this.height;
      if (f.y > this.height) f.y = 0;

      const pulse = Math.sin(this.time * 3 + f.phase) * 0.5 + 0.5;
      const brightness = 0.2 + volume * sensitivity * 0.5 + pulse * 0.3;
      const radius = f.radius * (1 + excitement * 0.5);

      const gradient = this.ctx!.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius * 4);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(1, "rgba(0,0,0,0)");

      this.ctx!.fillStyle = gradient;
      this.ctx!.globalAlpha = brightness * 0.6;
      this.ctx!.beginPath();
      this.ctx!.arc(f.x, f.y, radius * 4, 0, Math.PI * 2);
      this.ctx!.fill();
    });

    this.fireflies.forEach((f) => {
      this.ctx!.fillStyle = colors.end;
      this.ctx!.globalAlpha = 0.8;
      this.ctx!.beginPath();
      this.ctx!.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      this.ctx!.fill();
    });

    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initFireflies();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCounts = this.config.fireflyCount;
    this.config = { ...this.config, ...config } as FirefliesConfig;

    if (this.config.fireflyCount !== oldCounts) {
      this.initFireflies();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
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
        default: "nature",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      fireflyCount: {
        type: "number",
        label: "Firefly Count",
        default: 50,
        min: 10,
        max: 200,
        step: 10,
      },
      swarmSpeed: {
        type: "number",
        label: "Swarm Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
    };
  }
}
