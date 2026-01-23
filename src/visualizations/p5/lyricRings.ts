import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
  WordEvent,
} from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface LyricRingsConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  ringCount: number;
  ringRadius: number;
  ringSpacing: number;
  fontSize: number;
  spinSpeed: number;
}

export class LyricRingsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "lyricRings",
    name: "Lyric Rings",
    author: "Vizec",
    description: "Orbiting lyric rings that spin with the music",
    renderer: "p5",
    transitionType: "crossfade",
    usesSpeech: true,
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: LyricRingsConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    ringCount: 3,
    ringRadius: 140,
    ringSpacing: 90,
    fontSize: 54,
    spinSpeed: 0.35,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private currentDeltaTime = 0.016;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.width = container.clientWidth || window.innerWidth;
    this.height = container.clientHeight || window.innerHeight;

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.textAlign(p.CENTER, p.CENTER);
        p.textFont("Arial Black");
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  render(audioData: AudioData, deltaTime: number): void {
    this.currentAudioData = audioData;
    this.currentDeltaTime = deltaTime || 0.016;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as LyricRingsConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
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
      ringCount: {
        type: "number",
        label: "Ring Count",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
      },
      ringRadius: {
        type: "number",
        label: "Ring Radius",
        default: 140,
        min: 60,
        max: 260,
        step: 10,
      },
      ringSpacing: {
        type: "number",
        label: "Ring Spacing",
        default: 90,
        min: 40,
        max: 160,
        step: 10,
      },
      fontSize: {
        type: "number",
        label: "Font Size",
        default: 54,
        min: 24,
        max: 96,
        step: 2,
      },
      spinSpeed: {
        type: "number",
        label: "Spin Speed",
        default: 0.35,
        min: 0.05,
        max: 1,
        step: 0.05,
      },
    };
  }

  private drawVisualization(p: p5): void {
    if (!this.currentAudioData) return;

    const { bass, treble, volume } = this.currentAudioData;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, this.config.colorScheme);
    this.time += this.currentDeltaTime;

    p.clear();

    const speech = this.currentAudioData.speech;
    if (!speech?.isActive) {
      this.renderHint(p, colors.secondary);
      return;
    }

    const ringCount = Math.max(1, Math.round(this.config.ringCount));
    const words = this.collectRecentWords(speech.recentWords, 12);
    const ringWords: WordEvent[][] = Array.from({ length: ringCount }, () => []);
    words.forEach((word, index) => {
      ringWords[index % ringCount].push(word);
    });

    const centerWord = speech.currentWord ?? (words.length ? words[words.length - 1].word : null);

    p.push();
    p.translate(this.width / 2, this.height / 2);

    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const ring = ringWords[ringIndex];
      if (!ring.length) continue;

      const baseRadius =
        this.config.ringRadius + ringIndex * this.config.ringSpacing * (1 + bass * 0.25);
      const spinDir = ringIndex % 2 === 0 ? 1 : -1;
      const spin =
        this.time *
        this.config.spinSpeed *
        spinDir *
        (0.4 + treble * 1.2 * this.config.sensitivity);
      const count = ring.length;

      ring.forEach((entry, wordIndex) => {
        const angle = (wordIndex / count) * p.TWO_PI + spin;
        const x = Math.cos(angle) * baseRadius;
        const y = Math.sin(angle) * baseRadius;
        const ageAlpha = this.getWordAlpha(entry);
        const size = this.config.fontSize * (0.55 + volume * 0.45);

        p.push();
        p.translate(x, y);
        p.rotate(angle + p.HALF_PI);
        p.textSize(size);
        p.strokeWeight(2);
        p.stroke(this.withAlpha(p, colors.accent, ageAlpha * 0.6));
        p.fill(this.withAlpha(p, colors.primary, ageAlpha));
        p.text(entry.word, 0, 0);
        p.pop();
      });
    }

    if (centerWord) {
      const size = this.config.fontSize * 1.4 * (1 + volume * 0.6);
      p.textSize(size);
      p.strokeWeight(3 + volume * 2);
      p.stroke(this.withAlpha(p, colors.accent, 0.8));
      p.fill(this.withAlpha(p, colors.secondary, 1));
      p.text(centerWord, 0, 0);
    }

    p.pop();
  }

  private collectRecentWords(words: WordEvent[], limit: number): WordEvent[] {
    const now = Date.now();
    const maxAge = 9000;
    return words.filter((word) => now - word.timestamp < maxAge).slice(-limit);
  }

  private getWordAlpha(word: WordEvent): number {
    const age = Date.now() - word.timestamp;
    const maxAge = 9000;
    return this.clamp(1 - age / maxAge, 0.15, 1);
  }

  private withAlpha(p: p5, color: string, alpha: number): p5.Color {
    const c = p.color(color);
    c.setAlpha(this.clamp(alpha, 0, 1) * 255);
    return c;
  }

  private renderHint(p: p5, color: string): void {
    p.push();
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(20);
    p.fill(this.withAlpha(p, color, 0.7));
    p.text("Press S to enable speech", this.width / 2, this.height * 0.7);
    p.pop();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
