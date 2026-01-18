import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface BubbleRiseConfig extends VisualizationConfig {
  maxBubbles: number;
  riseSpeed: number;
  bubbleSize: number;
}

interface Bubble {
  x: number;
  y: number;
  size: number;
  wobblePhase: number;
  wobbleSpeed: number;
  riseSpeed: number;
  highlightAngle: number;
  opacity: number;
}

export class BubbleRiseVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "bubbleRise",
    name: "Bubble Rise",
    author: "Vizec",
    description: "Rising bubbles with shimmering light refraction",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: BubbleRiseConfig = {
    sensitivity: 1.0,
    colorScheme: "ice",
    maxBubbles: 100,
    riseSpeed: 1.0,
    bubbleSize: 1.0,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private bubbles: Bubble[] = [];
  private smoothedBass = 0;
  private smoothedTreble = 0;
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

  private spawnBubble(): void {
    const { maxBubbles, bubbleSize } = this.config;

    if (this.bubbles.length >= maxBubbles) return;

    const size = (10 + Math.random() * 30) * bubbleSize;

    this.bubbles.push({
      x: Math.random() * this.width,
      y: this.height + size,
      size,
      wobblePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.02 + Math.random() * 0.03,
      riseSpeed: 0.5 + Math.random() * 1.5,
      highlightAngle: Math.random() * Math.PI * 2,
      opacity: 0.4 + Math.random() * 0.3,
    });
  }

  private drawVisualization(p: p5): void {
    const { colorScheme, sensitivity, riseSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    p.clear();

    if (!this.currentAudioData) return;

    const { bass, treble } = this.currentAudioData;

    // Smooth audio
    const smoothing = 0.15;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    this.time += 0.02;

    // Spawn bubbles based on bass
    const spawnRate = 0.05 + this.smoothedBass * 0.2;
    if (Math.random() < spawnRate) {
      const burstCount = 1 + Math.floor(this.smoothedBass * 3);
      for (let i = 0; i < burstCount; i++) {
        this.spawnBubble();
      }
    }

    // Update and draw bubbles
    this.updateBubbles(riseSpeed);

    // Sort by size (smaller in front for depth effect)
    this.bubbles.sort((a, b) => b.size - a.size);

    for (const bubble of this.bubbles) {
      this.drawBubble(p, bubble, colors);
    }
  }

  private updateBubbles(riseSpeed: number): void {
    const speedBoost = 1 + this.smoothedTreble;

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const bubble = this.bubbles[i];

      // Rise upward
      bubble.y -= bubble.riseSpeed * riseSpeed * speedBoost;

      // Wobble side to side
      bubble.wobblePhase += bubble.wobbleSpeed;
      bubble.x += Math.sin(bubble.wobblePhase) * 0.5;

      // Slightly shrink as they rise (pressure change)
      bubble.size *= 0.9995;

      // Remove if off screen or too small
      if (bubble.y < -bubble.size || bubble.size < 3) {
        this.bubbles.splice(i, 1);
      }
    }
  }

  private drawBubble(p: p5, bubble: Bubble, colors: { primary: string; secondary: string; accent: string }): void {
    p.push();
    p.translate(bubble.x, bubble.y);

    const size = bubble.size;

    // Main bubble body - very transparent
    const bubbleColor = p.color(colors.primary);
    bubbleColor.setAlpha(bubble.opacity * 80);

    p.noStroke();
    p.fill(bubbleColor);
    p.ellipse(0, 0, size, size);

    // Outer ring - slightly more visible
    const ringColor = p.color(colors.secondary);
    ringColor.setAlpha(bubble.opacity * 120);
    p.noFill();
    p.stroke(ringColor);
    p.strokeWeight(1.5);
    p.ellipse(0, 0, size, size);

    // Highlight reflection - animated shimmer
    const highlightX = Math.cos(bubble.highlightAngle + this.time) * size * 0.25;
    const highlightY = Math.sin(bubble.highlightAngle + this.time) * size * 0.25 - size * 0.1;

    const highlightColor = p.color(255, 255, 255);
    highlightColor.setAlpha(180);
    p.noStroke();
    p.fill(highlightColor);
    p.ellipse(highlightX, highlightY, size * 0.2, size * 0.15);

    // Secondary smaller highlight
    highlightColor.setAlpha(100);
    p.fill(highlightColor);
    p.ellipse(
      highlightX + size * 0.15,
      highlightY + size * 0.1,
      size * 0.1,
      size * 0.08
    );

    // Refraction effect - color shift at bottom
    const refractionColor = p.color(colors.accent);
    refractionColor.setAlpha(40);
    p.fill(refractionColor);
    p.noStroke();

    p.beginShape();
    p.arc(0, 0, size, size, Math.PI * 0.2, Math.PI * 0.8);
    p.endShape(p.CLOSE);

    // Inner glow pulse with audio
    const glowSize = size * 0.6 * (1 + this.smoothedBass * 0.3);
    const glowColor = p.color(colors.accent);
    glowColor.setAlpha(30 + this.smoothedBass * 30);
    p.fill(glowColor);
    p.ellipse(0, 0, glowSize, glowSize);

    p.pop();
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
    this.config = { ...this.config, ...config } as BubbleRiseConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.bubbles = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      maxBubbles: {
        type: "number",
        label: "Max Bubbles",
        default: 100,
        min: 30,
        max: 200,
        step: 10,
      },
      riseSpeed: {
        type: "number",
        label: "Rise Speed",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      bubbleSize: {
        type: "number",
        label: "Bubble Size",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "ice",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
