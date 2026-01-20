import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface VHSTrackingConfig extends VisualizationConfig {
  glitchIntensity: number;
  scanlineOpacity: number;
  colorBleed: number;
}

interface TrackingLine {
  y: number;
  height: number;
  speed: number;
  offset: number;
  colorShift: number;
}

export class VHSTrackingVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "vhsTracking",
    name: "VHS Tracking",
    author: "Vizec",
    description: "Retro VHS tracking errors and scan lines",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: VHSTrackingConfig = {
    sensitivity: 1.0,
    glitchIntensity: 1.0,
    scanlineOpacity: 0.5,
    colorBleed: 1.0,
  };

  private width = 0;
  private height = 0;
  private trackingLines: TrackingLine[] = [];
  private time = 0;
  private noiseBuffer: ImageData | null = null;

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

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, treble, volume } = audioData;
    const { sensitivity, glitchIntensity, scanlineOpacity, colorBleed } = this.config;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Spawn tracking errors on bass
    if (bass > 0.6 && Math.random() < bass * sensitivity * 0.5) {
      this.spawnTrackingLine();
    }

    // Update and draw tracking lines
    for (let i = this.trackingLines.length - 1; i >= 0; i--) {
      const line = this.trackingLines[i];
      line.y += line.speed * deltaTime * 60;
      line.offset = Math.sin(this.time * 10 + line.y * 0.1) * 20 * glitchIntensity;

      if (line.y > this.height) {
        this.trackingLines.splice(i, 1);
        continue;
      }

      // Main tracking distortion band
      const gradient = this.ctx.createLinearGradient(0, line.y, 0, line.y + line.height);
      gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
      gradient.addColorStop(0.3, `rgba(255, 255, 255, ${0.3 * glitchIntensity})`);
      gradient.addColorStop(0.5, `rgba(200, 200, 200, ${0.5 * glitchIntensity})`);
      gradient.addColorStop(0.7, `rgba(255, 255, 255, ${0.3 * glitchIntensity})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(line.offset, line.y, this.width, line.height);

      // RGB split / color bleed
      if (colorBleed > 0) {
        this.ctx.globalCompositeOperation = "screen";

        // Red channel offset
        this.ctx.fillStyle = `rgba(255, 0, 0, ${0.15 * colorBleed * glitchIntensity})`;
        this.ctx.fillRect(line.offset - 5 * colorBleed, line.y, this.width, line.height);

        // Cyan channel offset
        this.ctx.fillStyle = `rgba(0, 255, 255, ${0.15 * colorBleed * glitchIntensity})`;
        this.ctx.fillRect(line.offset + 5 * colorBleed, line.y, this.width, line.height);

        this.ctx.globalCompositeOperation = "source-over";
      }
    }

    // Scanlines
    if (scanlineOpacity > 0) {
      this.ctx.fillStyle = `rgba(0, 0, 0, ${scanlineOpacity * 0.3})`;
      for (let y = 0; y < this.height; y += 4) {
        this.ctx.fillRect(0, y, this.width, 2);
      }
    }

    // Random noise bursts on treble
    if (treble > 0.5 && Math.random() < treble * sensitivity * 0.3) {
      this.drawNoiseBurst(treble * glitchIntensity);
    }

    // Horizontal jitter on high volume
    if (volume > 0.7) {
      const jitterAmount = (volume - 0.7) * 30 * sensitivity;
      this.ctx.save();
      this.ctx.translate(Math.sin(this.time * 50) * jitterAmount, 0);
    }

    // Head switching noise at bottom
    const headSwitchHeight = 30 + bass * 20;
    const headSwitchY = this.height - headSwitchHeight;
    const headGrad = this.ctx.createLinearGradient(0, headSwitchY, 0, this.height);
    headGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    headGrad.addColorStop(0.3, `rgba(50, 50, 50, ${0.3 * glitchIntensity})`);
    headGrad.addColorStop(1, `rgba(30, 30, 30, ${0.5 * glitchIntensity})`);
    this.ctx.fillStyle = headGrad;
    this.ctx.fillRect(0, headSwitchY, this.width, headSwitchHeight);

    // Flickering static lines in head switch area
    for (let i = 0; i < 10; i++) {
      const lineY = headSwitchY + Math.random() * headSwitchHeight;
      const lineWidth = Math.random() * 100 + 50;
      const lineX = Math.random() * this.width;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.3 * glitchIntensity})`;
      this.ctx.fillRect(lineX, lineY, lineWidth, 1);
    }

    if (volume > 0.7) {
      this.ctx.restore();
    }

    // Occasional full-screen color flash on big hits
    if (bass > 0.85 && Math.random() < 0.1) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * glitchIntensity})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private spawnTrackingLine(): void {
    this.trackingLines.push({
      y: -50,
      height: 20 + Math.random() * 40,
      speed: 3 + Math.random() * 5,
      offset: 0,
      colorShift: Math.random() * 10 - 5,
    });
  }

  private drawNoiseBurst(intensity: number): void {
    if (!this.ctx) return;

    const burstHeight = 10 + Math.random() * 50;
    const burstY = Math.random() * (this.height - burstHeight);

    for (let y = burstY; y < burstY + burstHeight; y += 2) {
      for (let x = 0; x < this.width; x += 4) {
        if (Math.random() < 0.3) {
          const bright = Math.random() * 255;
          this.ctx.fillStyle = `rgba(${bright}, ${bright}, ${bright}, ${intensity * 0.5})`;
          this.ctx.fillRect(x, y, 4, 2);
        }
      }
    }
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
    this.config = { ...this.config, ...config } as VHSTrackingConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.trackingLines = [];
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
      glitchIntensity: {
        type: "number",
        label: "Glitch Intensity",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      scanlineOpacity: {
        type: "number",
        label: "Scanline Opacity",
        default: 0.5,
        min: 0,
        max: 1.0,
        step: 0.1,
      },
      colorBleed: {
        type: "number",
        label: "Color Bleed",
        default: 1.0,
        min: 0,
        max: 3.0,
        step: 0.1,
      },
    };
  }
}
