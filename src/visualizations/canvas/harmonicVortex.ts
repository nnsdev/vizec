import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_STRING, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface HarmonicVortexConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  armCount: number;
  rotationSpeed: number;
  twistAmount: number;
}

export class HarmonicVortexVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "harmonicVortex",
    name: "Harmonic Vortex",
    author: "Vizec",
    description: "Multi-arm spiral where each arm reacts to a frequency band",
    renderer: "canvas2d",
    transitionType: "zoom",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: HarmonicVortexConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    armCount: 6,
    rotationSpeed: 0.5,
    twistAmount: 2.0,
  };

  private rotation = 0;

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

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, armCount, rotationSpeed, twistAmount } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45;

    // Update rotation based on volume
    const rotationBoost = volume * sensitivity * 0.5;
    this.rotation += (rotationSpeed * 0.01 + rotationBoost * 0.01) * deltaTime * 60;

    // Calculate audio boosts
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    // Draw each arm
    for (let arm = 0; arm < armCount; arm++) {
      const armAngle = (arm / armCount) * Math.PI * 2 + this.rotation;

      // Determine which frequency band this arm responds to
      const armBand = arm % 3; // 0 = bass, 1 = mid, 2 = treble
      let armBoost: number;
      let armColor: string;
      let glowColor: string;

      if (armBand === 0) {
        // Bass arms (outer)
        armBoost = bassBoost;
        armColor = colors.secondary;
        glowColor = colors.glow;
      } else if (armBand === 1) {
        // Mid arms (middle)
        armBoost = midBoost;
        armColor = colors.primary;
        glowColor = colors.secondary;
      } else {
        // Treble arms (inner)
        armBoost = trebleBoost;
        armColor = colors.glow;
        glowColor = colors.primary;
      }

      // Draw the arm
      this.ctx.save();
      this.ctx.translate(centerX, centerY);
      this.ctx.rotate(armAngle);

      // Draw arm segments
      const segments = 20;
      for (let seg = 0; seg < segments; seg++) {
        const t = seg / segments;
        const segmentRadius = t * maxRadius;

        // Get frequency data for this segment
        const freqIndex = Math.floor(
          t * frequencyData.length * 0.5 + (arm / armCount) * frequencyData.length * 0.3,
        );
        const freqValue = frequencyData[freqIndex] / 255;

        // Calculate segment properties
        const segmentWidth = 5 + armBoost * 5 + freqValue * 10 * sensitivity;
        const segmentLength = (maxRadius / segments) * 1.2;
        const twist = t * twistAmount * (1 + armBoost * 0.5);
        const alpha = 1 - t * 0.7;

        // Draw segment glow
        this.ctx.globalAlpha = alpha * 0.8;
        this.ctx.shadowBlur = 5 + armBoost * 8;
        this.ctx.shadowColor = glowColor;
        this.ctx.strokeStyle = armColor;
        this.ctx.lineWidth = segmentWidth;
        this.ctx.lineCap = "round";

        this.ctx.beginPath();
        this.ctx.moveTo(Math.cos(twist) * segmentRadius, Math.sin(twist) * segmentRadius);
        this.ctx.lineTo(
          Math.cos(twist) * (segmentRadius + segmentLength),
          Math.sin(twist) * (segmentRadius + segmentLength),
        );
        this.ctx.stroke();

        // Draw inner highlight
        this.ctx.globalAlpha = alpha * 0.5;
        this.ctx.lineWidth = segmentWidth * 0.5;
        this.ctx.strokeStyle = glowColor;
        this.ctx.beginPath();
        this.ctx.moveTo(Math.cos(twist) * segmentRadius, Math.sin(twist) * segmentRadius);
        this.ctx.lineTo(
          Math.cos(twist) * (segmentRadius + segmentLength),
          Math.sin(twist) * (segmentRadius + segmentLength),
        );
        this.ctx.stroke();
      }

      // Draw arm endpoint particle
      const endX = Math.cos(twistAmount) * maxRadius;
      const endY = Math.sin(twistAmount) * maxRadius;
      const particleSize = 3 + armBoost * 4 + volume * 5;

      this.ctx.globalAlpha = 0.9;
      this.ctx.shadowBlur = 15 + armBoost * 10;
      this.ctx.shadowColor = glowColor;
      this.ctx.fillStyle = armColor;
      this.ctx.beginPath();
      this.ctx.arc(endX, endY, particleSize, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    // Draw center core
    const coreSize = 10 + bassBoost * 15;
    const coreGlow = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      coreSize * 3,
    );
    coreGlow.addColorStop(0, colors.primary + "CC");
    coreGlow.addColorStop(0.4, colors.secondary + "66");
    coreGlow.addColorStop(1, "transparent");

    this.ctx.save();
    this.ctx.globalAlpha = 0.5 + volume * 0.5;
    this.ctx.fillStyle = coreGlow;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, coreSize * 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 20 + bassBoost * 15;
    this.ctx.shadowColor = colors.glow;
    this.ctx.fillStyle = colors.primary;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, coreSize, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
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
    this.config = { ...this.config, ...config } as HarmonicVortexConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
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
      armCount: {
        type: "number",
        min: 4,
        max: 12,
        step: 1,
        default: 6,
        label: "Arm Count",
      },
      rotationSpeed: {
        type: "number",
        min: 0,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Rotation Speed",
      },
      twistAmount: {
        type: "number",
        min: 0,
        max: 5,
        step: 0.1,
        default: 2.0,
        label: "Twist Amount",
      },
    };
  }
}
