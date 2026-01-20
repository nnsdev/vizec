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

interface VendingMachineConfig extends VisualizationConfig {
  colorScheme: string;
  flickerAmount: number;
  glowIntensity: number;
}

interface Product {
  row: number;
  col: number;
  color: string;
  brightness: number;
  flickerPhase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export class VendingMachineVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "vendingMachine",
    name: "Vending Machine",
    author: "Vizec",
    description: "Late night vending machine glow with flickering lights",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: VendingMachineConfig = {
    sensitivity: 1.0,
    colorScheme: "neonCity",
    flickerAmount: 0.5,
    glowIntensity: 1.0,
  };

  private width = 0;
  private height = 0;
  private products: Product[] = [];
  private particles: Particle[] = [];
  private time = 0;
  private lastBass = 0;
  private machineFlicker = 1;

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
    this.initProducts();
  }

  private initProducts(): void {
    this.products = [];
    const colors = ["#ff6b6b", "#4ecdc4", "#ffe66d", "#95e1d3", "#f38181", "#aa96da"];

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        this.products.push({
          row,
          col,
          color: colors[Math.floor(Math.random() * colors.length)],
          brightness: 0.7 + Math.random() * 0.3,
          flickerPhase: Math.random() * Math.PI * 2,
        });
      }
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, flickerAmount, glowIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Machine dimensions
    const machineWidth = Math.min(this.width * 0.4, 300);
    const machineHeight = Math.min(this.height * 0.8, 500);
    const machineX = (this.width - machineWidth) / 2;
    const machineY = (this.height - machineHeight) / 2;

    // Overall machine flicker
    if (Math.random() < flickerAmount * 0.02) {
      this.machineFlicker = 0.6 + Math.random() * 0.4;
    } else {
      this.machineFlicker += (1 - this.machineFlicker) * 0.1;
    }

    // Machine glow
    const glowRadius = 150 + bass * 50 * sensitivity;
    const machineGlow = this.ctx.createRadialGradient(
      machineX + machineWidth / 2, machineY + machineHeight / 2, 0,
      machineX + machineWidth / 2, machineY + machineHeight / 2, glowRadius
    );
    machineGlow.addColorStop(0, `rgba(${this.hexToRgb(colors.start)}, ${0.3 * glowIntensity * this.machineFlicker})`);
    machineGlow.addColorStop(0.5, `rgba(${this.hexToRgb(colors.mid)}, ${0.15 * glowIntensity * this.machineFlicker})`);
    machineGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = machineGlow;
    this.ctx.fillRect(machineX - glowRadius, machineY - glowRadius, machineWidth + glowRadius * 2, machineHeight + glowRadius * 2);

    // Machine body (semi-transparent)
    this.ctx.fillStyle = `rgba(30, 35, 45, 0.85)`;
    this.ctx.fillRect(machineX, machineY, machineWidth, machineHeight);

    // Machine border
    this.ctx.strokeStyle = `rgba(80, 90, 110, 0.7)`;
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(machineX, machineY, machineWidth, machineHeight);

    // Display window
    const windowMargin = 20;
    const windowX = machineX + windowMargin;
    const windowY = machineY + windowMargin;
    const windowW = machineWidth - windowMargin * 2;
    const windowH = machineHeight * 0.65;

    // Window glass effect
    this.ctx.fillStyle = `rgba(20, 25, 35, 0.9)`;
    this.ctx.fillRect(windowX, windowY, windowW, windowH);

    // Window glow from inside
    this.ctx.shadowColor = colors.start;
    this.ctx.shadowBlur = 20 * glowIntensity * this.machineFlicker;
    this.ctx.strokeStyle = colors.start;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(windowX, windowY, windowW, windowH);
    this.ctx.shadowBlur = 0;

    // Products grid
    const gridCols = 4;
    const gridRows = 5;
    const cellW = windowW / gridCols;
    const cellH = windowH / gridRows;

    for (const product of this.products) {
      product.flickerPhase += deltaTime * (5 + treble * 10);

      const flicker = Math.sin(product.flickerPhase) * 0.2 * flickerAmount + 1;
      const brightness = product.brightness * flicker * this.machineFlicker * (0.7 + mid * 0.3 * sensitivity);

      const px = windowX + product.col * cellW + cellW / 2;
      const py = windowY + product.row * cellH + cellH / 2;

      // Product glow
      this.ctx.shadowColor = product.color;
      this.ctx.shadowBlur = 10 * glowIntensity * brightness;

      // Product container
      this.ctx.fillStyle = product.color;
      this.ctx.globalAlpha = brightness * 0.8;
      this.ctx.beginPath();

      // Can shape
      const canWidth = cellW * 0.5;
      const canHeight = cellH * 0.7;
      this.ctx.roundRect(px - canWidth / 2, py - canHeight / 2, canWidth, canHeight, 5);
      this.ctx.fill();

      // Label
      this.ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.5})`;
      this.ctx.fillRect(px - canWidth / 2 + 3, py - 5, canWidth - 6, 10);

      this.ctx.globalAlpha = 1;
    }

    this.ctx.shadowBlur = 0;

    // Price panel
    const panelY = windowY + windowH + 15;

    // Digital display
    const displayH = 40;
    this.ctx.fillStyle = `rgba(0, 0, 0, 0.9)`;
    this.ctx.fillRect(windowX, panelY, windowW, displayH);

    // Price text (reacts to volume)
    const priceGlow = 0.7 + volume * 0.3 * sensitivity;
    this.ctx.shadowColor = colors.end;
    this.ctx.shadowBlur = 8 * glowIntensity * priceGlow * this.machineFlicker;
    this.ctx.fillStyle = colors.end;
    this.ctx.font = "bold 24px monospace";
    this.ctx.textAlign = "center";
    this.ctx.globalAlpha = priceGlow * this.machineFlicker;
    this.ctx.fillText("INSERT COIN", machineX + machineWidth / 2, panelY + 28);
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;

    // Coin slot
    const slotX = machineX + machineWidth / 2 - 15;
    const slotY = panelY + displayH + 20;
    this.ctx.fillStyle = `rgba(40, 45, 55, 0.9)`;
    this.ctx.fillRect(slotX, slotY, 30, 50);
    this.ctx.fillStyle = `rgba(10, 10, 15, 0.9)`;
    this.ctx.fillRect(slotX + 10, slotY + 10, 10, 4);

    // Keypad
    const keypadX = machineX + machineWidth / 2 + 30;
    const keypadY = slotY;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const kx = keypadX + c * 18;
        const ky = keypadY + r * 12;
        const keyGlow = Math.sin(this.time * 3 + r + c) * 0.3 + 0.7;

        this.ctx.fillStyle = `rgba(50, 55, 65, ${0.8 * keyGlow})`;
        this.ctx.fillRect(kx, ky, 14, 10);

        // Key light
        if (treble > 0.5 && Math.random() < 0.1) {
          this.ctx.shadowColor = colors.mid;
          this.ctx.shadowBlur = 5;
          this.ctx.fillStyle = colors.mid;
          this.ctx.globalAlpha = 0.5;
          this.ctx.fillRect(kx + 2, ky + 2, 10, 6);
          this.ctx.globalAlpha = 1;
          this.ctx.shadowBlur = 0;
        }
      }
    }

    // Dispensing area
    const dispenserY = machineY + machineHeight - 60;
    this.ctx.fillStyle = `rgba(15, 18, 25, 0.9)`;
    this.ctx.fillRect(windowX, dispenserY, windowW, 45);

    // Dispenser glow
    const dispenserGlow = 0.3 + bass * 0.5 * sensitivity;
    this.ctx.shadowColor = colors.start;
    this.ctx.shadowBlur = 10 * glowIntensity * dispenserGlow * this.machineFlicker;
    this.ctx.strokeStyle = colors.start;
    this.ctx.lineWidth = 1;
    this.ctx.globalAlpha = dispenserGlow * this.machineFlicker;
    this.ctx.strokeRect(windowX, dispenserY, windowW, 45);
    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;

    // Bass hit effect - dispense animation
    const bassHit = bass > 0.7 && bass > this.lastBass + 0.15;
    this.lastBass = bass;

    if (bassHit) {
      // Spawn particles
      for (let i = 0; i < 10; i++) {
        this.particles.push({
          x: machineX + machineWidth / 2 + (Math.random() - 0.5) * windowW,
          y: dispenserY,
          vx: (Math.random() - 0.5) * 3,
          vy: Math.random() * 3 + 1,
          life: 1,
          color: colors.end,
        });
      }
    }

    // Update and draw particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= deltaTime * 2;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.globalAlpha = p.life;
      this.ctx.shadowColor = p.color;
      this.ctx.shadowBlur = 8;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as VendingMachineConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.products = [];
    this.particles = [];
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
        default: "neonCity",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      flickerAmount: {
        type: "number",
        label: "Flicker Amount",
        default: 0.5,
        min: 0,
        max: 1.0,
        step: 0.1,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
