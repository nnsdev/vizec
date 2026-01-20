import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

type ShapeType = "triangle" | "square" | "pentagon" | "hexagon";

interface GeometricPulseConfig extends VisualizationConfig {
  shape: ShapeType;
  layers: number;
  rotationSpeed: number;
  pulseIntensity: number;
}

interface Layer {
  rotation: number;
  baseRadius: number;
  rotationDirection: number;
}

export class GeometricPulseVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "geometricPulse",
    name: "Geometric Pulse",
    author: "Vizec",
    description: "Central rotating geometric shape with nested layers that pulse with audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: GeometricPulseConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    shape: "hexagon",
    layers: 5,
    rotationSpeed: 1.0,
    pulseIntensity: 0.8,
  };
  private width = 0;
  private height = 0;
  private layers: Layer[] = [];
  private time = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private glowIntensity = 0;
  private beatDecay = 0;

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

    // Initial resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    // Initialize layers
    this.initLayers();
  }

  private initLayers(): void {
    this.layers = [];
    const maxRadius = Math.min(this.width, this.height) * 0.35;

    for (let i = 0; i < this.config.layers; i++) {
      const t = i / (this.config.layers - 1);
      this.layers.push({
        rotation: (i * Math.PI) / this.config.layers,
        baseRadius: maxRadius * (0.2 + t * 0.8),
        rotationDirection: i % 2 === 0 ? 1 : -1,
      });
    }
  }

  private getVertexCount(): number {
    switch (this.config.shape) {
      case "triangle":
        return 3;
      case "square":
        return 4;
      case "pentagon":
        return 5;
      case "hexagon":
        return 6;
      default:
        return 6;
    }
  }

  private drawShape(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    rotation: number,
    vertexCount: number,
    vertexExtensions: number[],
    filled: boolean = false,
  ): void {
    ctx.beginPath();

    for (let i = 0; i <= vertexCount; i++) {
      const idx = i % vertexCount;
      const angle = (idx / vertexCount) * Math.PI * 2 - Math.PI / 2 + rotation;
      const extension = vertexExtensions[idx] || 0;
      const r = radius + extension;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();

    if (filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass, mid, volume } = audioData;
    const { rotationSpeed, pulseIntensity, colorScheme, sensitivity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Update time
    this.time += deltaTime;

    // Smooth audio values
    const smoothing = 0.85;
    this.smoothedBass = this.smoothedBass * smoothing + bass * (1 - smoothing);
    this.smoothedMid = this.smoothedMid * smoothing + mid * (1 - smoothing);

    // Beat detection for glow
    const beatThreshold = 0.6;
    if (bass > beatThreshold && this.beatDecay <= 0) {
      this.glowIntensity = 1.0;
      this.beatDecay = 0.15; // Cooldown
    }
    this.beatDecay -= deltaTime;
    this.glowIntensity *= 0.92; // Decay glow

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const vertexCount = this.getVertexCount();

    // Calculate base pulse from bass
    const bassPulse = this.smoothedBass * pulseIntensity * sensitivity;
    const midRotation = this.smoothedMid * rotationSpeed;

    // Draw layers from outside to inside
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i];
      const layerIndex = i / (this.layers.length - 1);

      // Update rotation based on mid frequencies
      layer.rotation += deltaTime * (0.5 + midRotation) * layer.rotationDirection * rotationSpeed;

      // Calculate pulsing radius
      const pulseOffset = Math.sin(this.time * 2 + i * 0.5) * layer.baseRadius * 0.05;
      const audioPulse = bassPulse * layer.baseRadius * 0.3;
      const radius = layer.baseRadius + pulseOffset + audioPulse;

      // Calculate vertex extensions based on frequency data
      const vertexExtensions: number[] = [];
      for (let v = 0; v < vertexCount; v++) {
        const freqIdx = Math.floor((v / vertexCount) * frequencyData.length * 0.3 + i * 10);
        const freqValue = frequencyData[Math.min(freqIdx, frequencyData.length - 1)] / 255;
        const extension = freqValue * radius * 0.4 * pulseIntensity * sensitivity;
        vertexExtensions.push(extension);
      }

      // Calculate alpha based on layer
      const alpha = 0.4 + layerIndex * 0.4;

      // Create gradient for stroke
      const gradient = this.ctx.createLinearGradient(
        centerX - radius,
        centerY - radius,
        centerX + radius,
        centerY + radius,
      );

      // Color interpolation based on layer
      const colorInterp = (Math.sin(this.time * 0.5 + i * 0.3) + 1) * 0.5;
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(colorInterp, colors.end);
      gradient.addColorStop(1, colors.start);

      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 2 + (1 - layerIndex) * 2;

      // Glow effect on beats
      if (this.glowIntensity > 0.1) {
        this.ctx.shadowBlur = 20 * this.glowIntensity * (1 - layerIndex * 0.5);
        this.ctx.shadowColor = colors.glow;
      } else {
        this.ctx.shadowBlur = 0;
      }

      // Draw the shape
      this.drawShape(
        this.ctx,
        centerX,
        centerY,
        radius,
        layer.rotation,
        vertexCount,
        vertexExtensions,
      );

      // Draw connecting lines from center to outer for inner layers
      if (i < 2 && volume > 0.3) {
        this.ctx.globalAlpha = alpha * 0.3 * volume;
        this.ctx.lineWidth = 1;

        for (let v = 0; v < vertexCount; v++) {
          const angle = (v / vertexCount) * Math.PI * 2 - Math.PI / 2 + layer.rotation;
          const extension = vertexExtensions[v];
          const outerR = radius + extension;
          const innerR = radius * 0.1;

          this.ctx.beginPath();
          this.ctx.moveTo(centerX + Math.cos(angle) * innerR, centerY + Math.sin(angle) * innerR);
          this.ctx.lineTo(centerX + Math.cos(angle) * outerR, centerY + Math.sin(angle) * outerR);
          this.ctx.stroke();
        }
      }
    }

    // Draw central glow orb
    if (this.glowIntensity > 0.2 || volume > 0.4) {
      const orbSize = 10 + this.smoothedBass * 30 + this.glowIntensity * 20;
      const orbGradient = this.ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        orbSize,
      );
      orbGradient.addColorStop(0, colors.glow);
      orbGradient.addColorStop(0.5, colors.start);
      orbGradient.addColorStop(1, "transparent");

      this.ctx.globalAlpha = 0.5 + this.glowIntensity * 0.5;
      this.ctx.fillStyle = orbGradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, orbSize, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Reset context state
    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Reinitialize layers with new dimensions
    if (this.layers.length > 0) {
      this.initLayers();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevShape = this.config.shape;
    const prevLayers = this.config.layers;

    this.config = { ...this.config, ...config } as GeometricPulseConfig;

    // Reinitialize if shape or layer count changed
    if (prevShape !== this.config.shape || prevLayers !== this.config.layers) {
      this.initLayers();
    }
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
      shape: {
        type: "select",
        label: "Shape",
        default: "hexagon",
        options: [
          { value: "triangle", label: "Triangle" },
          { value: "square", label: "Square" },
          { value: "pentagon", label: "Pentagon" },
          { value: "hexagon", label: "Hexagon" },
        ],
      },
      layers: {
        type: "number",
        label: "Layers",
        default: 5,
        min: 2,
        max: 8,
        step: 1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      pulseIntensity: {
        type: "number",
        label: "Pulse Intensity",
        default: 0.8,
        min: 0,
        max: 1.5,
        step: 0.1,
      },
    };
  }
}
