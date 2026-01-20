import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  ColorSchemeId,
  COLOR_SCHEMES_STRING_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Pulse {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  color: string;
  glowColor: string;
  speed: number;
}

interface MagentaKeyPulseConfig extends VisualizationConfig {
  colorScheme: string;
  pulseRate: number;
  expansionSpeed: number;
  fadeSpeed: number;
  glow: number;
  burstCount: number;
}

export class MagentaKeyPulseVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "magentaKeyPulse",
    name: "Magenta Key Pulse",
    author: "Vizec",
    description: "Color-keyed magenta bursts that expand and fade with bass hits",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private pulses: Pulse[] = [];
  private lastPulseTime = 0;
  private config: MagentaKeyPulseConfig = {
    sensitivity: 1,
    colorScheme: "synthwave",
    pulseRate: 4,
    expansionSpeed: 120,
    fadeSpeed: 0.03,
    glow: 0.8,
    burstCount: 3,
  };

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
    this.pulses = [];
    this.lastPulseTime = 0;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx) return;

    const { volume, bass } = audioData;
    const { pulseRate, burstCount, expansionSpeed, fadeSpeed, glow, colorScheme } = this.config;
    const colors = getColorScheme(
      COLOR_SCHEMES_STRING_ACCENT,
      colorScheme as ColorSchemeId,
      "synthwave",
    );

    this.ctx.clearRect(0, 0, this.width, this.height);

    const now = performance.now();
    const readiness = 1000 / (pulseRate + volume * 6);
    const bassBoost = Math.min(1, (bass + volume * 0.5) * this.config.sensitivity);

    if (now - this.lastPulseTime > readiness && bassBoost > 0.15) {
      this.lastPulseTime = now;
      const bursts = Math.ceil(burstCount * (0.5 + bassBoost * 0.5));
      for (let i = 0; i < bursts; i += 1) {
        this.spawnPulse(colors, bassBoost);
      }
    }

    this.ctx.globalCompositeOperation = "lighter";

    const deltaSeconds = deltaTime || 0.016;

    for (let i = this.pulses.length - 1; i >= 0; i -= 1) {
      const pulse = this.pulses[i];
      pulse.radius += expansionSpeed * Math.max(0.5, bassBoost) * deltaSeconds;
      pulse.alpha -= fadeSpeed * deltaSeconds;

      if (pulse.alpha <= 0 || pulse.radius > pulse.maxRadius) {
        this.pulses.splice(i, 1);
        continue;
      }

      this.drawPulse(pulse, glow);
    }

    this.ctx.globalCompositeOperation = "source-over";
  }

  private spawnPulse(
    colors: { primary: string; accent: string; glow: string },
    bassBoost: number,
  ): void {
    if (!this.ctx) return;

    const x = Math.random() * this.width;
    const y = Math.random() * this.height;
    const radius = 30 + Math.random() * 40;
    const maxRadius = Math.max(this.width, this.height) * 0.5;

    this.pulses.push({
      x,
      y,
      radius,
      maxRadius,
      alpha: 0.9,
      color: Math.random() > 0.5 ? colors.primary : colors.accent,
      glowColor: colors.glow,
      speed: 1 + bassBoost,
    });
  }

  private drawPulse(pulse: Pulse, glow: number): void {
    if (!this.ctx) return;

    const gradient = this.ctx.createRadialGradient(
      pulse.x,
      pulse.y,
      pulse.radius * 0.2,
      pulse.x,
      pulse.y,
      pulse.radius,
    );
    gradient.addColorStop(0, this.hexToRgba(pulse.color, pulse.alpha * 0.9));
    gradient.addColorStop(0.6, this.hexToRgba(pulse.color, pulse.alpha * 0.5));
    gradient.addColorStop(1, this.hexToRgba(pulse.glowColor, pulse.alpha * 0.1));

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.lineWidth = 2 + glow * 4;
    this.ctx.strokeStyle = this.hexToRgba(pulse.color, pulse.alpha * 0.7);
    this.ctx.stroke();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!match) {
      return `rgba(255, 0, 255, ${alpha})`;
    }
    const r = parseInt(match[1], 16);
    const g = parseInt(match[2], 16);
    const b = parseInt(match[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    this.config = { ...this.config, ...config } as MagentaKeyPulseConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.pulses = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      pulseRate: {
        type: "number",
        label: "Pulse Rate",
        default: 4,
        min: 1,
        max: 12,
        step: 1,
      },
      burstCount: {
        type: "number",
        label: "Bursts per Pulse",
        default: 3,
        min: 1,
        max: 6,
        step: 1,
      },
      expansionSpeed: {
        type: "number",
        label: "Expansion Speed",
        default: 120,
        min: 40,
        max: 240,
        step: 10,
      },
      fadeSpeed: {
        type: "number",
        label: "Fade Speed",
        default: 0.03,
        min: 0.01,
        max: 0.08,
        step: 0.01,
      },
      glow: {
        type: "number",
        label: "Glow Strength",
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}
