import { BaseVisualization } from "../base";
import { VisualizationMeta, VisualizationConfig, AudioData, ConfigSchema } from "../types";

export class HexShield extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "hexShield",
    name: "Hex Shield",
    renderer: "canvas2d",
    transitionType: "cut",
  };

  private hexes: { x: number; y: number; active: number; freqIndex: number }[] = [];
  private hexSize: number = 40;
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

  initGrid(): void {
    this.hexes = [];
    const cols = Math.ceil(this.width / (this.hexSize * 1.5));
    const rows = Math.ceil(this.height / (this.hexSize * Math.sqrt(3)));

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const xOffset = r % 2 === 0 ? 0 : this.hexSize * 0.75;
        const x = c * this.hexSize * 1.5 + xOffset;
        const y = r * this.hexSize * Math.sqrt(3) * 0.5;

        const distFromCenter = Math.hypot(x - this.width / 2, y - this.height / 2);
        if (distFromCenter > 150) {
          const freqIndex = Math.floor(Math.random() * 64);
          this.hexes.push({ x, y, active: 0.1, freqIndex });
        }
      }
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initGrid();
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
        label: "Impact",
        min: 0.02,
        max: 1.2,
        default: 1.0,
        step: 0.02,
      },
    };
  }

  drawHex(x: number, y: number, r: number): void {
    if (!this.ctx) return;
    this.ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
      const px = x + r * Math.cos(angle);
      const py = y + r * Math.sin(angle);
      if (i === 0) {
        this.ctx.moveTo(px, py);
      } else {
        this.ctx.lineTo(px, py);
      }
    }
    this.ctx.closePath();
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx) return;

    const { sensitivity } = this.config;
    const { bass, frequencyData } = audioData;

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Reduced impact by 50%
    const sensitivityFactor = Math.pow(sensitivity / 2, 2) * 0.5;

    this.hexes.forEach((hex) => {
      const decayRate = 0.85 + sensitivityFactor * 0.1; // 0.85-0.95 range
      hex.active = Math.max(0, hex.active * decayRate);

      const val = (frequencyData[hex.freqIndex % frequencyData.length] || 0) / 255;
      const threshold = 0.4 - sensitivityFactor * 0.25; // 0.4 at low sens, 0.15 at high sens

      if (val > threshold) {
        hex.active = Math.min(1.0, hex.active + (val - threshold) * sensitivityFactor * 0.8);
      }

      if (bass > 0.7 - sensitivityFactor * 0.1 && Math.random() > 0.98 - sensitivityFactor * 0.05) {
        hex.active = Math.min(1.0, hex.active + 0.25 * sensitivityFactor);
      }

      this.ctx!.strokeStyle = `rgba(0, 150, 255, ${0.1 + hex.active * 0.8})`;
      this.ctx!.lineWidth = 1 + hex.active * 2;
      this.ctx!.fillStyle = `rgba(0, 200, 255, ${hex.active * 0.15})`;

      this.drawHex(hex.x, hex.y, this.hexSize);
      this.ctx!.stroke();
      if (hex.active > 0.01) {
        this.ctx!.fill();
      }
    });
  }
}
