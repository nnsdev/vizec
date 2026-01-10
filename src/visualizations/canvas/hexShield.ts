import { BaseVisualization } from "../base";
import {
  VisualizationMeta,
  VisualizationConfig,
  AudioData,
  ConfigSchema,
} from "../types";

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
      colorScheme: "cyanMagenta"
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

  initGrid() {
      // Create a honeycomb grid covering the screen
      this.hexes = [];
      const cols = Math.ceil(this.width / (this.hexSize * 1.5));
      const rows = Math.ceil(this.height / (this.hexSize * Math.sqrt(3)));
      
      for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
              const xOffset = (r % 2 === 0) ? 0 : this.hexSize * 0.75;
              const x = c * this.hexSize * 1.5 + xOffset;
              const y = r * this.hexSize * Math.sqrt(3) * 0.5;
              
              // Only keep edges? Or fill all?
              // Let's keep edges + random scatter to be "transparent"
              const distFromCenter = Math.hypot(x - this.width/2, y - this.height/2);
              if (distFromCenter > 150) { // Slightly smaller clear zone
                  // Assign random frequency bin to avoid "left-side" clustering
                  const freqIndex = Math.floor(Math.random() * 64); // Assume at least 64 bins
                  this.hexes.push({ x, y, active: 0.1, freqIndex }); // Start with slight activity
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
        min: 0.1,
        max: 3.0,
        default: 1.0,
        step: 0.1,
      },
    };
  }

  drawHex(x: number, y: number, r: number) {
      if (!this.ctx) return;
      this.ctx.beginPath();
      for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i;
          const px = x + r * Math.cos(angle);
          const py = y + r * Math.sin(angle);
          if (i === 0) this.ctx.moveTo(px, py);
          else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx) return;

    const { sensitivity } = this.config;
    const { bass, frequencyData } = audioData;
    
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Randomly activate hexes based on audio
    // Map frequency bins to grid roughly?
    
    this.hexes.forEach((hex) => {
        // Decay
        hex.active = Math.max(0, hex.active * 0.92);
        
        // Trigger
        const val = (frequencyData[hex.freqIndex % frequencyData.length] || 0) / 255;
        
        // Lower threshold for more activity
        // Was 0.3, lowering to 0.15 to make it way more responsive
        const threshold = 0.15 / sensitivity;
        
        if (val > threshold) {
            // Boost the gain so even small signals light it up
            hex.active = Math.min(1.0, hex.active + (val - threshold) * sensitivity * 2.0);
        }
        
        // Bass slam activates outer ring (distance based?)
        // Lowered from 0.7 to 0.4 for way more slams
        if (bass > 0.4 && Math.random() > 0.85) {
             hex.active = 1.0;
        }

        // Always draw faint outline for structure
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
