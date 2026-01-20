import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface FireEscapeConfig extends VisualizationConfig {
  colorScheme: string;
  windowGlow: number;
  lightFlicker: number;
}

interface Window {
  x: number;
  y: number;
  width: number;
  height: number;
  lit: boolean;
  brightness: number;
  flickerPhase: number;
  color: string;
}

interface LightSource {
  x: number;
  y: number;
  brightness: number;
  phase: number;
}

export class FireEscapeVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "fireEscape",
    name: "Fire Escape",
    author: "Vizec",
    description: "Building silhouette with fire escape and glowing windows",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: FireEscapeConfig = {
    sensitivity: 1.0,
    colorScheme: "warmSunset",
    windowGlow: 1.0,
    lightFlicker: 0.5,
  };

  private width = 0;
  private height = 0;
  private windows: Window[] = [];
  private lights: LightSource[] = [];
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
    this.initBuilding();
  }

  private initBuilding(): void {
    this.windows = [];
    this.lights = [];

    const buildingX = this.width * 0.3;
    const buildingWidth = this.width * 0.4;
    const buildingTop = this.height * 0.1;

    const windowColors = ["#ffcc66", "#ff9944", "#ffaa55", "#ffe599", "#ffbb77"];
    const floors = 6;
    const windowsPerFloor = 4;

    const windowWidth = buildingWidth / (windowsPerFloor + 1) - 20;
    const windowHeight = (this.height - buildingTop) / (floors + 1) - 30;

    for (let floor = 0; floor < floors; floor++) {
      const y = buildingTop + 40 + floor * (windowHeight + 30);

      for (let w = 0; w < windowsPerFloor; w++) {
        const x = buildingX + 30 + w * (windowWidth + 20);

        this.windows.push({
          x,
          y,
          width: windowWidth,
          height: windowHeight,
          lit: Math.random() > 0.3,
          brightness: 0.5 + Math.random() * 0.5,
          flickerPhase: Math.random() * Math.PI * 2,
          color: windowColors[Math.floor(Math.random() * windowColors.length)],
        });
      }

      // Fire escape platform light
      if (floor % 2 === 0) {
        this.lights.push({
          x: buildingX - 30,
          y: y + windowHeight / 2,
          brightness: 0.7,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble } = audioData;
    const { sensitivity, colorScheme, windowGlow, lightFlicker } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    const buildingX = this.width * 0.3;
    const buildingWidth = this.width * 0.4;
    const buildingTop = this.height * 0.1;

    // Building silhouette
    this.ctx.fillStyle = "rgba(25, 25, 35, 0.9)";
    this.ctx.fillRect(buildingX, buildingTop, buildingWidth, this.height - buildingTop);

    // Draw windows first (behind fire escape)
    for (const win of this.windows) {
      win.flickerPhase += deltaTime * (3 + treble * 5);

      if (!win.lit) {
        // Dark window
        this.ctx.fillStyle = "rgba(15, 15, 25, 0.9)";
        this.ctx.fillRect(win.x, win.y, win.width, win.height);
        continue;
      }

      // Flickering calculation
      let flicker = 1;
      if (Math.random() < lightFlicker * 0.01) {
        flicker = 0.3 + Math.random() * 0.4;
      } else {
        flicker = 0.9 + Math.sin(win.flickerPhase) * 0.1;
      }

      const brightness = win.brightness * flicker * (0.7 + mid * 0.3 * sensitivity) * windowGlow;

      // Window glow
      this.ctx.shadowColor = win.color;
      this.ctx.shadowBlur = 25 + 15 * brightness;

      // Window light (more opaque)
      const gradient = this.ctx.createLinearGradient(win.x, win.y, win.x, win.y + win.height);
      gradient.addColorStop(0, `rgba(255, 220, 150, ${Math.min(1, brightness * 1.2 + 0.3)})`);
      gradient.addColorStop(0.5, win.color);
      gradient.addColorStop(1, `rgba(255, 180, 100, ${Math.min(1, brightness + 0.2)})`);

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(win.x, win.y, win.width, win.height);

      // Window frame
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = "rgba(40, 40, 50, 0.8)";
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(win.x, win.y, win.width, win.height);

      // Window dividers
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(win.x + win.width / 2, win.y);
      this.ctx.lineTo(win.x + win.width / 2, win.y + win.height);
      this.ctx.moveTo(win.x, win.y + win.height / 2);
      this.ctx.lineTo(win.x + win.width, win.y + win.height / 2);
      this.ctx.stroke();

      // Occasional silhouette in window
      if (bass > 0.6 && Math.random() < 0.01) {
        this.ctx.fillStyle = `rgba(0, 0, 0, ${0.3 + bass * 0.3})`;
        const silX = win.x + win.width * 0.3;
        const silY = win.y + win.height * 0.3;
        // Simple head/shoulders silhouette
        this.ctx.beginPath();
        this.ctx.arc(silX, silY, 8, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillRect(silX - 12, silY + 8, 24, 20);
      }
    }

    // Fire escape structure
    const escapeX = buildingX - 60;
    const escapeWidth = 80;

    this.ctx.strokeStyle = "rgba(60, 60, 70, 0.85)";
    this.ctx.lineWidth = 4;

    // Vertical rails
    this.ctx.beginPath();
    this.ctx.moveTo(escapeX, buildingTop + 20);
    this.ctx.lineTo(escapeX, this.height);
    this.ctx.moveTo(escapeX + escapeWidth, buildingTop + 20);
    this.ctx.lineTo(escapeX + escapeWidth, this.height);
    this.ctx.stroke();

    // Platforms and railings
    const floors = 6;
    for (let floor = 0; floor < floors; floor++) {
      const platformY = buildingTop + 40 + floor * ((this.height - buildingTop - 40) / floors);

      // Platform
      this.ctx.fillStyle = "rgba(50, 50, 60, 0.8)";
      this.ctx.fillRect(escapeX - 10, platformY, escapeWidth + 20, 8);

      // Grating pattern
      this.ctx.strokeStyle = "rgba(40, 40, 50, 0.6)";
      this.ctx.lineWidth = 1;
      for (let gx = escapeX; gx < escapeX + escapeWidth; gx += 6) {
        this.ctx.beginPath();
        this.ctx.moveTo(gx, platformY);
        this.ctx.lineTo(gx, platformY + 8);
        this.ctx.stroke();
      }

      // Railing
      this.ctx.strokeStyle = "rgba(60, 60, 70, 0.8)";
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(escapeX - 10, platformY - 30);
      this.ctx.lineTo(escapeX - 10, platformY);
      this.ctx.moveTo(escapeX + escapeWidth + 10, platformY - 30);
      this.ctx.lineTo(escapeX + escapeWidth + 10, platformY);
      this.ctx.stroke();

      // Top rail
      this.ctx.beginPath();
      this.ctx.moveTo(escapeX - 10, platformY - 30);
      this.ctx.lineTo(escapeX + escapeWidth + 10, platformY - 30);
      this.ctx.stroke();

      // Stairs to next floor
      if (floor < floors - 1) {
        const nextY = buildingTop + 40 + (floor + 1) * ((this.height - buildingTop - 40) / floors);
        const stairStartX = floor % 2 === 0 ? escapeX : escapeX + escapeWidth - 20;
        const stairDir = floor % 2 === 0 ? 1 : -1;

        this.ctx.strokeStyle = "rgba(55, 55, 65, 0.7)";
        this.ctx.lineWidth = 2;
        const steps = 8;
        for (let s = 0; s < steps; s++) {
          const sy = platformY + (nextY - platformY) * (s / steps);
          const sx = stairStartX + stairDir * (escapeWidth - 40) * (s / steps);
          this.ctx.beginPath();
          this.ctx.moveTo(sx, sy);
          this.ctx.lineTo(sx + 20, sy);
          this.ctx.stroke();
        }
      }
    }

    // Fire escape lights
    for (const light of this.lights) {
      light.phase += deltaTime * 2;
      const flicker = lightFlicker > 0 && Math.random() < lightFlicker * 0.02 ? 0.4 : 1;
      const brightness = light.brightness * flicker * (0.6 + bass * 0.4 * sensitivity);

      this.ctx.shadowColor = colors.end;
      this.ctx.shadowBlur = 15 * brightness;
      this.ctx.fillStyle = colors.end;
      this.ctx.globalAlpha = brightness;
      this.ctx.beginPath();
      this.ctx.arc(light.x, light.y, 5, 0, Math.PI * 2);
      this.ctx.fill();

      // Light cone
      const coneGrad = this.ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, 60);
      coneGrad.addColorStop(0, `rgba(255, 200, 150, ${brightness * 0.3})`);
      coneGrad.addColorStop(1, "rgba(255, 200, 150, 0)");
      this.ctx.fillStyle = coneGrad;
      this.ctx.beginPath();
      this.ctx.arc(light.x, light.y, 60, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.globalAlpha = 1;
    }

    this.ctx.shadowBlur = 0;

    // Building edge highlight on treble
    if (treble > 0.3) {
      this.ctx.strokeStyle = `rgba(${this.hexToRgb(colors.start)}, ${treble * 0.3})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(buildingX, buildingTop);
      this.ctx.lineTo(buildingX, this.height);
      this.ctx.moveTo(buildingX + buildingWidth, buildingTop);
      this.ctx.lineTo(buildingX + buildingWidth, this.height);
      this.ctx.stroke();
    }
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

    this.initBuilding();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as FireEscapeConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.windows = [];
    this.lights = [];
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
        default: "warmSunset",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      windowGlow: {
        type: "number",
        label: "Window Glow",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      lightFlicker: {
        type: "number",
        label: "Light Flicker",
        default: 0.5,
        min: 0,
        max: 1.0,
        step: 0.1,
      },
    };
  }
}
