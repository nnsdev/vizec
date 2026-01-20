import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface NeonSignConfig extends VisualizationConfig {
  tubeCount: number;
  flickerIntensity: number;
  glowSize: number;
}

interface NeonTube {
  points: Array<{ x: number; y: number }>;
  color: string;
  flickerPhase: number;
  flickerSpeed: number;
  thickness: number;
  isFlickering: boolean;
}

export class NeonSignVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "neonSign",
    name: "Neon Sign",
    author: "Vizec",
    description: "Flickering neon sign tubes that pulse with the beat",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: NeonSignConfig = {
    sensitivity: 1.0,
    colorScheme: "neon",
    tubeCount: 5,
    flickerIntensity: 1.0,
    glowSize: 1.0,
  };
  private width = 0;
  private height = 0;
  private tubes: NeonTube[] = [];
  private smoothedBass = 0;
  private smoothedMid = 0;
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

    this.initTubes();
  }

  private initTubes(): void {
    this.tubes = [];
    const { tubeCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);
    const tubeColors = [colors.start, colors.end, colors.glow];

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Create various neon tube shapes
    for (let i = 0; i < tubeCount; i++) {
      const shapeType = i % 4;
      const points: Array<{ x: number; y: number }> = [];
      const color = tubeColors[i % tubeColors.length];

      switch (shapeType) {
        case 0:
          // Horizontal wave
          this.createWaveTube(points, centerX, centerY + (i - tubeCount / 2) * 60);
          break;
        case 1:
          // Circle/arc
          this.createArcTube(points, centerX, centerY, 80 + i * 30, i);
          break;
        case 2:
          // Zigzag
          this.createZigzagTube(points, centerX, centerY + (i - tubeCount / 2) * 50);
          break;
        case 3:
          // Spiral segment
          this.createSpiralTube(points, centerX, centerY, i);
          break;
      }

      this.tubes.push({
        points,
        color,
        flickerPhase: Math.random() * Math.PI * 2,
        flickerSpeed: 0.1 + Math.random() * 0.2,
        thickness: 4 + Math.random() * 4,
        isFlickering: Math.random() > 0.7,
      });
    }
  }

  private createWaveTube(
    points: Array<{ x: number; y: number }>,
    centerX: number,
    centerY: number,
  ): void {
    const waveWidth = this.width * 0.6;
    const segments = 20;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = centerX - waveWidth / 2 + t * waveWidth;
      const y = centerY + Math.sin(t * Math.PI * 3) * 30;
      points.push({ x, y });
    }
  }

  private createArcTube(
    points: Array<{ x: number; y: number }>,
    cx: number,
    cy: number,
    radius: number,
    index: number,
  ): void {
    const startAngle = Math.PI * 0.2 + index * 0.3;
    const endAngle = Math.PI * 0.8 + index * 0.3;
    const segments = 20;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + (endAngle - startAngle) * t;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }
  }

  private createZigzagTube(
    points: Array<{ x: number; y: number }>,
    centerX: number,
    centerY: number,
  ): void {
    const width = this.width * 0.5;
    const height = 40;
    const zigzags = 5;

    for (let i = 0; i <= zigzags; i++) {
      const x = centerX - width / 2 + (i / zigzags) * width;
      const y = centerY + (i % 2 === 0 ? -height / 2 : height / 2);
      points.push({ x, y });
    }
  }

  private createSpiralTube(
    points: Array<{ x: number; y: number }>,
    cx: number,
    cy: number,
    index: number,
  ): void {
    const segments = 30;
    const startRadius = 30;
    const endRadius = 100;
    const rotations = 1.5;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2 * rotations + index;
      const radius = startRadius + (endRadius - startRadius) * t;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid } = audioData;
    const { sensitivity, flickerIntensity, glowSize } = this.config;

    // Smooth audio
    const smoothing = 0.15;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw each tube
    for (const tube of this.tubes) {
      this.drawTube(tube, glowSize, flickerIntensity);
    }

    // Reset context
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  private drawTube(tube: NeonTube, glowSize: number, flickerIntensity: number): void {
    if (!this.ctx || tube.points.length < 2) return;

    // Calculate flicker
    tube.flickerPhase += tube.flickerSpeed;
    let flickerAlpha = 1;

    if (tube.isFlickering && flickerIntensity > 0) {
      const flickerValue = Math.sin(tube.flickerPhase * 10) * Math.sin(tube.flickerPhase * 7);
      flickerAlpha = 0.7 + flickerValue * 0.3 * flickerIntensity;

      // Random flicker bursts on bass
      if (this.smoothedBass > 0.5 && Math.random() > 0.9) {
        flickerAlpha *= 0.3 + Math.random() * 0.7;
      }
    }

    // Audio-reactive brightness
    const bassBrightness = 1 + this.smoothedBass * 0.5;
    const finalAlpha = flickerAlpha * bassBrightness;

    // Outer glow
    this.ctx.globalAlpha = finalAlpha * 0.3;
    this.ctx.strokeStyle = tube.color;
    this.ctx.lineWidth = tube.thickness * 3 * glowSize;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.shadowBlur = 30 * glowSize;
    this.ctx.shadowColor = tube.color;

    this.drawTubePath(tube.points);
    this.ctx.stroke();

    // Middle glow
    this.ctx.globalAlpha = finalAlpha * 0.5;
    this.ctx.lineWidth = tube.thickness * 1.5;
    this.ctx.shadowBlur = 15 * glowSize;

    this.drawTubePath(tube.points);
    this.ctx.stroke();

    // Core bright line
    this.ctx.globalAlpha = finalAlpha * 0.7;
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = tube.thickness * 0.5;
    this.ctx.shadowBlur = 5;
    this.ctx.shadowColor = "#ffffff";

    this.drawTubePath(tube.points);
    this.ctx.stroke();

    // Draw connection points (caps)
    this.ctx.fillStyle = tube.color;
    this.ctx.globalAlpha = finalAlpha * 0.4;
    this.ctx.shadowBlur = 10 * glowSize;
    this.ctx.shadowColor = tube.color;

    const endPoints = [tube.points[0], tube.points[tube.points.length - 1]];
    for (const point of endPoints) {
      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, tube.thickness * 0.8, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }

  private drawTubePath(points: Array<{ x: number; y: number }>): void {
    if (!this.ctx || points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    // Use quadratic curves for smoother tubes
    for (let i = 1; i < points.length - 1; i++) {
      const xc = (points[i].x + points[i + 1].x) / 2;
      const yc = (points[i].y + points[i + 1].y) / 2;
      this.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    // Last point
    const last = points[points.length - 1];
    this.ctx.lineTo(last.x, last.y);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.tubes.length > 0) {
      this.initTubes();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevCount = this.config.tubeCount;
    this.config = { ...this.config, ...config } as NeonSignConfig;

    if (this.config.tubeCount !== prevCount && this.width > 0) {
      this.initTubes();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.tubes = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      tubeCount: {
        type: "number",
        label: "Tube Count",
        default: 5,
        min: 2,
        max: 10,
        step: 1,
      },
      flickerIntensity: {
        type: "number",
        label: "Flicker Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      glowSize: {
        type: "number",
        label: "Glow Size",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "neon",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
