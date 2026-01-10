import { BaseVisualization } from "../base";
import {
  VisualizationMeta,
  VisualizationConfig,
  AudioData,
  ConfigSchema,
} from "../types";

export class BossHealthBar extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "bossHealthBar",
    name: "Boss Health Bar",
    renderer: "canvas2d",
    transitionType: "cut",
  };

  private currentHealth: number = 0;
  private shake: number = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig & { position: string } = {
      sensitivity: 1.0,
      position: "top",
      colorScheme: "bloodMoon"
  };

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
      this.resize(container.clientWidth, container.clientHeight);
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
      this.config = { ...this.config, ...config };
  }

  destroy(): void {
      if (this.canvas && this.canvas.parentElement) {
          this.canvas.parentElement.removeChild(this.canvas);
      }
      this.canvas = null;
      this.ctx = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        label: "Sensitivity",
        min: 0.1,
        max: 3.0,
        default: 1.0,
        step: 0.1,
      },
      position: {
        type: "select",
        label: "Position",
        default: "top",
        options: [
            { value: "top", label: "Top" },
            { value: "bottom", label: "Bottom" }
        ]
      }
    };
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx) return;

    const { volume, bass } = audioData;
    const { sensitivity, position } = this.config;
    
    // "Health" is inversely related to volume? Or directly?
    // Let's make it track volume for now - higher volume = full health bar
    // Or cool effect: Music "attacks" the bar?
    // Let's go with: Bar represents ENERGY.
    
    const targetHealth = Math.min(1.0, volume * sensitivity);
    // Smooth transition
    this.currentHealth += (targetHealth - this.currentHealth) * 0.1;
    
    // Shake on bass hit
    if (bass > 0.7) {
        this.shake = bass * 10;
    } else {
        this.shake *= 0.8;
    }
    
    const shakeX = (Math.random() - 0.5) * this.shake;
    const shakeY = (Math.random() - 0.5) * this.shake;

    this.ctx.clearRect(0, 0, this.width, this.height);

    const barWidth = this.width * 0.8;
    const barHeight = 40;
    const x = (this.width - barWidth) / 2 + shakeX;
    const y = position === "bottom" ? (this.height - 100) + shakeY : 60 + shakeY;

    // Draw ornate border (RPG style)
    this.ctx.strokeStyle = "rgba(200, 200, 200, 0.8)";
    this.ctx.lineWidth = 4;
    this.ctx.strokeRect(x, y, barWidth, barHeight);
    
    // Draw Name Plate
    this.ctx.font = "bold 24px Arial";
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    this.ctx.textAlign = "center";
    this.ctx.fillText("THE DROP", this.width / 2 + shakeX, y - 10);

    // Draw Health Fill
    // Layer 1: Background (Damage taken)
    this.ctx.fillStyle = "rgba(50, 0, 0, 0.5)";
    this.ctx.fillRect(x + 2, y + 2, barWidth - 4, barHeight - 4);
    
    // Layer 2: Actual Health (Red/Purple gradient)
    const fillWidth = (barWidth - 4) * this.currentHealth;
    
    if (fillWidth > 0) {
        const grad = this.ctx.createLinearGradient(x, y, x, y + barHeight);
        grad.addColorStop(0, "#ff4444");
        grad.addColorStop(0.5, "#ff0000");
        grad.addColorStop(1, "#880000");
        
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(x + 2, y + 2, fillWidth, barHeight - 4);
        
        // Shine/Gloss
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        this.ctx.fillRect(x + 2, y + 2, fillWidth, barHeight / 2);
    }
  }
}
