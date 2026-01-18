import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface DesertDunesConfig extends VisualizationConfig {
  duneCount: number;
  scrollSpeed: number;
  colorScheme: string;
}

const COLOR_SCHEMES: Record<string, { sky: string; dune1: string; dune2: string; dune3: string; accent: string }> = {
  golden: { sky: "#1a0f00", dune1: "#d4a84b", dune2: "#c4983b", dune3: "#b4882b", accent: "#ffd700" },
  sunset: { sky: "#1a0505", dune1: "#ff6b6b", dune2: "#ee5a5a", dune3: "#dd4a4a", accent: "#feca57" },
  fire: { sky: "#1a0500", dune1: "#ff4500", dune2: "#ee3400", dune3: "#dd2300", accent: "#ffd700" },
  monochrome: { sky: "#0a0a0a", dune1: "#888888", dune2: "#666666", dune3: "#444444", accent: "#ffffff" },
  synthwave: { sky: "#0a001a", dune1: "#ff00ff", dune2: "#dd00dd", dune3: "#bb00bb", accent: "#00ffff" },
  ocean: { sky: "#000a14", dune1: "#0077be", dune2: "#006699", dune3: "#005577", accent: "#00d4aa" },
};

export class DesertDunesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "desertDunes",
    name: "Desert Dunes",
    author: "Vizec",
    description: "Rolling sand dune silhouettes that pulse with audio",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: DesertDunesConfig = {
    sensitivity: 1.0,
    colorScheme: "golden",
    duneCount: 5,
    scrollSpeed: 1.0,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private scrollOffset = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedVolume = 0;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private drawVisualization(p: p5): void {
    const { duneCount, colorScheme, sensitivity, scrollSpeed } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.golden;

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) {
      return;
    }

    const { bass, mid, treble, volume } = this.currentAudioData;

    // Smooth audio values
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * smoothing;

    // Update scroll offset
    this.scrollOffset += (1 + this.smoothedMid * 2) * scrollSpeed * 0.5;
    this.time += 0.01;

    // Draw dune layers from back to front
    for (let i = 0; i < duneCount; i++) {
      const layerProgress = i / (duneCount - 1);
      this.drawDuneLayer(
        p,
        i,
        duneCount,
        layerProgress,
        colors,
        sensitivity
      );
    }

    // Draw sparkle particles on high treble
    if (treble * sensitivity > 0.4) {
      this.drawSandSparkles(p, colors.accent, treble * sensitivity);
    }
  }

  private drawDuneLayer(
    p: p5,
    index: number,
    totalLayers: number,
    progress: number,
    colors: { sky: string; dune1: string; dune2: string; dune3: string; accent: string },
    sensitivity: number
  ): void {
    // Calculate parallax speed (back layers move slower)
    const parallaxSpeed = 0.3 + progress * 0.7;
    const layerScroll = this.scrollOffset * parallaxSpeed;

    // Calculate vertical position (back layers are higher)
    const baseY = this.height * (0.4 + progress * 0.4);
    const heightVariation = this.smoothedBass * sensitivity * 30 * progress;

    // Calculate dune height for this layer
    const maxDuneHeight = this.height * (0.15 + progress * 0.15);

    // Choose color based on layer depth
    let duneColor: string;
    if (progress < 0.33) {
      duneColor = colors.dune3;
    } else if (progress < 0.66) {
      duneColor = colors.dune2;
    } else {
      duneColor = colors.dune1;
    }

    // Calculate alpha (back layers more transparent, overall more see-through)
    const alpha = 0.15 + progress * 0.35;

    // Begin shape for dune layer
    p.beginShape();
    p.noStroke();

    // Parse color and set with alpha
    const col = p.color(duneColor);
    col.setAlpha(alpha * 255);
    p.fill(col);

    // Start from bottom left
    p.vertex(0, this.height);

    // Draw dune profile with multiple frequency sine waves
    const resolution = 4;
    for (let x = 0; x <= this.width + resolution; x += resolution) {
      // Multiple overlapping dunes with different frequencies
      const freq1 = 0.003 + index * 0.001;
      const freq2 = 0.008 + index * 0.002;
      const freq3 = 0.015 + index * 0.003;

      const xOffset = x + layerScroll;

      // Combine multiple sine waves for organic dune shapes
      const wave1 = Math.sin(xOffset * freq1) * maxDuneHeight * 1.0;
      const wave2 = Math.sin(xOffset * freq2 + this.time) * maxDuneHeight * 0.4;
      const wave3 = Math.sin(xOffset * freq3 + this.time * 1.5) * maxDuneHeight * 0.2;

      // Audio-reactive height modulation
      const audioMod = Math.sin(xOffset * 0.01 + this.time * 2) * heightVariation;

      const duneHeight = wave1 + wave2 + wave3 + audioMod;
      const y = baseY - Math.abs(duneHeight);

      p.vertex(x, y);
    }

    // Close shape at bottom right
    p.vertex(this.width, this.height);
    p.endShape(p.CLOSE);

    // Add subtle glow on the tops for front layers
    if (progress > 0.6) {
      this.drawDuneGlow(p, layerScroll, baseY, maxDuneHeight, colors.accent, sensitivity, index);
    }
  }

  private drawDuneGlow(
    p: p5,
    layerScroll: number,
    baseY: number,
    maxDuneHeight: number,
    accentColor: string,
    sensitivity: number,
    index: number
  ): void {
    const glowAlpha = 0.1 + this.smoothedVolume * sensitivity * 0.15;

    p.noFill();
    const strokeCol = p.color(accentColor);
    strokeCol.setAlpha(glowAlpha * 255);
    p.stroke(strokeCol);
    p.strokeWeight(2);

    p.beginShape();

    const resolution = 8;
    for (let x = 0; x <= this.width + resolution; x += resolution) {
      const freq1 = 0.003 + index * 0.001;
      const freq2 = 0.008 + index * 0.002;
      const freq3 = 0.015 + index * 0.003;

      const xOffset = x + layerScroll;

      const wave1 = Math.sin(xOffset * freq1) * maxDuneHeight * 1.0;
      const wave2 = Math.sin(xOffset * freq2 + this.time) * maxDuneHeight * 0.4;
      const wave3 = Math.sin(xOffset * freq3 + this.time * 1.5) * maxDuneHeight * 0.2;

      const heightVariation = this.smoothedBass * sensitivity * 30;
      const audioMod = Math.sin(xOffset * 0.01 + this.time * 2) * heightVariation;

      const duneHeight = wave1 + wave2 + wave3 + audioMod;
      const y = baseY - Math.abs(duneHeight);

      p.vertex(x, y);
    }

    p.endShape();
  }

  private drawSandSparkles(p: p5, accentColor: string, intensity: number): void {
    const sparkleCount = Math.floor(intensity * 20);

    for (let i = 0; i < sparkleCount; i++) {
      const x = Math.random() * this.width;
      const y = this.height * 0.3 + Math.random() * this.height * 0.5;
      const size = 1 + Math.random() * 2 + intensity * 2;

      // Sparkle with glow
      const col = p.color(accentColor);
      col.setAlpha(180);
      p.fill(col);
      p.noStroke();
      p.ellipse(x, y, size, size);

      // Outer glow
      col.setAlpha(50);
      p.fill(col);
      p.ellipse(x, y, size * 3, size * 3);
    }
  }

  render(audioData: AudioData, _deltaTime: number): void {
    this.currentAudioData = audioData;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as DesertDunesConfig;
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
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "golden",
        options: [
          { value: "golden", label: "Golden" },
          { value: "sunset", label: "Sunset" },
          { value: "fire", label: "Fire" },
          { value: "monochrome", label: "Monochrome" },
          { value: "synthwave", label: "Synthwave" },
          { value: "ocean", label: "Ocean" },
        ],
      },
      duneCount: {
        type: "number",
        label: "Dune Layers",
        default: 5,
        min: 3,
        max: 8,
        step: 1,
      },
      scrollSpeed: {
        type: "number",
        label: "Scroll Speed",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
