import { BaseVisualization } from "../base";
import type {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
  WordEvent,
} from "../types";
import { COLOR_SCHEME_OPTIONS, COLOR_SCHEMES_STRING, getColorScheme } from "../shared/colorSchemes";

interface KaraokeGlowConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  fontSize: number;
  glowStrength: number;
  trailLength: number;
  waveHeight: number;
}

type WordMeasure = {
  word: WordEvent;
  width: number;
  alpha: number;
};

export class KaraokeGlowVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "karaokeGlow",
    name: "Karaoke Glow",
    author: "Vizec",
    description: "Glowing karaoke-style lyrics with trailing words",
    renderer: "canvas2d",
    transitionType: "crossfade",
    usesSpeech: true,
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private time = 0;
  private config: KaraokeGlowConfig = {
    sensitivity: 1,
    colorScheme: "cyanMagenta",
    fontSize: 96,
    glowStrength: 28,
    trailLength: 8,
    waveHeight: 120,
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

    const { bass, treble, volume, frequencyData } = audioData;
    this.time += deltaTime;

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.renderWave(frequencyData, bass, treble);

    const speech = audioData.speech;
    if (speech?.isActive) {
      this.renderWords(speech.currentWord, speech.recentWords, volume);
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
    this.config = { ...this.config, ...config } as KaraokeGlowConfig;
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
      fontSize: {
        type: "number",
        label: "Font Size",
        default: 96,
        min: 48,
        max: 160,
        step: 4,
      },
      glowStrength: {
        type: "number",
        label: "Glow Strength",
        default: 28,
        min: 0,
        max: 60,
        step: 2,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 8,
        min: 2,
        max: 16,
        step: 1,
      },
      waveHeight: {
        type: "number",
        label: "Wave Height",
        default: 120,
        min: 20,
        max: 220,
        step: 10,
      },
    };
  }

  private renderWave(frequencyData: Uint8Array, bass: number, treble: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, this.config.colorScheme);
    const points = 96;
    const step = Math.max(1, Math.floor(frequencyData.length / points));
    const baseY = this.height * 0.4;
    const amplitude = this.config.waveHeight * (0.4 + treble * this.config.sensitivity);

    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < points; i += 1) {
      const freq = frequencyData[i * step] / 255;
      const wave = Math.sin(this.time * 1.5 + i * 0.2) * this.config.waveHeight * 0.15;
      const y = baseY - freq * amplitude + wave;
      const x = (i / (points - 1)) * this.width;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = this.applyAlpha(colors.primary, 0.3 + bass * 0.4);
    ctx.lineWidth = 2 + treble * 2;
    ctx.stroke();
    ctx.restore();
  }

  private renderWords(currentWord: string | null, recentWords: WordEvent[], volume: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, this.config.colorScheme);
    const now = Date.now();
    const maxAge = 8000;
    const trailLimit = Math.max(1, Math.round(this.config.trailLength));
    const filtered = recentWords.filter((word) => now - word.timestamp < maxAge);
    const recent = filtered.slice(-trailLimit);
    const activeWord = currentWord || (recent.length ? recent[recent.length - 1].word : null);
    const trailWords = activeWord ? recent.filter((word) => word.word !== activeWord) : recent;

    const baseY = this.height * 0.65 + Math.sin(this.time * 0.6) * this.config.waveHeight * 0.2;
    const trailFont = this.config.fontSize * 0.55;
    const spacing = trailFont * 0.35;

    ctx.save();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.font = `${Math.round(trailFont)}px "Arial Black", Arial, sans-serif`;

    const measures: WordMeasure[] = trailWords.map((word) => {
      const age = now - word.timestamp;
      const alpha = this.clamp(1 - age / maxAge, 0, 1);
      return { word, width: ctx.measureText(word.word).width, alpha };
    });

    const totalWidth =
      measures.reduce((sum, entry) => sum + entry.width, 0) +
      spacing * Math.max(0, measures.length - 1);
    let x = this.width / 2 - totalWidth / 2;

    measures.forEach((entry, index) => {
      const wave = Math.sin(this.time * 1.2 + index) * this.config.waveHeight * 0.1;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = this.config.glowStrength * 0.25 * entry.alpha;
      ctx.fillStyle = this.applyAlpha(colors.secondary, entry.alpha * 0.9);
      ctx.fillText(entry.word.word, x, baseY + wave);
      x += entry.width + spacing;
    });

    ctx.restore();

    if (activeWord) {
      const size = this.config.fontSize * (1 + volume * 0.6 * this.config.sensitivity);
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(size)}px "Arial Black", Arial, sans-serif`;
      ctx.shadowColor = colors.glow;
      ctx.shadowBlur = this.config.glowStrength * (0.6 + volume);
      ctx.lineWidth = Math.max(2, size * 0.06);
      ctx.strokeStyle = this.applyAlpha(colors.glow, 0.8);
      ctx.fillStyle = this.applyAlpha(colors.primary, 1);
      ctx.strokeText(activeWord, this.width / 2, baseY);
      ctx.fillText(activeWord, this.width / 2, baseY);
      ctx.restore();
    }
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
