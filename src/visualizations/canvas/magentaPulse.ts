import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

interface PulseRing {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  maxRadius: number;
  speed: number;
}

interface MagentaPulseConfig extends VisualizationConfig {
  colorScheme: string;
  pulseSpeed: number;
  burstThreshold: number;
  trailLength: number;
  glow: boolean;
}

const COLOR_SCHEMES: Record<string, { center: string; edge: string; halo: string }> = {
  magenta: { center: "#ff00ff", edge: "#ff83ff", halo: "#ff0088" },
  violet: { center: "#c15cff", edge: "#7200ff", halo: "#da7bff" },
  neon: { center: "#00f5ff", edge: "#00b5ff", halo: "#4ff0ff" },
  sunset: { center: "#ff5f6d", edge: "#ffc371", halo: "#ff9e9a" },
};

export class MagentaPulseVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "magentaPulse",
    name: "Magenta Pulse",
    author: "Vizec",
    description: "Magenta bursts keyed for overlay transparencies with graceful trails",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  readonly id = (this.constructor as any).meta.id;
  readonly name = (this.constructor as any).meta.name;
  readonly author = (this.constructor as any).meta.author;
  readonly description = (this.constructor as any).meta.description;
  readonly renderer = (this.constructor as any).meta.renderer;
  readonly transitionType = (this.constructor as any).meta.transitionType;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private pulses: PulseRing[] = [];
  private config: MagentaPulseConfig = {
    sensitivity: 1,
    colorScheme: "magenta",
    pulseSpeed: 160,
    burstThreshold: 0.25,
    trailLength: 60,
    glow: true,
  };
  private elapsedSincePulse = 0;

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
    this.resize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, volume, treble } = audioData;
    this.elapsedSincePulse += deltaTime;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.magenta;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.globalCompositeOperation = "lighter";

    const shouldPulse = (bass + treble) * 0.5 > this.config.burstThreshold;
    if (shouldPulse && this.elapsedSincePulse > 0.08) {
      this.spawnPulse(volume, treble);
      this.elapsedSincePulse = 0;
    }

    const nowPulses: PulseRing[] = [];

    for (const pulse of this.pulses) {
      pulse.radius += this.config.pulseSpeed * deltaTime;
      pulse.alpha -= 0.5 * this.config.sensitivity * deltaTime;
      if (pulse.radius >= pulse.maxRadius || pulse.alpha <= 0) {
        continue;
      }

      const gradient = this.ctx.createRadialGradient(
        pulse.x,
        pulse.y,
        pulse.radius * 0.1,
        pulse.x,
        pulse.y,
        pulse.radius,
      );
      gradient.addColorStop(0, this.applyAlpha(colors.center, pulse.alpha * 0.6));
      gradient.addColorStop(0.35, this.applyAlpha(colors.halo, pulse.alpha * 0.35));
      gradient.addColorStop(1, this.applyAlpha(colors.edge, pulse.alpha * 0.08));

      this.ctx.beginPath();
      this.ctx.fillStyle = gradient;
      this.ctx.globalAlpha = this.config.glow ? pulse.alpha : Math.max(pulse.alpha * 0.6, 0);
      this.ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      this.ctx.fill();

      nowPulses.push(pulse);
    }

    this.pulses = nowPulses;
    this.ctx.globalCompositeOperation = "source-over";
  }

  private spawnPulse(volume: number, treble: number): void {
    if (!this.canvas) return;

    const strength = Math.max(0.35, Math.min(1, volume * this.config.sensitivity));
    const maxRadius = (Math.max(this.width, this.height) / 2) * (0.5 + strength * 0.5);
    const softAngle = Math.random() * Math.PI * 2;
    const offset = (Math.sin(softAngle) * treble + 0.5) * (this.width / 3);

    this.pulses.push({
      x: this.width / 2 + offset,
      y: this.height / 2 + Math.cos(softAngle) * (this.height / 4),
      radius: 0,
      alpha: 1,
      maxRadius,
      speed: this.config.pulseSpeed,
    });

    if (this.pulses.length > this.config.trailLength) {
      this.pulses.shift();
    }
  }

  private applyAlpha(hex: string, alpha: number): string {
    const clamp = Math.max(0, Math.min(1, alpha));
    const [r, g, b] = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    return `rgba(${r}, ${g}, ${b}, ${clamp.toFixed(3)})`;
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
    this.config = { ...this.config, ...config } as MagentaPulseConfig;
    this.pulses = [];
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
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "magenta",
        options: [
          { value: "magenta", label: "Magenta" },
          { value: "violet", label: "Violet" },
          { value: "neon", label: "Neon Cyan" },
          { value: "sunset", label: "Sunset" },
        ],
      },
      pulseSpeed: {
        type: "number",
        label: "Pulse Speed",
        default: 160,
        min: 60,
        max: 320,
        step: 20,
      },
      burstThreshold: {
        type: "number",
        label: "Trigger Threshold",
        default: 0.25,
        min: 0,
        max: 0.6,
        step: 0.05,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 60,
        min: 10,
        max: 120,
        step: 5,
      },
      glow: {
        type: "boolean",
        label: "Glow Overlay",
        default: true,
      },
    };
  }
}
