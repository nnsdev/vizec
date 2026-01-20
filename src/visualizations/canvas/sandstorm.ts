import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface SandstormConfig extends VisualizationConfig {
  particleCount: number;
  windSpeed: number;
  colorScheme: string;
}

interface SandParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  layer: number; // 0 = back, 1 = mid, 2 = front
}

export class SandstormVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "sandstorm",
    name: "Sandstorm",
    author: "Vizec",
    description: "Swirling sand particles that intensify with bass",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: SandstormConfig = {
    sensitivity: 1.0,
    particleCount: 800,
    windSpeed: 1.0,
    colorScheme: "golden",
  };
  private width = 0;
  private height = 0;
  private particles: SandParticle[] = [];
  private time = 0;
  private smoothedBass = 0;
  private smoothedTreble = 0;
  private smoothedVolume = 0;

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

  private initParticles(): void {
    this.particles = [];
    const { particleCount } = this.config;

    for (let i = 0; i < particleCount; i++) {
      this.particles.push(this.createParticle());
    }
  }

  private createParticle(startFromLeft = false): SandParticle {
    const layer = Math.floor(Math.random() * 3);
    // Layer affects size and speed - back layer is smaller and slower
    const layerScale = 0.5 + layer * 0.3;

    return {
      x: startFromLeft ? -10 : Math.random() * this.width,
      y: Math.random() * this.height,
      vx: (1 + Math.random() * 2) * layerScale,
      vy: (Math.random() - 0.5) * 0.5 * layerScale,
      size: (1 + Math.random() * 2) * layerScale,
      alpha: (0.3 + Math.random() * 0.4) * layerScale,
      phase: Math.random() * Math.PI * 2,
      layer,
    };
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, windSpeed } = this.config;
    const { volume, bass, treble, mid } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values for fluid motion
    const smoothing = 0.15;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Clear canvas (transparent background)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate wind intensity based on audio
    const bassIntensity = this.smoothedBass * sensitivity;
    const windMultiplier = (1 + bassIntensity * 3) * windSpeed;

    // Swirl factor based on mid frequencies
    const swirlIntensity = mid * sensitivity;

    // Sort particles by layer for proper depth rendering
    const sortedParticles = [...this.particles].sort((a, b) => a.layer - b.layer);

    // Update and render particles
    sortedParticles.forEach((p) => {
      // Apply wind with swirling motion
      const swirlAngle = Math.sin(this.time * 2 + p.phase + p.y * 0.01) * swirlIntensity * 0.5;
      const layerSpeed = 0.5 + p.layer * 0.3;

      p.vx += (Math.cos(swirlAngle) * 0.1 + 0.05) * windMultiplier * layerSpeed;
      p.vy += Math.sin(swirlAngle) * 0.1 * windMultiplier * layerSpeed;

      // Add bass-triggered gusts
      if (bassIntensity > 0.5) {
        p.vx += bassIntensity * 0.5 * layerSpeed;
        p.vy += (Math.random() - 0.5) * bassIntensity * 0.3;
      }

      // Apply friction
      p.vx *= 0.98;
      p.vy *= 0.98;

      // Update position
      p.x += p.vx * deltaTime * 0.05;
      p.y += p.vy * deltaTime * 0.05;

      // Wrap around screen
      if (p.x > this.width + 10) {
        p.x = -10;
        p.y = Math.random() * this.height;
      }
      if (p.y < -10) p.y = this.height + 10;
      if (p.y > this.height + 10) p.y = -10;

      // Calculate particle alpha with treble sparkle
      const sparkle = this.smoothedTreble > 0.5 ? Math.sin(this.time * 10 + p.phase) * 0.3 : 0;
      const particleAlpha = Math.min(0.8, p.alpha * (0.6 + this.smoothedVolume * 0.4) + sparkle);

      // Draw particle with trail
      this.drawSandParticle(p, colors, particleAlpha, bassIntensity);
    });

    // Add dust haze effect on high intensity
    if (bassIntensity > 0.3) {
      this.drawDustHaze(colors, bassIntensity);
    }
  }

  private drawSandParticle(
    p: SandParticle,
    colors: { start: string; end: string; glow: string },
    alpha: number,
    intensity: number,
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const size = p.size * (1 + intensity * 0.5);

    // Draw trail
    const trailLength = Math.min(20, Math.abs(p.vx) * 3);
    if (trailLength > 2) {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * trailLength * 0.5, p.y - p.vy * trailLength * 0.5);

      const gradient = ctx.createLinearGradient(
        p.x,
        p.y,
        p.x - p.vx * trailLength * 0.5,
        p.y - p.vy * trailLength * 0.5,
      );
      gradient.addColorStop(0, this.hexToRgba(colors.start, alpha * 0.6));
      gradient.addColorStop(1, this.hexToRgba(colors.start, 0));

      ctx.strokeStyle = gradient;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Draw particle glow
    const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 3);
    glowGradient.addColorStop(0, this.hexToRgba(colors.glow, alpha * 0.3));
    glowGradient.addColorStop(1, this.hexToRgba(colors.glow, 0));

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, size * 3, 0, Math.PI * 2);
    ctx.fill();

    // Draw particle core
    ctx.fillStyle = this.hexToRgba(colors.end, alpha * 0.8);
    ctx.beginPath();
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawDustHaze(
    colors: { start: string; end: string; glow: string },
    intensity: number,
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const hazeAlpha = Math.min(0.15, intensity * 0.1);

    // Create horizontal gradient for dust haze
    const gradient = ctx.createLinearGradient(0, 0, this.width, 0);
    gradient.addColorStop(0, this.hexToRgba(colors.start, 0));
    gradient.addColorStop(0.3, this.hexToRgba(colors.start, hazeAlpha));
    gradient.addColorStop(0.7, this.hexToRgba(colors.end, hazeAlpha * 0.7));
    gradient.addColorStop(1, this.hexToRgba(colors.end, 0));

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initParticles();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.particleCount;
    this.config = { ...this.config, ...config } as SandstormConfig;

    if (this.config.particleCount !== oldCount && this.width > 0) {
      this.initParticles();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
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
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "golden",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 800,
        min: 200,
        max: 1500,
        step: 100,
      },
      windSpeed: {
        type: "number",
        label: "Wind Speed",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
