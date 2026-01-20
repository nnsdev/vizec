import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface HologramGlitchConfig extends VisualizationConfig {
  glitchIntensity: number;
  scanLineCount: number;
  chromaticAberration: number;
}

interface GlitchBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  life: number;
}

export class HologramGlitchVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "hologramGlitch",
    name: "Hologram Glitch",
    author: "Vizec",
    description: "Glitchy holographic projection with scan lines and chromatic aberration",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: HologramGlitchConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
    glitchIntensity: 1.0,
    scanLineCount: 100,
    chromaticAberration: 1.0,
  };
  private width = 0;
  private height = 0;
  private glitchBlocks: GlitchBlock[] = [];
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;
  private time = 0;
  private holoShapePoints: Array<{ x: number; y: number }> = [];

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

    this.initHoloShape();
  }

  private initHoloShape(): void {
    this.holoShapePoints = [];
    const cx = this.width / 2;
    const cy = this.height / 2;
    const size = Math.min(this.width, this.height) * 0.25;

    // Create a geometric shape (diamond/crystal)
    const points = 6;
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
      const r = size * (1 + Math.cos(angle * 3) * 0.3);
      this.holoShapePoints.push({
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble } = audioData;
    const { sensitivity, glitchIntensity, scanLineCount, chromaticAberration, colorScheme } =
      this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio
    const smoothing = 0.15;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Trigger glitch blocks on bass
    if (this.smoothedBass > 0.4 && Math.random() > 0.7) {
      this.spawnGlitchBlock();
    }

    // Draw hologram shape with chromatic aberration
    this.drawHologramShape(colors, chromaticAberration);

    // Draw scan lines
    this.drawScanLines(scanLineCount, colors);

    // Update and draw glitch blocks
    this.updateGlitchBlocks(deltaTime);
    this.drawGlitchBlocks(colors, glitchIntensity);

    // Draw interference patterns
    this.drawInterference(colors);

    // Reset context
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  private drawHologramShape(
    colors: { start: string; end: string; glow: string },
    chromaticAberration: number,
  ): void {
    if (!this.ctx) return;

    const cx = this.width / 2;
    const cy = this.height / 2;
    const pulse = 1 + this.smoothedBass * 0.2;
    const chromOffset = chromaticAberration * 5 * (1 + this.smoothedBass);

    // Draw three offset layers for chromatic aberration
    const layers = [
      { color: this.hexToRgba(colors.start, 0.4), offsetX: -chromOffset, offsetY: 0 },
      { color: this.hexToRgba(colors.end, 0.4), offsetX: chromOffset, offsetY: 0 },
      { color: this.hexToRgba(colors.glow, 0.5), offsetX: 0, offsetY: 0 },
    ];

    for (const layer of layers) {
      this.ctx.globalAlpha = 0.5;
      this.ctx.strokeStyle = layer.color;
      this.ctx.lineWidth = 2;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = layer.color;

      this.ctx.beginPath();
      for (let i = 0; i < this.holoShapePoints.length; i++) {
        const point = this.holoShapePoints[i];
        const x = cx + (point.x - cx) * pulse + layer.offsetX;
        const y = cy + (point.y - cy) * pulse + layer.offsetY;

        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.closePath();
      this.ctx.stroke();
    }

    // Inner wireframe
    this.ctx.globalAlpha = 0.3;
    this.ctx.strokeStyle = colors.glow;
    this.ctx.lineWidth = 1;

    // Draw inner triangles
    for (let i = 0; i < this.holoShapePoints.length - 1; i++) {
      const point = this.holoShapePoints[i];
      const px = cx + (point.x - cx) * pulse;
      const py = cy + (point.y - cy) * pulse;

      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      this.ctx.lineTo(px, py);
      this.ctx.stroke();
    }
  }

  private drawScanLines(count: number, colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const lineSpacing = this.height / count;
    const scrollOffset = (this.time * 50) % lineSpacing;

    this.ctx.globalAlpha = 0.1 + this.smoothedMid * 0.1;

    for (let i = 0; i < count; i++) {
      const y = i * lineSpacing + scrollOffset;

      // Varying intensity
      const intensity = 0.5 + Math.sin(i * 0.5 + this.time * 5) * 0.5;

      this.ctx.fillStyle = this.hexToRgba(colors.glow, intensity * 0.15);
      this.ctx.fillRect(0, y, this.width, 1);

      // Occasional bright scan line
      if (i % 10 === 0 && this.smoothedBass > 0.3) {
        this.ctx.fillStyle = this.hexToRgba(colors.start, 0.3);
        this.ctx.fillRect(0, y, this.width, 2);
      }
    }
  }

  private spawnGlitchBlock(): void {
    if (this.glitchBlocks.length > 10) return;

    this.glitchBlocks.push({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      width: 50 + Math.random() * 150,
      height: 10 + Math.random() * 50,
      offsetX: (Math.random() - 0.5) * 50,
      life: 0.1 + Math.random() * 0.2,
    });
  }

  private updateGlitchBlocks(deltaTime: number): void {
    for (let i = this.glitchBlocks.length - 1; i >= 0; i--) {
      this.glitchBlocks[i].life -= deltaTime * 0.001;
      if (this.glitchBlocks[i].life <= 0) {
        this.glitchBlocks.splice(i, 1);
      }
    }
  }

  private drawGlitchBlocks(
    colors: { start: string; end: string; glow: string },
    intensity: number,
  ): void {
    if (!this.ctx) return;

    for (const block of this.glitchBlocks) {
      const alpha = block.life * 2 * intensity;

      // Displaced block
      this.ctx.globalAlpha = alpha * 0.5;
      this.ctx.fillStyle = colors.start;
      this.ctx.fillRect(block.x + block.offsetX, block.y, block.width, block.height);

      // Complementary color offset
      this.ctx.fillStyle = colors.end;
      this.ctx.fillRect(block.x - block.offsetX, block.y + 2, block.width, block.height);

      // White noise in block
      this.ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 5; i++) {
        const nx = block.x + Math.random() * block.width;
        const ny = block.y + Math.random() * block.height;
        this.ctx.globalAlpha = Math.random() * 0.3 * intensity;
        this.ctx.fillRect(nx, ny, 2, 2);
      }
    }
  }

  private drawInterference(colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    // Horizontal interference bars
    const barCount = 3;
    for (let i = 0; i < barCount; i++) {
      const y = ((this.time * 100 + i * 200) % (this.height + 100)) - 50;
      const alpha = 0.1 + this.smoothedTreble * 0.2;

      const gradient = this.ctx.createLinearGradient(0, y, 0, y + 20);
      gradient.addColorStop(0, "transparent");
      gradient.addColorStop(0.5, this.hexToRgba(colors.glow, alpha));
      gradient.addColorStop(1, "transparent");

      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, y, this.width, 20);
    }

    // Corner distortion
    const distortionSize = 50 + this.smoothedBass * 30;
    this.ctx.globalAlpha = 0.2;

    const corners = [
      { x: 0, y: 0 },
      { x: this.width - distortionSize, y: 0 },
      { x: 0, y: this.height - distortionSize },
      { x: this.width - distortionSize, y: this.height - distortionSize },
    ];

    for (const corner of corners) {
      const gradient = this.ctx.createRadialGradient(
        corner.x + distortionSize / 2,
        corner.y + distortionSize / 2,
        0,
        corner.x + distortionSize / 2,
        corner.y + distortionSize / 2,
        distortionSize,
      );
      gradient.addColorStop(0, this.hexToRgba(colors.end, 0.3));
      gradient.addColorStop(1, "transparent");

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(corner.x, corner.y, distortionSize, distortionSize);
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initHoloShape();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as HologramGlitchConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.glitchBlocks = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      glitchIntensity: {
        type: "number",
        label: "Glitch Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      scanLineCount: {
        type: "number",
        label: "Scan Lines",
        default: 100,
        min: 30,
        max: 200,
        step: 10,
      },
      chromaticAberration: {
        type: "number",
        label: "Chromatic Aberration",
        default: 1.0,
        min: 0.0,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
