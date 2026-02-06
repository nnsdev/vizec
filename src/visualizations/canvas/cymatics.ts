import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_GRADIENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface CymaticsConfig extends VisualizationConfig {
  particleCount: number;
  complexity: number;
  particleSize: number;
  drift: number;
  plateGlow: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

export class CymaticsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "cymatics",
    name: "Cymatics",
    author: "Vizec",
    description: "Chladni plate sand patterns driven by audio frequency",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: CymaticsConfig = {
    sensitivity: 1.0,
    colorScheme: "golden",
    particleCount: 2000,
    complexity: 3,
    particleSize: 1.5,
    drift: 1.0,
    plateGlow: true,
  };
  private width = 0;
  private height = 0;
  private time = 0;
  private particles: Particle[] = [];
  private currentM = 1;
  private currentN = 2;
  private targetM = 1;
  private targetN = 2;
  private smoothBass = 0;
  private smoothMid = 0;
  private smoothTreble = 0;

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
    this.resize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.initParticles();
  }

  private initParticles(): void {
    this.particles = [];
    const cx = this.width / 2;
    const cy = this.height / 2;
    const radius = Math.min(this.width, this.height) * 0.42;
    for (let i = 0; i < this.config.particleCount; i++) {
      // Distribute particles in a circular region
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      this.particles.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        size: 0.8 + Math.random() * 1.2,
        alpha: 0.5 + Math.random() * 0.5,
      });
    }
  }

  /**
   * Chladni pattern function: cos(n*pi*x)*cos(m*pi*y) - cos(m*pi*x)*cos(n*pi*y)
   * Nodal lines are where this equals zero. Particles drift toward these lines.
   */
  private chladniValue(nx: number, ny: number, m: number, n: number): number {
    return (
      Math.cos(n * Math.PI * nx) * Math.cos(m * Math.PI * ny) -
      Math.cos(m * Math.PI * nx) * Math.cos(n * Math.PI * ny)
    );
  }

  /**
   * Compute gradient of Chladni function for particle steering.
   * Particles move down the absolute-value gradient toward nodal lines.
   */
  private chladniGradient(
    nx: number,
    ny: number,
    m: number,
    n: number,
  ): { gx: number; gy: number } {
    const eps = 0.002;
    const val = Math.abs(this.chladniValue(nx, ny, m, n));
    const dx = Math.abs(this.chladniValue(nx + eps, ny, m, n)) - val;
    const dy = Math.abs(this.chladniValue(nx, ny + eps, m, n)) - val;
    return { gx: dx / eps, gy: dy / eps };
  }

  private hexToRgba(hex: string, alpha: number): string {
    const num = parseInt(hex.replace("#", ""), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;
    const dt = deltaTime * 0.001; // ms → seconds
    this.time += dt;

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const sens = this.config.sensitivity;

    // Smooth audio values
    const smoothing = Math.pow(0.15, dt);
    this.smoothBass += (bass * sens - this.smoothBass) * (1 - smoothing);
    this.smoothMid += (mid * sens - this.smoothMid) * (1 - smoothing);
    this.smoothTreble += (treble * sens - this.smoothTreble) * (1 - smoothing);

    // Derive Chladni mode numbers from frequency spectrum
    // Low frequencies = simple patterns (low m,n), high = complex
    const complexity = this.config.complexity;
    const dominantBin = this.getDominantFrequencyBin(frequencyData);
    const freqRatio = dominantBin / frequencyData.length;

    this.targetM = Math.max(1, Math.round(1 + freqRatio * complexity * 4));
    this.targetN = Math.max(1, Math.round(2 + freqRatio * complexity * 6));

    // Ensure m != n for interesting patterns
    if (this.targetM === this.targetN) {
      this.targetN = this.targetM + 1;
    }

    // Smoothly interpolate mode numbers
    const modeSmoothing = Math.pow(0.05, dt);
    this.currentM += (this.targetM - this.currentM) * (1 - modeSmoothing);
    this.currentN += (this.targetN - this.currentN) * (1 - modeSmoothing);

    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, this.config.colorScheme);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const plateRadius = Math.min(this.width, this.height) * 0.42;

    // Draw plate outline with subtle glow
    if (this.config.plateGlow) {
      const glowAlpha = 0.08 + this.smoothBass * 0.12;
      ctx.beginPath();
      ctx.arc(cx, cy, plateRadius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = this.hexToRgba(colors.glow, glowAlpha);
      ctx.lineWidth = 2 + this.smoothBass * 4;
      ctx.shadowBlur = 15 + this.smoothBass * 25;
      ctx.shadowColor = this.hexToRgba(colors.glow, glowAlpha * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Subtle plate fill
      ctx.beginPath();
      ctx.arc(cx, cy, plateRadius, 0, Math.PI * 2);
      ctx.fillStyle = this.hexToRgba(colors.glow, 0.015 + volume * sens * 0.02);
      ctx.fill();
    }

    // Draw nodal line pattern faintly for visual reference
    this.drawNodalPattern(ctx, cx, cy, plateRadius, colors.glow, volume * sens);

    // Update and render particles
    const driftStrength = this.config.drift;
    const vibration = this.smoothBass * 0.5 + volume * sens * 0.3;
    const pSize = this.config.particleSize;

    for (const p of this.particles) {
      // Normalize position to [0,1] relative to plate
      const nx = (p.x - cx + plateRadius) / (plateRadius * 2);
      const ny = (p.y - cy + plateRadius) / (plateRadius * 2);

      // Compute Chladni gradient - particles move toward nodal lines
      const grad = this.chladniGradient(nx, ny, this.currentM, this.currentN);

      // Force toward nodal lines (negative gradient of |chladni|)
      const force = driftStrength * (0.3 + vibration * 2.0);
      p.vx += -grad.gx * force * dt * 60;
      p.vy += -grad.gy * force * dt * 60;

      // Add vibration jitter proportional to bass
      p.vx += (Math.random() - 0.5) * vibration * 3.0 * dt * 60;
      p.vy += (Math.random() - 0.5) * vibration * 3.0 * dt * 60;

      // Damping
      const damping = Math.pow(0.85, deltaTime * 60);
      p.vx *= damping;
      p.vy *= damping;

      // Integrate position
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;

      // Constrain to plate circle
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > plateRadius) {
        const angle = Math.atan2(dy, dx);
        p.x = cx + Math.cos(angle) * plateRadius * 0.99;
        p.y = cy + Math.sin(angle) * plateRadius * 0.99;
        // Bounce inward
        p.vx = -dx / dist * Math.abs(p.vx) * 0.5;
        p.vy = -dy / dist * Math.abs(p.vy) * 0.5;
      }

      // Particle color based on proximity to nodal line
      const chladniVal = Math.abs(this.chladniValue(nx, ny, this.currentM, this.currentN));
      const nearNodeLine = Math.max(0, 1 - chladniVal * 3);

      // Particles on nodal lines are brighter (accumulated sand)
      const alpha = (0.3 + nearNodeLine * 0.6) * p.alpha;
      const sizeScale = (0.7 + nearNodeLine * 0.5) * pSize;

      // Color: blend between start (on nodal lines) and end (away from lines)
      const t = nearNodeLine;
      const color = t > 0.5 ? colors.start : colors.end;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * sizeScale, 0, Math.PI * 2);
      ctx.fillStyle = this.hexToRgba(color, alpha * 0.85);
      ctx.fill();
    }

    // Draw center glow on beats
    if (this.smoothBass > 0.3) {
      const beatIntensity = (this.smoothBass - 0.3) / 0.7;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, plateRadius * 0.3);
      gradient.addColorStop(0, this.hexToRgba(colors.glow, beatIntensity * 0.08));
      gradient.addColorStop(1, this.hexToRgba(colors.glow, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, plateRadius * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private getDominantFrequencyBin(frequencyData: Uint8Array): number {
    let maxVal = 0;
    let maxIdx = 0;
    // Scan meaningful range (skip DC and very high)
    const start = Math.floor(frequencyData.length * 0.02);
    const end = Math.floor(frequencyData.length * 0.6);
    for (let i = start; i < end; i++) {
      if (frequencyData[i] > maxVal) {
        maxVal = frequencyData[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  private drawNodalPattern(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    radius: number,
    color: string,
    intensity: number,
  ): void {
    // Draw faint Chladni nodal lines by sampling the pattern
    const step = 8;
    const alpha = 0.04 + intensity * 0.06;
    const m = this.currentM;
    const n = this.currentN;

    ctx.fillStyle = this.hexToRgba(color, alpha);

    for (let px = cx - radius; px < cx + radius; px += step) {
      for (let py = cy - radius; py < cy + radius; py += step) {
        // Check if within plate
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy > radius * radius) continue;

        const nx = (px - cx + radius) / (radius * 2);
        const ny = (py - cy + radius) / (radius * 2);

        const val = Math.abs(this.chladniValue(nx, ny, m, n));

        // Draw points near nodal lines (where val is close to 0)
        if (val < 0.15) {
          const lineAlpha = (1 - val / 0.15) * alpha;
          ctx.globalAlpha = lineAlpha;
          ctx.fillRect(px - step / 2, py - step / 2, step, step);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    const oldCx = this.width / 2;
    const oldCy = this.height / 2;
    const oldRadius = Math.min(this.width, this.height) * 0.42;

    this.width = width;
    this.height = height;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Remap particles to new plate area
    if (oldRadius > 0) {
      const newCx = width / 2;
      const newCy = height / 2;
      const newRadius = Math.min(width, height) * 0.42;
      for (const p of this.particles) {
        const relX = (p.x - oldCx) / oldRadius;
        const relY = (p.y - oldCy) / oldRadius;
        p.x = newCx + relX * newRadius;
        p.y = newCy + relY * newRadius;
      }
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.particleCount;
    this.config = { ...this.config, ...config } as CymaticsConfig;
    if (this.config.particleCount !== oldCount && this.width > 0) {
      this.initParticles();
    }
  }

  destroy(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
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
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 2000,
        min: 500,
        max: 5000,
        step: 250,
      },
      complexity: {
        type: "number",
        label: "Pattern Complexity",
        default: 3,
        min: 1,
        max: 8,
        step: 1,
      },
      particleSize: {
        type: "number",
        label: "Particle Size",
        default: 1.5,
        min: 0.5,
        max: 4.0,
        step: 0.5,
      },
      drift: {
        type: "number",
        label: "Drift Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      plateGlow: {
        type: "boolean",
        label: "Plate Glow",
        default: true,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "golden",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
    };
  }
}
