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

interface CassetteTapeConfig extends VisualizationConfig {
  colorScheme: string;
  reelSpeed: number;
  wowFlutter: number;
}

export class CassetteTapeVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "cassetteTape",
    name: "Cassette Tape",
    author: "Vizec",
    description: "Retro cassette tape with spinning reels",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: CassetteTapeConfig = {
    sensitivity: 1.0,
    colorScheme: "warmSunset",
    reelSpeed: 1.0,
    wowFlutter: 0.5,
  };

  private width = 0;
  private height = 0;
  private leftReelAngle = 0;
  private rightReelAngle = 0;
  private time = 0;
  private tapePosition = 0.3; // 0 = all on left, 1 = all on right

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

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, reelSpeed, wowFlutter } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Cassette dimensions
    const cassetteWidth = Math.min(this.width * 0.6, 500);
    const cassetteHeight = cassetteWidth * 0.65;
    const cassetteX = (this.width - cassetteWidth) / 2;
    const cassetteY = (this.height - cassetteHeight) / 2;

    // Wow and flutter effect
    const flutter = Math.sin(this.time * 20) * wowFlutter * 0.02;
    const wow = Math.sin(this.time * 2) * wowFlutter * 0.01;
    const speedMod = 1 + flutter + wow;

    // Update reel rotation based on audio
    const baseSpeed = 2 * reelSpeed * speedMod * (0.5 + volume * 0.5 * sensitivity);
    this.leftReelAngle += baseSpeed * deltaTime;
    this.rightReelAngle += baseSpeed * deltaTime * 1.1; // Slightly different speed

    // Tape position slowly changes
    this.tapePosition = 0.3 + Math.sin(this.time * 0.1) * 0.2;

    // Cassette body
    this.ctx.fillStyle = "rgba(40, 35, 30, 0.9)";
    this.ctx.strokeStyle = "rgba(60, 55, 50, 0.8)";
    this.ctx.lineWidth = 3;

    // Rounded rectangle
    this.roundRect(cassetteX, cassetteY, cassetteWidth, cassetteHeight, 15);
    this.ctx.fill();
    this.ctx.stroke();

    // Label area
    const labelX = cassetteX + cassetteWidth * 0.1;
    const labelY = cassetteY + cassetteHeight * 0.08;
    const labelW = cassetteWidth * 0.8;
    const labelH = cassetteHeight * 0.35;

    this.ctx.fillStyle = "rgba(240, 235, 220, 0.95)";
    this.roundRect(labelX, labelY, labelW, labelH, 5);
    this.ctx.fill();

    // Label text
    this.ctx.fillStyle = "rgba(60, 50, 40, 0.9)";
    this.ctx.font = `bold ${cassetteHeight * 0.08}px "Courier New", monospace`;
    this.ctx.textAlign = "center";
    this.ctx.fillText("AUDIO VISUALIZER", cassetteX + cassetteWidth / 2, labelY + labelH * 0.4);

    this.ctx.font = `${cassetteHeight * 0.05}px "Courier New", monospace`;
    this.ctx.fillText("SIDE A - 60 MIN", cassetteX + cassetteWidth / 2, labelY + labelH * 0.7);

    // Lines on label
    this.ctx.strokeStyle = "rgba(100, 90, 80, 0.3)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const ly = labelY + labelH * 0.75 + i * 4;
      this.ctx.beginPath();
      this.ctx.moveTo(labelX + 20, ly);
      this.ctx.lineTo(labelX + labelW - 20, ly);
      this.ctx.stroke();
    }

    // Tape window
    const windowX = cassetteX + cassetteWidth * 0.15;
    const windowY = cassetteY + cassetteHeight * 0.5;
    const windowW = cassetteWidth * 0.7;
    const windowH = cassetteHeight * 0.35;

    this.ctx.fillStyle = "rgba(20, 20, 25, 0.95)";
    this.roundRect(windowX, windowY, windowW, windowH, 8);
    this.ctx.fill();

    // Window frame
    this.ctx.strokeStyle = "rgba(50, 45, 40, 0.8)";
    this.ctx.lineWidth = 2;
    this.roundRect(windowX, windowY, windowW, windowH, 8);
    this.ctx.stroke();

    // Reel positions
    const reelRadius = windowH * 0.35;
    const leftReelX = windowX + windowW * 0.25;
    const rightReelX = windowX + windowW * 0.75;
    const reelY = windowY + windowH * 0.5;

    // Tape between reels
    const tapeColor = "rgba(60, 40, 30, 0.9)";

    // Left tape spool size (decreases as tape plays)
    const leftSpoolRadius = reelRadius * 0.4 + reelRadius * 0.5 * (1 - this.tapePosition);
    const rightSpoolRadius = reelRadius * 0.4 + reelRadius * 0.5 * this.tapePosition;

    // Draw tape path
    this.ctx.strokeStyle = tapeColor;
    this.ctx.lineWidth = 3;

    // Top tape path
    this.ctx.beginPath();
    this.ctx.moveTo(leftReelX, reelY - leftSpoolRadius);
    this.ctx.lineTo(rightReelX, reelY - rightSpoolRadius);
    this.ctx.stroke();

    // Bottom tape path (through head area)
    const headY = windowY + windowH + 10;
    this.ctx.beginPath();
    this.ctx.moveTo(leftReelX, reelY + leftSpoolRadius);
    this.ctx.lineTo(windowX + windowW * 0.3, headY);
    this.ctx.lineTo(windowX + windowW * 0.5, headY + 5); // Head
    this.ctx.lineTo(windowX + windowW * 0.7, headY);
    this.ctx.lineTo(rightReelX, reelY + rightSpoolRadius);
    this.ctx.stroke();

    // Draw reels
    this.drawReel(leftReelX, reelY, reelRadius, leftSpoolRadius, this.leftReelAngle, colors, bass, mid);
    this.drawReel(rightReelX, reelY, reelRadius, rightSpoolRadius, this.rightReelAngle, colors, bass, mid);

    // Tape head glow (reacts to audio)
    const headGlow = 0.3 + volume * 0.7 * sensitivity;
    this.ctx.shadowColor = colors.end;
    this.ctx.shadowBlur = 15 * headGlow;
    this.ctx.fillStyle = `rgba(${this.hexToRgb(colors.end)}, ${headGlow * 0.5})`;
    this.ctx.fillRect(windowX + windowW * 0.45, headY, windowW * 0.1, 10);
    this.ctx.shadowBlur = 0;

    // VU meter style indicators
    const vuX = cassetteX + cassetteWidth * 0.85;
    const vuY = cassetteY + cassetteHeight * 0.15;

    // Left channel (bass)
    this.drawVUBar(vuX, vuY, 8, 40, bass * sensitivity, colors.start);

    // Right channel (treble)
    this.drawVUBar(vuX + 15, vuY, 8, 40, treble * sensitivity, colors.end);

    // Screw holes
    const screwPositions = [
      [cassetteX + 20, cassetteY + 20],
      [cassetteX + cassetteWidth - 20, cassetteY + 20],
      [cassetteX + 20, cassetteY + cassetteHeight - 20],
      [cassetteX + cassetteWidth - 20, cassetteY + cassetteHeight - 20],
    ];

    for (const [sx, sy] of screwPositions) {
      this.ctx.fillStyle = "rgba(80, 75, 70, 0.8)";
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      this.ctx.fill();

      // Screw slot
      this.ctx.strokeStyle = "rgba(40, 35, 30, 0.8)";
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 4, sy);
      this.ctx.lineTo(sx + 4, sy);
      this.ctx.stroke();
    }
  }

  private drawReel(
    x: number,
    y: number,
    radius: number,
    spoolRadius: number,
    angle: number,
    colors: { start: string; mid: string; end: string },
    bass: number,
    _mid: number
  ): void {
    if (!this.ctx) return;

    // Reel hub
    this.ctx.fillStyle = "rgba(50, 50, 55, 0.9)";
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();

    // Tape spool (brown tape wrapped around hub)
    this.ctx.fillStyle = "rgba(70, 50, 40, 0.95)";
    this.ctx.beginPath();
    this.ctx.arc(x, y, spoolRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Spool rings (tape layers visible)
    this.ctx.strokeStyle = "rgba(90, 65, 50, 0.5)";
    this.ctx.lineWidth = 1;
    for (let r = radius * 0.3; r < spoolRadius; r += 3) {
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Center hub
    this.ctx.fillStyle = "rgba(40, 40, 45, 0.95)";
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius * 0.25, 0, Math.PI * 2);
    this.ctx.fill();

    // Hub spokes (rotating)
    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.rotate(angle);

    this.ctx.fillStyle = "rgba(60, 60, 65, 0.9)";
    for (let i = 0; i < 6; i++) {
      const spokeAngle = (i / 6) * Math.PI * 2;
      this.ctx.save();
      this.ctx.rotate(spokeAngle);
      this.ctx.fillRect(-3, 5, 6, radius * 0.2);
      this.ctx.restore();
    }

    // Center decoration
    this.ctx.fillStyle = "rgba(80, 80, 85, 0.9)";
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius * 0.1, 0, Math.PI * 2);
    this.ctx.fill();

    // Glow effect on bass
    if (bass > 0.5) {
      this.ctx.shadowColor = colors.start;
      this.ctx.shadowBlur = 10 * bass;
      this.ctx.strokeStyle = colors.start;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = bass * 0.5;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, radius * 0.15, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.globalAlpha = 1;
      this.ctx.shadowBlur = 0;
    }

    this.ctx.restore();
  }

  private drawVUBar(
    x: number,
    y: number,
    width: number,
    height: number,
    level: number,
    color: string
  ): void {
    if (!this.ctx) return;

    // Background
    this.ctx.fillStyle = "rgba(30, 30, 35, 0.8)";
    this.ctx.fillRect(x, y, width, height);

    // Level
    const levelHeight = height * Math.min(1, level);
    const gradient = this.ctx.createLinearGradient(x, y + height, x, y + height - levelHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.7, color);
    gradient.addColorStop(1, "#ff3333");

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(x, y + height - levelHeight, width, levelHeight);

    // Peak indicator
    if (level > 0.8) {
      this.ctx.fillStyle = "#ff3333";
      this.ctx.fillRect(x, y, width, 3);
    }
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return "255, 255, 255";
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
    this.config = { ...this.config, ...config } as CassetteTapeConfig;
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
        default: "warmSunset",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      reelSpeed: {
        type: "number",
        label: "Reel Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      wowFlutter: {
        type: "number",
        label: "Wow & Flutter",
        default: 0.5,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
