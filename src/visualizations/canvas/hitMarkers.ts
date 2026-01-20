import { BaseVisualization } from "../base";
import { VisualizationMeta, VisualizationConfig, AudioData, ConfigSchema } from "../types";

interface HitMarker {
  x: number;
  y: number;
  life: number; // 1.0 to 0
  size: number;
}

export class HitMarkers extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "hitMarkers",
    name: "Hit Markers",
    renderer: "canvas2d",
    transitionType: "cut",
  };

  private markers: HitMarker[] = [];
  private recoil: number = 0;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
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
    };
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx) return;

    const sensitivity = this.config.sensitivity || 1.0;
    const { bass } = audioData;

    this.ctx.clearRect(0, 0, this.width, this.height);
    const centerX = this.width / 2;
    const centerY = this.height / 2;

    const recoilImpulse = Math.max(0, (bass - 0.2) * sensitivity * 160);
    this.recoil = Math.max(this.recoil, recoilImpulse);

    const spawnThreshold = 0.2 / sensitivity;
    if (bass > 0.3 && Math.random() > spawnThreshold) {
      this.markers.push({
        x: centerX + (Math.random() - 0.5) * (100 + this.recoil * 2),
        y: centerY + (Math.random() - 0.5) * (100 + this.recoil * 2),
        life: 1.0,
        size: 20 + bass * 30,
      });
    }

    this.recoil *= 0.85;

    const breathing = Math.sin(Date.now() / 200) * 2;
    const crosshairSize = 20 + this.recoil + breathing;

    this.ctx.strokeStyle = "rgba(0, 255, 255, 0.8)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY - crosshairSize);
    this.ctx.lineTo(centerX, centerY - crosshairSize * 0.5);
    this.ctx.moveTo(centerX, centerY + crosshairSize);
    this.ctx.lineTo(centerX, centerY + crosshairSize * 0.5);
    this.ctx.moveTo(centerX - crosshairSize, centerY);
    this.ctx.lineTo(centerX - crosshairSize * 0.5, centerY);
    this.ctx.moveTo(centerX + crosshairSize, centerY);
    this.ctx.lineTo(centerX + crosshairSize * 0.5, centerY);
    this.ctx.stroke();

    this.ctx.fillStyle = "rgba(255, 0, 0, 0.9)";
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    this.ctx.fill();

    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.life -= 0.05;

      if (m.life <= 0) {
        this.markers.splice(i, 1);
        continue;
      }

      const alpha = m.life;
      const size = m.size;

      this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(m.x - size / 2, m.y - size / 2);
      this.ctx.lineTo(m.x - size / 4, m.y - size / 4);
      this.ctx.moveTo(m.x + size / 2, m.y - size / 2);
      this.ctx.lineTo(m.x + size / 4, m.y - size / 4);
      this.ctx.moveTo(m.x - size / 2, m.y + size / 2);
      this.ctx.lineTo(m.x - size / 4, m.y + size / 4);
      this.ctx.moveTo(m.x + size / 2, m.y + size / 2);
      this.ctx.lineTo(m.x + size / 4, m.y + size / 4);
      this.ctx.stroke();
    }
  }
}
