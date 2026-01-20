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

interface GraffitiSprayConfig extends VisualizationConfig {
  colorScheme: string;
  sprayDensity: number;
  fadeSpeed: number;
}

interface SprayParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface SprayBurst {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: string;
  particles: SprayParticle[];
  active: boolean;
  progress: number;
}

export class GraffitiSprayVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "graffitiSpray",
    name: "Graffiti Spray",
    author: "Vizec",
    description: "Urban spray paint bursts reacting to beats",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: GraffitiSprayConfig = {
    sensitivity: 1.0,
    colorScheme: "neonCity",
    sprayDensity: 1.0,
    fadeSpeed: 0.5,
  };

  private width = 0;
  private height = 0;
  private bursts: SprayBurst[] = [];
  private lastBass = 0;
  private sprayPositions: Array<{ x: number; y: number }> = [];

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

    // Clamp deltaTime to prevent huge jumps on first frame
    const dt = Math.min(deltaTime, 0.05);

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, sprayDensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Force create bursts if none exist and dimensions are valid
    if (this.bursts.length === 0 && this.width > 0) {
      for (let i = 0; i < 3; i++) {
        this.createBurst(colors);
      }
    }

    // Detect bass hits for new bursts
    const bassHit = bass > 0.5 && bass > this.lastBass + 0.08;
    this.lastBass = bass;

    // Spawn bursts on bass OR randomly for continuous action
    if (bassHit || (Math.random() < 0.03 * sensitivity && this.bursts.length < 5)) {
      this.createBurst(colors);
    }

    // Also spawn on high mid/treble
    if ((mid > 0.6 || treble > 0.6) && Math.random() < 0.02 * sensitivity && this.bursts.length < 8) {
      this.createBurst(colors);
    }

    // Update and render bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const burst = this.bursts[i];
      if (!burst.active) {
        this.bursts.splice(i, 1);
        continue;
      }

      burst.progress += dt * 0.5; // Slower progress

      // Update particles
      let activeParticles = 0;
      for (const p of burst.particles) {
        if (p.life <= 0) continue;
        activeParticles++;

        // Physics
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vy += 0.05 * dt * 60; // Less gravity
        p.vx *= 0.995;
        p.vy *= 0.995;

        p.life -= dt * 0.3; // Much slower decay
        p.alpha = Math.max(0, p.life / p.maxLife);

        // Drip effect for larger particles
        if (p.size > 4 && Math.random() < 0.02) {
          p.vy += 0.3;
        }

        // Draw particle - more opaque
        this.ctx!.globalAlpha = Math.min(1, p.alpha * 1.2 + 0.3);
        this.ctx!.fillStyle = p.color;
        this.ctx!.beginPath();
        this.ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx!.fill();

        // Spray mist effect - more visible
        if (p.size > 2) {
          this.ctx!.globalAlpha = Math.min(0.5, p.alpha * 0.4);
          this.ctx!.beginPath();
          this.ctx!.arc(p.x, p.y, p.size * 2.5, 0, Math.PI * 2);
          this.ctx!.fill();
        }
      }

      // Spawn new particles while spray is active - always spawn some
      if (burst.progress < 2) {
        const spawnCount = Math.max(5, Math.floor(15 * sprayDensity * (0.3 + mid + treble) * sensitivity));
        for (let j = 0; j < spawnCount; j++) {
          this.addSprayParticle(burst, colors, Math.max(0.3, volume));
        }
      }

      // Only deactivate after much longer
      if (activeParticles === 0 && burst.progress >= 2) {
        burst.active = false;
      }
    }

    this.ctx.globalAlpha = 1.0;
  }

  private createBurst(colors: { start: string; mid: string; end: string }): void {
    // Random position - ensure it's within visible area with padding
    const padding = 100;
    const x = padding + Math.random() * (this.width - padding * 2);
    const y = padding + Math.random() * (this.height - padding * 2);

    const colorChoice = [colors.start, colors.mid, colors.end][Math.floor(Math.random() * 3)];

    const burst: SprayBurst = {
      x,
      y,
      targetX: x + (Math.random() - 0.5) * 200,
      targetY: y + (Math.random() - 0.5) * 200,
      color: colorChoice,
      particles: [],
      active: true,
      progress: 0,
    };

    // Add initial particles immediately - more and bigger
    for (let i = 0; i < 80; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 2;
      burst.particles.push({
        x: x + (Math.random() - 0.5) * 50,
        y: y + (Math.random() - 0.5) * 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 4 + Math.random() * 10, // Bigger particles
        color: colorChoice,
        alpha: 1,
        life: 5 + Math.random() * 5, // Much longer life
        maxLife: 10,
      });
    }

    this.bursts.push(burst);
  }

  private addSprayParticle(
    burst: SprayBurst,
    _colors: { start: string; mid: string; end: string },
    volume: number
  ): void {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3 * volume;
    const spread = 40 + Math.random() * 60;

    // Interpolate position towards target (clamped progress)
    const prog = Math.min(burst.progress, 1);
    const currentX = burst.x + (burst.targetX - burst.x) * prog;
    const currentY = burst.y + (burst.targetY - burst.y) * prog;

    burst.particles.push({
      x: currentX + (Math.random() - 0.5) * spread,
      y: currentY + (Math.random() - 0.5) * spread,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 3 + Math.random() * 8, // Bigger
      color: burst.color,
      alpha: 1,
      life: 4 + Math.random() * 4, // Much longer
      maxLife: 8,
    });
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
    this.config = { ...this.config, ...config } as GraffitiSprayConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.bursts = [];
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
        default: "neonCity",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      sprayDensity: {
        type: "number",
        label: "Spray Density",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      fadeSpeed: {
        type: "number",
        label: "Fade Speed",
        default: 0.5,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
