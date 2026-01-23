import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface Ring {
  radius: number;
  opacity: number;
  color: string;
  lineWidth: number;
  speed: number;
}

interface BeatPulseRingsConfig extends VisualizationConfig {
  maxRings: number;
  ringSpeed: number;
  beatThreshold: number;
  lineWidth: number;
}

export class BeatPulseRingsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "beatPulseRings",
    name: "Beat Pulse Rings",
    author: "Vizec",
    description: "Concentric rings that pulse outward on beats",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: BeatPulseRingsConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    maxRings: 15,
    ringSpeed: 4,
    beatThreshold: 0.05,
    lineWidth: 3,
  };

  private rings: Ring[] = [];
  private smoothedBass = 0;
  private smoothedVolume = 0;
  private beatCooldown = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");
    
    // Apply initial config with clamping
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, volume } = audioData;
    const { sensitivity, colorScheme, maxRings, ringSpeed, beatThreshold, lineWidth } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.max(this.width, this.height) * 0.8;

    const bassLevel = Math.min(1, bass * sensitivity);
    const volumeLevel = Math.min(1, volume * sensitivity);
    this.smoothedBass += (bassLevel - this.smoothedBass) * 0.2;
    this.smoothedVolume += (volumeLevel - this.smoothedVolume) * 0.15;

    const frameScale = deltaTime / 16.67;
    this.beatCooldown = Math.max(0, this.beatCooldown - deltaTime);

    const beatReady =
      bassLevel > beatThreshold && this.beatCooldown <= 0 && this.rings.length < maxRings;

    if (beatReady) {
      const colorChoice = Math.random();
      let ringColor: string;
      if (colorChoice < 0.5) {
        ringColor = colors.primary;
      } else if (colorChoice < 0.85) {
        ringColor = colors.secondary;
      } else {
        ringColor = colors.accent;
      }

      const centerRadius = 18 + this.smoothedVolume * 50;
      this.rings.push({
        radius: centerRadius,
        opacity: 0.85,
        color: ringColor,
        lineWidth: lineWidth + bassLevel * 4,
        speed: ringSpeed * (0.4 + bassLevel * 0.8),
      });

      this.beatCooldown = 200;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];

      // Expand ring (Preserve modulation)
      ring.radius += ring.speed * (4 + volumeLevel * 8) * frameScale;

      // Fade out as it expands
      ring.opacity -= 0.015 * frameScale;
      ring.lineWidth *= 0.99; // Gradually thin out

      // Remove if faded or too large
      if (ring.opacity <= 0 || ring.radius > maxRadius) {
        this.rings.splice(i, 1);
        continue;
      }

      // Draw ring
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = ring.color;
      this.ctx.lineWidth = ring.lineWidth;
      this.ctx.globalAlpha = Math.max(0, ring.opacity);

      // Add glow effect
      this.ctx.shadowBlur = 12;
      this.ctx.shadowColor = ring.color;

      this.ctx.stroke();
    }

    // Draw center ring
    const centerRadius = 18 + this.smoothedVolume * 50;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
    this.ctx.strokeStyle = colors.primary;
    this.ctx.lineWidth = lineWidth + this.smoothedVolume * 2.5;
    this.ctx.globalAlpha = 0.5 + this.smoothedVolume * 0.4;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = colors.primary;
    this.ctx.stroke();

    // Draw center glow
    const centerSize = 6 + this.smoothedBass * 20 + this.smoothedVolume * 12;
    const gradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      centerSize,
    );
    gradient.addColorStop(0, colors.accent);
    gradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.3 + this.smoothedVolume * 0.6;
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, centerSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Reset
    this.ctx.shadowBlur = 0;
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
    const schema = this.getConfigSchema();
    const nextConfig = { ...this.config, ...config } as BeatPulseRingsConfig;

    const clampNumber = (value: number, field: { min?: number; max?: number }): number => {
      const min = field.min ?? value;
      const max = field.max ?? value;
      return Math.max(min, Math.min(max, value));
    };

    nextConfig.sensitivity = clampNumber(nextConfig.sensitivity, schema.sensitivity);
    nextConfig.maxRings = clampNumber(nextConfig.maxRings, schema.maxRings);
    nextConfig.ringSpeed = clampNumber(nextConfig.ringSpeed, schema.ringSpeed);
    nextConfig.beatThreshold = clampNumber(nextConfig.beatThreshold, schema.beatThreshold);
    nextConfig.lineWidth = clampNumber(nextConfig.lineWidth, schema.lineWidth);

    this.config = nextConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.rings = [];
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
      maxRings: { type: "number", min: 5, max: 30, step: 1, default: 15, label: "Max Rings" },
      ringSpeed: { type: "number", min: 1, max: 10, step: 0.5, default: 4, label: "Ring Speed" },
      beatThreshold: {
        type: "number",
        label: "Beat Threshold",
        default: 0.05,
        min: 0.02,
        max: 0.4,
        step: 0.01,
      },
      lineWidth: {
        type: "number",
        label: "Line Width",
        default: 3,
        min: 1,
        max: 10,
        step: 0.5,
      },
    };
  }
}
