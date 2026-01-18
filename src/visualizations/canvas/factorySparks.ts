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

interface FactorySparksConfig extends VisualizationConfig {
  emitterCount: number;
  sparkIntensity: number;
  colorScheme: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  brightness: number;
  trail: Array<{ x: number; y: number }>;
}

interface Emitter {
  x: number;
  y: number;
  angle: number;
  cooldown: number;
  active: boolean;
  sparks: Spark[];
}

export class FactorySparksVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "factorySparks",
    name: "Factory Sparks",
    author: "Vizec",
    description: "Welding/grinding sparks that burst on beats",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: FactorySparksConfig = {
    sensitivity: 1.0,
    emitterCount: 4,
    sparkIntensity: 1.0,
    colorScheme: "fire",
  };
  private width = 0;
  private height = 0;
  private emitters: Emitter[] = [];
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

  private initEmitters(): void {
    this.emitters = [];
    const { emitterCount } = this.config;

    for (let i = 0; i < emitterCount; i++) {
      // Distribute emitters across screen with varied positions
      const xRange = this.width * 0.8;
      const xStart = this.width * 0.1;

      this.emitters.push({
        x: xStart + (i / (emitterCount - 1 || 1)) * xRange,
        y: this.height * (0.3 + Math.random() * 0.4),
        angle: -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.5,
        cooldown: Math.random() * 500,
        active: false,
        sparks: [],
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, sparkIntensity } = this.config;
    const { volume, bass, mid } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.1;
    const prevBass = this.smoothedBass;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Clear canvas with slight trail effect for spark glow
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
    this.ctx.fillRect(0, 0, this.width, this.height);

    // Actually clear for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Detect bass hits
    const bassThreshold = 0.4;
    const bassHit = bass * sensitivity > bassThreshold && prevBass * sensitivity < bassThreshold;

    // Update each emitter
    this.emitters.forEach((emitter) => {
      // Decrease cooldown
      emitter.cooldown = Math.max(0, emitter.cooldown - deltaTime);

      // Trigger spark burst on bass hit
      if (bassHit && emitter.cooldown <= 0) {
        this.createSparkBurst(emitter, bass * sensitivity * sparkIntensity, colors);
        emitter.cooldown = 150 + Math.random() * 200;
        emitter.active = true;
      }

      // Continuous sparks with volume
      if (this.smoothedVolume * sensitivity > 0.3 && Math.random() < 0.15 * sparkIntensity) {
        this.createSpark(emitter, this.smoothedVolume * sensitivity * 0.6, colors);
      }

      // Update sparks
      this.updateEmitterSparks(emitter, deltaTime, mid * sensitivity);

      // Draw emitter source glow
      this.drawEmitterGlow(emitter, colors);

      // Draw sparks with additive blending
      this.drawSparks(emitter, colors);

      // Decay active state
      if (emitter.sparks.length === 0) {
        emitter.active = false;
      }
    });

    // Draw ambient welding flash on high bass
    if (this.smoothedBass * sensitivity > 0.6) {
      this.drawWeldingFlash(colors, this.smoothedBass * sensitivity);
    }
  }

  private createSparkBurst(
    emitter: Emitter,
    intensity: number,
    colors: { start: string; end: string; glow: string }
  ): void {
    const sparkCount = Math.floor((20 + Math.random() * 30) * intensity);

    for (let i = 0; i < sparkCount; i++) {
      this.createSpark(emitter, intensity, colors);
    }
  }

  private createSpark(
    emitter: Emitter,
    intensity: number,
    _colors: { start: string; end: string; glow: string }
  ): void {
    const spreadAngle = Math.PI * 0.4;
    const angle = emitter.angle + (Math.random() - 0.5) * spreadAngle;
    const speed = 5 + Math.random() * 10 + intensity * 8;

    const spark: Spark = {
      x: emitter.x,
      y: emitter.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 1 + Math.random() * 2 + intensity,
      life: 1,
      maxLife: 0.5 + Math.random() * 0.5 + intensity * 0.3,
      brightness: 0.7 + Math.random() * 0.3,
      trail: [],
    };

    emitter.sparks.push(spark);
  }

  private updateEmitterSparks(emitter: Emitter, deltaTime: number, midEffect: number): void {
    const dt = deltaTime * 0.016;
    const gravity = 0.15;

    emitter.sparks = emitter.sparks.filter((spark) => {
      // Save position for trail
      spark.trail.push({ x: spark.x, y: spark.y });
      if (spark.trail.length > 8) {
        spark.trail.shift();
      }

      // Update physics
      spark.vy += gravity * dt; // Gravity
      spark.vx *= 0.99; // Air resistance
      spark.vy *= 0.99;

      // Add slight turbulence from audio
      spark.vx += (Math.random() - 0.5) * midEffect * 0.3;
      spark.vy += (Math.random() - 0.5) * midEffect * 0.2;

      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;

      // Decay life
      spark.life -= (1 / spark.maxLife) * dt * 0.03;

      // Decrease brightness as life decreases
      spark.brightness = Math.max(0.2, spark.brightness * 0.995);

      // Remove if dead or off screen
      return spark.life > 0 && spark.y < this.height + 50 && spark.x > -50 && spark.x < this.width + 50;
    });
  }

  private drawEmitterGlow(
    emitter: Emitter,
    colors: { start: string; end: string; glow: string }
  ): void {
    if (!this.ctx || !emitter.active) return;

    const ctx = this.ctx;

    // Draw welding point glow
    const glowSize = 30 + Math.random() * 20;
    const glowGradient = ctx.createRadialGradient(
      emitter.x, emitter.y, 0,
      emitter.x, emitter.y, glowSize
    );
    glowGradient.addColorStop(0, this.hexToRgba("#ffffff", 0.9));
    glowGradient.addColorStop(0.2, this.hexToRgba(colors.glow, 0.6));
    glowGradient.addColorStop(0.5, this.hexToRgba(colors.start, 0.3));
    glowGradient.addColorStop(1, this.hexToRgba(colors.start, 0));

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(emitter.x, emitter.y, glowSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // Inner bright core
    const coreSize = 5 + Math.random() * 3;
    ctx.fillStyle = this.hexToRgba("#ffffff", 0.95);
    ctx.beginPath();
    ctx.arc(emitter.x, emitter.y, coreSize, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSparks(
    emitter: Emitter,
    colors: { start: string; end: string; glow: string }
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    ctx.globalCompositeOperation = "lighter";

    emitter.sparks.forEach((spark) => {
      // Draw trail
      if (spark.trail.length > 1) {
        ctx.beginPath();
        ctx.moveTo(spark.trail[0].x, spark.trail[0].y);

        for (let i = 1; i < spark.trail.length; i++) {
          ctx.lineTo(spark.trail[i].x, spark.trail[i].y);
        }
        ctx.lineTo(spark.x, spark.y);

        const trailAlpha = spark.life * spark.brightness * 0.6;
        ctx.strokeStyle = this.hexToRgba(colors.start, trailAlpha);
        ctx.lineWidth = spark.size * 0.5;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      // Draw spark glow
      const glowSize = spark.size * 4;
      const glowGradient = ctx.createRadialGradient(
        spark.x, spark.y, 0,
        spark.x, spark.y, glowSize
      );
      const glowAlpha = spark.life * spark.brightness * 0.5;
      glowGradient.addColorStop(0, this.hexToRgba(colors.glow, glowAlpha));
      glowGradient.addColorStop(0.5, this.hexToRgba(colors.start, glowAlpha * 0.3));
      glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, glowSize, 0, Math.PI * 2);
      ctx.fill();

      // Draw spark core
      const coreAlpha = spark.life * spark.brightness;
      const coreGradient = ctx.createRadialGradient(
        spark.x, spark.y, 0,
        spark.x, spark.y, spark.size * 1.5
      );

      // Hot core (white/yellow) to cooler edge (orange/red)
      coreGradient.addColorStop(0, this.hexToRgba("#ffffff", coreAlpha));
      coreGradient.addColorStop(0.3, this.hexToRgba("#ffff00", coreAlpha * 0.9));
      coreGradient.addColorStop(0.6, this.hexToRgba(colors.start, coreAlpha * 0.7));
      coreGradient.addColorStop(1, this.hexToRgba(colors.end, coreAlpha * 0.3));

      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.size * 1.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = "source-over";
  }

  private drawWeldingFlash(
    colors: { start: string; end: string; glow: string },
    intensity: number
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;

    // Draw ambient flash/glow
    this.emitters.forEach((emitter) => {
      if (!emitter.active) return;

      const flashSize = 100 + intensity * 150;
      const flashGradient = ctx.createRadialGradient(
        emitter.x, emitter.y, 0,
        emitter.x, emitter.y, flashSize
      );

      const flashAlpha = 0.1 + Math.random() * 0.1;
      flashGradient.addColorStop(0, this.hexToRgba("#ffffff", flashAlpha));
      flashGradient.addColorStop(0.3, this.hexToRgba(colors.glow, flashAlpha * 0.5));
      flashGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = flashGradient;
      ctx.beginPath();
      ctx.arc(emitter.x, emitter.y, flashSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    });
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
    this.initEmitters();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.emitterCount;
    this.config = { ...this.config, ...config } as FactorySparksConfig;

    if (this.config.emitterCount !== oldCount && this.width > 0) {
      this.initEmitters();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.emitters = [];
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
        default: "fire",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      emitterCount: {
        type: "number",
        label: "Emitter Count",
        default: 4,
        min: 1,
        max: 6,
        step: 1,
      },
      sparkIntensity: {
        type: "number",
        label: "Spark Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
