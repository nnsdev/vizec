import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface JellyfishFloatConfig extends VisualizationConfig {
  jellyfishCount: number;
  pulseIntensity: number;
  tentacleLength: number;
}

interface Jellyfish {
  x: number;
  y: number;
  size: number;
  phase: number;
  floatPhase: number;
  pulsePhase: number;
  color: string;
  tentacleCount: number;
  driftSpeed: number;
}

export class JellyfishFloatVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "jellyfishFloat",
    name: "Jellyfish Float",
    author: "Vizec",
    description: "Translucent jellyfish drifting and pulsing with audio",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: JellyfishFloatConfig = {
    sensitivity: 1.0,
    colorScheme: "purpleHaze",
    jellyfishCount: 5,
    pulseIntensity: 1.0,
    tentacleLength: 1.0,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private jellyfish: Jellyfish[] = [];
  private smoothedBass = 0;
  private smoothedMid = 0;
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
        this.initJellyfish(p);
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initJellyfish(p: p5): void {
    this.jellyfish = [];
    const { jellyfishCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);
    const jellyColors = [colors.primary, colors.secondary, colors.accent];

    for (let i = 0; i < jellyfishCount; i++) {
      this.jellyfish.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 30 + Math.random() * 50,
        phase: Math.random() * Math.PI * 2,
        floatPhase: Math.random() * Math.PI * 2,
        pulsePhase: Math.random() * Math.PI * 2,
        color: jellyColors[Math.floor(Math.random() * jellyColors.length)],
        tentacleCount: 5 + Math.floor(Math.random() * 4),
        driftSpeed: 0.2 + Math.random() * 0.3,
      });
    }
  }

  private drawVisualization(p: p5): void {
    const { sensitivity, pulseIntensity, tentacleLength } = this.config;

    p.clear();

    if (!this.currentAudioData) return;

    const { bass, mid } = this.currentAudioData;

    // Smooth audio
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;

    this.time += 0.02;

    // Update and draw jellyfish
    for (const jelly of this.jellyfish) {
      this.updateJellyfish(jelly);
      this.drawJellyfish(p, jelly, pulseIntensity, tentacleLength);
    }
  }

  private updateJellyfish(jelly: Jellyfish): void {
    // Float upward slowly
    jelly.y -= jelly.driftSpeed * (1 + this.smoothedMid);

    // Horizontal drift
    jelly.x += Math.sin(this.time * 0.5 + jelly.floatPhase) * 0.5;

    // Update phases
    jelly.floatPhase += 0.01;
    jelly.pulsePhase += 0.05 * (1 + this.smoothedBass * 2);

    // Wrap around
    if (jelly.y < -jelly.size * 2) {
      jelly.y = this.height + jelly.size;
      jelly.x = Math.random() * this.width;
    }
    if (jelly.x < -jelly.size) jelly.x = this.width + jelly.size;
    if (jelly.x > this.width + jelly.size) jelly.x = -jelly.size;
  }

  private drawJellyfish(
    p: p5,
    jelly: Jellyfish,
    pulseIntensity: number,
    tentacleLength: number,
  ): void {
    p.push();
    p.translate(jelly.x, jelly.y);

    // Pulse effect with bass
    const pulse = 1 + Math.sin(jelly.pulsePhase) * 0.15 * pulseIntensity * (1 + this.smoothedBass);
    const bodyWidth = jelly.size * pulse;
    const bodyHeight = jelly.size * 0.7 * pulse;

    // Draw tentacles first (behind body)
    this.drawTentacles(p, jelly, tentacleLength);

    // Draw bell (body)
    this.drawBell(p, jelly, bodyWidth, bodyHeight);

    // Draw inner glow
    this.drawInnerGlow(p, jelly, bodyWidth * 0.6, bodyHeight * 0.5);

    p.pop();
  }

  private drawBell(p: p5, jelly: Jellyfish, width: number, height: number): void {
    const bellColor = p.color(jelly.color);
    bellColor.setAlpha(120);

    p.noStroke();
    p.fill(bellColor);

    // Main bell shape using bezier curves
    p.beginShape();

    // Left side
    p.vertex(-width * 0.1, height * 0.3);
    p.bezierVertex(-width * 0.5, height * 0.3, -width * 0.5, -height * 0.5, 0, -height * 0.5);

    // Right side
    p.bezierVertex(
      width * 0.5,
      -height * 0.5,
      width * 0.5,
      height * 0.3,
      width * 0.1,
      height * 0.3,
    );

    // Bottom curve (inside of bell)
    p.bezierVertex(width * 0.3, 0, -width * 0.3, 0, -width * 0.1, height * 0.3);

    p.endShape(p.CLOSE);

    // Bell edge highlight
    bellColor.setAlpha(180);
    p.stroke(bellColor);
    p.strokeWeight(2);
    p.noFill();

    p.beginShape();
    p.vertex(-width * 0.4, height * 0.25);
    p.bezierVertex(-width * 0.5, height * 0.2, -width * 0.5, -height * 0.4, 0, -height * 0.5);
    p.bezierVertex(
      width * 0.5,
      -height * 0.4,
      width * 0.5,
      height * 0.2,
      width * 0.4,
      height * 0.25,
    );
    p.endShape();

    // Frilly edge
    p.noStroke();
    bellColor.setAlpha(100);
    p.fill(bellColor);

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI - Math.PI / 2;
      const x = Math.cos(angle) * width * 0.45;
      const y = height * 0.3 + Math.sin(angle + Math.PI) * height * 0.1;
      const frillySize = 8 + Math.sin(this.time * 3 + i) * 3;

      p.ellipse(x, y, frillySize, frillySize * 0.6);
    }
  }

  private drawInnerGlow(p: p5, jelly: Jellyfish, width: number, height: number): void {
    const glowColor = p.color(jelly.color);

    // Pulsing inner organs
    const organPulse = 1 + Math.sin(jelly.pulsePhase * 1.5) * 0.2;

    glowColor.setAlpha(80);
    p.fill(glowColor);
    p.noStroke();

    // Central organ
    p.ellipse(0, -height * 0.2, width * 0.4 * organPulse, height * 0.4 * organPulse);

    // Radial canals
    glowColor.setAlpha(50);
    p.fill(glowColor);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + this.time * 0.2;
      const x = Math.cos(angle) * width * 0.2;
      const y = -height * 0.1 + Math.sin(angle) * height * 0.15;
      p.ellipse(x, y, width * 0.15, height * 0.2);
    }
  }

  private drawTentacles(p: p5, jelly: Jellyfish, lengthMultiplier: number): void {
    const tentacleColor = p.color(jelly.color);
    tentacleColor.setAlpha(100);

    p.stroke(tentacleColor);
    p.strokeWeight(2);
    p.noFill();

    const baseY = jelly.size * 0.3;
    const tentacleBaseLength = jelly.size * 2 * lengthMultiplier;

    for (let i = 0; i < jelly.tentacleCount; i++) {
      const t = i / (jelly.tentacleCount - 1);
      const startX = (t - 0.5) * jelly.size * 0.8;
      const length = tentacleBaseLength * (0.7 + Math.random() * 0.3);

      // Each tentacle is a flowing curve
      p.beginShape();
      p.vertex(startX, baseY);

      const segments = 8;
      for (let j = 1; j <= segments; j++) {
        const segT = j / segments;
        const waveOffset = Math.sin(this.time * 2 + jelly.phase + i * 0.5 + segT * 3) * 15 * segT;
        const secondaryWave = Math.sin(this.time * 3 + i + segT * 5) * 8 * segT;

        const x = startX + waveOffset + secondaryWave;
        const y = baseY + length * segT;

        p.vertex(x, y);
      }

      p.endShape();
    }

    // Draw some shorter, thinner tentacles
    tentacleColor.setAlpha(60);
    p.stroke(tentacleColor);
    p.strokeWeight(1);

    for (let i = 0; i < jelly.tentacleCount * 2; i++) {
      const t = i / (jelly.tentacleCount * 2 - 1);
      const startX = (t - 0.5) * jelly.size * 0.6;
      const length = tentacleBaseLength * 0.4;

      p.beginShape();
      p.vertex(startX, baseY);

      const segments = 5;
      for (let j = 1; j <= segments; j++) {
        const segT = j / segments;
        const waveOffset = Math.sin(this.time * 3 + i * 0.7 + segT * 4) * 10 * segT;

        p.vertex(startX + waveOffset, baseY + length * segT);
      }

      p.endShape();
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
      this.initJellyfish(this.p5Instance);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.jellyfishCount;
    this.config = { ...this.config, ...config } as JellyfishFloatConfig;

    if (this.p5Instance && this.config.jellyfishCount !== oldCount) {
      this.initJellyfish(this.p5Instance);
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.jellyfish = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      jellyfishCount: {
        type: "number",
        label: "Jellyfish Count",
        default: 5,
        min: 1,
        max: 10,
        step: 1,
      },
      pulseIntensity: {
        type: "number",
        label: "Pulse Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      tentacleLength: {
        type: "number",
        label: "Tentacle Length",
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "purpleHaze",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
