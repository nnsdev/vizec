import { BaseVisualization } from "../base";
import type {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
  WordEvent,
} from "../types";
import { COLOR_SCHEME_OPTIONS, COLOR_SCHEMES_STRING, getColorScheme } from "../shared/colorSchemes";

interface SpectrumCaptionsConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  barCount: number;
  bandHeight: number;
  captionSize: number;
  glow: boolean;
  trailLength: number;
}

type CaptionWord = {
  word: WordEvent;
  alpha: number;
  width: number;
};

export class SpectrumCaptionsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "spectrumCaptions",
    name: "Spectrum Captions",
    author: "Vizec",
    description: "Subtitle band synced to spectrum bars",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private time = 0;
  private config: SpectrumCaptionsConfig = {
    sensitivity: 1,
    colorScheme: "cyanMagenta",
    barCount: 64,
    bandHeight: 160,
    captionSize: 42,
    glow: true,
    trailLength: 7,
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
    this.resize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;
    this.time += deltaTime;

    const { frequencyData, bass, treble, volume } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, this.config.colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    const bandHeight = this.config.bandHeight * (0.6 + bass * 0.6);
    const bandTop = this.height - bandHeight;
    const barCount = this.config.barCount;
    const barWidth = this.width / barCount;
    const freqStep = Math.max(1, Math.floor(frequencyData.length / barCount));

    this.ctx.save();
    this.ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < barCount; i += 1) {
      const value = frequencyData[i * freqStep] / 255;
      const height = value * bandHeight * (0.5 + this.config.sensitivity * 0.7);
      const x = i * barWidth + barWidth * 0.1;
      const barW = barWidth * 0.8;
      const y = bandTop + bandHeight - height;

      const gradient = this.ctx.createLinearGradient(0, y, 0, bandTop + bandHeight);
      gradient.addColorStop(0, colors.primary);
      gradient.addColorStop(1, colors.secondary);

      this.ctx.fillStyle = gradient;
      this.ctx.globalAlpha = 0.35 + value * 0.55;
      this.ctx.fillRect(x, y, barW, height);
    }

    this.ctx.restore();

    const speech = audioData.speech;
    if (speech?.isActive) {
      this.renderCaptions(speech.currentWord, speech.recentWords, bandTop, volume, treble);
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
    this.config = { ...this.config, ...config } as SpectrumCaptionsConfig;
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
        default: 1,
        min: 0.5,
        max: 2.5,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      barCount: {
        type: "number",
        label: "Bar Count",
        default: 64,
        min: 24,
        max: 120,
        step: 4,
      },
      bandHeight: {
        type: "number",
        label: "Band Height",
        default: 160,
        min: 80,
        max: 260,
        step: 10,
      },
      captionSize: {
        type: "number",
        label: "Caption Size",
        default: 42,
        min: 20,
        max: 90,
        step: 2,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 7,
        min: 2,
        max: 12,
        step: 1,
      },
      glow: {
        type: "boolean",
        label: "Glow",
        default: true,
      },
    };
  }

  private renderCaptions(
    currentWord: string | null,
    recentWords: WordEvent[],
    bandTop: number,
    volume: number,
    treble: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, this.config.colorScheme);
    const now = Date.now();
    const maxAge = 8000;
    const activeWord =
      currentWord ?? (recentWords.length ? recentWords[recentWords.length - 1].word : null);
    const filtered = recentWords.filter((word) => now - word.timestamp < maxAge);
    const trail = filtered.slice(-this.config.trailLength);

    const captionSize = this.config.captionSize * (1 + volume * 0.4 * this.config.sensitivity);
    const trailSize = captionSize * 0.55;
    const baseY = bandTop - captionSize * 0.25;

    ctx.save();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(trailSize)}px "Arial Black", Arial, sans-serif`;

    const entries: CaptionWord[] = trail
      .filter((word) => word.word !== activeWord)
      .map((word) => {
        const age = now - word.timestamp;
        const alpha = this.clamp(1 - age / maxAge, 0, 1);
        return { word, alpha, width: ctx.measureText(word.word).width };
      });

    const spacing = trailSize * 0.25;
    const totalWidth =
      entries.reduce((sum, entry) => sum + entry.width, 0) +
      spacing * Math.max(0, entries.length - 1);
    let x = this.width / 2 - totalWidth / 2;
    const trailY = baseY - trailSize * 0.9;

    entries.forEach((entry) => {
      ctx.fillStyle = this.applyAlpha(colors.secondary, entry.alpha * 0.7);
      if (this.config.glow) {
        ctx.shadowBlur = 10 + treble * 20;
        ctx.shadowColor = colors.glow;
      }
      ctx.fillText(entry.word.word, x, trailY);
      x += entry.width + spacing;
    });

    if (activeWord) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(captionSize)}px "Arial Black", Arial, sans-serif`;
      ctx.shadowBlur = this.config.glow ? 20 + treble * 30 : 0;
      ctx.shadowColor = colors.glow;
      ctx.strokeStyle = this.applyAlpha(colors.glow, 0.7);
      ctx.lineWidth = Math.max(2, captionSize * 0.06);
      ctx.fillStyle = colors.primary;
      ctx.strokeText(activeWord, this.width / 2, baseY);
      ctx.fillText(activeWord, this.width / 2, baseY);
    }

    ctx.restore();
  }

  private applyAlpha(color: string, alpha: number): string {
    const normalized = color.replace("#", "");
    const value = parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `rgba(${r}, ${g}, ${b}, ${this.clamp(alpha, 0, 1)})`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
