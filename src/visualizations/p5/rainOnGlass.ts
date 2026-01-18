import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface RainOnGlassConfig extends VisualizationConfig {
  raindropCount: number;
  trailSensitivity: number;
  blurAmount: number;
  lightIntensity: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string }> = {
  night: { primary: "#1a1a2e", secondary: "#16213e" },
  urban: { primary: "#2d3436", secondary: "#636e72" },
  sunset: { primary: "#2d1b2e", secondary: "#4a192c" },
  dawn: { primary: "#1a1a2e", secondary: "#2d3436" },
};

export class RainOnGlassVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "rainOnGlass",
    name: "Rain on Glass",
    author: "Vizec",
    renderer: "p5",
    transitionType: "crossfade",
    description: "Raindrops sliding down a window pane",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: RainOnGlassConfig = {
    sensitivity: 1.0,
    colorScheme: "night",
    raindropCount: 400, // Increased 4x
    trailSensitivity: 0.7,
    blurAmount: 2,
    lightIntensity: 0.5,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private currentDeltaTime = 0.016;
  private drops: Raindrop[] = [];
  private trails: TrailPoint[] = [];
  private time = 0;
  private backgroundBuffer: p5.Graphics | null = null;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        this.width = container.clientWidth;
        this.height = container.clientHeight;

        // Create offscreen buffer for background
        this.backgroundBuffer = p.createGraphics(this.width, this.height);
        this.backgroundBuffer.colorMode(p.HSB, 360, 100, 100, 100);
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private drawVisualization(p: p5): void {
    if (!this.currentAudioData || !this.backgroundBuffer) return;

    const { bass, mid, treble, volume } = this.currentAudioData;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.night;

    this.time += this.currentDeltaTime;

    // Clear main canvas
    p.clear();

    // Draw subtle background
    this.drawBackground(this.backgroundBuffer, colors);

    // Spawn new drops based on treble (high frequencies = more drops) - 4x spawn rate
    const spawnChance = treble * 1.2 * this.config.sensitivity;
    if (Math.random() < spawnChance) {
      this.spawnDrop(p, colors, treble);
    }
    if (Math.random() < spawnChance * 0.8) {
      this.spawnDrop(p, colors, treble);
    }
    if (Math.random() < spawnChance * 0.6) {
      this.spawnDrop(p, colors, treble);
    }
    if (Math.random() < spawnChance * 0.4) {
      this.spawnDrop(p, colors, treble);
    }

    // Update and draw background
    p.image(this.backgroundBuffer, 0, 0);

    // Update and draw trails (water trails on glass)
    this.updateTrails(p, bass, mid, volume);
    this.drawTrails(p, colors);

    // Update and draw drops
    this.updateDrops(p, bass, mid, treble, volume, colors);
  }

  private drawBackground(
    buffer: p5.Graphics,
    colors: { primary: string; secondary: string },
  ): void {
    buffer.clear();
    buffer.noStroke();

    // Dark gradient background - VERY transparent for overlay
    const c1 = buffer.color(colors.primary);
    c1.setAlpha(5); // Very low alpha
    const c2 = buffer.color(colors.secondary);
    c2.setAlpha(5); // Very low alpha

    for (let y = 0; y < this.height; y += 10) {
      const t = y / this.height;
      const c = buffer.lerpColor(c1, c2, t * 0.3);
      buffer.fill(c);
      buffer.rect(0, y, this.width, 10);
    }

    // Subtle bokeh lights in background
    const lightCount = 3;
    for (let i = 0; i < lightCount; i++) {
      const x = (this.time * 20 + i * this.width / lightCount) % (this.width + 200) - 100;
      const y = this.height * 0.3 + Math.sin(this.time + i) * 50;
      const size = 50 + Math.sin(this.time * 0.5 + i * 2) * 20;
      const alpha = (this.config.lightIntensity * 15 * (0.5 + Math.sin(this.time + i) * 0.5));

      buffer.fill(45, 80, 100, alpha);
      buffer.ellipse(x, y, size, size);
    }
  }

  private spawnDrop(
    p: p5,
    colors: { primary: string; secondary: string },
    treble: number,
  ): void {
    const x = Math.random() * this.width;
    const y = Math.random() * this.height * 0.2;
    const size = 3 + Math.random() * 8 + treble * 10;

    this.drops.push(new Raindrop(x, y, size, this.height));
  }

  private updateDrops(
    p: p5,
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    colors: { primary: string; secondary: string },
  ): void {
    const gravity = 0.5 + bass * 2 * this.config.sensitivity;

    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      drop.update(gravity, mid, volume, this.config.sensitivity);

      // Leave trail
      if (Math.random() < 0.3) {
        this.trails.push(
          new TrailPoint(drop.x, drop.y, drop.size * 0.5, drop.speed),
        );
      }

      // Draw drop
      drop.draw(p, colors);

      // Remove if off screen
      if (drop.y > this.height + drop.size) {
        this.drops.splice(i, 1);
      }
    }
  }

  private updateTrails(p: p5, bass: number, mid: number, volume: number): void {
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const trail = this.trails[i];
      trail.update(bass, mid, volume);
      if (trail.life <= 0) {
        this.trails.splice(i, 1);
      }
    }
  }

  private drawTrails(
    p: p5,
    _colors: { primary: string; secondary: string },
  ): void {
    p.noStroke();

    for (const trail of this.trails) {
      const alpha = trail.life * 30;
      p.fill(200, 10, 90, alpha);
      p.ellipse(trail.x, trail.y, trail.size, trail.size * 2);
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    this.currentAudioData = audioData;
    this.currentDeltaTime = deltaTime || 0.016;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }

    if (this.backgroundBuffer) {
      this.backgroundBuffer.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as RainOnGlassConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.drops = [];
    this.trails = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        default: 1.0,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "night",
        options: [
          { value: "night", label: "Night" },
          { value: "urban", label: "Urban" },
          { value: "sunset", label: "Sunset" },
          { value: "dawn", label: "Dawn" },
        ],
      },
      raindropCount: {
        type: "number",
        label: "Max Drops",
        default: 100,
        min: 20,
        max: 300,
        step: 10,
      },
      trailSensitivity: {
        type: "number",
        label: "Trail Sensitivity",
        default: 0.7,
        min: 0.1,
        max: 1,
        step: 0.05,
      },
      lightIntensity: {
        type: "number",
        label: "Light Intensity",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}

class Raindrop {
  x: number;
  y: number;
  size: number;
  speed: number;
  maxY: number;
  wobble: number = Math.random() * Math.PI * 2;
  wobbleSpeed: number = 0.05 + Math.random() * 0.05;

  constructor(x: number, y: number, size: number, maxY: number) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = 0;
    this.maxY = maxY;
  }

  update(gravity: number, mid: number, _volume: number, sensitivity: number): void {
    // Gravity acceleration
    this.speed += gravity * 0.5;

    // Wobble path
    this.wobble += this.wobbleSpeed;
    this.x += Math.sin(this.wobble) * (0.5 + mid * sensitivity);

    // Speed variation
    this.speed *= 0.98;

    // Apply speed
    this.y += this.speed + 1;
  }

  draw(p: p5, _colors: { primary: string; secondary: string }): void {
    p.noStroke();

    // Drop body
    const ctx = p.drawingContext as CanvasRenderingContext2D;

    // Create gradient for drop
    const gradient2d = ctx.createRadialGradient(
      this.x - this.size * 0.3,
      this.y - this.size * 0.3,
      0,
      this.x,
      this.y,
      this.size,
    );

    const c1 = p.color(220, 20, 95, 70);
    const c2 = p.color(220, 30, 70, 40);

    gradient2d.addColorStop(0, c1.toString());
    gradient2d.addColorStop(1, c2.toString());

    ctx.fillStyle = gradient2d;
    p.ellipse(this.x, this.y, this.size, this.size * 1.5);

    // Highlight
    p.fill(0, 0, 100, 50);
    p.ellipse(this.x - this.size * 0.3, this.y - this.size * 0.4, this.size * 0.3, this.size * 0.4);
  }
}

class TrailPoint {
  x: number;
  y: number;
  size: number;
  speed: number;
  life: number = 1;

  constructor(x: number, y: number, size: number, speed: number) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.speed = speed;
  }

  update(bass: number, _mid: number, _volume: number): void {
    this.y += this.speed * 0.5;
    this.life -= 0.02 + bass * 0.02;
    this.size *= 0.98;
  }
}
