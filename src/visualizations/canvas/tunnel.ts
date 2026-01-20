import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

type ShapeType = "circle" | "square" | "hexagon";

interface TunnelConfig extends VisualizationConfig {
  shapeType: ShapeType;
  speed: number;
  density: number;
  distortion: number;
}

interface TunnelShape {
  z: number; // depth (0 = far, 1 = close)
  rotation: number;
  distortionOffsets: number[];
}

export class TunnelVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "tunnel",
    name: "Tunnel",
    author: "Vizec",
    description: "Flying through an infinite tunnel with concentric shapes",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: TunnelConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
    shapeType: "hexagon",
    speed: 1.0,
    density: 12,
    distortion: 0.5,
  };
  private width = 0;
  private height = 0;
  private shapes: TunnelShape[] = [];
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

    // Initial resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    // Initialize shapes
    this.initShapes();
  }

  private initShapes(): void {
    this.shapes = [];
    const numShapes = Math.floor(this.config.density * 2);
    const vertexCount = this.getVertexCount();

    for (let i = 0; i < numShapes; i++) {
      this.shapes.push({
        z: i / numShapes, // Evenly distributed depth
        rotation: (i * Math.PI) / numShapes,
        distortionOffsets: Array.from({ length: vertexCount }, () => Math.random() * Math.PI * 2),
      });
    }
  }

  private getVertexCount(): number {
    switch (this.config.shapeType) {
      case "circle":
        return 36;
      case "square":
        return 4;
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
    distortionOffsets: number[],
    frequencyData: Uint8Array,
    distortionAmount: number,
  ): void {
    ctx.beginPath();

    for (let i = 0; i <= vertexCount; i++) {
      const idx = i % vertexCount;
      const angle = (idx / vertexCount) * Math.PI * 2 + rotation;

      // Calculate distortion based on frequency data
      const freqIdx = Math.floor((idx / vertexCount) * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIdx] / 255;
      const distortion = freqValue * distortionAmount * radius * 0.3;
      const timeDistortion =
        Math.sin(this.time * 2 + distortionOffsets[idx]) * distortionAmount * radius * 0.1;

      const r = radius + distortion + timeDistortion;
      const x = centerX + Math.cos(angle) * r;
      const y = centerY + Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.closePath();
    ctx.stroke();
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass, volume } = audioData;
    const { speed, distortion, colorScheme, shapeType } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Update time
    this.time += deltaTime;

    // Calculate speed based on bass and volume
    const audioSpeed = (0.3 + bass * 0.5 + volume * 0.3) * speed;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.max(this.width, this.height) * 0.8;
    const vertexCount = this.getVertexCount();

    // Update and draw shapes
    for (let i = 0; i < this.shapes.length; i++) {
      const shape = this.shapes[i];

      // Move shape toward viewer
      shape.z += audioSpeed * deltaTime * 0.5;

      // Reset shape when it passes the viewer
      if (shape.z >= 1) {
        shape.z = 0;
        shape.rotation = Math.random() * Math.PI * 2;
        shape.distortionOffsets = Array.from(
          { length: vertexCount },
          () => Math.random() * Math.PI * 2,
        );
      }

      // Rotate shape slowly
      shape.rotation += deltaTime * 0.2 * speed;

      // Calculate radius based on depth (perspective projection)
      // Shapes far away are large (tunnel walls), shapes close are small (passed)
      const perspective = 1 - shape.z;
      const radius = maxRadius * perspective * perspective;

      // Skip if too small
      if (radius < 5) continue;

      // Calculate alpha based on depth (fade in and out)
      let alpha = 0.7;
      if (shape.z < 0.1) {
        alpha = (shape.z / 0.1) * 0.7; // Fade in
      } else if (shape.z > 0.9) {
        alpha = ((1 - shape.z) / 0.1) * 0.7; // Fade out
      }

      this.ctx.globalAlpha = alpha;

      // Create gradient effect
      const gradient = this.ctx.createRadialGradient(
        centerX,
        centerY,
        radius * 0.8,
        centerX,
        centerY,
        radius * 1.2,
      );
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(1, colors.end);

      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 2 + (1 - shape.z) * 2;

      // Glow effect for closer shapes
      if (shape.z > 0.7 && volume > 0.3) {
        this.ctx.shadowBlur = 15 * (shape.z - 0.7) * 3;
        this.ctx.shadowColor = colors.glow;
      } else {
        this.ctx.shadowBlur = 0;
      }

      // Draw the shape
      if (shapeType === "circle") {
        // For circle, draw actual circle with distortion
        this.ctx.beginPath();
        const segments = 36;
        for (let j = 0; j <= segments; j++) {
          const angle = (j / segments) * Math.PI * 2;
          const freqIdx = Math.floor((j / segments) * frequencyData.length * 0.5);
          const freqValue = frequencyData[freqIdx] / 255;
          const d = freqValue * distortion * radius * 0.3;
          const r = radius + d;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (j === 0) {
            this.ctx.moveTo(x, y);
          } else {
            this.ctx.lineTo(x, y);
          }
        }
        this.ctx.closePath();
        this.ctx.stroke();
      } else {
        this.drawShape(
          this.ctx,
          centerX,
          centerY,
          radius,
          shape.rotation,
          vertexCount,
          shape.distortionOffsets,
          frequencyData,
          distortion,
        );
      }
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevShapeType = this.config.shapeType;
    const prevDensity = this.config.density;

    this.config = { ...this.config, ...config } as TunnelConfig;

    // Reinitialize shapes if type or density changed
    if (prevShapeType !== this.config.shapeType || prevDensity !== this.config.density) {
      this.initShapes();
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
      shapeType: {
        type: "select",
        label: "Shape Type",
        default: "hexagon",
        options: [
          { value: "circle", label: "Circle" },
          { value: "square", label: "Square" },
          { value: "hexagon", label: "Hexagon" },
        ],
      },
      speed: {
        type: "number",
        label: "Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      density: {
        type: "number",
        label: "Density",
        default: 12,
        min: 6,
        max: 24,
        step: 2,
      },
      distortion: {
        type: "number",
        label: "Distortion",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
      },
    };
  }
}
