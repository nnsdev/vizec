import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface FountainConfig extends VisualizationConfig {
  particleCount: number;
  gravity: number;
  spraySpread: number;
  dropletSize: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  water: { primary: "#00bfff", secondary: "#87ceeb", accent: "#ffffff" },
  fire: { primary: "#ff4500", secondary: "#ff6347", accent: "#ffd700" },
  magic: { primary: "#9400d3", secondary: "#ff00ff", accent: "#00ffff" },
  gold: { primary: "#ffd700", secondary: "#ffaa00", accent: "#fff8dc" },
  silver: { primary: "#c0c0c0", secondary: "#a8a8a8", accent: "#ffffff" },
};

export class FountainVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "fountain",
    name: "Water Fountain",
    author: "Vizec",
    renderer: "canvas2d",
    transitionType: "zoom",
    description: "Arc of water shooting up and breaking into droplets",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: FountainConfig = {
    sensitivity: 1.0,
    colorScheme: "water",
    particleCount: 300,
    gravity: 0.3,
    spraySpread: 0.4,
    dropletSize: 1,
  };

  private particles: FountainParticle[] = [];
  private time = 0;

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

    this.time += deltaTime;
    const { bass, treble, volume } = audioData;
    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.water;

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Use additive blending for water glow effect
    this.ctx.globalCompositeOperation = "screen";

    // Spawn particles based on bass
    const spawnRate = Math.floor((bass * this.config.sensitivity * 15) + 2);
    
    // Main jet
    for (let i = 0; i < spawnRate; i++) {
      if (this.particles.length < this.config.particleCount) {
        this.particles.push(this.createParticle(this.width / 2, -Math.PI / 2, bass, treble, "main"));
      }
    }

    // Side jets (on beat)
    if (bass > 0.6) {
      const sideRate = Math.floor(spawnRate * 0.5);
      for (let i = 0; i < sideRate; i++) {
        if (this.particles.length < this.config.particleCount) {
          // Left jet
          this.particles.push(this.createParticle(this.width / 2 - 20, -Math.PI / 2 - 0.3, bass, treble, "side"));
          // Right jet
          this.particles.push(this.createParticle(this.width / 2 + 20, -Math.PI / 2 + 0.3, bass, treble, "side"));
        }
      }
    }

    // Draw pool at bottom
    this.drawPool(colors, volume);

    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.update(this.config.gravity);
      particle.draw(this.ctx!, colors);

      if (particle.y > this.height + 10 || particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
    
    this.ctx.globalCompositeOperation = "source-over";
  }

  private createParticle(x: number, angleBase: number, bass: number, treble: number, type: "main" | "side"): FountainParticle {
    const baseY = this.height * 0.85;

    // Angle spread
    const spread = type === "main" ? this.config.spraySpread : this.config.spraySpread * 0.5;
    const angle = angleBase + (Math.random() - 0.5) * spread * (1 + treble);

    // Velocity
    let speed = 0;
    if (type === "main") {
      speed = 12 + bass * this.config.sensitivity * 15 + Math.random() * 5;
    } else {
      speed = 8 + bass * this.config.sensitivity * 10 + Math.random() * 3;
    }

    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const size = this.config.dropletSize * (0.5 + Math.random() * 2);
    
    // Determine color
    let colorType: "primary" | "secondary" | "accent" = "secondary";
    if (Math.random() < 0.2) colorType = "primary";
    if (Math.random() < 0.1 + treble * 0.2) colorType = "accent";

    return new FountainParticle(x, baseY, vx, vy, size, colorType);
  }

  private drawPool(colors: { primary: string; secondary: string; accent: string }, volume: number): void {
    if (!this.ctx) return;

    const centerX = this.width / 2;
    const poolY = this.height * 0.85;

    // Pool glow
    const poolGradient = this.ctx.createRadialGradient(
      centerX, poolY, 0,
      centerX, poolY, 100 + volume * 50,
    );
    poolGradient.addColorStop(0, colors.primary + "40");
    poolGradient.addColorStop(0.5, colors.secondary + "20");
    poolGradient.addColorStop(1, "transparent");

    this.ctx.fillStyle = poolGradient;
    this.ctx.beginPath();
    this.ctx.ellipse(centerX, poolY, 100 + volume * 50, 30 + volume * 15, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Pool surface line
    this.ctx.strokeStyle = colors.accent + "60";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX - 80, poolY);
    this.ctx.lineTo(centerX + 80, poolY);
    this.ctx.stroke();
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
    this.config = { ...this.config, ...config } as FountainConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
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
        max: 3,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "water",
        options: [
          { value: "water", label: "Water" },
          { value: "fire", label: "Fire" },
          { value: "magic", label: "Magic" },
          { value: "gold", label: "Gold" },
          { value: "silver", label: "Silver" },
        ],
      },
      particleCount: {
        type: "number",
        label: "Particle Count",
        default: 300,
        min: 100,
        max: 800,
        step: 50,
      },
      gravity: {
        type: "number",
        label: "Gravity",
        default: 0.3,
        min: 0.1,
        max: 0.8,
        step: 0.05,
      },
      spraySpread: {
        type: "number",
        label: "Spray Spread",
        default: 0.4,
        min: 0.1,
        max: 1,
        step: 0.05,
      },
      dropletSize: {
        type: "number",
        label: "Droplet Size",
        default: 1,
        min: 0.5,
        max: 3,
        step: 0.1,
      },
    };
  }
}

class FountainParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number = 1;
  decay: number = 0.003 + Math.random() * 0.005;
  colorType: "primary" | "secondary" | "accent";

  constructor(x: number, y: number, vx: number, vy: number, size: number, colorType: "primary" | "secondary" | "accent" = "secondary") {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.size = size;
    this.colorType = colorType;
  }

  update(gravity: number): void {
    this.vy += gravity;
    this.x += this.vx;
    this.y += this.vy;

    // Air resistance
    this.vx *= 0.99;
    this.vy *= 0.99;

    // Life decay
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D, colors: { primary: string; secondary: string; accent: string }): void {
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const angle = Math.atan2(this.vy, this.vx);
    const stretch = Math.min(3, 1 + speed * 0.2);

    ctx.globalAlpha = this.life * (0.5 + Math.min(0.5, speed * 0.1));
    ctx.fillStyle = colors[this.colorType];
    
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, this.size * stretch, this.size * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 1.0;
  }
}
