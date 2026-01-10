import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface OilSwirlConfig extends VisualizationConfig {
  dropletCount: number;
  viscosity: number;
  iridescence: number;
  trailLength: number;
}

const COLOR_SCHEMES: Record<string, { baseHue: number }> = {
  rainbow: { baseHue: 0 },
  oil: { baseHue: 200 },
  gold: { baseHue: 45 },
  rose: { baseHue: 320 },
  emerald: { baseHue: 140 },
};

export class OilSwirlVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "oilSwirl",
    name: "Oil Swirl",
    author: "Vizec",
    renderer: "p5",
    transitionType: "crossfade",
    description: "Iridescent oil droplets swirling on water",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: OilSwirlConfig = {
    sensitivity: 1.0,
    colorScheme: "oil",
    dropletCount: 15,
    viscosity: 0.97,
    iridescence: 1.0,
    trailLength: 0.95,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private currentDeltaTime = 0.016;
  private droplets: OilDroplet[] = [];
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Set initial dimensions from container
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;

    this.droplets = [];
    for (let i = 0; i < this.config.dropletCount; i++) {
      this.droplets.push(
        new OilDroplet(
          Math.random() * this.width,
          Math.random() * this.height,
          20 + Math.random() * 40,
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
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.oil;

    this.time += this.currentDeltaTime * 0.3;

    // Clear background for transparency
    p.clear();

    // Fade trail for transparent background - disabled for true transparency
    // p.noStroke();
    // p.fill(0, 0, 0, (1 - this.config.trailLength) * 100);
    // p.rect(0, 0, this.width, this.height);

    // Apply audio influence to flow field
    const flowStrength = bass * this.config.sensitivity * 0.02;
    const flowAngle = this.time + treble * 0.1;

    // Update and draw droplets
    for (const droplet of this.droplets) {
      droplet.update(
        bass,
        mid,
        treble,
        volume,
        this.config.sensitivity,
        this.config.viscosity,
        flowStrength,
        flowAngle,
        this.time,
        this.width,
        this.height,
        this.config.trailLength,
      );
      droplet.draw(p, colors, this.config.iridescence);
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.dropletCount;
    this.config = { ...this.config, ...config } as OilSwirlConfig;

    if (config.dropletCount && config.dropletCount !== oldCount) {
      this.droplets = [];
      for (let i = 0; i < this.config.dropletCount; i++) {
        this.droplets.push(
          new OilDroplet(
            Math.random() * this.width,
            Math.random() * this.height,
            20 + Math.random() * 40,
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
        default: "oil",
        options: [
          { value: "rainbow", label: "Rainbow" },
          { value: "oil", label: "Oil Blue" },
          { value: "gold", label: "Gold" },
          { value: "rose", label: "Rose" },
          { value: "emerald", label: "Emerald" },
        ],
      },
      dropletCount: {
        type: "number",
        label: "Droplet Count",
        default: 15,
        min: 5,
        max: 40,
        step: 1,
      },
      viscosity: {
        type: "number",
        label: "Viscosity",
        default: 0.97,
        min: 0.9,
        max: 0.99,
        step: 0.01,
      },
      iridescence: {
        type: "number",
        label: "Iridescence",
        default: 1.0,
        min: 0,
        max: 1,
        step: 0.05,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 0.95,
        min: 0.8,
        max: 0.99,
        step: 0.01,
      },
    };
  }
}

class OilDroplet {
  x: number;
  y: number;
  radius: number;
  vx: number = 0;
  vy: number = 0;
  hue: number;
  baseRadius: number;
  history: { x: number; y: number; radius: number }[] = [];

  constructor(x: number, y: number, radius: number) {
    this.x = x;
    this.y = y;
    this.baseRadius = radius;
    this.radius = radius;
    this.hue = Math.random() * 360;
  }

  update(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    sensitivity: number,
    viscosity: number,
    flowStrength: number,
    flowAngle: number,
    time: number,
    width: number,
    height: number,
    trailLengthConfig: number, // Add trailLengthConfig param
  ): void {
    // Store history for trails
    this.history.push({ x: this.x, y: this.y, radius: this.radius });
    
    // Limit history based on trail config (0.8 - 0.99 maps to ~5 - 50 frames)
    const maxHistory = Math.floor((trailLengthConfig - 0.8) * 200) + 5;
    if (this.history.length > maxHistory) {
      this.history.shift();
    }

    // Flow field influence
    const angle = flowAngle + Math.sin(time + this.x * 0.01) * Math.PI;
    this.vx += Math.cos(angle) * flowStrength * sensitivity;
    this.vy += Math.sin(angle) * flowStrength * sensitivity;

    // Audio pulse influence
    this.vx += (Math.random() - 0.5) * bass * sensitivity * 0.5;
    this.vy += (Math.random() - 0.5) * treble * sensitivity * 0.3;

    // Viscosity damping
    this.vx *= viscosity;
    this.vy *= viscosity;

    // Update position
    this.x += this.vx;
    this.y += this.vy;

    // Radius responds to bass
    const targetRadius = this.baseRadius + bass * 30 * sensitivity;
    this.radius += (targetRadius - this.radius) * 0.1;

    // Wrap around edges
    if (this.x < -this.radius) this.x = width + this.radius;
    if (this.x > width + this.radius) this.x = -this.radius;
    if (this.y < -this.radius) this.y = height + this.radius;
    if (this.y > height + this.radius) this.y = -this.radius;

    // Shift hue over time
    this.hue = (this.hue + 0.1 + volume * 2) % 360;
  }

  draw(p: p5, colors: { baseHue: number }, iridescence: number): void {
    p.noStroke();

    // Draw trail
    for (let i = 0; i < this.history.length; i++) {
      const pos = this.history[i];
      const t = i / this.history.length;
      const alpha = t * 40; // Fade in
      const size = pos.radius * t;
      
      const layerHue = (colors.baseHue + this.hue) % 360;
      p.fill(layerHue, 80 * iridescence, 90, alpha);
      p.ellipse(pos.x, pos.y, size, size);
    }

    // Iridescent layers
    const layerCount = 4;
    for (let i = layerCount - 1; i >= 0; i--) {
      const t = i / layerCount;
      const layerRadius = this.radius * (1 - t * 0.3);
      const layerHue = (colors.baseHue + this.hue + i * 30) % 360;
      const saturation = 80 * iridescence;
      const brightness = 90;
      const alpha = 60 + i * 10;

      p.fill(layerHue, saturation, brightness, alpha);
      p.ellipse(this.x, this.y, layerRadius, layerRadius);
    }

    // Highlight
    const highlightX = this.x - this.radius * 0.3;
    const highlightY = this.y - this.radius * 0.3;
    p.fill(0, 0, 100, 40);
    p.ellipse(highlightX, highlightY, this.radius * 0.4, this.radius * 0.3);
  }
}
