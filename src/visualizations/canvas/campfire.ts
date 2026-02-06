import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface FlameParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  layer: "base" | "inner" | "core";
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  brightness: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  wobblePhase: number;
  wobbleSpeed: number;
}

interface CampfireConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  fireIntensity: number;
  sparkCount: number;
  emberCount: number;
  flameWidth: number;
}

export class CampfireVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "campfire",
    name: "Campfire",
    author: "Vizec",
    description:
      "Realistic layered fire with rising sparks and glowing embers. Great for chill/ambient music.",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: CampfireConfig = {
    sensitivity: 1.0,
    colorScheme: "fire",
    fireIntensity: 1.0,
    sparkCount: 40,
    emberCount: 15,
    flameWidth: 1.0,
  };

  private flames: FlameParticle[] = [];
  private sparks: Spark[] = [];
  private embers: Ember[] = [];
  private time = 0;
  private smoothBass = 0;
  private smoothTreble = 0;
  private smoothMid = 0;
  private smoothVolume = 0;

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

  private spawnFlame(layer: FlameParticle["layer"]): void {
    const cx = this.width / 2;
    const baseY = this.height;
    const spread = this.config.flameWidth;
    const intensity = this.config.fireIntensity * this.config.sensitivity;
    const bassBoost = 1 + this.smoothBass * intensity * 0.8;

    let xSpread: number;
    let size: number;
    let maxLife: number;
    let vy: number;

    switch (layer) {
      case "base":
        xSpread = (60 + Math.random() * 60) * spread;
        size = 30 + Math.random() * 40;
        maxLife = 1.0 + Math.random() * 0.6;
        vy = -(80 + Math.random() * 60) * bassBoost;
        break;
      case "inner":
        xSpread = (20 + Math.random() * 40) * spread;
        size = 18 + Math.random() * 25;
        maxLife = 0.6 + Math.random() * 0.4;
        vy = -(120 + Math.random() * 80) * bassBoost;
        break;
      case "core":
        xSpread = (5 + Math.random() * 15) * spread;
        size = 10 + Math.random() * 15;
        maxLife = 0.3 + Math.random() * 0.3;
        vy = -(150 + Math.random() * 100) * bassBoost;
        break;
    }

    const xOffset = (Math.random() - 0.5) * 2 * xSpread;

    this.flames.push({
      x: cx + xOffset,
      y: baseY + Math.random() * 10,
      vx: (Math.random() - 0.5) * 20,
      vy,
      life: maxLife,
      maxLife,
      size: size * bassBoost,
      layer,
    });
  }

  private spawnSpark(): void {
    const cx = this.width / 2;
    const baseY = this.height;
    const spread = this.config.flameWidth;
    const xOffset = (Math.random() - 0.5) * 80 * spread;
    const intensity = this.config.fireIntensity * this.config.sensitivity;

    this.sparks.push({
      x: cx + xOffset,
      y: baseY - Math.random() * 80,
      vx: (Math.random() - 0.5) * 40,
      vy: -(200 + Math.random() * 200) * (1 + this.smoothBass * intensity * 0.5),
      life: 1.0 + Math.random() * 1.5,
      maxLife: 1.0 + Math.random() * 1.5,
      size: 1 + Math.random() * 2.5,
      brightness: 0.7 + Math.random() * 0.3,
    });
  }

  private spawnEmber(): void {
    const cx = this.width / 2;
    const baseY = this.height;
    const spread = this.config.flameWidth;
    const xOffset = (Math.random() - 0.5) * 120 * spread;

    this.embers.push({
      x: cx + xOffset,
      y: baseY - 20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 15,
      vy: -(20 + Math.random() * 40),
      life: 3 + Math.random() * 4,
      maxLife: 3 + Math.random() * 4,
      size: 1.5 + Math.random() * 2.5,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 1.5 + Math.random() * 2,
    });
  }

  private getFlameColors(): { base: string; inner: string; core: string; spark: string } {
    const scheme = getColorScheme(COLOR_SCHEMES_GRADIENT, this.config.colorScheme);
    return {
      base: scheme.start,
      inner: scheme.end,
      core: scheme.glow,
      spark: scheme.glow,
    };
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const num = parseInt(hex.replace("#", ""), 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  private drawFlameParticle(p: FlameParticle): void {
    if (!this.ctx) return;

    const lifeRatio = p.life / p.maxLife;
    const colors = this.getFlameColors();
    let color: string;

    switch (p.layer) {
      case "base":
        color = colors.base;
        break;
      case "inner":
        color = colors.inner;
        break;
      case "core":
        color = colors.core;
        break;
    }

    const rgb = this.hexToRgb(color);
    const alpha = lifeRatio * lifeRatio * 0.6;
    const currentSize = p.size * (0.3 + lifeRatio * 0.7);

    // Tapered flame shape: wider at bottom, narrow at top via ellipse
    const scaleX = 1.0;
    const scaleY = 1.4 + lifeRatio * 0.6;

    const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, currentSize);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`);
    gradient.addColorStop(0.4, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.5})`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

    this.ctx.save();
    this.ctx.translate(p.x, p.y);
    this.ctx.scale(scaleX, scaleY);
    this.ctx.translate(-p.x, -p.y);

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const dt = Math.min(deltaTime * 0.001, 0.05); // ms → seconds, cap to avoid explosions
    this.time += dt;

    // Smooth audio values
    const smoothing = 0.85;
    this.smoothBass = this.smoothBass * smoothing + bass * (1 - smoothing);
    this.smoothTreble = this.smoothTreble * smoothing + treble * (1 - smoothing);
    this.smoothMid = this.smoothMid * smoothing + mid * (1 - smoothing);
    this.smoothVolume = this.smoothVolume * smoothing + volume * (1 - smoothing);

    const intensity = this.config.fireIntensity * this.config.sensitivity;
    const bassLevel = this.smoothBass * intensity;
    const trebleLevel = this.smoothTreble * intensity;

    // Clear
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Use additive blending for fire glow
    this.ctx.globalCompositeOperation = "lighter";

    // Spawn flames — rate scales with bass
    const baseFlameRate = 8 + bassLevel * 20;
    const innerFlameRate = 5 + bassLevel * 15;
    const coreFlameRate = 3 + bassLevel * 10;

    for (let i = 0; i < baseFlameRate * dt * 60; i++) {
      this.spawnFlame("base");
    }
    for (let i = 0; i < innerFlameRate * dt * 60; i++) {
      this.spawnFlame("inner");
    }
    for (let i = 0; i < coreFlameRate * dt * 60; i++) {
      this.spawnFlame("core");
    }

    // Spawn sparks — rate scales with treble
    const sparkRate =
      this.config.sparkCount * (0.3 + trebleLevel * 1.5) * dt * 10;
    for (let i = 0; i < sparkRate; i++) {
      if (this.sparks.length < this.config.sparkCount * 6) {
        this.spawnSpark();
      }
    }

    // Spawn embers — steady slow drip
    const emberRate = this.config.emberCount * 0.15 * dt * 10;
    for (let i = 0; i < emberRate; i++) {
      if (this.embers.length < this.config.emberCount * 4) {
        this.spawnEmber();
      }
    }

    // Update and draw flames (back to front: base, inner, core)
    const layers: FlameParticle["layer"][] = ["base", "inner", "core"];
    for (const layer of layers) {
      for (let i = this.flames.length - 1; i >= 0; i--) {
        const p = this.flames[i];
        if (p.layer !== layer) continue;

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // Flames taper inward and slow down as they rise
        p.vx *= 1 - 2.0 * dt;
        p.vy *= 1 - 0.5 * dt;
        p.life -= dt;

        if (p.life <= 0) {
          this.flames.splice(i, 1);
          continue;
        }

        this.drawFlameParticle(p);
      }
    }

    // Draw sparks
    const sparkColor = this.getFlameColors().spark;
    const sparkRgb = this.hexToRgb(sparkColor);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];

      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 30 * dt; // Slight gravity on sparks
      s.vx += (Math.random() - 0.5) * 60 * dt; // Horizontal drift
      s.life -= dt;

      if (s.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }

      const lifeRatio = s.life / s.maxLife;
      const alpha = lifeRatio * s.brightness;
      const sparkSize = s.size * (0.5 + lifeRatio * 0.5);

      // Bright dot with glow
      this.ctx.fillStyle = `rgba(${sparkRgb.r}, ${sparkRgb.g}, ${sparkRgb.b}, ${alpha})`;
      this.ctx.shadowBlur = 6 * alpha;
      this.ctx.shadowColor = `rgba(${sparkRgb.r}, ${sparkRgb.g}, ${sparkRgb.b}, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, sparkSize, 0, Math.PI * 2);
      this.ctx.fill();

      // White-hot center
      const whiteAlpha = alpha * lifeRatio * 0.8;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${whiteAlpha})`;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, sparkSize * 0.4, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.shadowBlur = 0;

    // Draw embers
    const emberColors = this.getFlameColors();
    const emberRgb = this.hexToRgb(emberColors.base);
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];

      e.wobblePhase += e.wobbleSpeed * dt;
      e.x += (e.vx + Math.sin(e.wobblePhase) * 12) * dt;
      e.y += e.vy * dt;
      e.vy -= 3 * dt; // Embers slowly accelerate upward
      e.life -= dt;

      if (e.life <= 0) {
        this.embers.splice(i, 1);
        continue;
      }

      const lifeRatio = e.life / e.maxLife;
      // Embers pulse in brightness
      const pulse = 0.6 + Math.sin(this.time * 4 + e.wobblePhase) * 0.4;
      const alpha = lifeRatio * pulse * 0.8;
      const emberSize = e.size * (0.4 + lifeRatio * 0.6);

      // Warm glow
      this.ctx.fillStyle = `rgba(${emberRgb.r}, ${emberRgb.g}, ${emberRgb.b}, ${alpha})`;
      this.ctx.shadowBlur = 8 * alpha;
      this.ctx.shadowColor = `rgba(${emberRgb.r}, ${emberRgb.g}, ${emberRgb.b}, ${alpha})`;
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y, emberSize, 0, Math.PI * 2);
      this.ctx.fill();

      // Hot center
      const coreAlpha = alpha * 0.6;
      this.ctx.fillStyle = `rgba(255, 200, 80, ${coreAlpha})`;
      this.ctx.beginPath();
      this.ctx.arc(e.x, e.y, emberSize * 0.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Draw base glow on the ground
    const glowIntensity = 0.15 + this.smoothVolume * intensity * 0.3;
    const baseGlowRgb = this.hexToRgb(emberColors.base);
    const cx = this.width / 2;
    const glowRadius = (120 + bassLevel * 200) * this.config.flameWidth;
    const groundGlow = this.ctx.createRadialGradient(
      cx,
      this.height,
      0,
      cx,
      this.height,
      glowRadius,
    );
    groundGlow.addColorStop(
      0,
      `rgba(${baseGlowRgb.r}, ${baseGlowRgb.g}, ${baseGlowRgb.b}, ${glowIntensity})`,
    );
    groundGlow.addColorStop(1, `rgba(${baseGlowRgb.r}, ${baseGlowRgb.g}, ${baseGlowRgb.b}, 0)`);
    this.ctx.fillStyle = groundGlow;
    this.ctx.beginPath();
    this.ctx.arc(cx, this.height, glowRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Performance caps
    while (this.flames.length > 600) this.flames.shift();
    while (this.sparks.length > 400) this.sparks.shift();
    while (this.embers.length > 150) this.embers.shift();

    // Reset composite and shadow
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.shadowBlur = 0;
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
    this.config = { ...this.config, ...config } as CampfireConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.flames = [];
    this.sparks = [];
    this.embers = [];
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
        default: "fire",
        label: "Color Scheme",
      },
      fireIntensity: {
        type: "number",
        min: 0.2,
        max: 3.0,
        step: 0.1,
        default: 1.0,
        label: "Fire Intensity",
      },
      sparkCount: {
        type: "number",
        min: 0,
        max: 100,
        step: 5,
        default: 40,
        label: "Spark Count",
      },
      emberCount: {
        type: "number",
        min: 0,
        max: 40,
        step: 5,
        default: 15,
        label: "Ember Count",
      },
      flameWidth: {
        type: "number",
        min: 0.3,
        max: 3.0,
        step: 0.1,
        default: 1.0,
        label: "Flame Width",
      },
    };
  }
}
