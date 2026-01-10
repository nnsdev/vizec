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

interface LaserScannerConfig extends VisualizationConfig {
  beamCount: number;
  scanSpeed: number;
  glow: boolean;
}

interface Beam {
  y: number;
  direction: number;
  phase: number;
  speed: number;
}

export class LaserScannerVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "laserScanner",
    name: "Laser Scanner",
    author: "Vizec",
    description: "Horizontal scanning lines that sweep up/down with glow effect",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: LaserScannerConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    beamCount: 5,
    scanSpeed: 1.0,
    glow: true,
  };
  private width = 0;
  private height = 0;
  private beams: Beam[] = [];
  private smoothedBass = 0;

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

    // Initialize beams
    this.initializeBeams();
  }

  private initializeBeams(): void {
    this.beams = [];
    for (let i = 0; i < this.config.beamCount; i++) {
      this.beams.push({
        y: Math.random() * this.height,
        direction: Math.random() > 0.5 ? 1 : -1,
        phase: (i / this.config.beamCount) * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.5,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass } = audioData;
    const { beamCount, scanSpeed, glow, sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Smooth bass for reactive effects
    this.smoothedBass = this.smoothedBass * 0.85 + bass * 0.15;

    // Set transparency
    this.ctx.globalAlpha = 0.8;

    // Update and draw beams
    for (let i = 0; i < this.beams.length; i++) {
      const beam = this.beams[i];

      // Update beam position
      const moveSpeed = scanSpeed * beam.speed * deltaTime * 200 * (1 + this.smoothedBass * 0.5);
      beam.y += beam.direction * moveSpeed;

      // Bounce at edges
      if (beam.y < 0) {
        beam.y = 0;
        beam.direction = 1;
      } else if (beam.y > this.height) {
        beam.y = this.height;
        beam.direction = -1;
      }

      // Calculate beam properties based on audio
      const beamIndex = i / beamCount;
      const freqIndex = Math.floor(beamIndex * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIndex] / 255;

      const brightness = 0.4 + freqValue * 0.6 * sensitivity;
      const thickness = 2 + this.smoothedBass * 8 * sensitivity;

      // Create gradient for beam
      const gradient = this.ctx.createLinearGradient(0, beam.y, this.width, beam.y);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.1, colors.start);
      gradient.addColorStop(0.5, colors.end);
      gradient.addColorStop(0.9, colors.start);
      gradient.addColorStop(1, "transparent");

      // Draw glow effect
      if (glow) {
        const glowLayers = 3;
        for (let g = glowLayers; g >= 1; g--) {
          const glowThickness = thickness + g * 6;
          const glowAlpha = (brightness * 0.15) / g;

          this.ctx.beginPath();
          this.ctx.strokeStyle = colors.glow;
          this.ctx.lineWidth = glowThickness;
          this.ctx.globalAlpha = glowAlpha;
          this.ctx.moveTo(0, beam.y);
          this.ctx.lineTo(this.width, beam.y);
          this.ctx.stroke();
        }
      }

      // Draw main beam
      this.ctx.beginPath();
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = thickness;
      this.ctx.globalAlpha = brightness * 0.8;
      this.ctx.moveTo(0, beam.y);
      this.ctx.lineTo(this.width, beam.y);
      this.ctx.stroke();

      // Draw bright center line
      this.ctx.beginPath();
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1;
      this.ctx.globalAlpha = brightness * 0.5;
      this.ctx.moveTo(this.width * 0.1, beam.y);
      this.ctx.lineTo(this.width * 0.9, beam.y);
      this.ctx.stroke();
    }

    // Add horizontal frequency bars along the scanning lines
    this.ctx.globalAlpha = 0.3;
    const barCount = 64;
    const barWidth = this.width / barCount;

    for (let i = 0; i < barCount; i++) {
      const freqIndex = Math.floor((i / barCount) * frequencyData.length * 0.75);
      const value = frequencyData[freqIndex] / 255;
      const barHeight = value * 20 * sensitivity;

      // Draw small frequency indicators at top and bottom
      this.ctx.fillStyle = colors.glow;
      this.ctx.fillRect(i * barWidth, 0, barWidth - 1, barHeight);
      this.ctx.fillRect(i * barWidth, this.height - barHeight, barWidth - 1, barHeight);
    }

    // Reset alpha
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Rescale beam positions
    for (const beam of this.beams) {
      beam.y = Math.min(beam.y, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldBeamCount = this.config.beamCount;
    this.config = { ...this.config, ...config } as LaserScannerConfig;

    // Reinitialize beams if count changed
    if (this.config.beamCount !== oldBeamCount) {
      this.initializeBeams();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.beams = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      beamCount: {
        type: "number",
        label: "Beam Count",
        default: 5,
        min: 1,
        max: 15,
        step: 1,
      },
      scanSpeed: {
        type: "number",
        label: "Scan Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      glow: {
        type: "boolean",
        label: "Glow Effect",
        default: true,
      },
    };
  }
}
