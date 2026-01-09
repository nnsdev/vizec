import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_ARRAY,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface Shape {
  type: "line" | "arc" | "triangle";
  angle: number;
  distance: number;
  size: number;
  color: string;
  rotation: number;
  speed: number;
}

export class KaleidoscopeVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "kaleidoscope",
    name: "Kaleidoscope",
    author: "Vizec",
    description: "Mirrored geometric patterns that morph with audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    segments: 12,
    shapeCount: 8,
    rotationSpeed: 0.5,
    complexity: 3,
  };

  private shapes: Shape[] = [];
  private globalRotation = 0;
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

    this.initShapes();
  }

  private initShapes(): void {
    const { shapeCount, colorScheme, complexity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ARRAY, colorScheme).colors;

    this.shapes = [];
    for (let i = 0; i < shapeCount * complexity; i++) {
      const types: ("line" | "arc" | "triangle")[] = ["line", "arc", "triangle"];
      this.shapes.push({
        type: types[Math.floor(Math.random() * types.length)],
        angle: Math.random() * Math.PI * 2,
        distance: 50 + Math.random() * 200,
        size: 20 + Math.random() * 80,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        speed: (Math.random() - 0.5) * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, frequencyData } = audioData;
    const { sensitivity, colorScheme, segments, rotationSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ARRAY, colorScheme).colors;

    this.time += deltaTime;

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) / 2;

    // Global rotation based on audio
    this.globalRotation += deltaTime * rotationSpeed * (1 + mid * sensitivity);

    // Set transparency
    this.ctx.globalAlpha = 0.6;

    // Draw kaleidoscope segments
    const segmentAngle = (Math.PI * 2) / segments;

    this.ctx.save();
    this.ctx.translate(centerX, centerY);

    for (let seg = 0; seg < segments; seg++) {
      this.ctx.save();
      this.ctx.rotate(seg * segmentAngle + this.globalRotation);

      // Clip to segment
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(maxRadius * 1.5, 0);
      this.ctx.arc(0, 0, maxRadius * 1.5, 0, segmentAngle);
      this.ctx.closePath();
      this.ctx.clip();

      // Mirror every other segment
      if (seg % 2 === 1) {
        this.ctx.scale(1, -1);
        this.ctx.rotate(segmentAngle);
      }

      // Draw shapes
      for (let i = 0; i < this.shapes.length; i++) {
        const shape = this.shapes[i];

        // Get frequency influence for this shape
        const freqIndex = Math.floor((i / this.shapes.length) * frequencyData.length * 0.5);
        const freqValue = frequencyData[freqIndex] / 255;

        // Update shape based on audio
        shape.rotation += shape.speed * deltaTime * (1 + freqValue * sensitivity * 2);
        const dynamicDistance = shape.distance + freqValue * sensitivity * 100;
        const dynamicSize = shape.size * (0.5 + freqValue * sensitivity);

        const x = Math.cos(shape.angle + this.time * shape.speed * 0.5) * dynamicDistance;
        const y = Math.sin(shape.angle + this.time * shape.speed * 0.5) * dynamicDistance * 0.5;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(shape.rotation);

        // Set color with glow
        this.ctx.strokeStyle = shape.color;
        this.ctx.fillStyle = shape.color + "40";
        this.ctx.lineWidth = 2 + freqValue * 3;
        this.ctx.shadowBlur = 10 + freqValue * 15;
        this.ctx.shadowColor = shape.color;

        // Draw shape based on type
        switch (shape.type) {
          case "line":
            this.ctx.beginPath();
            this.ctx.moveTo(-dynamicSize / 2, 0);
            this.ctx.lineTo(dynamicSize / 2, 0);
            this.ctx.stroke();
            break;

          case "arc":
            this.ctx.beginPath();
            this.ctx.arc(0, 0, dynamicSize / 2, 0, Math.PI * (0.5 + freqValue));
            this.ctx.stroke();
            break;

          case "triangle":
            this.ctx.beginPath();
            const triSize = dynamicSize / 2;
            this.ctx.moveTo(0, -triSize);
            this.ctx.lineTo(-triSize * 0.866, triSize * 0.5);
            this.ctx.lineTo(triSize * 0.866, triSize * 0.5);
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.globalAlpha = 0.2;
            this.ctx.fill();
            this.ctx.globalAlpha = 0.6;
            break;
        }

        this.ctx.restore();
      }

      this.ctx.restore();
    }

    this.ctx.restore();

    // Center mandala
    const centerSize = 30 + bass * sensitivity * 50;
    this.ctx.globalAlpha = 0.5;

    for (let ring = 3; ring >= 0; ring--) {
      const ringRadius = centerSize * (ring + 1) * 0.3;
      const gradient = this.ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        ringRadius,
      );
      gradient.addColorStop(0, colors[ring % colors.length] + "60");
      gradient.addColorStop(1, "transparent");

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Reset
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
    const oldShapeCount = this.config.shapeCount;
    const oldComplexity = this.config.complexity;
    this.config = { ...this.config, ...config };

    if (
      (config.shapeCount && config.shapeCount !== oldShapeCount) ||
      (config.complexity && config.complexity !== oldComplexity)
    ) {
      this.initShapes();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.shapes = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [...COLOR_SCHEME_OPTIONS],
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      segments: { type: "number", min: 4, max: 24, step: 2, default: 12, label: "Segments" },
      shapeCount: { type: "number", min: 4, max: 16, step: 2, default: 8, label: "Shape Count" },
      rotationSpeed: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Rotation Speed",
      },
      complexity: { type: "number", min: 1, max: 5, step: 1, default: 3, label: "Complexity" },
    };
  }
}
