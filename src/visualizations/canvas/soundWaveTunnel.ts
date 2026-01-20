import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_STRING, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface SoundWaveTunnelConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  ringCount: number;
  tunnelDepth: number;
  glowIntensity: number;
}

export class SoundWaveTunnelVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "soundWaveTunnel",
    name: "Sound Wave Tunnel",
    author: "Vizec",
    description: "Concentric rings forming an audio-reactive tunnel effect",
    renderer: "canvas2d",
    transitionType: "zoom",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: SoundWaveTunnelConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    ringCount: 30,
    tunnelDepth: 1.0,
    glowIntensity: 1.0,
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

    const { bass, mid, treble, volume, frequencyData, timeDomainData } = audioData;
    const { sensitivity, colorScheme, ringCount, tunnelDepth, glowIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45 * tunnelDepth;

    // Calculate audio boost factors
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity * 1;

    // Draw concentric rings from outside in
    for (let i = 0; i < ringCount; i++) {
      // Calculate ring position
      const t = i / (ringCount - 1);
      const baseRadius = maxRadius * (1 - Math.pow(t, 0.8));

      // Get frequency data for this ring (distribute frequency bands across rings)
      const freqIndex = Math.floor(t * frequencyData.length * 0.7);
      const freqValue = frequencyData[freqIndex] / 255;

      // Waveform distortion
      const waveIndex = Math.floor((timeDomainData.length / ringCount) * i);
      const waveValue = (timeDomainData[waveIndex] || 128) / 128 - 0.5;

      // Calculate ring radius with audio reactivity
      const audioRadius = baseRadius * (1 + freqValue * 0.15 * sensitivity);
      const waveDistortion = waveValue * 10 * sensitivity;
      const ringRadius = Math.max(5, audioRadius + waveDistortion);

      // Determine color based on ring position and audio
      const isBassRing = t < 0.33;
      const isMidRing = t >= 0.33 && t < 0.66;

      let ringColor: string;
      let glowColor: string;

      if (isBassRing) {
        ringColor = colors.secondary;
        glowColor = colors.glow;
      } else if (isMidRing) {
        ringColor = colors.primary;
        glowColor = colors.secondary;
      } else {
        ringColor = colors.glow;
        glowColor = colors.primary;
      }

      // Calculate opacity based on depth (fade out in distance)
      const depthAlpha = 1 - Math.pow(t, 0.5);
      const audioAlpha = 0.3 + freqValue * 0.5;

      // Draw ring glow
      this.ctx.save();
      this.ctx.globalAlpha = audioAlpha * depthAlpha * glowIntensity;

      // Outer glow
      this.ctx.shadowBlur =
        15 + (isBassRing ? bassBoost * 10 : isMidRing ? midBoost * 8 : trebleBoost * 5);
      this.ctx.shadowColor = glowColor;

      // Draw the ring
      this.ctx.strokeStyle = ringColor;
      this.ctx.lineWidth =
        2 + (isBassRing ? bassBoost * 2 : isMidRing ? midBoost * 1.5 : trebleBoost);

      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Draw inner highlight
      this.ctx.globalAlpha = audioAlpha * 0.5 * depthAlpha;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ringRadius * 0.95, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.restore();
    }

    // Draw center glow based on overall volume
    const centerGlow = volume * sensitivity * 0.5;
    if (centerGlow > 0.05) {
      const gradient = this.ctx.createRadialGradient(
        centerX,
        centerY,
        0,
        centerX,
        centerY,
        50 * centerGlow * glowIntensity,
      );
      gradient.addColorStop(0, colors.glow + "40");
      gradient.addColorStop(0.5, colors.primary + "20");
      gradient.addColorStop(1, "transparent");

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, 50 * centerGlow * glowIntensity, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Draw audio-reactive particles at center
    const particleCount = Math.floor(8 + volume * sensitivity * 16);
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + volume * 2;
      const distance = 20 + bassBoost * 30;
      const particleX = centerX + Math.cos(angle) * distance;
      const particleY = centerY + Math.sin(angle) * distance;
      const particleSize = 2 + trebleBoost * 3;

      this.ctx.save();
      this.ctx.globalAlpha = 0.5 + volume * 0.5;
      this.ctx.fillStyle = colors.glow;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = colors.glow;

      this.ctx.beginPath();
      this.ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
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
    this.config = { ...this.config, ...config } as SoundWaveTunnelConfig;
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
      ringCount: {
        type: "number",
        min: 10,
        max: 50,
        step: 1,
        default: 30,
        label: "Ring Count",
      },
      tunnelDepth: {
        type: "number",
        min: 0.5,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Tunnel Depth",
      },
      glowIntensity: {
        type: "number",
        min: 0,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Glow Intensity",
      },
    };
  }
}
