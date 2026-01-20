import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface ManholeSteamConfig extends VisualizationConfig {
  colorScheme: string;
  steamDensity: number;
  windSpeed: number;
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
}

interface Manhole {
  x: number;
  y: number;
  radius: number;
  steamRate: number;
  particles: SteamParticle[];
}

export class ManholeSteamVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "manholeSteam",
    name: "Manhole Steam",
    author: "Vizec",
    description: "Steam rising from city manholes",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: ManholeSteamConfig = {
    sensitivity: 1.0,
    colorScheme: "arctic",
    steamDensity: 1.0,
    windSpeed: 0.5,
  };

  private width = 0;
  private height = 0;
  private manholes: Manhole[] = [];
  private time = 0;
  private windAngle = 0;

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
    this.initManholes();
  }

  private initManholes(): void {
    this.manholes = [];

    // Place manholes along bottom portion of screen
    const manholeCount = 3 + Math.floor(this.width / 500);
    for (let i = 0; i < manholeCount; i++) {
      const x = (this.width / (manholeCount + 1)) * (i + 1) + (Math.random() - 0.5) * 100;
      const y = this.height * 0.75 + Math.random() * (this.height * 0.2);

      this.manholes.push({
        x,
        y,
        radius: 30 + Math.random() * 20,
        steamRate: 0.5 + Math.random() * 0.5,
        particles: [],
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, steamDensity, windSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Wind variation
    this.windAngle = Math.sin(this.time * 0.3) * 0.5;

    for (const manhole of this.manholes) {
      // Draw manhole cover
      this.drawManholeCover(manhole, bass);

      // Spawn steam particles based on audio
      const spawnRate = manhole.steamRate * steamDensity * (0.5 + volume * sensitivity);
      const particlesToSpawn = Math.floor(spawnRate * 10 * deltaTime * 60);

      for (let i = 0; i < particlesToSpawn; i++) {
        this.spawnSteamParticle(manhole);
      }

      // Update and draw particles
      for (let i = manhole.particles.length - 1; i >= 0; i--) {
        const p = manhole.particles[i];

        // Physics with wind
        const windForce = windSpeed * (1 + treble * sensitivity);
        p.vx += Math.cos(this.windAngle) * windForce * 0.02;
        p.vy -= 0.05 + bass * 0.05 * sensitivity; // Rise up

        p.x += p.vx * deltaTime * 60;
        p.y += p.vy * deltaTime * 60;

        // Expand as it rises
        p.size += deltaTime * 20;

        // Fade out
        p.life -= deltaTime;
        p.alpha = (p.life / p.maxLife) * 0.4;

        if (p.life <= 0 || p.y < -p.size) {
          manhole.particles.splice(i, 1);
          continue;
        }

        // Draw steam particle
        const gradient = this.ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        gradient.addColorStop(0, `rgba(200, 210, 220, ${p.alpha})`);
        gradient.addColorStop(0.5, `rgba(180, 190, 200, ${p.alpha * 0.5})`);
        gradient.addColorStop(1, "rgba(160, 170, 180, 0)");

        this.ctx!.fillStyle = gradient;
        this.ctx!.beginPath();
        this.ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx!.fill();
      }

      // Draw glow from below on bass
      if (bass > 0.4) {
        const glowGradient = this.ctx.createRadialGradient(
          manhole.x,
          manhole.y,
          0,
          manhole.x,
          manhole.y,
          manhole.radius * 2,
        );
        glowGradient.addColorStop(
          0,
          `rgba(${this.hexToRgb(colors.end)}, ${bass * 0.3 * sensitivity})`,
        );
        glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        this.ctx.fillStyle = glowGradient;
        this.ctx.fillRect(
          manhole.x - manhole.radius * 2,
          manhole.y - manhole.radius * 2,
          manhole.radius * 4,
          manhole.radius * 4,
        );
      }
    }

    // Add distant steam wisps on mid frequencies
    if (mid > 0.3) {
      this.ctx.globalAlpha = mid * 0.2;
      for (let i = 0; i < 3; i++) {
        const wx = ((this.time * 30 * (i + 1) + i * 500) % (this.width + 200)) - 100;
        const wy = this.height * 0.6 + Math.sin(this.time + i) * 50;
        const wSize = 80 + Math.sin(this.time * 2 + i) * 20;

        const wispGrad = this.ctx.createRadialGradient(wx, wy, 0, wx, wy, wSize);
        wispGrad.addColorStop(0, "rgba(180, 190, 200, 0.3)");
        wispGrad.addColorStop(1, "rgba(160, 170, 180, 0)");
        this.ctx.fillStyle = wispGrad;
        this.ctx.beginPath();
        this.ctx.arc(wx, wy, wSize, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1;
    }
  }

  private drawManholeCover(manhole: Manhole, bass: number): void {
    if (!this.ctx) return;

    const { x, y, radius } = manhole;

    // Shadow/depth
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.beginPath();
    this.ctx.ellipse(x, y + 5, radius, radius * 0.3, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Cover surface
    this.ctx.fillStyle = "rgba(50, 55, 60, 0.8)";
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Cover pattern (grate lines)
    this.ctx.strokeStyle = "rgba(30, 35, 40, 0.8)";
    this.ctx.lineWidth = 2;

    // Horizontal lines
    for (let ly = -radius + 8; ly < radius; ly += 8) {
      const halfWidth = Math.sqrt(radius * radius - ly * ly);
      this.ctx.beginPath();
      this.ctx.moveTo(x - halfWidth, y + ly);
      this.ctx.lineTo(x + halfWidth, y + ly);
      this.ctx.stroke();
    }

    // Glow from gaps on bass
    if (bass > 0.3) {
      this.ctx.globalAlpha = bass * 0.5;
      this.ctx.fillStyle = "rgba(255, 200, 150, 0.3)";
      for (let ly = -radius + 8; ly < radius; ly += 8) {
        const halfWidth = Math.sqrt(radius * radius - ly * ly);
        this.ctx.fillRect(x - halfWidth, y + ly - 1, halfWidth * 2, 2);
      }
      this.ctx.globalAlpha = 1;
    }

    // Border
    this.ctx.strokeStyle = "rgba(70, 75, 80, 0.8)";
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private spawnSteamParticle(manhole: Manhole): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * manhole.radius * 0.7;

    manhole.particles.push({
      x: manhole.x + Math.cos(angle) * dist,
      y: manhole.y + Math.sin(angle) * dist * 0.3,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1 - Math.random() * 2,
      size: 10 + Math.random() * 20,
      alpha: 0.4,
      life: 2 + Math.random() * 2,
      maxLife: 4,
    });
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return "255, 255, 255";
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initManholes();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as ManholeSteamConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.manholes = [];
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
        default: "arctic",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      steamDensity: {
        type: "number",
        label: "Steam Density",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      windSpeed: {
        type: "number",
        label: "Wind Speed",
        default: 0.5,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
