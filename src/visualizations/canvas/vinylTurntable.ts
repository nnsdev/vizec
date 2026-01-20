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

interface VinylTurntableConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  platterSpeed: number;
  armSwing: number;
  showStrobe: boolean;
}

export class VinylTurntableVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "vinylTurntable",
    name: "Vinyl Turntable",
    author: "Vizec",
    description: "Complete turntable with audio-reactive tonearm and platter",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VinylTurntableConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    platterSpeed: 1.0,
    armSwing: 1.0,
    showStrobe: true,
  };

  private rotation: number = 0;
  private armAngle: number = Math.PI / 4;
  private strobePhase: number = 0;
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
    this.armAngle = Math.PI / 4;
    this.strobePhase = 0;
    this.lastFrameTime = performance.now();
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass, volume } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, this.config.colorScheme);

    // Clear canvas with transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const turntableSize = Math.min(this.width, this.height) * 0.4;

    // Update platter rotation
    const baseRotation = deltaTime * 0.0035;
    const audioBoost = 1 + (volume * this.config.sensitivity);
    this.rotation += baseRotation * this.config.platterSpeed * audioBoost;

    // Update tonearm position based on frequency distribution
    const freqCenter = this.calculateFrequencyCenter(frequencyData);
    const targetArmAngle = Math.PI / 6 + (freqCenter / frequencyData.length) * Math.PI / 3;
    this.armAngle += (targetArmAngle - this.armAngle) * 0.05 * this.config.armSwing;

    // Draw turntable base
    this.drawTurntableBase(centerX, centerY, turntableSize);

    // Draw platter with vinyl record
    this.drawPlatter(centerX, centerY, turntableSize, bass, frequencyData, colors);

    // Draw tonearm
    this.drawTonearm(centerX, centerY, turntableSize, colors);

    // Draw optional strobe lights
    if (this.config.showStrobe) {
      this.drawStrobeLights(centerX, centerY, turntableSize, deltaTime, colors);
    }
  }

  private calculateFrequencyCenter(frequencyData: Uint8Array): number {
    let weightedSum = 0;
    let totalEnergy = 0;

    for (let i = 0; i < frequencyData.length; i++) {
      weightedSum += i * frequencyData[i];
      totalEnergy += frequencyData[i];
    }

    return totalEnergy > 0 ? weightedSum / totalEnergy : frequencyData.length / 2;
  }

  private drawTurntableBase(centerX: number, centerY: number, size: number): void {
    if (!this.ctx) return;

    // Turntable base (semi-transparent for overlay)
    const gradient = this.ctx.createLinearGradient(
      centerX - size, centerY - size,
      centerX + size, centerY + size,
    );
    gradient.addColorStop(0, "rgba(74, 74, 74, 0.5)");
    gradient.addColorStop(0.3, "rgba(42, 42, 42, 0.5)");
    gradient.addColorStop(0.7, "rgba(26, 26, 26, 0.5)");
    gradient.addColorStop(1, "rgba(10, 10, 10, 0.5)");

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(centerX - size, centerY - size, size * 2, size * 2);

    // Wood grain effect (simplified)
    this.ctx.strokeStyle = "rgba(139, 90, 43, 0.15)";
    this.ctx.lineWidth = 1;
    for (let i = 0; i < size * 2; i += 8) {
      this.ctx.beginPath();
      this.ctx.moveTo(centerX - size, centerY - size + i);
      this.ctx.bezierCurveTo(
        centerX - size + 20, centerY - size + i + 10,
        centerX + size - 20, centerY - size + i + 10,
        centerX + size, centerY - size + i,
      );
      this.ctx.stroke();
    }

    // Base border
    this.ctx.strokeStyle = "#333333";
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(centerX - size, centerY - size, size * 2, size * 2);

    // Control panel area (semi-transparent)
    const panelY = centerY + size * 0.7;
    this.ctx.fillStyle = "rgba(26, 26, 26, 0.6)";
    this.ctx.fillRect(centerX - size + 10, panelY, size * 2 - 20, 30);

    // Speed selector buttons (decorative)
    this.drawSpeedButtons(centerX, panelY, size);
  }

  private drawSpeedButtons(centerX: number, panelY: number, _size: number): void {
    if (!this.ctx) return;

    const buttonY = panelY + 10;
    const buttonSpacing = 25;
    const startX = centerX - 30;

    // 33 1/3 button
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(startX, buttonY, 20, 12);
    this.ctx.fillStyle = "#0f0";
    this.ctx.fillRect(startX + 2, buttonY + 2, 16, 8);

    // 45 button
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(startX + buttonSpacing, buttonY, 20, 12);
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(startX + buttonSpacing + 2, buttonY + 2, 16, 8);

    // 78 button
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(startX + buttonSpacing * 2, buttonY, 20, 12);
    this.ctx.fillStyle = "#333";
    this.ctx.fillRect(startX + buttonSpacing * 2 + 2, buttonY + 2, 16, 8);
  }

  private drawPlatter(
    centerX: number,
    centerY: number,
    size: number,
    bass: number,
    frequencyData: Uint8Array,
    colors: { primary: string; secondary: string; glow: string },
  ): void {
    if (!this.ctx) return;

    const platterRadius = size * 0.82;

    // Platter rubber mat (semi-transparent)
    const matGradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, platterRadius,
    );
    matGradient.addColorStop(0, "rgba(42, 42, 42, 0.6)");
    matGradient.addColorStop(0.9, "rgba(26, 26, 26, 0.6)");
    matGradient.addColorStop(1, "rgba(10, 10, 10, 0.6)");

    this.ctx.fillStyle = matGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, platterRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Platter edge highlight
    this.ctx.strokeStyle = "#444";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, platterRadius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Vinyl record (rotated)
    this.ctx.save();
    this.ctx.translate(centerX, centerY);
    this.ctx.rotate(this.rotation);
    this.ctx.translate(-centerX, -centerY);

    const vinylRadius = platterRadius * 0.93;
    const vinylGradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, vinylRadius,
    );
    vinylGradient.addColorStop(0, "rgba(17, 17, 17, 0.4)");
    vinylGradient.addColorStop(0.85, "rgba(0, 0, 0, 0.5)");
    vinylGradient.addColorStop(0.95, "rgba(26, 26, 26, 0.5)");
    vinylGradient.addColorStop(1, "rgba(34, 34, 34, 0.55)");

    this.ctx.fillStyle = vinylGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, vinylRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Grooves (simplified concentric circles)
    const grooveCount = 50;
    const startRadius = vinylRadius * 0.28;
    const endRadius = vinylRadius * 0.95;

    for (let i = 0; i < grooveCount; i++) {
      const radius = startRadius + (endRadius - startRadius) * (i / grooveCount);

      // Audio-reactive groove wobble
      const freqIndex = Math.floor((i / grooveCount) * frequencyData.length);
      const audioValue = frequencyData[freqIndex] / 255;
      const wobble = Math.sin(this.rotation * 10 + i * 0.5) * audioValue * 0.5;

      this.ctx.strokeStyle = `rgba(80, 80, 80, ${0.15 + audioValue * 0.25})`;
      this.ctx.lineWidth = 0.7;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius + wobble, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Label (semi-transparent)
    const labelRadius = vinylRadius * 0.26;
    const labelGradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, labelRadius,
    );
    labelGradient.addColorStop(0, this.hexToRgba(colors.primary, 0.6));
    labelGradient.addColorStop(0.7, this.hexToRgba(colors.secondary, 0.5));
    labelGradient.addColorStop(1, this.hexToRgba(colors.secondary, 0.4));

    this.ctx.fillStyle = labelGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, labelRadius, 0, Math.PI * 2);
    this.ctx.fill();

    // Label ring
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, labelRadius - 2, 0, Math.PI * 2);
    this.ctx.stroke();

    // Label text
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    this.ctx.font = "bold 10px sans-serif";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("VIZEC", centerX, centerY);

    // Spindle hole (semi-transparent)
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, 3.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Rotation shine effect
    const shineAngle = this.rotation * 2;
    this.ctx.strokeStyle = `rgba(255, 255, 255, ${0.03 + bass * 0.08})`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, vinylRadius * 0.88, shineAngle, shineAngle + 0.4);
    this.ctx.stroke();

    this.ctx.restore();
  }

  private drawTonearm(
    centerX: number,
    centerY: number,
    size: number,
    _colors: { primary: string; secondary: string },
  ): void {
    if (!this.ctx) return;

    // Tonearm pivot point
    const pivotX = centerX + size * 0.65;
    const pivotY = centerY - size * 0.65;
    const armLength = size * 0.52;

    // Draw tonearm base
    this.ctx.fillStyle = "#555";
    this.ctx.beginPath();
    this.ctx.arc(pivotX, pivotY, 12, 0, Math.PI * 2);
    this.ctx.fill();

    // Base highlight
    this.ctx.fillStyle = "#666";
    this.ctx.beginPath();
    this.ctx.arc(pivotX, pivotY, 8, 0, Math.PI * 2);
    this.ctx.fill();

    // Draw tonearm
    const endX = pivotX + Math.cos(this.armAngle + Math.PI) * armLength;
    const endY = pivotY + Math.sin(this.armAngle + Math.PI) * armLength;

    this.ctx.strokeStyle = "#aaa";
    this.ctx.lineWidth = 5;
    this.ctx.lineCap = "round";
    this.ctx.beginPath();
    this.ctx.moveTo(pivotX, pivotY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    // Tonearm highlight
    this.ctx.strokeStyle = "#ccc";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(pivotX, pivotY);
    this.ctx.lineTo(endX, endY);
    this.ctx.stroke();

    // Counterweight
    const counterX = pivotX + Math.cos(this.armAngle) * 35;
    const counterY = pivotY + Math.sin(this.armAngle) * 35;
    this.ctx.fillStyle = "#555";
    this.ctx.beginPath();
    this.ctx.arc(counterX, counterY, 10, 0, Math.PI * 2);
    this.ctx.fill();

    // Headshell/cartridge
    this.ctx.fillStyle = "#bbb";
    this.ctx.beginPath();
    this.ctx.arc(endX, endY, 7, 0, Math.PI * 2);
    this.ctx.fill();

    // Stylus needle
    this.ctx.strokeStyle = "#888";
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(endX, endY);
    this.ctx.lineTo(
      endX + Math.cos(this.armAngle + Math.PI / 2) * 10,
      endY + Math.sin(this.armAngle + Math.PI / 2) * 10,
    );
    this.ctx.stroke();
  }

  private drawStrobeLights(
    centerX: number,
    centerY: number,
    size: number,
    deltaTime: number,
    colors: { glow: string },
  ): void {
    if (!this.ctx) return;

    this.strobePhase += deltaTime * 0.008;

    const strobeCount = 4;
    const strobeRadius = size * 0.88;

    for (let i = 0; i < strobeCount; i++) {
      const angle = (i / strobeCount) * Math.PI * 2 + this.strobePhase;
      const x = centerX + Math.cos(angle) * strobeRadius;
      const y = centerY + Math.sin(angle) * strobeRadius;

      // Strobe effect (flashes at specific rotation angles)
      const flash = Math.sin(this.rotation * 40 + i * 1.5) > 0.9;

      if (flash) {
        // Flash on
        this.ctx.fillStyle = colors.glow;
        this.ctx.shadowColor = colors.glow;
        this.ctx.shadowBlur = 10;
      } else {
        // Standby state
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        this.ctx.shadowBlur = 0;
      }

      this.ctx.beginPath();
      this.ctx.arc(x, y, 4, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Reset shadow
    this.ctx.shadowBlur = 0;
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
    if (config.platterSpeed !== undefined) this.config.platterSpeed = config.platterSpeed;
    if (config.armSwing !== undefined) this.config.armSwing = config.armSwing;
    if (config.showStrobe !== undefined) this.config.showStrobe = config.showStrobe;
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
      platterSpeed: {
        type: "number",
        label: "Platter Speed",
        default: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.1,
      },
      armSwing: {
        type: "number",
        label: "Arm Swing",
        default: 1.0,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      showStrobe: {
        type: "boolean",
        label: "Show Strobe Lights",
        default: true,
      },
    };
  }
}
