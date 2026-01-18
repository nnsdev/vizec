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

interface TelegraphSparksConfig extends VisualizationConfig {
  sparkIntensity: number;
  arcCount: number;
  glowStrength: number;
}

interface Spark {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  life: number;
  maxLife: number;
  segments: Array<{ x: number; y: number }>;
  brightness: number;
}

interface TelegraphKey {
  x: number;
  y: number;
  width: number;
  height: number;
  pressed: boolean;
  pressAmount: number;
  lastSparkTime: number;
}

export class TelegraphSparksVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "telegraphSparks",
    name: "Telegraph Sparks",
    author: "Vizec",
    description: "Electrical telegraph sparks that crackle with the rhythm",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: TelegraphSparksConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    sparkIntensity: 1.0,
    arcCount: 3,
    glowStrength: 1.0,
  };
  private width = 0;
  private height = 0;
  private sparks: Spark[] = [];
  private keys: TelegraphKey[] = [];
  private smoothedMid = 0;
  private smoothedTreble = 0;
  private time = 0;
  private lastSparkTime = 0;

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

    this.initKeys();
  }

  private initKeys(): void {
    this.keys = [];
    const { arcCount } = this.config;

    for (let i = 0; i < arcCount; i++) {
      this.keys.push({
        x: (this.width / (arcCount + 1)) * (i + 1),
        y: this.height * 0.7,
        width: 80,
        height: 30,
        pressed: false,
        pressAmount: 0,
        lastSparkTime: 0,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { mid, treble } = audioData;
    const { sensitivity, colorScheme, sparkIntensity, glowStrength } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values - faster response, boosted sensitivity
    const smoothing = 0.3;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * 2 * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * 2 * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update keys and trigger sparks
    for (const key of this.keys) {
      // Press key when mid is strong - use raw mid value for immediate response
      const midLevel = mid * sensitivity;
      key.pressed = midLevel > 0.08 || this.smoothedMid > 0.1;
      const targetPress = key.pressed ? 1 : 0;
      key.pressAmount += (targetPress - key.pressAmount) * 0.4;

      // Trigger sparks when key is pressed and enough time has passed
      // Each key has its own spark timer
      const shouldSpark = key.pressed && this.time - key.lastSparkTime > 0.02;
      const ambientSpark = this.time - key.lastSparkTime > 0.2;
      
      if (shouldSpark || ambientSpark) {
        this.createSpark(key, sparkIntensity);
        key.lastSparkTime = this.time;
      }

      this.drawKey(key, colors);
      this.drawContactPoint(key, colors, glowStrength);
    }

    // Update and draw sparks
    this.updateSparks(deltaTime);
    this.drawSparks(colors, glowStrength);

    // Draw wires connecting keys
    this.drawWires(colors);

    // Reset context
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  private createSpark(key: TelegraphKey, _intensity: number): void {
    if (this.sparks.length > 50) return;

    const startX = key.x;
    const startY = key.y - key.height - 20;
    const endX = key.x + (Math.random() - 0.5) * 60;
    const endY = key.y - key.height - 60 - Math.random() * 40;

    // Create jagged spark path
    const segments: Array<{ x: number; y: number }> = [];
    const segmentCount = 5 + Math.floor(Math.random() * 5);

    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const baseX = startX + (endX - startX) * t;
      const baseY = startY + (endY - startY) * t;
      const jitter = (1 - Math.abs(t - 0.5) * 2) * 15;

      segments.push({
        x: baseX + (Math.random() - 0.5) * jitter,
        y: baseY + (Math.random() - 0.5) * jitter,
      });
    }

    this.sparks.push({
      x: startX,
      y: startY,
      targetX: endX,
      targetY: endY,
      life: 0.15 + Math.random() * 0.1,
      maxLife: 0.15 + Math.random() * 0.1,
      segments,
      brightness: 0.8 + this.smoothedTreble * 0.2,
    });
  }

  private updateSparks(deltaTime: number): void {
    const dt = deltaTime * 0.001;

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.life -= dt;

      // Add some jitter to segments while alive
      for (const seg of spark.segments) {
        seg.x += (Math.random() - 0.5) * 2;
        seg.y += (Math.random() - 0.5) * 2;
      }

      if (spark.life <= 0) {
        this.sparks.splice(i, 1);
      }
    }
  }

  private drawSparks(colors: { start: string; end: string; glow: string }, glowStrength: number): void {
    if (!this.ctx) return;

    for (const spark of this.sparks) {
      const alpha = (spark.life / spark.maxLife) * spark.brightness;

      // Glow effect
      this.ctx.shadowBlur = 15 * glowStrength;
      this.ctx.shadowColor = colors.glow;

      // Main spark line
      this.ctx.globalAlpha = alpha * 0.7;
      this.ctx.strokeStyle = colors.glow;
      this.ctx.lineWidth = 2;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      this.ctx.beginPath();
      this.ctx.moveTo(spark.segments[0].x, spark.segments[0].y);
      for (let i = 1; i < spark.segments.length; i++) {
        this.ctx.lineTo(spark.segments[i].x, spark.segments[i].y);
      }
      this.ctx.stroke();

      // Bright core
      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1;
      this.ctx.stroke();

      // Draw branch sparks
      if (spark.segments.length > 2 && Math.random() > 0.7) {
        const branchIndex = 1 + Math.floor(Math.random() * (spark.segments.length - 2));
        const branchSeg = spark.segments[branchIndex];

        this.ctx.beginPath();
        this.ctx.moveTo(branchSeg.x, branchSeg.y);
        this.ctx.lineTo(
          branchSeg.x + (Math.random() - 0.5) * 30,
          branchSeg.y + (Math.random() - 0.5) * 20
        );
        this.ctx.stroke();
      }
    }

    this.ctx.shadowBlur = 0;
  }

  private drawKey(key: TelegraphKey, colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const pressOffset = key.pressAmount * 8;

    // Key base
    this.ctx.globalAlpha = 0.5;
    this.ctx.fillStyle = colors.start;
    this.ctx.fillRect(
      key.x - key.width / 2,
      key.y + pressOffset,
      key.width,
      key.height
    );

    // Key top
    const gradient = this.ctx.createLinearGradient(
      key.x - key.width / 2, key.y + pressOffset,
      key.x + key.width / 2, key.y + pressOffset
    );
    gradient.addColorStop(0, colors.start);
    gradient.addColorStop(0.5, colors.end);
    gradient.addColorStop(1, colors.start);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(
      key.x - key.width / 2 + 5,
      key.y - 5 + pressOffset,
      key.width - 10,
      8
    );

    // Knob on top
    this.ctx.beginPath();
    this.ctx.ellipse(
      key.x,
      key.y - 8 + pressOffset,
      15,
      8,
      0, 0, Math.PI * 2
    );
    this.ctx.fillStyle = colors.end;
    this.ctx.fill();
  }

  private drawContactPoint(
    key: TelegraphKey,
    colors: { start: string; end: string; glow: string },
    glowStrength: number
  ): void {
    if (!this.ctx) return;

    const contactY = key.y - key.height - 20;

    // Contact post
    this.ctx.globalAlpha = 0.5;
    this.ctx.fillStyle = colors.start;
    this.ctx.fillRect(key.x - 5, contactY, 10, key.height + 10);

    // Contact tip glow when active
    if (key.pressed) {
      this.ctx.shadowBlur = 20 * glowStrength;
      this.ctx.shadowColor = colors.glow;
      this.ctx.globalAlpha = 0.7;
      this.ctx.fillStyle = colors.glow;
      this.ctx.beginPath();
      this.ctx.arc(key.x, contactY, 6, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }

    // Static contact tip
    this.ctx.globalAlpha = 0.6;
    this.ctx.fillStyle = colors.end;
    this.ctx.beginPath();
    this.ctx.arc(key.x, contactY, 4, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawWires(colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx || this.keys.length < 2) return;

    this.ctx.globalAlpha = 0.3;
    this.ctx.strokeStyle = colors.start;
    this.ctx.lineWidth = 2;

    // Draw wire connecting all keys at bottom
    const wireY = this.height * 0.85;

    this.ctx.beginPath();
    this.ctx.moveTo(this.keys[0].x, wireY);

    for (let i = 1; i < this.keys.length; i++) {
      const prev = this.keys[i - 1];
      const curr = this.keys[i];

      // Catenary-like sag
      const midX = (prev.x + curr.x) / 2;
      const sag = 20;

      this.ctx.quadraticCurveTo(midX, wireY + sag, curr.x, wireY);
    }
    this.ctx.stroke();

    // Vertical wires to keys
    for (const key of this.keys) {
      this.ctx.beginPath();
      this.ctx.moveTo(key.x, key.y + key.height);
      this.ctx.lineTo(key.x, wireY);
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

    if (this.keys.length > 0) {
      this.initKeys();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevCount = this.config.arcCount;
    this.config = { ...this.config, ...config } as TelegraphSparksConfig;

    if (this.config.arcCount !== prevCount && this.width > 0) {
      this.initKeys();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.keys = [];
    this.sparks = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      arcCount: {
        type: "number",
        label: "Telegraph Count",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
      },
      sparkIntensity: {
        type: "number",
        label: "Spark Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      glowStrength: {
        type: "number",
        label: "Glow Strength",
        default: 1.0,
        min: 0.0,
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
