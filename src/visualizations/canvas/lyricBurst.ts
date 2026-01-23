import { BaseVisualization } from "../base";
import type {
  AudioData,
  VisualizationConfig,
  VisualizationMeta,
  ConfigSchema,
  WordEvent,
} from "../types";

interface FloatingWord {
  word: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  scale: number;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
  hue: number;
  birth: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
}

/**
 * Lyric Burst Visualization
 * Displays detected words/lyrics with explosive visual effects
 */
export class LyricBurstVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "lyricBurst",
    name: "Lyric Burst",
    author: "Vizec",
    description:
      "Displays detected words with explosive particle effects - enable speech recognition to see lyrics",
    renderer: "canvas2d",
    transitionType: "crossfade",
    usesSpeech: true,
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  // Current main word display
  private currentWord: string | null = null;
  private currentWordScale = 0;
  private currentWordAlpha = 0;
  private targetWordScale = 1;

  // Floating words
  private floatingWords: FloatingWord[] = [];
  private readonly MAX_FLOATING = 12;
  private nextSpawnQuadrant = 0; // Rotate through quadrants for spawn positions

  // Particles
  private particles: Particle[] = [];
  private readonly MAX_PARTICLES = 200;

  // Animation state
  private time = 0;
  private lastWordTime = 0;
  private processedWords = new Set<string>();

  // Config
  private baseHue = 180; // Cyan
  private fontFamily = "Arial Black, Arial, sans-serif";
  private glowIntensity = 1.0;
  private wordSize = 120;

  // Color schemes
  private readonly colorSchemes: Record<string, { hue: number; saturation: number }> = {
    neon: { hue: 180, saturation: 100 },
    fire: { hue: 20, saturation: 100 },
    purple: { hue: 280, saturation: 80 },
    matrix: { hue: 120, saturation: 100 },
    gold: { hue: 45, saturation: 90 },
    rainbow: { hue: -1, saturation: 100 }, // Special: cycles through hues
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");
    this.updateConfig(config);

    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    this.time += deltaTime;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Process speech data
    if (audioData.speech?.isActive) {
      this.processSpeechData(audioData.speech.currentWord, audioData.speech.recentWords);
    }

    // Update and render particles
    this.updateParticles(deltaTime, bass);
    this.renderParticles();

    // Update and render floating words
    this.updateFloatingWords(deltaTime);
    this.renderFloatingWords();

    // Render main word
    this.updateMainWord(deltaTime, bass);
    this.renderMainWord(bass, volume);

    // Render audio-reactive background elements
    this.renderBackgroundEffects(bass, mid, treble);

    // Show hint if speech is not active
    if (!audioData.speech?.isActive) {
      this.renderHint();
    }
  }

  private processSpeechData(currentWord: string | null, recentWords: WordEvent[]): void {
    // Check for new words to add as floating
    for (const wordEvent of recentWords) {
      const wordKey = `${wordEvent.word}-${wordEvent.timestamp}`;
      if (!this.processedWords.has(wordKey)) {
        this.processedWords.add(wordKey);
        this.addFloatingWord(wordEvent.word);
        this.spawnWordParticles();
      }
    }

    // Clean up old processed words
    if (this.processedWords.size > 100) {
      const arr = Array.from(this.processedWords);
      this.processedWords = new Set(arr.slice(-50));
    }

    // Update current word
    if (currentWord && currentWord !== this.currentWord) {
      this.currentWord = currentWord;
      this.currentWordScale = 0.3;
      this.currentWordAlpha = 1;
      this.targetWordScale = 1;
      this.lastWordTime = this.time;

      // Burst of particles for new word
      this.spawnBurst(this.width / 2, this.height / 2, 30);
    } else if (!currentWord && this.currentWord) {
      // Word is fading out
      this.currentWordAlpha = Math.max(0, this.currentWordAlpha - 0.02);
      if (this.currentWordAlpha <= 0) {
        this.currentWord = null;
      }
    }
  }

  private addFloatingWord(word: string): void {
    if (this.floatingWords.length >= this.MAX_FLOATING) {
      this.floatingWords.shift();
    }

    // Spawn in different screen regions to avoid overlap
    // Rotate through 8 zones around the screen
    const zones = [
      { x: 0.2, y: 0.2 }, // top-left
      { x: 0.5, y: 0.15 }, // top-center
      { x: 0.8, y: 0.2 }, // top-right
      { x: 0.85, y: 0.5 }, // right-center
      { x: 0.8, y: 0.8 }, // bottom-right
      { x: 0.5, y: 0.85 }, // bottom-center
      { x: 0.2, y: 0.8 }, // bottom-left
      { x: 0.15, y: 0.5 }, // left-center
    ];

    const zone = zones[this.nextSpawnQuadrant % zones.length];
    this.nextSpawnQuadrant++;

    // Add some randomness within the zone
    const spawnX = zone.x * this.width + (Math.random() - 0.5) * this.width * 0.15;
    const spawnY = zone.y * this.height + (Math.random() - 0.5) * this.height * 0.15;

    // Move slowly toward center or drift gently
    const toCenterX = this.width / 2 - spawnX;
    const toCenterY = this.height / 2 - spawnY;
    const dist = Math.sqrt(toCenterX * toCenterX + toCenterY * toCenterY);
    const speed = 15 + Math.random() * 25;

    this.floatingWords.push({
      word,
      x: spawnX,
      y: spawnY,
      vx: (toCenterX / dist) * speed + (Math.random() - 0.5) * 20,
      vy: (toCenterY / dist) * speed + (Math.random() - 0.5) * 20,
      scale: 0.6 + Math.random() * 0.4,
      alpha: 1,
      rotation: (Math.random() - 0.5) * 0.2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      hue: this.getHue(),
      birth: this.time,
    });
  }

  private spawnWordParticles(): void {
    // Spawn particles at the last added word's position
    const lastWord = this.floatingWords[this.floatingWords.length - 1];
    if (lastWord) {
      const count = Math.min(lastWord.word.length * 2, 15);
      this.spawnBurst(lastWord.x, lastWord.y, count);
    }
  }

  private spawnBurst(x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX_PARTICLES) {
        this.particles.shift();
      }

      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 200;

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 1 + Math.random() * 0.5,
        size: 3 + Math.random() * 5,
        hue: this.getHue(),
      });
    }
  }

  private getHue(): number {
    if (this.baseHue === -1) {
      // Rainbow mode
      return (this.time * 50) % 360;
    }
    return this.baseHue + (Math.random() - 0.5) * 30;
  }

  private updateParticles(deltaTime: number, bass: number): void {
    const gravity = 50 + bass * 100;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.vx * deltaTime;
      p.y += p.vy * deltaTime;
      p.vy += gravity * deltaTime;
      p.vx *= 0.98;
      p.life -= deltaTime / p.maxLife;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private renderParticles(): void {
    if (!this.ctx) return;

    for (const p of this.particles) {
      const alpha = p.life * 0.8;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      this.ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${alpha})`;
      this.ctx.fill();

      // Glow
      this.ctx.shadowColor = `hsla(${p.hue}, 100%, 50%, ${alpha})`;
      this.ctx.shadowBlur = 10 * this.glowIntensity;
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
  }

  private updateFloatingWords(deltaTime: number): void {
    const repulsionRadius = 120; // Words push away within this distance
    const repulsionStrength = 80;

    for (let i = this.floatingWords.length - 1; i >= 0; i--) {
      const w = this.floatingWords[i];

      // Apply repulsion from other words
      for (let j = 0; j < this.floatingWords.length; j++) {
        if (i === j) continue;
        const other = this.floatingWords[j];

        const dx = w.x - other.x;
        const dy = w.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < repulsionRadius && dist > 0) {
          const force = (1 - dist / repulsionRadius) * repulsionStrength;
          w.vx += (dx / dist) * force * deltaTime;
          w.vy += (dy / dist) * force * deltaTime;
        }
      }

      // Keep words on screen with soft boundaries
      const margin = 50;
      if (w.x < margin) w.vx += 30 * deltaTime;
      if (w.x > this.width - margin) w.vx -= 30 * deltaTime;
      if (w.y < margin) w.vy += 30 * deltaTime;
      if (w.y > this.height - margin) w.vy -= 30 * deltaTime;

      w.x += w.vx * deltaTime;
      w.y += w.vy * deltaTime;
      w.rotation += w.rotationSpeed * deltaTime;
      w.vx *= 0.95; // Slightly more friction
      w.vy *= 0.95;

      // Fade out over time
      const age = this.time - w.birth;
      if (age > 4) {
        w.alpha -= deltaTime * 0.4;
      }

      if (w.alpha <= 0) {
        this.floatingWords.splice(i, 1);
      }
    }
  }

  private renderFloatingWords(): void {
    if (!this.ctx) return;

    for (const w of this.floatingWords) {
      this.ctx.save();
      this.ctx.translate(w.x, w.y);
      this.ctx.rotate(w.rotation);
      this.ctx.scale(w.scale, w.scale);

      const fontSize = 30;
      this.ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";

      // Glow
      this.ctx.shadowColor = `hsla(${w.hue}, 100%, 50%, ${w.alpha})`;
      this.ctx.shadowBlur = 15 * this.glowIntensity;

      // Text
      this.ctx.fillStyle = `hsla(${w.hue}, 80%, 70%, ${w.alpha})`;
      this.ctx.fillText(w.word, 0, 0);

      this.ctx.restore();
    }
  }

  private updateMainWord(deltaTime: number, bass: number): void {
    // Animate scale
    const scaleSpeed = 5;
    this.currentWordScale +=
      (this.targetWordScale - this.currentWordScale) * scaleSpeed * deltaTime;

    // Pulse with bass
    this.targetWordScale = 1 + bass * 0.2;
  }

  private renderMainWord(bass: number, volume: number): void {
    if (!this.ctx || !this.currentWord) return;

    const x = this.width / 2;
    const y = this.height / 2;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(this.currentWordScale, this.currentWordScale);

    const fontSize = this.wordSize + bass * 30;
    this.ctx.font = `bold ${fontSize}px ${this.fontFamily}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    const hue = this.baseHue === -1 ? (this.time * 50) % 360 : this.baseHue;

    // Multiple glow layers
    for (let i = 3; i >= 0; i--) {
      this.ctx.shadowColor = `hsla(${hue}, 100%, 50%, ${this.currentWordAlpha * 0.3})`;
      this.ctx.shadowBlur = (20 + i * 15) * this.glowIntensity * (1 + volume);
      this.ctx.fillStyle = `hsla(${hue}, 100%, ${70 + i * 10}%, ${this.currentWordAlpha})`;
      this.ctx.fillText(this.currentWord, 0, 0);
    }

    // Main text
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = `hsla(${hue}, 30%, 95%, ${this.currentWordAlpha})`;
    this.ctx.fillText(this.currentWord, 0, 0);

    // Outline
    this.ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${this.currentWordAlpha * 0.5})`;
    this.ctx.lineWidth = 2;
    this.ctx.strokeText(this.currentWord, 0, 0);

    this.ctx.restore();
  }

  private renderBackgroundEffects(bass: number, _mid: number, _treble: number): void {
    if (!this.ctx) return;

    // Subtle radial pulse on bass
    if (bass > 0.3) {
      const hue = this.baseHue === -1 ? (this.time * 50) % 360 : this.baseHue;
      const radius = bass * 300;

      const gradient = this.ctx.createRadialGradient(
        this.width / 2,
        this.height / 2,
        0,
        this.width / 2,
        this.height / 2,
        radius,
      );
      gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, ${bass * 0.1})`);
      gradient.addColorStop(1, "transparent");

      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private renderHint(): void {
    if (!this.ctx) return;

    this.ctx.save();
    this.ctx.font = `20px ${this.fontFamily}`;
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";

    const hint = "Enable speech recognition to see lyrics";
    this.ctx.fillText(hint, this.width / 2, this.height / 2);

    this.ctx.font = `14px Arial, sans-serif`;
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    this.ctx.fillText(
      "(Whisper model required - ~75MB download)",
      this.width / 2,
      this.height / 2 + 30,
    );

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
    if (config.colorScheme && this.colorSchemes[config.colorScheme]) {
      const scheme = this.colorSchemes[config.colorScheme];
      this.baseHue = scheme.hue;
    }
    if (typeof config.glowIntensity === "number") {
      this.glowIntensity = config.glowIntensity;
    }
    if (typeof config.wordSize === "number") {
      this.wordSize = config.wordSize;
    }
  }

  destroy(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.floatingWords = [];
    this.particles = [];
    this.processedWords.clear();
  }

  getConfigSchema(): ConfigSchema {
    return {
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "neon",
        options: [
          { value: "neon", label: "Neon Cyan" },
          { value: "fire", label: "Fire" },
          { value: "purple", label: "Purple" },
          { value: "matrix", label: "Matrix Green" },
          { value: "gold", label: "Gold" },
          { value: "rainbow", label: "Rainbow" },
        ],
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0,
        max: 2,
        step: 0.1,
      },
      wordSize: {
        type: "number",
        label: "Word Size",
        default: 120,
        min: 60,
        max: 200,
        step: 10,
      },
    };
  }
}
