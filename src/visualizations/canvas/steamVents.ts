import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface SteamVentsConfig extends VisualizationConfig {
  ventCount: number;
  particleDensity: number;
  colorScheme: string;
}

interface SteamParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotationSpeed: number;
}

interface Vent {
  x: number;
  baseY: number;
  width: number;
  cooldown: number;
  active: boolean;
  intensity: number;
  particles: SteamParticle[];
}

export class SteamVentsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "steamVents",
    name: "Steam Vents",
    author: "Vizec",
    description: "Steam particle bursts on bass hits",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: SteamVentsConfig = {
    sensitivity: 1.0,
    ventCount: 5,
    particleDensity: 1.0,
    colorScheme: "monochrome",
  };
  private width = 0;
  private height = 0;
  private vents: Vent[] = [];
  private time = 0;
  private smoothedBass = 0;
  private smoothedVolume = 0;
  private lastBassHit = 0;

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

  private initVents(): void {
    this.vents = [];
    const { ventCount } = this.config;

    const spacing = this.width / (ventCount + 1);

    for (let i = 0; i < ventCount; i++) {
      this.vents.push({
        x: spacing * (i + 1),
        baseY: this.height,
        width: 30 + Math.random() * 20,
        cooldown: 0,
        active: false,
        intensity: 0,
        particles: [],
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, particleDensity } = this.config;
    const { volume, bass, mid, treble } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Clear canvas (transparent background)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Detect bass hits
    const bassThreshold = 0.5;
    const bassHit =
      bass * sensitivity > bassThreshold && this.smoothedBass * sensitivity < bassThreshold * 1.2;

    // Update vents and trigger bursts
    this.vents.forEach((vent) => {
      // Decrease cooldown
      vent.cooldown = Math.max(0, vent.cooldown - deltaTime);

      // Trigger steam burst on bass hit or continuous with volume
      if (bassHit && vent.cooldown <= 0) {
        vent.active = true;
        vent.intensity = bass * sensitivity;
        vent.cooldown = 200 + Math.random() * 300; // Prevent too rapid firing
        this.createSteamBurst(vent, particleDensity, bass * sensitivity);
      }

      // Continuous steam with high volume - increased frequency
      if (this.smoothedVolume * sensitivity > 0.25 && Math.random() < 0.15 * particleDensity) {
        this.createSteamParticle(vent, this.smoothedVolume * sensitivity * 0.6);
      }
      // Extra continuous steam for more visible effect
      if (this.smoothedVolume * sensitivity > 0.3 && Math.random() < 0.1 * particleDensity) {
        this.createSteamParticle(vent, this.smoothedVolume * sensitivity * 0.4);
      }

      // Update particles
      this.updateVentParticles(vent, deltaTime, mid * sensitivity);

      // Draw vent base and particles
      this.drawVent(vent, colors);
      this.drawVentParticles(vent, colors);

      // Decay intensity
      vent.intensity *= 0.95;
    });

    // Draw ambient steam wisps
    this.drawAmbientSteam(colors, this.smoothedVolume * sensitivity, treble * sensitivity);
  }

  private createSteamBurst(vent: Vent, density: number, intensity: number): void {
    // Doubled particle count for more steam
    const particleCount = Math.floor((30 + Math.random() * 50) * density * intensity);

    for (let i = 0; i < particleCount; i++) {
      this.createSteamParticle(vent, intensity);
    }
  }

  private createSteamParticle(vent: Vent, intensity: number): SteamParticle {
    const spread = vent.width * 0.6;
    const particle: SteamParticle = {
      x: vent.x + (Math.random() - 0.5) * spread,
      y: vent.baseY - 10,
      vx: (Math.random() - 0.5) * 2.5,
      vy: -(4 + Math.random() * 7 + intensity * 6), // Faster upward
      size: 15 + Math.random() * 30 + intensity * 20, // Bigger particles
      alpha: 0.7 + Math.random() * 0.2,
      life: 1,
      maxLife: 1.2, // Live longer
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.1,
    };

    vent.particles.push(particle);
    return particle;
  }

  private updateVentParticles(vent: Vent, deltaTime: number, midEffect: number): void {
    const dt = deltaTime * 0.01;

    vent.particles = vent.particles.filter((p) => {
      // Update life
      p.life -= dt * 0.03;

      if (p.life <= 0) return false;

      // Apply physics
      p.vy *= 0.98; // Slow down as it rises
      p.vx += (Math.random() - 0.5) * 0.2 + Math.sin(this.time * 2 + p.y * 0.01) * 0.1;
      p.vx *= 0.95;

      // Horizontal drift increases with height
      const heightProgress = 1 - p.y / this.height;
      p.vx += Math.sin(this.time * 3 + p.x * 0.02) * heightProgress * 0.3;

      // Audio-reactive turbulence
      p.vx += (Math.random() - 0.5) * midEffect * 0.3;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Expand as it rises
      p.size += dt * 0.5 * (1 + midEffect);

      // Fade alpha as life decreases
      p.alpha = 0.8 * p.life;

      // Rotate
      p.rotation += p.rotationSpeed;

      return true;
    });
  }

  private drawVent(vent: Vent, colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const ventHeight = 15;

    // Draw vent glow when active
    if (vent.intensity > 0.1) {
      const glowGradient = ctx.createRadialGradient(
        vent.x,
        vent.baseY - 5,
        0,
        vent.x,
        vent.baseY - 5,
        vent.width * 2,
      );
      glowGradient.addColorStop(0, this.hexToRgba(colors.glow, vent.intensity * 0.3));
      glowGradient.addColorStop(1, this.hexToRgba(colors.glow, 0));

      ctx.fillStyle = glowGradient;
      ctx.fillRect(
        vent.x - vent.width * 2,
        vent.baseY - vent.width * 2,
        vent.width * 4,
        vent.width * 2,
      );
    }

    // Draw vent pipe
    ctx.fillStyle = this.hexToRgba("#444444", 0.8);
    ctx.fillRect(vent.x - vent.width / 2, vent.baseY - ventHeight, vent.width, ventHeight);

    // Vent rim
    ctx.fillStyle = this.hexToRgba("#666666", 0.9);
    ctx.fillRect(vent.x - vent.width * 0.6, vent.baseY - ventHeight, vent.width * 1.2, 5);

    // Inner glow
    const innerGradient = ctx.createLinearGradient(
      vent.x,
      vent.baseY - ventHeight,
      vent.x,
      vent.baseY,
    );
    innerGradient.addColorStop(0, this.hexToRgba(colors.start, 0.3 + vent.intensity * 0.3));
    innerGradient.addColorStop(1, this.hexToRgba(colors.start, 0));

    ctx.fillStyle = innerGradient;
    ctx.fillRect(
      vent.x - vent.width * 0.4,
      vent.baseY - ventHeight + 2,
      vent.width * 0.8,
      ventHeight - 2,
    );
  }

  private drawVentParticles(
    vent: Vent,
    colors: { start: string; end: string; glow: string },
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;

    vent.particles.forEach((p) => {
      // Calculate height-based color interpolation (white at bottom, fading to color at top)
      const heightProgress = 1 - p.y / this.height;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      // Outer glow
      const glowSize = p.size * 1.5;
      const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
      glowGradient.addColorStop(0, this.hexToRgba(colors.start, p.alpha * 0.3));
      glowGradient.addColorStop(0.5, this.hexToRgba(colors.glow, p.alpha * 0.15));
      glowGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Steam puff (white to transparent)
      const puffGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size);
      const whiteAlpha = p.alpha * (1 - heightProgress * 0.5);
      puffGradient.addColorStop(0, this.hexToRgba("#ffffff", whiteAlpha * 0.6));
      puffGradient.addColorStop(0.4, this.hexToRgba("#dddddd", whiteAlpha * 0.4));
      puffGradient.addColorStop(1, this.hexToRgba("#aaaaaa", 0));

      ctx.fillStyle = puffGradient;
      ctx.beginPath();
      ctx.arc(0, 0, p.size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  private drawAmbientSteam(
    colors: { start: string; end: string; glow: string },
    volumeLevel: number,
    trebleLevel: number,
  ): void {
    if (!this.ctx || volumeLevel < 0.2) return;

    const ctx = this.ctx;
    const wispCount = 3;

    for (let i = 0; i < wispCount; i++) {
      const xBase = (i / wispCount) * this.width + this.width / (wispCount * 2) + 50;
      const phase = i * 1.5 + this.time * 0.3;

      ctx.beginPath();
      ctx.moveTo(xBase, this.height);

      const segments = 20;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const y = this.height - t * this.height * 0.7;
        const sway = Math.sin(phase + t * 4) * 40 * t + Math.sin(phase * 2 + t * 8) * 15 * t;
        const x = xBase + sway;

        ctx.lineTo(x, y);
      }

      const wispAlpha = 0.03 + volumeLevel * 0.04 + trebleLevel * 0.02;
      ctx.strokeStyle = this.hexToRgba(colors.start, wispAlpha);
      ctx.lineWidth = 3 + volumeLevel * 2;
      ctx.lineCap = "round";
      ctx.stroke();
    }
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
    this.initVents();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.ventCount;
    this.config = { ...this.config, ...config } as SteamVentsConfig;

    if (this.config.ventCount !== oldCount && this.width > 0) {
      this.initVents();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.vents = [];
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
        default: "monochrome",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      ventCount: {
        type: "number",
        label: "Vent Count",
        default: 5,
        min: 2,
        max: 8,
        step: 1,
      },
      particleDensity: {
        type: "number",
        label: "Particle Density",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
