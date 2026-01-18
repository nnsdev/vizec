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

interface HydraulicPistonsConfig extends VisualizationConfig {
  pistonCount: number;
  pistonSpeed: number;
  colorScheme: string;
}

interface Piston {
  x: number;
  baseY: number;
  width: number;
  maxExtension: number;
  currentExtension: number;
  targetExtension: number;
  frequencyBand: number; // Which frequency range this piston responds to
  phase: number;
}

export class HydraulicPistonsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "hydraulicPistons",
    name: "Hydraulic Pistons",
    author: "Vizec",
    description: "Industrial pistons moving to bass rhythm",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: HydraulicPistonsConfig = {
    sensitivity: 1.0,
    pistonCount: 8,
    pistonSpeed: 1.0,
    colorScheme: "monochrome",
  };
  private width = 0;
  private height = 0;
  private pistons: Piston[] = [];
  private time = 0;
  private smoothedVolume = 0;

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

  private initPistons(): void {
    this.pistons = [];
    const { pistonCount } = this.config;

    const pistonWidth = this.width * 0.08;
    const spacing = (this.width - pistonWidth * pistonCount) / (pistonCount + 1);
    const maxExtension = this.height * 0.5;

    for (let i = 0; i < pistonCount; i++) {
      this.pistons.push({
        x: spacing + i * (pistonWidth + spacing) + pistonWidth / 2,
        baseY: this.height,
        width: pistonWidth,
        maxExtension: maxExtension * (0.7 + Math.random() * 0.3),
        currentExtension: 0,
        targetExtension: 0,
        frequencyBand: i / (pistonCount - 1), // 0 to 1, low to high freq
        phase: i * 0.3,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, pistonSpeed } = this.config;
    const { volume, bass, mid, treble, frequencyData } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth volume
    const smoothing = 0.12;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Clear canvas (transparent background)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw base platform
    this.drawBasePlatform(colors);

    // Update and draw each piston
    this.pistons.forEach((piston) => {
      // Get frequency value for this piston
      const freqIndex = Math.floor(piston.frequencyBand * frequencyData.length * 0.6);
      const freqValue = frequencyData[Math.min(freqIndex, frequencyData.length - 1)] / 255;

      // Also blend with bass/mid/treble based on position
      let audioValue = freqValue;
      if (piston.frequencyBand < 0.33) {
        audioValue = (freqValue + bass) / 2;
      } else if (piston.frequencyBand < 0.66) {
        audioValue = (freqValue + mid) / 2;
      } else {
        audioValue = (freqValue + treble) / 2;
      }

      // Calculate target extension
      piston.targetExtension = audioValue * sensitivity * piston.maxExtension;

      // Smooth movement towards target
      const extensionSmoothing = 0.15 * pistonSpeed;
      piston.currentExtension +=
        (piston.targetExtension - piston.currentExtension) * extensionSmoothing;

      // Draw piston
      this.drawPiston(piston, colors, audioValue * sensitivity);
    });

    // Draw connecting framework
    this.drawFramework(colors);

    // Draw hydraulic fluid lines
    this.drawHydraulicLines(colors);
  }

  private drawBasePlatform(_colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const platformHeight = 20;

    // Platform base
    const platformGradient = ctx.createLinearGradient(0, this.height - platformHeight, 0, this.height);
    platformGradient.addColorStop(0, "#555555");
    platformGradient.addColorStop(0.5, "#444444");
    platformGradient.addColorStop(1, "#333333");

    ctx.fillStyle = platformGradient;
    ctx.fillRect(0, this.height - platformHeight, this.width, platformHeight);

    // Top edge highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
    ctx.fillRect(0, this.height - platformHeight, this.width, 2);

    // Mounting holes
    this.pistons.forEach((piston) => {
      ctx.fillStyle = "#222222";
      ctx.beginPath();
      ctx.arc(piston.x, this.height - platformHeight / 2, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#666666";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  private drawPiston(
    piston: Piston,
    colors: { start: string; end: string; glow: string },
    intensity: number
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const { x, baseY, width, currentExtension } = piston;

    const cylinderWidth = width * 0.6;
    const rodWidth = width * 0.3;
    const cylinderHeight = piston.maxExtension * 0.4;
    const rodLength = currentExtension;

    // Calculate positions
    const cylinderY = baseY - cylinderHeight - 30;
    const pistonHeadY = cylinderY - rodLength;

    // Draw hydraulic fluid glow when active
    if (intensity > 0.3) {
      const glowAlpha = Math.min(0.3, (intensity - 0.3) * 0.5);
      const glowGradient = ctx.createLinearGradient(x, cylinderY, x, pistonHeadY);
      glowGradient.addColorStop(0, this.hexToRgba(colors.glow, glowAlpha));
      glowGradient.addColorStop(1, this.hexToRgba(colors.glow, 0));

      ctx.fillStyle = glowGradient;
      ctx.fillRect(x - cylinderWidth / 2 - 5, pistonHeadY, cylinderWidth + 10, cylinderY - pistonHeadY);
    }

    // Draw piston rod (chrome)
    const rodGradient = ctx.createLinearGradient(x - rodWidth / 2, 0, x + rodWidth / 2, 0);
    rodGradient.addColorStop(0, "#666666");
    rodGradient.addColorStop(0.2, "#aaaaaa");
    rodGradient.addColorStop(0.5, "#dddddd");
    rodGradient.addColorStop(0.8, "#aaaaaa");
    rodGradient.addColorStop(1, "#666666");

    ctx.fillStyle = rodGradient;
    ctx.fillRect(x - rodWidth / 2, pistonHeadY, rodWidth, rodLength + 10);

    // Draw piston head
    const headHeight = 15;
    const headGradient = ctx.createLinearGradient(x - cylinderWidth * 0.4, 0, x + cylinderWidth * 0.4, 0);
    headGradient.addColorStop(0, "#555555");
    headGradient.addColorStop(0.3, "#888888");
    headGradient.addColorStop(0.5, "#999999");
    headGradient.addColorStop(0.7, "#888888");
    headGradient.addColorStop(1, "#555555");

    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.roundRect(x - cylinderWidth * 0.4, pistonHeadY - headHeight, cylinderWidth * 0.8, headHeight, 3);
    ctx.fill();

    // Piston head highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(x - cylinderWidth * 0.3, pistonHeadY - headHeight + 2, cylinderWidth * 0.6, 2);

    // Draw cylinder body
    const cylinderGradient = ctx.createLinearGradient(x - cylinderWidth / 2, 0, x + cylinderWidth / 2, 0);
    cylinderGradient.addColorStop(0, "#444444");
    cylinderGradient.addColorStop(0.15, "#666666");
    cylinderGradient.addColorStop(0.5, "#777777");
    cylinderGradient.addColorStop(0.85, "#666666");
    cylinderGradient.addColorStop(1, "#444444");

    ctx.fillStyle = cylinderGradient;
    ctx.beginPath();
    ctx.roundRect(x - cylinderWidth / 2, cylinderY, cylinderWidth, cylinderHeight, 4);
    ctx.fill();

    // Cylinder top cap
    const capGradient = ctx.createLinearGradient(x - cylinderWidth * 0.6, 0, x + cylinderWidth * 0.6, 0);
    capGradient.addColorStop(0, "#555555");
    capGradient.addColorStop(0.5, "#777777");
    capGradient.addColorStop(1, "#555555");

    ctx.fillStyle = capGradient;
    ctx.beginPath();
    ctx.roundRect(x - cylinderWidth * 0.6, cylinderY - 8, cylinderWidth * 1.2, 10, 3);
    ctx.fill();

    // Cylinder highlights and details
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(x - cylinderWidth * 0.3, cylinderY + 5, cylinderWidth * 0.1, cylinderHeight - 10);

    // Draw mounting bracket
    const bracketWidth = cylinderWidth * 1.4;
    const bracketHeight = 25;
    const bracketY = baseY - bracketHeight - 5;

    ctx.fillStyle = "#4a4a4a";
    ctx.beginPath();
    ctx.roundRect(x - bracketWidth / 2, bracketY, bracketWidth, bracketHeight, 4);
    ctx.fill();

    // Bracket bolts
    ctx.fillStyle = "#333333";
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.arc(x + side * bracketWidth * 0.35, bracketY + bracketHeight / 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#555555";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Connection to cylinder
    ctx.fillStyle = "#555555";
    ctx.fillRect(x - cylinderWidth * 0.4, bracketY - 5, cylinderWidth * 0.8, 10);

    // Pressure indicator light
    const indicatorColor = intensity > 0.7 ? "#ff4444" : intensity > 0.4 ? "#ffaa00" : "#44ff44";
    const indicatorGlow = intensity > 0.7 ? 0.5 : intensity > 0.4 ? 0.3 : 0.2;

    // Glow
    const glowGradient = ctx.createRadialGradient(
      x + cylinderWidth * 0.3, cylinderY + cylinderHeight * 0.3, 0,
      x + cylinderWidth * 0.3, cylinderY + cylinderHeight * 0.3, 15
    );
    glowGradient.addColorStop(0, this.hexToRgba(indicatorColor, indicatorGlow));
    glowGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(x + cylinderWidth * 0.3, cylinderY + cylinderHeight * 0.3, 15, 0, Math.PI * 2);
    ctx.fill();

    // Light
    ctx.fillStyle = indicatorColor;
    ctx.beginPath();
    ctx.arc(x + cylinderWidth * 0.3, cylinderY + cylinderHeight * 0.3, 4, 0, Math.PI * 2);
    ctx.fill();

    // Light highlight
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.beginPath();
    ctx.arc(x + cylinderWidth * 0.3 - 1, cylinderY + cylinderHeight * 0.3 - 1, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawFramework(_colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx || this.pistons.length < 2) return;

    const ctx = this.ctx;

    // Draw horizontal support beams connecting pistons
    const beamY = this.height - 60;
    const beamHeight = 8;

    // Main beam
    const beamGradient = ctx.createLinearGradient(0, beamY, 0, beamY + beamHeight);
    beamGradient.addColorStop(0, "#555555");
    beamGradient.addColorStop(0.5, "#666666");
    beamGradient.addColorStop(1, "#444444");

    const firstPiston = this.pistons[0];
    const lastPiston = this.pistons[this.pistons.length - 1];

    ctx.fillStyle = beamGradient;
    ctx.fillRect(
      firstPiston.x - firstPiston.width / 2 - 10,
      beamY,
      lastPiston.x - firstPiston.x + lastPiston.width + 20,
      beamHeight
    );

    // Beam highlights
    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    ctx.fillRect(
      firstPiston.x - firstPiston.width / 2 - 10,
      beamY,
      lastPiston.x - firstPiston.x + lastPiston.width + 20,
      2
    );
  }

  private drawHydraulicLines(_colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx || this.pistons.length < 2) return;

    const ctx = this.ctx;

    // Draw hydraulic fluid lines between pistons
    const lineY = this.height - 45;

    for (let i = 0; i < this.pistons.length - 1; i++) {
      const p1 = this.pistons[i];
      const p2 = this.pistons[i + 1];

      // Pipe shadow
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(p1.x + 2, lineY + 2);
      ctx.lineTo(p2.x + 2, lineY + 2);
      ctx.stroke();

      // Main pipe
      const pipeGradient = ctx.createLinearGradient(p1.x, lineY - 2, p1.x, lineY + 2);
      pipeGradient.addColorStop(0, "#666666");
      pipeGradient.addColorStop(0.5, "#888888");
      pipeGradient.addColorStop(1, "#555555");

      ctx.strokeStyle = pipeGradient;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p1.x, lineY);
      ctx.lineTo(p2.x, lineY);
      ctx.stroke();

      // Pipe highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1.x, lineY - 2);
      ctx.lineTo(p2.x, lineY - 2);
      ctx.stroke();
    }

    // Draw connectors at each piston
    this.pistons.forEach((piston) => {
      ctx.fillStyle = "#777777";
      ctx.beginPath();
      ctx.arc(piston.x, lineY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#555555";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
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
    this.initPistons();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.pistonCount;
    this.config = { ...this.config, ...config } as HydraulicPistonsConfig;

    if (this.config.pistonCount !== oldCount && this.width > 0) {
      this.initPistons();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.pistons = [];
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
        default: "monochrome",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      pistonCount: {
        type: "number",
        label: "Piston Count",
        default: 8,
        min: 4,
        max: 12,
        step: 1,
      },
      pistonSpeed: {
        type: "number",
        label: "Response Speed",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
