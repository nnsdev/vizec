import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface PendulumWaveConfig extends VisualizationConfig {
  pendulumCount: number;
  trailLength: number;
  bobSize: number;
  glowIntensity: number;
}

interface Pendulum {
  angle: number;
  angularVelocity: number;
  length: number;
  period: number;
  trail: Array<{ x: number; y: number }>;
}

export class PendulumWaveVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "pendulumWave",
    name: "Pendulum Wave",
    author: "Vizec",
    description: "Mesmerizing pendulum wave with phase patterns driven by audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PendulumWaveConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    pendulumCount: 18,
    trailLength: 20,
    bobSize: 8,
    glowIntensity: 1.0,
  };
  private width = 0;
  private height = 0;
  private pendulums: Pendulum[] = [];
  private time = 0;
  private smoothedBass = 0;
  private smoothedVolume = 0;
  private lastKickTime = 0;
  private kickEnergy = 0;

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

  private initPendulums(): void {
    const count = this.config.pendulumCount;
    this.pendulums = [];

    // Each pendulum has a slightly different period so they go in/out of phase.
    // The longest pendulum completes N oscillations in a cycle period,
    // and the shortest completes N + count - 1 oscillations.
    const basePeriod = 4.0; // seconds for the longest pendulum
    const cycleOscillations = 20; // oscillations for longest in one full cycle

    for (let i = 0; i < count; i++) {
      const oscillations = cycleOscillations + i;
      const period = (basePeriod * cycleOscillations) / oscillations;

      this.pendulums.push({
        angle: 0,
        angularVelocity: 0,
        length: 0, // set in resize
        period,
        trail: [],
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas || this.pendulums.length === 0) return;

    const { bass, volume, mid } = audioData;
    const { sensitivity, colorScheme, trailLength, bobSize, glowIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);
    const dtRaw = deltaTime * 0.001; // ms → seconds
    const dt = !isFinite(dtRaw) || dtRaw <= 0 ? 0.016 : Math.min(dtRaw, 0.1);

    this.time += dt;

    // Smooth audio values
    this.smoothedBass += (bass * sensitivity - this.smoothedBass) * 0.15;
    this.smoothedVolume += (volume * sensitivity - this.smoothedVolume) * 0.1;

    // Detect bass kicks
    if (bass * sensitivity > 0.6 && this.time - this.lastKickTime > 0.2) {
      this.kickEnergy = Math.min(1.0, bass * sensitivity);
      this.lastKickTime = this.time;
    }
    this.kickEnergy *= 0.95;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Pivot point at top center
    const pivotY = this.height * 0.08;
    const count = this.pendulums.length;
    const totalSpread = this.width * 0.7;
    const spacing = totalSpread / (count - 1);
    const startX = (this.width - totalSpread) / 2;

    // Base amplitude driven by audio; kick energy adds a burst
    const baseAmplitude = 0.3 + this.smoothedVolume * 0.5 + this.kickEnergy * 0.4;

    // Update and draw each pendulum
    for (let i = 0; i < count; i++) {
      const p = this.pendulums[i];
      const pivotX = startX + i * spacing;

      // Simple harmonic motion: angle = A * sin(2*pi*t / period + phase_offset)
      // Audio modulates amplitude; kick adds an impulse to angular velocity
      const omega = (2 * Math.PI) / p.period;
      const targetAngle = baseAmplitude * Math.sin(omega * this.time);

      // Blend toward target with some springiness
      const springForce = (targetAngle - p.angle) * 8.0;
      const damping = -p.angularVelocity * 2.0;
      p.angularVelocity += (springForce + damping) * dt;

      // Kick impulse
      if (this.kickEnergy > 0.1) {
        p.angularVelocity += this.kickEnergy * 0.3 * Math.sin(omega * this.time) * dt;
      }

      p.angle += p.angularVelocity * dt;

      // String length varies per pendulum (shorter = faster)
      const maxStringLen = this.height * 0.65;
      const minStringLen = this.height * 0.35;
      const lenFraction = i / (count - 1);
      p.length = maxStringLen - lenFraction * (maxStringLen - minStringLen);

      // Bob position
      const bobX = pivotX + Math.sin(p.angle) * p.length;
      const bobY = pivotY + Math.cos(p.angle) * p.length;

      // Update trail
      p.trail.push({ x: bobX, y: bobY });
      if (p.trail.length > trailLength) {
        p.trail.shift();
      }

      // Color interpolation per pendulum
      const t = i / (count - 1);
      const r1 = parseInt(colors.start.slice(1, 3), 16);
      const g1 = parseInt(colors.start.slice(3, 5), 16);
      const b1 = parseInt(colors.start.slice(5, 7), 16);
      const r2 = parseInt(colors.end.slice(1, 3), 16);
      const g2 = parseInt(colors.end.slice(3, 5), 16);
      const b2 = parseInt(colors.end.slice(5, 7), 16);
      const cr = Math.round(r1 + (r2 - r1) * t);
      const cg = Math.round(g1 + (g2 - g1) * t);
      const cb = Math.round(b1 + (b2 - b1) * t);

      // Draw trail
      if (p.trail.length > 1) {
        for (let j = 1; j < p.trail.length; j++) {
          const trailAlpha = (j / p.trail.length) * 0.4 * (0.5 + this.smoothedVolume * 0.5);
          this.ctx.beginPath();
          this.ctx.moveTo(p.trail[j - 1].x, p.trail[j - 1].y);
          this.ctx.lineTo(p.trail[j].x, p.trail[j].y);
          this.ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${trailAlpha})`;
          this.ctx.lineWidth = 2 + (j / p.trail.length) * 2;
          this.ctx.stroke();
        }
      }

      // Draw string
      this.ctx.beginPath();
      this.ctx.moveTo(pivotX, pivotY);
      this.ctx.lineTo(bobX, bobY);
      this.ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, 0.25)`;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      // Draw bob glow
      const glowRadius = Math.max(1, (bobSize + bobSize * this.smoothedVolume * 2) * glowIntensity);
      if (!isFinite(bobX) || !isFinite(bobY)) continue;
      const gradient = this.ctx.createRadialGradient(
        bobX, bobY, 0,
        bobX, bobY, glowRadius * 3,
      );
      gradient.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${0.5 * glowIntensity})`);
      gradient.addColorStop(0.4, `rgba(${cr}, ${cg}, ${cb}, ${0.15 * glowIntensity})`);
      gradient.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(bobX, bobY, glowRadius * 3, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw bob (solid core)
      const coreSize = bobSize * (0.8 + this.smoothedBass * 0.4);
      this.ctx.beginPath();
      this.ctx.arc(bobX, bobY, coreSize, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, 0.85)`;
      this.ctx.fill();

      // Inner bright spot
      this.ctx.beginPath();
      this.ctx.arc(bobX, bobY, coreSize * 0.4, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + this.smoothedVolume * 0.3})`;
      this.ctx.fill();
    }

    // Draw pivot bar
    const barStartX = startX - spacing * 0.5;
    const barEndX = startX + totalSpread + spacing * 0.5;
    const glowR = parseInt(colors.glow.slice(1, 3), 16);
    const glowG = parseInt(colors.glow.slice(3, 5), 16);
    const glowB = parseInt(colors.glow.slice(5, 7), 16);

    this.ctx.beginPath();
    this.ctx.moveTo(barStartX, pivotY);
    this.ctx.lineTo(barEndX, pivotY);
    this.ctx.strokeStyle = `rgba(${glowR}, ${glowG}, ${glowB}, 0.3)`;
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Draw pivot dots
    for (let i = 0; i < count; i++) {
      const pivotX = startX + i * spacing;
      this.ctx.beginPath();
      this.ctx.arc(pivotX, pivotY, 2, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${glowR}, ${glowG}, ${glowB}, 0.4)`;
      this.ctx.fill();
    }

    // Draw wave connection line through bobs (emphasizes the wave pattern)
    if (this.pendulums.length > 2) {
      this.ctx.beginPath();
      const firstBobX = startX + Math.sin(this.pendulums[0].angle) * this.pendulums[0].length;
      const firstBobY = pivotY + Math.cos(this.pendulums[0].angle) * this.pendulums[0].length;
      this.ctx.moveTo(firstBobX, firstBobY);

      for (let i = 1; i < count; i++) {
        const px = startX + i * spacing;
        const bx = px + Math.sin(this.pendulums[i].angle) * this.pendulums[i].length;
        const by = pivotY + Math.cos(this.pendulums[i].angle) * this.pendulums[i].length;
        this.ctx.lineTo(bx, by);
      }

      this.ctx.strokeStyle = `rgba(${glowR}, ${glowG}, ${glowB}, ${0.1 + mid * sensitivity * 0.15})`;
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
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
    const prev = this.config;
    const newConfig = { ...this.config, ...config } as PendulumWaveConfig;

    if (typeof newConfig.pendulumCount === "number") {
      newConfig.pendulumCount = Math.max(5, Math.min(30, newConfig.pendulumCount));
    }
    if (typeof newConfig.trailLength === "number") {
      newConfig.trailLength = Math.max(5, Math.min(60, newConfig.trailLength));
    }
    if (typeof newConfig.bobSize === "number") {
      newConfig.bobSize = Math.max(3, Math.min(15, newConfig.bobSize));
    }
    if (typeof newConfig.glowIntensity === "number") {
      newConfig.glowIntensity = Math.max(0.2, Math.min(2.0, newConfig.glowIntensity));
    }

    this.config = newConfig;

    if (prev.pendulumCount !== newConfig.pendulumCount || this.pendulums.length === 0) {
      this.initPendulums();
    }
  }

  destroy(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.pendulums = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      pendulumCount: {
        type: "number",
        label: "Pendulum Count",
        default: 18,
        min: 5,
        max: 30,
        step: 1,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 20,
        min: 5,
        max: 60,
        step: 5,
      },
      bobSize: {
        type: "number",
        label: "Bob Size",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
