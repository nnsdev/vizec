import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Pane {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  hueOffset: number;
  freqBand: number; // 0=bass, 1=mid, 2=treble
}

interface StainedGlassConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  ringCount: number;
  paneOpacity: number;
  leadThickness: number;
  glowIntensity: number;
}

export class StainedGlassVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "stainedGlass",
    name: "Stained Glass",
    author: "Vizec",
    description: "Cathedral rose window with translucent glass panes that glow with audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: StainedGlassConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    ringCount: 5,
    paneOpacity: 0.4,
    leadThickness: 2,
    glowIntensity: 1.0,
  };

  private panes: Pane[] = [];
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

    this.buildGeometry();
  }

  private buildGeometry(): void {
    const { ringCount } = this.config;
    this.panes = [];

    // Central rosette is ring 0 with fewer, wider panes
    // Outer rings have more subdivisions for classic rose window look
    for (let ring = 0; ring < ringCount; ring++) {
      // More divisions in outer rings: 6, 12, 12, 24, 24...
      const divisions = ring === 0 ? 6 : ring <= 2 ? 12 : 24;
      const innerR = ring / ringCount;
      const outerR = (ring + 1) / ringCount;

      for (let d = 0; d < divisions; d++) {
        const startAngle = (d / divisions) * Math.PI * 2;
        const endAngle = ((d + 1) / divisions) * Math.PI * 2;

        this.panes.push({
          innerRadius: innerR,
          outerRadius: outerR,
          startAngle,
          endAngle,
          hueOffset: (ring * 60 + d * 30) % 360,
          freqBand: ring % 3, // cycle bass/mid/treble across rings
        });
      }
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const n = parseInt(hex.replace("#", ""), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  private lerpColor(
    c1: { r: number; g: number; b: number },
    c2: { r: number; g: number; b: number },
    t: number,
  ): { r: number; g: number; b: number } {
    return {
      r: Math.round(c1.r + (c2.r - c1.r) * t),
      g: Math.round(c1.g + (c2.g - c1.g) * t),
      b: Math.round(c1.b + (c2.b - c1.b) * t),
    };
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, frequencyData, volume } = audioData;
    const { sensitivity, colorScheme, paneOpacity, leadThickness, glowIntensity } = this.config;

    this.time += deltaTime * 0.001;

    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.42;

    const scheme = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);
    const startRgb = this.hexToRgb(scheme.start);
    const endRgb = this.hexToRgb(scheme.end);
    const glowRgb = this.hexToRgb(scheme.glow);

    const bands = [bass, mid, treble];

    // Draw each pane
    for (const pane of this.panes) {
      const bandValue = bands[pane.freqBand] * sensitivity;
      const freqIdx = Math.floor(
        ((pane.startAngle / (Math.PI * 2)) * frequencyData.length) / 2,
      );
      const freqVal = (frequencyData[freqIdx] ?? 128) / 255;

      // Color shifts with audio: lerp between start and end based on band energy + slow time drift
      const colorT = Math.sin(this.time * 0.3 + pane.hueOffset * 0.01) * 0.5 + 0.5;
      const shiftedT = Math.min(1, Math.max(0, colorT + (bandValue - 0.5) * 0.4));
      const paneColor = this.lerpColor(startRgb, endRgb, shiftedT);

      // Alpha varies with audio but stays in 0.3-0.5 range
      const alpha = Math.min(
        0.5,
        Math.max(0.3, paneOpacity + freqVal * sensitivity * 0.1),
      );

      const iR = pane.innerRadius * maxRadius;
      const oR = pane.outerRadius * maxRadius;

      // Draw filled pane
      this.ctx.save();
      this.ctx.translate(centerX, centerY);

      this.ctx.beginPath();
      this.ctx.arc(0, 0, oR, pane.startAngle, pane.endAngle);
      this.ctx.arc(0, 0, iR, pane.endAngle, pane.startAngle, true);
      this.ctx.closePath();

      this.ctx.fillStyle = `rgba(${paneColor.r},${paneColor.g},${paneColor.b},${alpha})`;

      // Glow effect when audio energy is high
      if (bandValue > 0.3) {
        this.ctx.shadowBlur = (bandValue - 0.3) * 20 * glowIntensity;
        this.ctx.shadowColor = `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${bandValue * 0.6})`;
      }

      this.ctx.fill();
      this.ctx.shadowBlur = 0;
      this.ctx.restore();
    }

    // Draw lead borders (dark lines between panes) - these vibrate with bass
    const bassVibrate = bass * sensitivity * 2;

    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.strokeStyle = `rgba(20,20,30,${0.6 + volume * 0.2})`;

    const ringCount = this.config.ringCount;

    // Radial lead lines
    const allDivisions = new Set<number>();
    for (const pane of this.panes) {
      allDivisions.add(pane.startAngle);
    }

    for (const angle of allDivisions) {
      // Vibrate: offset the angle slightly with bass
      const vibrateOffset = Math.sin(this.time * 30 + angle * 5) * bassVibrate * 0.003;
      const a = angle + vibrateOffset;

      this.ctx.lineWidth = leadThickness + bassVibrate * 0.3;
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(Math.cos(a) * maxRadius, Math.sin(a) * maxRadius);
      this.ctx.stroke();
    }

    // Concentric ring borders
    for (let ring = 0; ring <= ringCount; ring++) {
      const r = (ring / ringCount) * maxRadius;
      const vibrateR = r + Math.sin(this.time * 25 + ring * 2) * bassVibrate * 0.5;

      this.ctx.lineWidth = leadThickness + bassVibrate * 0.2;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, Math.max(0, vibrateR), 0, Math.PI * 2);
      this.ctx.stroke();
    }

    this.ctx.restore();

    // Central rosette ornament - glowing circle at the heart
    const rosetteSize = maxRadius * 0.08 + bass * sensitivity * maxRadius * 0.04;
    const rosetteGrad = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      rosetteSize,
    );
    rosetteGrad.addColorStop(
      0,
      `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${0.5 + volume * 0.3})`,
    );
    rosetteGrad.addColorStop(1, "rgba(0,0,0,0)");

    this.ctx.fillStyle = rosetteGrad;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, rosetteSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Outer decorative ring - subtle glow at the boundary
    const outerGlowWidth = maxRadius * 0.03;
    const outerGrad = this.ctx.createRadialGradient(
      centerX,
      centerY,
      maxRadius - outerGlowWidth,
      centerX,
      centerY,
      maxRadius + outerGlowWidth,
    );
    outerGrad.addColorStop(0, "rgba(0,0,0,0)");
    outerGrad.addColorStop(
      0.5,
      `rgba(${glowRgb.r},${glowRgb.g},${glowRgb.b},${0.15 + treble * sensitivity * 0.15})`,
    );
    outerGrad.addColorStop(1, "rgba(0,0,0,0)");

    this.ctx.fillStyle = outerGrad;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, maxRadius + outerGlowWidth, 0, Math.PI * 2);
    this.ctx.fill();
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
    const oldRingCount = this.config.ringCount;
    this.config = { ...this.config, ...config } as StainedGlassConfig;

    if (config.ringCount && config.ringCount !== oldRingCount) {
      this.buildGeometry();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.panes = [];
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
      ringCount: {
        type: "number",
        min: 3,
        max: 8,
        step: 1,
        default: 5,
        label: "Ring Count",
      },
      paneOpacity: {
        type: "number",
        min: 0.2,
        max: 0.5,
        step: 0.05,
        default: 0.4,
        label: "Pane Opacity",
      },
      leadThickness: {
        type: "number",
        min: 1,
        max: 5,
        step: 0.5,
        default: 2,
        label: "Lead Thickness",
      },
      glowIntensity: {
        type: "number",
        min: 0,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Glow Intensity",
      },
    };
  }
}
