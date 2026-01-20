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

// Extended config interface for piano-specific settings
interface PianoKeysConfig extends VisualizationConfig {
  keyCount: number;
  keyAnimation: number;
  glowIntensity: number;
  showLabels: boolean;
  fallingNotes: boolean;
}

// Piano key data structure
interface PianoKey {
  x: number;
  y: number;
  width: number;
  height: number;
  isBlack: boolean;
  isPressed: boolean;
  pressAmount: number; // 0-1 for animation
  frequency: number; // Target frequency for this key
  noteName: string; // e.g., "C", "C#", "D", etc.
  octave: number; // Octave number
}

// Note particle for falling notes effect
interface NoteParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

export class PianoKeysVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "pianoKeys",
    name: "Piano Keys",
    author: "Vizec",
    description: "Animated piano keyboard that reacts to music",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PianoKeysConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    keyCount: 24,
    keyAnimation: 1.0,
    glowIntensity: 1.0,
    showLabels: true,
    fallingNotes: false,
  };
  private width = 0;
  private height = 0;
  private keys: PianoKey[] = [];
  private noteParticles: NoteParticle[] = [];
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    // Create canvas element - standard pattern from frequencyBars.ts:45-60
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

    this.initKeys();
  }

  private initKeys(): void {
    // Generate piano key layout with 2-3 black key pattern
    this.keys = [];
    const { keyCount } = this.config;

    // Calculate key dimensions based on screen size
    const octaveCount = Math.ceil(keyCount / 12);
    const whiteKeyWidth = this.width / (octaveCount * 7);
    const blackKeyWidth = whiteKeyWidth * 0.6;
    const blackKeyHeight = this.height * 0.4;
    const whiteKeyHeight = this.height;

    // Note names for natural keys
    const noteNames = ["C", "D", "E", "F", "G", "A", "B"];

    let keyIndex = 0;
    for (let octave = 0; octave < octaveCount && keyIndex < keyCount; octave++) {
      // White keys (7 per octave)
      for (let i = 0; i < 7 && keyIndex < keyCount; i++) {
        const x = (octave * 7 + i) * whiteKeyWidth;

        this.keys.push({
          x,
          y: 0,
          width: whiteKeyWidth - 1,
          height: whiteKeyHeight,
          isBlack: false,
          isPressed: false,
          pressAmount: 0,
          frequency: this.noteToFrequency(octave + 4, i), // Start from octave 4
          noteName: noteNames[i],
          octave: octave + 4,
        });
        keyIndex++;
      }

      // Black keys (5 per octave, between certain white keys)
      const blackKeyPositions = [0, 1, 3, 4, 5]; // C#, D#, F#, G#, A#
      for (const pos of blackKeyPositions) {
        if (keyIndex >= keyCount) break;

        const whiteX = (octave * 7 + pos) * whiteKeyWidth;
        const x = whiteX - blackKeyWidth / 2;

        this.keys.push({
          x,
          y: 0,
          width: blackKeyWidth,
          height: blackKeyHeight,
          isBlack: true,
          isPressed: false,
          pressAmount: 0,
          frequency: this.noteToFrequency(octave + 4, pos + 1), // +1 for sharp
          noteName: noteNames[pos] + "#",
          octave: octave + 4,
        });
        keyIndex++;
      }
    }
  }

  private noteToFrequency(octave: number, noteIndex: number): number {
    // Calculate frequency from octave and note index
    // A4 = 440Hz, MIDI note 69
    const midiNote = (octave + 1) * 12 + noteIndex + 12; // C0 = MIDI 12
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass, mid, treble } = audioData;
    const {
      sensitivity,
      colorScheme,
      keyCount,
      keyAnimation,
      glowIntensity,
      fallingNotes,
    } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values - pattern from telegraphSparks.ts:113-115
    const smoothing = 0.15;
    this.smoothedBass += (bass - this.smoothedBass) * smoothing;
    this.smoothedMid += (mid - this.smoothedMid) * smoothing;
    this.smoothedTreble += (treble - this.smoothedTreble) * smoothing;

    // Clear canvas for transparency - critical per CLAUDE.md:131
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update key states based on frequency data
    this.updateKeys(frequencyData, deltaTime, colors, fallingNotes);

    // Draw all keys
    this.drawKeys(colors, glowIntensity);

    // Update and draw falling note particles
    if (fallingNotes) {
      this.updateParticles(deltaTime);
      this.drawParticles(colors);
    }

    // Reset context state
    this.ctx.globalAlpha = 1.0;
    this.ctx.shadowBlur = 0;
  }

  private updateKeys(
    frequencyData: Uint8Array,
    deltaTime: number,
    _colors: { start: string; end: string; glow: string },
    fallingNotes: boolean
  ): void {
    const { sensitivity, keyAnimation } = this.config;

    // Sample frequency data to match key count - pattern from frequencyBars.ts:86-94
    const step = Math.floor(frequencyData.length / this.keys.length);

    for (let i = 0; i < this.keys.length; i++) {
      const key = this.keys[i];

      // Get frequency data for this key's position
      const freqIndex = Math.min(i * step, frequencyData.length - 1);
      const audioValue = frequencyData[freqIndex] / 255;

      // Calculate frequency compensation (boost higher frequencies)
      const freqPosition = i / this.keys.length;
      const freqCompensation = 1 + freqPosition * 2.5;
      const compensatedValue = audioValue * freqCompensation * sensitivity;

      // Apply threshold to prevent noise
      const threshold = 0.1;
      const smoothedValue = key.pressAmount;

      // Key press detection with smoothing
      if (compensatedValue > threshold && compensatedValue > smoothedValue) {
        key.isPressed = true;
        key.pressAmount = Math.min(1, compensatedValue);

        // Spawn particle on new key press
        if (fallingNotes && smoothedValue < 0.2) {
          this.spawnNoteParticle(key, _colors);
        }
      } else {
        // Key release with decay animation
        const decayRate = 0.1 + (1 - keyAnimation) * 0.2;
        key.pressAmount -= decayRate * (deltaTime / 16.67); // Normalize to 60fps
        if (key.pressAmount < 0.01) {
          key.isPressed = false;
          key.pressAmount = 0;
        }
      }
    }
  }

  private spawnNoteParticle(
    key: PianoKey,
    colors: { start: string; end: string; glow: string }
  ): void {
    this.noteParticles.push({
      x: key.x + key.width / 2,
      y: key.y + key.height,
      vx: (Math.random() - 0.5) * 30,
      vy: 50 + Math.random() * 50,
      life: 1.0,
      maxLife: 1.0,
      color: key.isBlack ? colors.end : colors.start,
      size: 8 + Math.random() * 8,
    });
  }

  private updateParticles(deltaTime: number): void {
    const dt = deltaTime / 1000; // Convert to seconds

    for (let i = this.noteParticles.length - 1; i >= 0; i--) {
      const particle = this.noteParticles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 200 * dt; // Gravity
      particle.life -= dt * 1.5;

      if (particle.life <= 0 || particle.y > this.height) {
        this.noteParticles.splice(i, 1);
      }
    }
  }

  private drawKeys(
    colors: { start: string; end: string; glow: string },
    glowIntensity: number
  ): void {
    for (const key of this.keys) {
      this.ctx?.save();

      if (key.isBlack) {
        // Black key rendering with transparency
        const blackAlpha = 0.7 + key.pressAmount * 0.2;
        this.ctx!.fillStyle = key.pressAmount > 0
          ? this.lerpColorAlpha("#1a1a1a", colors.start, key.pressAmount * 0.5, blackAlpha)
          : `rgba(26, 26, 26, ${blackAlpha})`;

        if (key.pressAmount > 0) {
          this.ctx!.shadowColor = colors.glow;
          this.ctx!.shadowBlur = 15 * key.pressAmount * key.pressAmount * glowIntensity;
        }
      } else {
        // White key rendering with gradient and transparency
        const whiteAlpha = 0.5 + key.pressAmount * 0.3;
        const gradient = this.ctx!.createLinearGradient(
          key.x, 0,
          key.x + key.width, 0
        );
        gradient.addColorStop(0, `rgba(245, 245, 245, ${whiteAlpha})`);
        gradient.addColorStop(0.5, `rgba(255, 255, 255, ${whiteAlpha})`);
        gradient.addColorStop(1, `rgba(224, 224, 224, ${whiteAlpha})`);

        this.ctx!.fillStyle = key.pressAmount > 0
          ? this.lerpColorAlpha("#ffffff", colors.start, key.pressAmount * 0.3, whiteAlpha)
          : gradient;
      }

      // Draw key with depression effect
      const pressOffset = key.pressAmount * 3;
      this.ctx!.fillRect(
        key.x,
        key.y + pressOffset,
        key.width,
        key.height - pressOffset
      );

      // Key outline (semi-transparent)
      this.ctx!.strokeStyle = "rgba(0, 0, 0, 0.2)";
      this.ctx!.lineWidth = 1;
      this.ctx!.strokeRect(
        key.x,
        key.y + pressOffset,
        key.width,
        key.height - pressOffset
      );

      // Note labels (optional)
      if (this.config.showLabels && !key.isBlack && key.noteName === "C") {
        this.ctx!.fillStyle = "rgba(0, 0, 0, 0.5)";
        this.ctx!.font = `${Math.max(10, this.height * 0.02)}px monospace`;
        this.ctx!.fillText(
          `${key.noteName}${key.octave}`,
          key.x + 4,
          key.y + this.height - 10
        );
      }

      this.ctx?.restore();
    }
  }

  private drawParticles(_colors: { start: string; end: string; glow: string }): void {
    for (const particle of this.noteParticles) {
      this.ctx?.save();
      this.ctx!.globalAlpha = particle.life;
      this.ctx!.fillStyle = particle.color;
      this.ctx!.beginPath();
      this.ctx!.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx!.fill();
      this.ctx?.restore();
    }
  }

  private lerpColor(color1: string, color2: string, t: number): string {
    // Linear interpolation between two hex colors
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);
    if (!c1 || !c2) return color1;

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);

    return `rgb(${r}, ${g}, ${b})`;
  }

  private lerpColorAlpha(color1: string, color2: string, t: number, alpha: number): string {
    // Linear interpolation between two hex colors with alpha
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);
    if (!c1 || !c2) return `rgba(255, 255, 255, ${alpha})`;

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Recalculate key positions
    if (this.keys.length > 0) {
      this.initKeys();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const prevKeyCount = this.config.keyCount;
    this.config = { ...this.config, ...config } as PianoKeysConfig;

    // Reinitialize keys if count changed
    if (this.config.keyCount !== prevKeyCount && this.width > 0) {
      this.initKeys();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.keys = [];
    this.noteParticles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      keyCount: {
        type: "number",
        label: "Key Count",
        default: 24,
        min: 12,
        max: 48,
        step: 12,
      },
      keyAnimation: {
        type: "number",
        label: "Animation Speed",
        default: 1.0,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
      showLabels: {
        type: "boolean",
        label: "Show Note Labels",
        default: true,
      },
      fallingNotes: {
        type: "boolean",
        label: "Falling Notes",
        default: false,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
