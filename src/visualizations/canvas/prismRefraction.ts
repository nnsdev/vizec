import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_STRING, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface PrismRefractionConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  bandCount: number;
  refractionAngle: number;
  spread: number;
}

export class PrismRefractionVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "prismRefraction",
    name: "Prism Refraction",
    author: "Vizec",
    description: "Light spectrum that splits and refracts based on frequency bands",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: PrismRefractionConfig = {
    sensitivity: 1.0,
    colorScheme: "fire",
    bandCount: 14,
    refractionAngle: 45,
    spread: 1.0,
  };

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

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, bandCount, refractionAngle, spread } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Calculate audio boost
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;
    const overallBoost = volume * sensitivity;

    // Draw central light source
    const lightRadius = 30 + overallBoost * 40;
    const lightGlow = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      lightRadius * 3,
    );
    lightGlow.addColorStop(0, colors.primary + "CC");
    lightGlow.addColorStop(0.3, colors.secondary + "66");
    lightGlow.addColorStop(0.6, colors.glow + "33");
    lightGlow.addColorStop(1, "transparent");

    this.ctx.save();
    this.ctx.fillStyle = lightGlow;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, lightRadius * 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Central light core
    this.ctx.fillStyle = colors.primary;
    this.ctx.shadowBlur = 20 + trebleBoost * 15;
    this.ctx.shadowColor = colors.glow;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, lightRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // Calculate refraction angle in radians
    const angleRad = (refractionAngle * Math.PI) / 180;

    // Draw spectral bands
    const maxSpread = Math.min(this.width, this.height) * 0.4 * spread;

    // Spectrum colors (rainbow from red to violet)
    const spectrumColors = [
      "#FF0000", // Red (bass)
      "#FF4500",
      "#FF8C00",
      "#FFD700",
      "#ADFF2F",
      "#00FF00",
      "#00CED1",
      "#00BFFF",
      "#1E90FF",
      "#4169E1",
      "#6A5ACD",
      "#8A2BE2",
      "#9400D3",
      "#FF00FF", // Violet (treble)
    ];

    for (let i = 0; i < bandCount; i++) {
      const t = i / (bandCount - 1);

      // Get frequency data for this band
      const freqIndex = Math.floor(t * frequencyData.length);
      const freqValue = frequencyData[freqIndex] / 255;

      // Calculate band properties
      const isBassBand = t < 0.33;
      const isMidBand = t >= 0.33 && t < 0.66;

      let bandFreqBoost: number;
      if (isBassBand) {
        bandFreqBoost = bassBoost;
      } else if (isMidBand) {
        bandFreqBoost = midBoost;
      } else {
        bandFreqBoost = trebleBoost;
      }

      // Calculate band length based on frequency
      const baseLength = (0.3 + t * 0.5) * maxSpread;
      const audioLength = baseLength * (1 + freqValue * 0.8 * sensitivity);
      const bandLength = audioLength * spread;

      // Calculate band position
      const bandAngle = angleRad + (t - 0.5) * Math.PI * 0.5 * spread;
      const startX = centerX + Math.cos(bandAngle) * lightRadius;
      const startY = centerY + Math.sin(bandAngle) * lightRadius;
      const endX = centerX + Math.cos(bandAngle) * (lightRadius + bandLength);
      const endY = centerY + Math.sin(bandAngle) * (lightRadius + bandLength);

      // Get band color
      const colorIndex = Math.floor(t * (spectrumColors.length - 1));
      const bandColor = spectrumColors[Math.min(colorIndex, spectrumColors.length - 1)];

      // Calculate opacity based on audio
      const bandOpacity = 0.2 + freqValue * 0.7 + bandFreqBoost * 0.2;

      // Draw band glow
      this.ctx.save();
      this.ctx.globalAlpha = bandOpacity;
      this.ctx.strokeStyle = bandColor;
      this.ctx.lineWidth = 4 + freqValue * 8;
      this.ctx.shadowBlur = 10 + bandFreqBoost * 10;
      this.ctx.shadowColor = bandColor;

      this.ctx.beginPath();
      this.ctx.moveTo(startX, startY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();

      // Draw inner bright line
      this.ctx.globalAlpha = bandOpacity * 0.7;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, startY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();

      // Draw band endpoint glow
      this.ctx.globalAlpha = bandOpacity * 0.5;
      this.ctx.fillStyle = bandColor;
      this.ctx.beginPath();
      this.ctx.arc(endX, endY, 5 + freqValue * 5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.restore();
    }

    // Draw ambient glow based on overall volume
    if (volume > 0.1) {
      const ambientGlow = this.ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        Math.max(this.width, this.height) * 0.5,
      );
      ambientGlow.addColorStop(0, colors.primary + "10");
      ambientGlow.addColorStop(0.5, colors.secondary + "05");
      ambientGlow.addColorStop(1, "transparent");

      this.ctx.save();
      this.ctx.globalAlpha = volume * 0.3;
      this.ctx.fillStyle = ambientGlow;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, Math.max(this.width, this.height) * 0.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
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
    this.config = { ...this.config, ...config } as PrismRefractionConfig;
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
        default: "fire",
        label: "Color Scheme",
      },
      bandCount: {
        type: "number",
        min: 7,
        max: 21,
        step: 1,
        default: 14,
        label: "Band Count",
      },
      refractionAngle: {
        type: "number",
        min: 0,
        max: 180,
        step: 5,
        default: 45,
        label: "Refraction Angle",
      },
      spread: {
        type: "number",
        min: 0.5,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Spread",
      },
    };
  }
}
