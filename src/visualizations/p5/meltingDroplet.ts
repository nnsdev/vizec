import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface MeltingDropletConfig extends VisualizationConfig {
  dropletCount: number;
  meltSpeed: number;
  surfaceTension: number;
  glowIntensity: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  water: { primary: "#00bfff", secondary: "#87ceeb", accent: "#ffffff" },
  honey: { primary: "#ffa500", secondary: "#ffd700", accent: "#fff8dc" },
  mercury: { primary: "#c0c0c0", secondary: "#a9a9a9", accent: "#ffffff" },
  lava: { primary: "#ff4500", secondary: "#ff6347", accent: "#ffd700" },
  slime: { primary: "#32cd32", secondary: "#228b22", accent: "#98fb98" },
};

export class MeltingDropletVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "meltingDroplet",
    name: "Melting Droplet",
    author: "Vizec",
    renderer: "p5",
    transitionType: "crossfade",
    description: "Droplets slowly stretching and dripping",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: MeltingDropletConfig = {
    sensitivity: 1.0,
    colorScheme: "water",
    dropletCount: 5,
    meltSpeed: 0.5,
    surfaceTension: 0.3,
    glowIntensity: 0.8,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private currentDeltaTime = 0.016;
  private droplets: MeltingDrop[] = [];
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Set initial dimensions
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;

    this.droplets = [];
    for (let i = 0; i < this.config.dropletCount; i++) {
      this.droplets.push(
        new MeltingDrop(
          this.width / 2 + (Math.random() - 0.5) * this.width * 0.5,
          this.height * 0.3 + Math.random() * this.height * 0.2,
          30 + Math.random() * 30,
        ),
      );
    }

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private drawVisualization(p: p5): void {
    if (!this.currentAudioData) return;

    const { bass, mid, treble, volume } = this.currentAudioData;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.water;

    this.time += this.currentDeltaTime * 0.5;

    // Clear with transparent background
    p.clear();

    // Draw subtle surface
    this.drawSurface(p, colors);

    // Update and draw droplets
    for (const droplet of this.droplets) {
      droplet.update(
        bass,
        mid,
        treble,
        volume,
        this.config.sensitivity,
        this.config.meltSpeed,
        this.config.surfaceTension,
        this.time,
        this.width,
        this.height,
      );
      droplet.draw(p, colors, this.config.glowIntensity);
    }
  }

  private drawSurface(
    p: p5,
    _colors: { primary: string; secondary: string },
  ): void {
    p.noStroke();
    p.fill(220, 30, 15, 20);
    p.rect(0, this.height * 0.85, this.width, this.height * 0.15);
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.dropletCount;
    this.config = { ...this.config, ...config } as MeltingDropletConfig;

    if (config.dropletCount && config.dropletCount !== oldCount) {
      this.droplets = [];
      for (let i = 0; i < this.config.dropletCount; i++) {
        this.droplets.push(
          new MeltingDrop(
            this.width / 2 + (Math.random() - 0.5) * this.width * 0.5,
            this.height * 0.3 + Math.random() * this.height * 0.2,
            30 + Math.random() * 30,
          ),
        );
      }
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.droplets = [];
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
        default: "water",
        options: [
          { value: "water", label: "Water" },
          { value: "honey", label: "Honey" },
          { value: "mercury", label: "Mercury" },
          { value: "lava", label: "Lava" },
          { value: "slime", label: "Slime" },
        ],
      },
      dropletCount: {
        type: "number",
        label: "Drop Count",
        default: 5,
        min: 1,
        max: 15,
        step: 1,
      },
      meltSpeed: {
        type: "number",
        label: "Melt Speed",
        default: 0.5,
        min: 0.1,
        max: 1,
        step: 0.05,
      },
      surfaceTension: {
        type: "number",
        label: "Surface Tension",
        default: 0.3,
        min: 0.1,
        max: 0.8,
        step: 0.05,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
      },
    };
  }
}

class MeltingDrop {
  x: number;
  y: number;
  baseRadius: number;
  radius: number;
  stretchY: number = 1;
  stretchX: number = 1;
  vy: number = 0;
 滴Count: number = 0;
 滴s: FallingDrop[] = [];
  wobblePhase: number = Math.random() * Math.PI * 2;
  wobbleSpeed: number = 0.02 + Math.random() * 0.02;

  constructor(x: number, y: number, radius: number) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
  }

  update(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    sensitivity: number,
    meltSpeed: number,
    surfaceTension: number,
    time: number,
    width: number,
    height: number,
  ): void {
    this.wobblePhase += this.wobbleSpeed + treble * 0.02;

    // Wobble effect
    const wobble = Math.sin(this.wobblePhase) * (0.1 + treble * 0.2 * sensitivity);

    // Stretch based on bass and gravity
    const stretchFactor = 1 + bass * 0.3 * sensitivity + this.vy * 0.01;
    const tensionEffect = surfaceTension * 2;

    this.stretchY = stretchFactor * (1 - tensionEffect * 0.3);
    this.stretchX = 1 / Math.sqrt(this.stretchY) + wobble * 0.1;

    // Gravity and movement
    this.vy += 0.1 * meltSpeed;
    this.y += this.vy;

    // Spawn falling drops
    if (this.y > height * 0.4 && this.vy > 2) {
      if (Math.random() < 0.05 * volume * sensitivity) {
        this.滴s.push(
          new FallingDrop(
            this.x + (Math.random() - 0.5) * this.radius,
            this.y + this.radius * this.stretchY,
            3 + Math.random() * 5,
          ),
        );
      }
    }

    // Reset when reaching bottom
    if (this.y > height * 0.75) {
      this.reset(width, height);
    }

    // Update falling drops
    for (let i = this.滴s.length - 1; i >= 0; i--) {
      const drop = this.滴s[i];
      drop.update();
      if (drop.y > height) {
        this.滴s.splice(i, 1);
      }
    }
  }

  reset(width: number, height: number): void {
    this.x = width / 2 + (Math.random() - 0.5) * width * 0.3;
    this.y = height * 0.2 + Math.random() * height * 0.1;
    this.vy = 0;
    this.stretchY = 1;
    this.stretchX = 1;
  }

  draw(
    p: p5,
    colors: { primary: string; secondary: string; accent: string },
    glowIntensity: number,
  ): void {
    p.noStroke();

    // Glow effect
    if (glowIntensity > 0) {
      for (let i = 3; i >= 0; i--) {
        const glowSize = this.radius * this.stretchX * (1 + i * 0.3);
        const glowHeight = this.radius * this.stretchY * (1 + i * 0.3);
        const alpha = (glowIntensity * 20) / (i + 1);
        p.fill(200, 50, 100, alpha);
        p.ellipse(this.x, this.y, glowSize, glowHeight);
      }
    }

    // Main droplet body (teardrop shape using bezier)
    p.push();
    p.translate(this.x, this.y);
    p.scale(this.stretchX, this.stretchY);

    // Gradient-like layered drawing
    p.fill(colors.primary);
    p.ellipse(0, 0, this.radius * 2, this.radius * 2);

    // Inner highlight
    p.fill(colors.secondary);
    p.ellipse(-this.radius * 0.3, -this.radius * 0.3, this.radius, this.radius);

    // Core
    p.fill(colors.accent);
    p.ellipse(-this.radius * 0.2, -this.radius * 0.2, this.radius * 0.5, this.radius * 0.5);

    p.pop();

    // Draw falling drops
    for (const drop of this.滴s) {
      drop.draw(p, colors);
    }
  }
}

class FallingDrop {
  x: number;
  y: number;
  size: number;
  speed: number = 0;

  constructor(x: number, y: number, size: number) {
    this.x = x;
    this.y = y;
    this.size = size;
  }

  update(): void {
    this.speed += 0.3;
    this.y += this.speed;
  }

  draw(
    p: p5,
    colors: { primary: string; secondary: string },
  ): void {
    p.noStroke();
    p.fill(colors.primary);
    p.ellipse(this.x, this.y, this.size, this.size * 1.5);

    // Highlight
    p.fill(colors.secondary);
    p.ellipse(this.x - this.size * 0.2, this.y - this.size * 0.2, this.size * 0.3, this.size * 0.4);
  }
}
