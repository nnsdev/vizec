import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Blip {
  angle: number;
  distance: number; // 0-1 normalized radius
  life: number;
  maxLife: number;
  size: number;
  intensity: number;
}

interface RadarSweepConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  sweepSpeed: number;
  blipPersistence: number;
  ringCount: number;
  showCardinals: boolean;
}

export class RadarSweepVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "radarSweep",
    name: "Radar Sweep",
    author: "Vizec",
    description: "Classic green phosphor radar with rotating sweep, audio-reactive blips and range rings",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  private config: RadarSweepConfig = {
    sensitivity: 1.0,
    colorScheme: "toxic",
    sweepSpeed: 1.0,
    blipPersistence: 3.0,
    ringCount: 4,
    showCardinals: true,
  };

  private sweepAngle = 0;
  private blips: Blip[] = [];
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private volumeSmooth = 0;
  private prevBass = 0;
  private time = 0;

  // Trail canvas for phosphor decay effect
  private trailCanvas: HTMLCanvasElement | null = null;
  private trailCtx: CanvasRenderingContext2D | null = null;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");

    // Off-screen canvas for phosphor trail persistence
    this.trailCanvas = document.createElement("canvas");
    this.trailCtx = this.trailCanvas.getContext("2d");

    this.updateConfig(config);

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.resize(w, h);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas || !this.trailCtx || !this.trailCanvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, sweepSpeed, blipPersistence, ringCount, showCardinals } =
      this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    const dt = deltaTime * 0.001; // ms → seconds
    this.time += dt;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;
    this.volumeSmooth += (volume - this.volumeSmooth) * smoothing;

    const bassBoost = Math.pow(this.bassSmooth, 0.7) * sensitivity;
    const midBoost = Math.pow(this.midSmooth, 0.7) * sensitivity;
    const trebleBoost = Math.pow(this.trebleSmooth, 0.7) * sensitivity;
    const volumeBoost = Math.pow(this.volumeSmooth, 0.5) * sensitivity;

    // Beat detection: rising edge on bass
    const bassRise = bass - this.prevBass;
    this.prevBass = bass;
    const isBeat = bassRise > 0.15 && bass > 0.3;

    // Spawn blips on beats
    if (isBeat) {
      const blipCount = 1 + Math.floor(bassBoost * 3);
      for (let i = 0; i < blipCount; i++) {
        this.blips.push({
          angle: Math.random() * Math.PI * 2,
          distance: 0.15 + Math.random() * 0.8,
          life: blipPersistence,
          maxLife: blipPersistence,
          size: 2 + Math.random() * 4 + bassBoost * 3,
          intensity: 0.6 + Math.random() * 0.4,
        });
      }
    }

    // Treble triggers smaller scattered blips
    if (treble > 0.5 && Math.random() < trebleBoost * 0.3) {
      this.blips.push({
        angle: Math.random() * Math.PI * 2,
        distance: 0.3 + Math.random() * 0.65,
        life: blipPersistence * 0.6,
        maxLife: blipPersistence * 0.6,
        size: 1.5 + Math.random() * 2,
        intensity: 0.3 + Math.random() * 0.4,
      });
    }

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = Math.min(this.width, this.height) * 0.42;

    // Update sweep angle - volume modulates speed
    const baseSpeed = sweepSpeed * 1.5;
    this.sweepAngle += dt * baseSpeed * (0.6 + volumeBoost * 0.8);
    if (this.sweepAngle > Math.PI * 2) this.sweepAngle -= Math.PI * 2;

    // -- Fade trail canvas for phosphor decay --
    this.trailCtx.globalCompositeOperation = "destination-out";
    const fadeRate = dt * (0.4 / Math.max(blipPersistence, 0.5));
    this.trailCtx.fillStyle = `rgba(0,0,0,${fadeRate})`;
    this.trailCtx.fillRect(0, 0, this.width, this.height);
    this.trailCtx.globalCompositeOperation = "source-over";

    // Draw sweep trail wedge onto trail canvas
    this.drawSweepTrail(this.trailCtx, centerX, centerY, radius, colors.start, volumeBoost);

    // Draw blips onto trail canvas (they persist with phosphor decay)
    this.drawBlips(this.trailCtx, centerX, centerY, radius, colors, dt);

    // -- Main canvas: clear fully for transparency --
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw static elements on main canvas
    this.drawRangeRings(this.ctx, centerX, centerY, radius, colors.start, ringCount, bassBoost);

    if (showCardinals) {
      this.drawCardinals(this.ctx, centerX, centerY, radius, colors.start);
    }

    // Composite trail canvas onto main
    this.ctx.globalAlpha = 0.9;
    this.ctx.drawImage(this.trailCanvas, 0, 0);
    this.ctx.globalAlpha = 1.0;

    // Draw sweep line (bright, on top)
    this.drawSweepLine(this.ctx, centerX, centerY, radius, colors, bassBoost, midBoost);

    // Draw center dot
    this.drawCenter(this.ctx, centerX, centerY, colors.start, volumeBoost);

    // Outer ring border
    this.drawOuterRing(this.ctx, centerX, centerY, radius, colors.start, midBoost);
  }

  private drawSweepTrail(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    color: string,
    volumeBoost: number,
  ): void {
    // Draw a fading wedge behind the sweep line
    const trailAngle = 0.6 + volumeBoost * 0.3;
    const gradient = ctx.createConicGradient(this.sweepAngle - trailAngle, cx, cy);

    // Build gradient from transparent to colored along the trail
    const alpha = Math.round((0.08 + volumeBoost * 0.06) * 255)
      .toString(16)
      .padStart(2, "0");
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(0.7, color + alpha);
    gradient.addColorStop(1, color + alpha);

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, this.sweepAngle - trailAngle, this.sweepAngle);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  private drawSweepLine(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    colors: { start: string; end: string; glow: string },
    bassBoost: number,
    midBoost: number,
  ): void {
    const endX = cx + Math.cos(this.sweepAngle) * r;
    const endY = cy + Math.sin(this.sweepAngle) * r;

    // Glow line
    ctx.globalAlpha = 0.3 + midBoost * 0.2;
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = 6 + bassBoost * 4;
    ctx.shadowColor = colors.glow;
    ctx.shadowBlur = 15 + bassBoost * 10;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bright sweep line
    const gradient = ctx.createLinearGradient(cx, cy, endX, endY);
    gradient.addColorStop(0, colors.start + "ff");
    gradient.addColorStop(0.5, colors.start + "cc");
    gradient.addColorStop(1, colors.start + "66");

    ctx.globalAlpha = 0.7 + bassBoost * 0.3;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2 + bassBoost * 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
  }

  private drawRangeRings(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    maxR: number,
    color: string,
    count: number,
    bassBoost: number,
  ): void {
    for (let i = 1; i <= count; i++) {
      const ringR = (maxR / count) * i;
      // Rings pulse slightly with bass
      const pulseR = ringR * (1 + bassBoost * 0.02 * (i / count));

      ctx.globalAlpha = 0.12 + bassBoost * 0.08;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
  }

  private drawCardinals(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    color: string,
  ): void {
    const labels = ["N", "E", "S", "W"];
    const angles = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;

    // Cross-hair lines
    for (const angle of angles) {
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Cardinal labels
    ctx.fillStyle = color;
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.35;

    for (let i = 0; i < labels.length; i++) {
      const labelR = r + 16;
      const lx = cx + Math.cos(angles[i]) * labelR;
      const ly = cy + Math.sin(angles[i]) * labelR;
      ctx.fillText(labels[i], lx, ly);
    }

    // Tick marks at 30-degree intervals
    ctx.globalAlpha = 0.15;
    for (let deg = 0; deg < 360; deg += 30) {
      if (deg % 90 === 0) continue; // Skip cardinals
      const a = (deg * Math.PI) / 180;
      const innerR = r - 6;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  private drawBlips(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    colors: { start: string; end: string; glow: string },
    deltaTime: number,
  ): void {
    for (let i = this.blips.length - 1; i >= 0; i--) {
      const blip = this.blips[i];
      blip.life -= deltaTime;

      if (blip.life <= 0) {
        this.blips.splice(i, 1);
        continue;
      }

      const lifeRatio = blip.life / blip.maxLife;
      // CRT afterglow curve - bright initially then slow exponential decay
      const glow = Math.pow(lifeRatio, 0.5);

      const bx = cx + Math.cos(blip.angle) * blip.distance * r;
      const by = cy + Math.sin(blip.angle) * blip.distance * r;
      const size = blip.size * (0.7 + glow * 0.3);

      // Outer glow
      const glowR = size * 3;
      const glowGradient = ctx.createRadialGradient(bx, by, 0, bx, by, glowR);
      glowGradient.addColorStop(0, colors.glow + alphaHex(glow * blip.intensity * 0.4));
      glowGradient.addColorStop(1, "transparent");

      ctx.globalAlpha = 1.0;
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(bx, by, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Core blip
      ctx.globalAlpha = glow * blip.intensity;
      ctx.fillStyle = colors.start;
      ctx.beginPath();
      ctx.arc(bx, by, size, 0, Math.PI * 2);
      ctx.fill();

      // Bright center
      if (glow > 0.5) {
        ctx.globalAlpha = (glow - 0.5) * 2 * blip.intensity * 0.8;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(bx, by, size * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1.0;

    // Cap blip count
    if (this.blips.length > 200) {
      this.blips.splice(0, this.blips.length - 200);
    }
  }

  private drawCenter(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    color: string,
    volumeBoost: number,
  ): void {
    const size = 3 + volumeBoost * 2;

    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 4);
    gradient.addColorStop(0, color + "60");
    gradient.addColorStop(1, "transparent");

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1.0;
  }

  private drawOuterRing(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    color: string,
    midBoost: number,
  ): void {
    ctx.globalAlpha = 0.25 + midBoost * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Slight glow on outer ring
    ctx.globalAlpha = 0.08 + midBoost * 0.06;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.trailCanvas) {
      this.trailCanvas.width = width;
      this.trailCanvas.height = height;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as RadarSweepConfig;
  }

  destroy(): void {
    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.trailCanvas = null;
    this.trailCtx = null;
    this.blips = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Audio Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [...COLOR_SCHEME_OPTIONS],
        default: "toxic",
        label: "Color Scheme",
      },
      sweepSpeed: {
        type: "number",
        min: 0.2,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Sweep Speed",
      },
      blipPersistence: {
        type: "number",
        min: 0.5,
        max: 8,
        step: 0.5,
        default: 3.0,
        label: "Blip Persistence",
      },
      ringCount: {
        type: "number",
        min: 2,
        max: 8,
        step: 1,
        default: 4,
        label: "Range Rings",
      },
      showCardinals: {
        type: "boolean",
        default: true,
        label: "Cardinal Marks",
      },
    };
  }
}

/** Convert 0-1 float to 2-char hex alpha string */
function alphaHex(a: number): string {
  return Math.round(Math.min(1, Math.max(0, a)) * 255)
    .toString(16)
    .padStart(2, "0");
}
