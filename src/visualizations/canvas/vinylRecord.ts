import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_STRING,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface VinylRecordConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  grooveCount: number;
  spinSpeed: number;
  grooveDepth: number;
  labelSize: number;
  showStylus: boolean;
  rotationDirection: "clockwise" | "counterclockwise";
}

export class VinylRecordVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "vinylRecord",
    name: "Vinyl Record",
    author: "Vizec",
    description: "Spinning vinyl disc with audio-reactive grooves and animated label",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VinylRecordConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    grooveCount: 80,
    spinSpeed: 1.0,
    grooveDepth: 1.0,
    labelSize: 0.25,
    showStylus: false,
    rotationDirection: "clockwise",
  };

  private rotation: number = 0;
  private lastFrameTime: number = 0;

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

    this.rotation = 0;
    this.lastFrameTime = performance.now();
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, this.config.colorScheme);

    // Clear canvas with transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45;

    // Update rotation based on audio
    // Base 33⅓ RPM = ~0.56 rotations/second = ~3.5 radians/second
    const baseRotation = deltaTime * 0.0035;
    const audioBoost = 1 + (bass * this.config.sensitivity);
    const directionMultiplier = this.config.rotationDirection === "clockwise" ? 1 : -1;
    this.rotation += baseRotation * this.config.spinSpeed * audioBoost * directionMultiplier;

    // Save context and apply rotation
    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(this.rotation);
    this.ctx.translate(-centerX, -centerY);

    // Draw vinyl disc background
    this.drawDiscBackground(centerX, centerY, maxRadius, colors);

    // Draw grooves
    this.drawGrooves(centerX, centerY, maxRadius, frequencyData, colors);

    // Draw label with beat pulse
    this.drawLabel(centerX, centerY, maxRadius, bass, colors);

    // Draw spindle hole
    this.drawSpindleHole(centerX, centerY);

    // Restore context (remove rotation)
    this.ctx.restore();

    // Draw optional stylus overlay (not rotated with record)
    if (this.config.showStylus) {
      this.drawStylus(centerX, centerY, maxRadius, bass, colors);
    }
  }

  private drawDiscBackground(
    centerX: number,
    centerY: number,
    maxRadius: number,
    _colors: { primary: string; secondary: string; glow: string },
  ): void {
    if (!this.ctx) return;

    // Vinyl disc gradient (shiny black vinyl look)
    const gradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, maxRadius,
    );
    gradient.addColorStop(0, "#1a1a1a");
    gradient.addColorStop(0.85, "#0a0a0a");
    gradient.addColorStop(0.95, "#1a1a1a");
    gradient.addColorStop(1, "#333333");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Add subtle rainbow sheen effect (light reflection on vinyl)
    const sheenGradient = this.ctx.createLinearGradient(
      centerX - maxRadius, centerY - maxRadius,
      centerX + maxRadius, centerY + maxRadius,
    );
    sheenGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    sheenGradient.addColorStop(0.45, "rgba(255, 255, 255, 0)");
    sheenGradient.addColorStop(0.5, "rgba(255, 255, 255, 0.02)");
    sheenGradient.addColorStop(0.55, "rgba(255, 255, 255, 0)");
    sheenGradient.addColorStop(1, "rgba(255, 255, 255, 0)");

    this.ctx.fillStyle = sheenGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, maxRadius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawGrooves(
    centerX: number,
    centerY: number,
    maxRadius: number,
    frequencyData: Uint8Array,
    colors: { primary: string; secondary: string },
  ): void {
    if (!this.ctx) return;

    const startRadius = maxRadius * (1 - this.config.labelSize);
    const endRadius = maxRadius * 0.98;
    const grooveCount = this.config.grooveCount;
    const grooveSpacing = (endRadius - startRadius) / grooveCount;

    for (let i = 0; i < grooveCount; i++) {
      const radius = startRadius + i * grooveSpacing;

      // Get audio data for groove position (higher frequencies toward outer edge)
      const freqIndex = Math.floor((i / grooveCount) * frequencyData.length);
      const audioValue = frequencyData[freqIndex] / 255;

      // Groove depth modulated by audio
      const depth = audioValue * this.config.grooveDepth * 1.5;

      // Draw groove with slight wobble
      this.ctx.beginPath();
      this.ctx.strokeStyle = this.getGrooveColor(colors, i, grooveCount, audioValue);
      this.ctx.lineWidth = 0.8 + audioValue * 0.4;

      // Draw slightly elliptical circles for realistic groove effect
      const ellipseRatio = 1 + Math.sin(this.rotation * 2 + i * 0.1) * 0.01;

      for (let angle = 0; angle < Math.PI * 2; angle += 0.08) {
        // Add wobble based on audio and position
        const wobble = Math.sin(angle * 15 + this.rotation * 3) * depth;
        const r = radius + wobble;
        const x = centerX + Math.cos(angle) * r * ellipseRatio;
        const y = centerY + Math.sin(angle) * r / ellipseRatio;

        if (angle === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }

      this.ctx.closePath();
      this.ctx.stroke();
    }
  }

  private getGrooveColor(
    colors: { primary: string; secondary: string },
    index: number,
    total: number,
    audioValue: number,
  ): string {
    // Mix colors based on position and add slight variation
    const ratio = index / total;
    const color1 = this.hexToRgba(colors.primary, 0.3 + audioValue * 0.4);
    const color2 = this.hexToRgba(colors.secondary, 0.25 + audioValue * 0.35);

    if (ratio < 0.5) {
      return color1;
    }
    return color2;
  }

  private drawLabel(
    centerX: number,
    centerY: number,
    maxRadius: number,
    bass: number,
    colors: { primary: string; secondary: string; glow: string },
  ): void {
    if (!this.ctx) return;

    const labelRadius = maxRadius * this.config.labelSize;

    // Pulsing effect based on bass
    const pulse = 1 + bass * this.config.sensitivity * 0.15;
    const pulseRadius = labelRadius * pulse;

    // Label background with gradient
    const gradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, pulseRadius,
    );
    gradient.addColorStop(0, colors.primary);
    gradient.addColorStop(0.6, colors.secondary);
    gradient.addColorStop(1, this.hexToRgba(colors.secondary, 0.7));

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, pulseRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Label ring (decorative border)
    this.ctx.strokeStyle = this.hexToRgba("#ffffff", 0.3);
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, pulseRadius - 2, 0, Math.PI * 2);
    this.ctx.stroke();

    // Label text
    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = `bold ${Math.floor(12 * (maxRadius / 200))}px sans-serif`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.shadowColor = colors.glow;
    this.ctx.shadowBlur = 5;
    this.ctx.fillText("VINYL", centerX, centerY);
    this.ctx.shadowBlur = 0;

    // Subtitle
    this.ctx.font = `${Math.floor(8 * (maxRadius / 200))}px sans-serif`;
    this.ctx.fillStyle = this.hexToRgba("#ffffff", 0.7);
    this.ctx.fillText("RECORDS", centerX, centerY + 18 * (maxRadius / 200));
  }

  private drawSpindleHole(centerX: number, centerY: number): void {
    if (!this.ctx) return;

    // Spindle hole with slight shadow
    this.ctx.fillStyle = "#000000";
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    this.ctx.fill();

    // Highlight ring around spindle
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    this.ctx.lineWidth = 0.5;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    this.ctx.stroke();
  }

  private drawStylus(
    centerX: number,
    centerY: number,
    maxRadius: number,
    bass: number,
    colors: { primary: string; secondary: string },
  ): void {
    if (!this.ctx) return;

    // Stylus arm angle (fixed position for visual effect)
    const armAngle = Math.PI / 4 + Math.sin(this.rotation * 0.3) * 0.1;
    const armLength = maxRadius * 0.65;
    const endX = centerX + Math.cos(armAngle) * armLength;
    const endY = centerY + Math.sin(armAngle) * armLength;

    // Pivot point position
    const pivotX = centerX + maxRadius * 0.5;
    const pivotY = centerY - maxRadius * 0.5;

    // Draw tonearm base/pivot
    this.ctx.fillStyle = "#444444";
    this.ctx.beginPath();
    this.ctx.arc(pivotX, pivotY, 10, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw tonearm
    this.ctx.strokeStyle = "#888888";
    this.ctx.lineWidth = 4;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(pivotX, pivotY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    // Counterweight
    const counterX = pivotX + Math.cos(armAngle + Math.PI) * 25;
    const counterY = pivotY + Math.sin(armAngle + Math.PI) * 25;
    this.ctx.fillStyle = "#555555";
    this.ctx.beginPath();
    this.ctx.arc(counterX, counterY, 8, 0, Math.PI * 2);
    this.ctx.fill();

    // Stylus head (cartridge)
    this.ctx.fillStyle = bass > 0.5 ? colors.primary : "#cccccc";
    this.ctx.beginPath();
    this.ctx.arc(endX, endY, 6, 0, Math.PI * 2);
    this.ctx.fill();

    // Stylus needle
    this.ctx.strokeStyle = "#666666";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX + Math.cos(armAngle + Math.PI / 2) * 8,
      endY + Math.sin(armAngle + Math.PI / 2) * 8,
    );
    this.ctx.stroke();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(255, 255, 255, ${alpha})`;

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    if (config.sensitivity !== undefined) this.config.sensitivity = config.sensitivity;
    if (config.colorScheme !== undefined) this.config.colorScheme = config.colorScheme;
    if (config.grooveCount !== undefined) this.config.grooveCount = config.grooveCount;
    if (config.spinSpeed !== undefined) this.config.spinSpeed = config.spinSpeed;
    if (config.grooveDepth !== undefined) this.config.grooveDepth = config.grooveDepth;
    if (config.labelSize !== undefined) this.config.labelSize = config.labelSize;
    if (config.showStylus !== undefined) this.config.showStylus = config.showStylus;
    if (config.rotationDirection !== undefined) {
      this.config.rotationDirection = config.rotationDirection;
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
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      grooveCount: {
        type: "number",
        label: "Groove Count",
        default: 80,
        min: 50,
        max: 150,
        step: 10,
      },
      spinSpeed: {
        type: "number",
        label: "Spin Speed",
        default: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.1,
      },
      grooveDepth: {
        type: "number",
        label: "Groove Depth",
        default: 1.0,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      labelSize: {
        type: "number",
        label: "Label Size",
        default: 0.25,
        min: 0.15,
        max: 0.35,
        step: 0.01,
      },
      showStylus: {
        type: "boolean",
        label: "Show Stylus",
        default: false,
      },
      rotationDirection: {
        type: "select",
        label: "Rotation Direction",
        default: "clockwise",
        options: [
          { value: "clockwise", label: "Clockwise" },
          { value: "counterclockwise", label: "Counterclockwise" },
        ],
      },
    };
  }
}
