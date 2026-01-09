import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_STRING,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Ring {
  radius: number;
  waveformData: number[];
  alpha: number;
  color: string;
  birthTime: number;
}

interface WaveformRingsConfig extends VisualizationConfig {
  ringCount: number;
  expansionSpeed: number;
  colorScheme: string;
  lineWidth: number;
  fadeRate: number;
}

export class WaveformRingsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "waveformRings",
    name: "Waveform Rings",
    author: "Vizec",
    description: "Concentric rings showing waveform that expand on beats",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: WaveformRingsConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    ringCount: 8,
    expansionSpeed: 2,
    lineWidth: 2,
    fadeRate: 0.02,
  };
  private width = 0;
  private height = 0;
  private rings: Ring[] = [];
  private lastBeatTime = 0;
  private beatCooldown = 200; // ms between beats
  private lastBass = 0;

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

    // Initial resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    this.rings = [];
    this.lastBeatTime = 0;
    this.lastBass = 0;
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { timeDomainData, bass, volume } = audioData;
    const { ringCount, expansionSpeed, colorScheme, lineWidth, fadeRate, sensitivity } =
      this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas with transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45;
    const now = performance.now();

    // Beat detection - spawn new ring on bass hit
    const beatThreshold = 0.5 + (1 - sensitivity) * 0.3;
    const bassIncrease = bass - this.lastBass;
    this.lastBass = bass;

    if (
      bassIncrease > beatThreshold * 0.3 &&
      bass > beatThreshold &&
      now - this.lastBeatTime > this.beatCooldown
    ) {
      this.lastBeatTime = now;

      // Create new ring with current waveform data
      const waveformData: number[] = [];
      const samples = 128;
      const step = Math.floor(timeDomainData.length / samples);

      for (let i = 0; i < samples; i++) {
        const value = (timeDomainData[i * step] / 128 - 1) * sensitivity;
        waveformData.push(value);
      }

      // Alternate between primary and secondary colors
      const colorChoice = this.rings.length % 2 === 0 ? colors.primary : colors.secondary;

      this.rings.push({
        radius: 20,
        waveformData,
        alpha: 0.8,
        color: colorChoice,
        birthTime: now,
      });
    }

    // Limit ring count
    while (this.rings.length > ringCount) {
      this.rings.shift();
    }

    // Update and draw rings
    const ringsToRemove: number[] = [];

    for (let i = 0; i < this.rings.length; i++) {
      const ring = this.rings[i];

      // Expand ring
      ring.radius += expansionSpeed * (1 + volume * 2 * sensitivity);

      // Fade ring
      ring.alpha -= fadeRate;

      // Mark for removal if too faded or too large
      if (ring.alpha <= 0 || ring.radius > maxRadius) {
        ringsToRemove.push(i);
        continue;
      }

      // Draw the ring as a waveform circle
      this.drawWaveformRing(ring, centerX, centerY, lineWidth, colors.glow);
    }

    // Remove dead rings (in reverse order to maintain indices)
    for (let i = ringsToRemove.length - 1; i >= 0; i--) {
      this.rings.splice(ringsToRemove[i], 1);
    }

    // Draw center glow based on bass
    if (bass > 0.3) {
      const glowRadius = 30 + bass * 50 * sensitivity;
      const gradient = this.ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        glowRadius,
      );
      gradient.addColorStop(0, this.hexToRgba(colors.glow, 0.3 * bass));
      gradient.addColorStop(1, this.hexToRgba(colors.glow, 0));

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawWaveformRing(
    ring: Ring,
    centerX: number,
    centerY: number,
    lineWidth: number,
    glowColor: string,
  ): void {
    if (!this.ctx) return;

    const { waveformData, radius, alpha, color } = ring;
    const points = waveformData.length;

    // Set up drawing style
    this.ctx.strokeStyle = this.hexToRgba(color, alpha * 0.7);
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // Add glow effect
    if (alpha > 0.3) {
      this.ctx.shadowBlur = 15 * alpha;
      this.ctx.shadowColor = glowColor;
    }

    // Draw waveform as circular path
    this.ctx.beginPath();

    for (let i = 0; i <= points; i++) {
      const index = i % points;
      const angle = (index / points) * Math.PI * 2 - Math.PI / 2;

      // Waveform deviation from perfect circle
      const waveValue = waveformData[index];
      const deviation = waveValue * 40; // Scale deviation
      const r = radius + deviation;

      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.closePath();
    this.ctx.stroke();

    // Reset shadow
    this.ctx.shadowBlur = 0;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(255, 255, 255, ${alpha})`;

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

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
    this.config = { ...this.config, ...config } as WaveformRingsConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.rings = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      ringCount: {
        type: "number",
        label: "Max Rings",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      expansionSpeed: {
        type: "number",
        label: "Expansion Speed",
        default: 2,
        min: 0.5,
        max: 5,
        step: 0.5,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      lineWidth: {
        type: "number",
        label: "Line Width",
        default: 2,
        min: 1,
        max: 5,
        step: 0.5,
      },
      fadeRate: {
        type: "number",
        label: "Fade Rate",
        default: 0.02,
        min: 0.005,
        max: 0.05,
        step: 0.005,
      },
    };
  }
}
