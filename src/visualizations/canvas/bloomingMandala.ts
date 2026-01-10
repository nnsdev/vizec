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

interface BloomingMandalaConfig extends VisualizationConfig {
  petals: number;
  layers: number;
  rotationSpeed: number;
  colorScheme: string;
}

export class BloomingMandalaVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "bloomingMandala",
    name: "Blooming Mandala",
    author: "Vizec",
    description: "Geometric flower that pulses and rotates",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: BloomingMandalaConfig = {
    sensitivity: 1.0,
    petals: 12,
    layers: 4,
    rotationSpeed: 0.2,
    colorScheme: "nature",
  };
  private width = 0;
  private height = 0;
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

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, petals, layers, rotationSpeed } = this.config;
    const { volume, bass, frequencyData } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45;

    // Rotation increases with bass
    const rotation = this.time * rotationSpeed + (bass * sensitivity * 0.5);

    // Draw layers from outside in (or inside out?)
    // Let's do inside out so outer petals cover inner? No, other way around.
    
    // We map frequency bands to layers.
    // Inner layers = high freq? Outer = low freq?
    // Let's try:
    // Center: Treble/High Mids
    // Outer: Bass/Low Mids

    for (let l = 0; l < layers; l++) {
        this.ctx.save();
        this.ctx.translate(centerX, centerY);
        
        // Each layer rotates slightly differently
        const layerDir = l % 2 === 0 ? 1 : -1;
        this.ctx.rotate(rotation * layerDir + (l * 0.2));

        // Get audio value for this layer
        // Distribute 0-100 across layers?
        const freqIndex = Math.floor((l / layers) * 20); // First 20 bins (bass/low-mid)
        const val = frequencyData[freqIndex] || 0;
        const intensity = (val / 255) * sensitivity;

        const layerRadius = (maxRadius / layers) * (l + 1) * (1 + intensity * 0.2);
        
        // Color interpolation
        // Inner = Start color, Outer = End color
        const colorRatio = l / (layers - 1);
        this.ctx.fillStyle = l % 2 === 0 ? colors.start : colors.end;
        this.ctx.fillStyle = colorRatio < 0.5 ? colors.start : colors.end; // Simplified
        this.ctx.globalAlpha = 0.2 + (intensity * 0.4); // More transparent base

        // Draw Petals
        const petalCount = petals + (l * 2); // More petals on outer layers
        const angleStep = (Math.PI * 2) / petalCount;

        for (let p = 0; p < petalCount; p++) {
            this.ctx.save();
            this.ctx.rotate(p * angleStep);
            this.ctx.beginPath();
            
            // Petal Shape (Ellipse-ish)
            // x, y, radiusX, radiusY, rotation, startAngle, endAngle
            // We draw at radius distance
            
            const petalSize = (maxRadius / layers) * 0.8;
            const stretch = 1.0 + (volume * 0.5); // Pulse with volume
            
            this.ctx.ellipse(
                layerRadius * 0.6, // distance from center
                0, 
                petalSize * stretch, // length 
                petalSize * 0.4, // width
                0, 
                0, 
                Math.PI * 2
            );
            
            this.ctx.fill();
            this.ctx.restore();
        }

        this.ctx.restore();
    }
    
    // Center glow
    this.ctx.globalAlpha = 0.4; // Force transparency for glow
    const centerGlow = volume * sensitivity * 50;
    const grad = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, centerGlow);
    grad.addColorStop(0, colors.glow || colors.start);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = 1.0; // Reset
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
    this.config = { ...this.config, ...config } as BloomingMandalaConfig;
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
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "nature",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      petals: {
        type: "number",
        label: "Petal Count",
        default: 12,
        min: 4,
        max: 32,
        step: 1,
      },
      layers: {
        type: "number",
        label: "Layers",
        default: 4,
        min: 2,
        max: 8,
        step: 1,
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 0.2,
        min: 0.0,
        max: 1.0,
        step: 0.1,
      },
    };
  }
}
