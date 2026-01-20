import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface InkDropConfig extends VisualizationConfig {
  dropCount: number;
  inkColors: string;
  spreadSpeed: number;
  turbulence: number;
  trailOpacity: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; tertiary: string }> = {
  cyanMagenta: {
    primary: "#00ffff",
    secondary: "#ff00ff",
    tertiary: "#8000ff",
  },
  ocean: { primary: "#0066ff", secondary: "#00ffcc", tertiary: "#00bfff" },
  sunset: { primary: "#ff6600", secondary: "#ff0066", tertiary: "#ffcc00" },
  forest: { primary: "#00ff80", secondary: "#0080ff", tertiary: "#80ff00" },
  fire: { primary: "#ff3300", secondary: "#ff6600", tertiary: "#ffcc00" },
};

export class InkDropVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "inkDrop",
    name: "Ink Drop",
    author: "Vizec",
    renderer: "p5",
    transitionType: "crossfade",
    description: "Colorful ink drops spreading in water",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: InkDropConfig = {
    sensitivity: 1.0,
    colorScheme: "ocean",
    dropCount: 8,
    inkColors: "ocean",
    spreadSpeed: 1.0,
    turbulence: 0.5,
    trailOpacity: 0.92,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private currentDeltaTime = 0.016;
  private drops: InkDrop[] = [];
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Set initial dimensions
    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;

    this.drops = [];
    for (let i = 0; i < this.config.dropCount; i++) {
      this.drops.push(new InkDrop(this.width, this.height));
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
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.ocean;

    this.time += this.currentDeltaTime * 0.5;

    // Clear background for transparency
    p.clear();

    // Update and draw drops
    for (const drop of this.drops) {
      drop.update(
        bass,
        mid,
        treble,
        volume,
        this.config.sensitivity,
        this.config.spreadSpeed,
        this.config.turbulence,
        this.time,
        this.width,
        this.height,
      );
      drop.draw(p, colors);
    }

    // Spawn new drops based on audio
    if (volume > 0.3 && Math.random() < volume * 0.1) {
      const inactiveDrop = this.drops.find((d) => !d.active);
      if (inactiveDrop) {
        inactiveDrop.spawn(Math.random() * this.width, Math.random() * this.height, colors, bass);
      }
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
    const oldDropCount = this.config.dropCount;
    this.config = { ...this.config, ...config } as InkDropConfig;

    if (config.dropCount && config.dropCount !== oldDropCount) {
      this.drops = [];
      for (let i = 0; i < this.config.dropCount; i++) {
        this.drops.push(new InkDrop(this.width, this.height));
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
    this.drops = [];
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
        default: "ocean",
        options: [
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "ocean", label: "Ocean" },
          { value: "sunset", label: "Sunset" },
          { value: "forest", label: "Forest" },
          { value: "fire", label: "Fire" },
        ],
      },
      dropCount: {
        type: "number",
        label: "Max Drops",
        default: 8,
        min: 1,
        max: 20,
        step: 1,
      },
      spreadSpeed: {
        type: "number",
        label: "Spread Speed",
        default: 1.0,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      turbulence: {
        type: "number",
        label: "Turbulence",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.05,
      },
      trailOpacity: {
        type: "number",
        label: "Trail Length",
        default: 0.92,
        min: 0.5,
        max: 0.99,
        step: 0.01,
      },
    };
  }
}

class InkDrop {
  x: number = 0;
  y: number = 0;
  radius: number = 0;
  active: boolean = false;
  color: { primary: string; secondary: string; tertiary: string } | null = null;
  tendrils: Tendril[] = [];
  rotation: number = 0;
  rotationSpeed: number = 0;
  opacity: number = 100;

  constructor(width: number, height: number) {
    this.x = width / 2;
    this.y = height / 2;
  }

  spawn(
    x: number,
    y: number,
    colors: { primary: string; secondary: string; tertiary: string },
    bass: number,
  ): void {
    this.x = x;
    this.y = y;
    this.radius = 5 + bass * 30;
    this.active = true;
    this.color = colors;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.02;
    this.opacity = 100;
    this.tendrils = [];

    // Create tendrils
    const tendrilCount = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < tendrilCount; i++) {
      this.tendrils.push(new Tendril(x, y, (i / tendrilCount) * Math.PI * 2));
    }
  }

  update(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    sensitivity: number,
    spreadSpeed: number,
    turbulence: number,
    time: number,
    width: number,
    height: number,
  ): void {
    if (!this.active || !this.color) return;

    // Expand radius
    const expansion = (0.5 + bass * sensitivity) * spreadSpeed;
    this.radius += expansion;

    // Rotate
    this.rotation += this.rotationSpeed + treble * 0.01 * sensitivity;

    // Fade out
    this.opacity = Math.max(0, this.opacity - 0.1 * volume * sensitivity);

    // Update tendrils
    for (const tendril of this.tendrils) {
      tendril.update(
        this.x,
        this.y,
        this.radius,
        bass,
        mid,
        treble,
        volume,
        sensitivity,
        turbulence,
        time,
      );
    }

    // Deactivate when too large or faded
    if (this.opacity <= 0 || this.radius > Math.min(width, height) * 0.8) {
      this.active = false;
    }
  }

  draw(p: p5, colors: { primary: string; secondary: string; tertiary: string }): void {
    if (!this.active) return;

    p.push();
    p.translate(this.x, this.y);
    p.rotate(this.rotation);

    // Draw tendrils
    for (const tendril of this.tendrils) {
      tendril.draw(p, this.color!, this.opacity);
    }

    // Draw main ink blot
    p.noStroke();
    const c1 = p.color(colors.primary);
    const c2 = p.color(colors.secondary);

    // Layered circles for organic look
    for (let i = 3; i >= 0; i--) {
      const r = this.radius * (1 - i * 0.15);
      const alpha = (this.opacity / 100) * (1 - i * 0.2);
      const layerColor = p.lerpColor(c1, c2, i * 0.3);

      p.fill(p.hue(layerColor), p.saturation(layerColor), p.brightness(layerColor), alpha * 50);
      p.ellipse(0, 0, r, r);
    }

    p.pop();
  }
}

class Tendril {
  angle: number;
  length: number;
  segments: { x: number; y: number }[];

  constructor(x: number, y: number, angle: number) {
    this.angle = angle;
    this.length = 30 + Math.random() * 50;
    this.segments = [];
    for (let i = 0; i < 10; i++) {
      this.segments.push({ x: 0, y: 0 });
    }
  }

  update(
    cx: number,
    cy: number,
    radius: number,
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    sensitivity: number,
    turbulence: number,
    time: number,
  ): void {
    const targetLength = this.length + radius * 0.3 + bass * 50 * sensitivity;
    this.length += (targetLength - this.length) * 0.05;

    let x = 0;
    let y = 0;

    for (let i = 0; i < this.segments.length; i++) {
      const t = i / this.segments.length;
      const wave =
        Math.sin(time * 2 + i * 0.5 + this.angle * 10) *
        (20 + treble * 30 * sensitivity) *
        turbulence;

      this.segments[i].x = x + Math.cos(this.angle + Math.PI / 2) * wave * t;
      this.segments[i].y = y + Math.sin(this.angle + Math.PI / 2) * wave * t;

      x = this.segments[i].x;
      y = this.segments[i].y;
    }
  }

  draw(
    p: p5,
    colors: { primary: string; secondary: string; tertiary: string },
    opacity: number,
  ): void {
    p.noFill();

    for (let i = 1; i < this.segments.length; i++) {
      const alpha = (opacity / 100) * (1 - i / this.segments.length) * 80;

      const c = p.color(colors.secondary);
      c.setAlpha(alpha);
      p.stroke(c);

      // p.strokeWeight(3 * (1 - i / this.segments.length));
      p.strokeWeight(3);
      p.line(
        this.segments[i - 1].x,
        this.segments[i - 1].y,
        this.segments[i].x,
        this.segments[i].y,
      );
    }
  }
}
