import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface MeteorShowerConfig extends VisualizationConfig {
  meteorDensity: number;
  starCount: number;
  trailLength: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface Meteor {
  x: number;
  y: number;
  speed: number;
  angle: number;
  size: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
  life: number;
  brightness: number;
  color: string;
}

export class MeteorShowerVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "meteorShower",
    name: "Meteor Shower",
    author: "Vizec",
    description: "Streaking meteors with glowing trails across a starfield",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: MeteorShowerConfig = {
    sensitivity: 1.0,
    colorScheme: "fire",
    meteorDensity: 1.0,
    starCount: 150,
    trailLength: 1.0,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private stars: Star[] = [];
  private meteors: Meteor[] = [];
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
        this.initStars();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initStars(): void {
    this.stars = [];
    const { starCount } = this.config;

    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 0.5 + Math.random() * 2,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.05,
      });
    }
  }

  private spawnMeteor(p: p5): void {
    const { colorScheme, trailLength } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Spawn from top/right area
    const spawnFromTop = Math.random() > 0.3;
    const x = spawnFromTop ? Math.random() * this.width : this.width + 50;
    const y = spawnFromTop ? -50 : Math.random() * this.height * 0.5;

    // Angle pointing down-left
    const angle = Math.PI * 0.6 + (Math.random() - 0.5) * 0.4;

    const colorOptions = [colors.primary, colors.secondary, colors.accent];

    this.meteors.push({
      x,
      y,
      speed: 8 + Math.random() * 12,
      angle,
      size: 2 + Math.random() * 4,
      trail: [],
      life: 1.0,
      brightness: 0.7 + this.smoothedBass * 0.3,
      color: colorOptions[Math.floor(Math.random() * colorOptions.length)],
    });
  }

  private drawVisualization(p: p5): void {
    const { colorScheme, sensitivity, meteorDensity, trailLength } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    p.clear();

    if (!this.currentAudioData) return;

    const { bass, treble } = this.currentAudioData;

    // Smooth audio
    const smoothing = 0.12;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;

    this.time += 0.02;

    // Draw starfield
    this.drawStars(p, colors);

    // Spawn meteors based on bass and density
    const spawnChance = 0.02 * meteorDensity + this.smoothedBass * 0.1;
    if (Math.random() < spawnChance && this.meteors.length < 20) {
      this.spawnMeteor(p);

      // Spawn burst on strong bass
      if (this.smoothedBass > 0.6) {
        for (let i = 0; i < 2; i++) {
          this.spawnMeteor(p);
        }
      }
    }

    // Update and draw meteors
    this.updateMeteors(trailLength);
    this.drawMeteors(p, colors);
  }

  private drawStars(p: p5, colors: { primary: string; secondary: string; accent: string }): void {
    p.noStroke();

    for (const star of this.stars) {
      star.twinklePhase += star.twinkleSpeed;
      const twinkle = 0.5 + Math.sin(star.twinklePhase) * 0.5;
      const audioBoost = 1 + this.smoothedTreble * 0.3;

      const alpha = twinkle * audioBoost * 180;
      const starColor = p.color(colors.accent);
      starColor.setAlpha(alpha);

      p.fill(starColor);
      p.ellipse(star.x, star.y, star.size * audioBoost, star.size * audioBoost);
    }
  }

  private updateMeteors(trailLength: number): void {
    const trailMaxLength = Math.floor(20 * trailLength);

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const meteor = this.meteors[i];

      // Store trail point
      meteor.trail.unshift({
        x: meteor.x,
        y: meteor.y,
        alpha: 1,
      });

      // Limit trail length
      if (meteor.trail.length > trailMaxLength) {
        meteor.trail.pop();
      }

      // Update trail alpha
      for (let j = 0; j < meteor.trail.length; j++) {
        meteor.trail[j].alpha = 1 - j / meteor.trail.length;
      }

      // Move meteor
      meteor.x += Math.cos(meteor.angle) * meteor.speed;
      meteor.y += Math.sin(meteor.angle) * meteor.speed;

      // Fade out
      meteor.life -= 0.01;

      // Remove if off screen or dead
      if (meteor.x < -100 || meteor.y > this.height + 100 || meteor.life <= 0) {
        this.meteors.splice(i, 1);
      }
    }
  }

  private drawMeteors(p: p5, colors: { primary: string; secondary: string; accent: string }): void {
    for (const meteor of this.meteors) {
      // Draw trail
      p.noFill();
      p.strokeWeight(meteor.size);

      for (let i = 1; i < meteor.trail.length; i++) {
        const prev = meteor.trail[i - 1];
        const curr = meteor.trail[i];

        const trailAlpha = curr.alpha * meteor.life * meteor.brightness * 200;
        const trailColor = p.color(meteor.color);
        trailColor.setAlpha(trailAlpha);

        p.stroke(trailColor);
        p.line(prev.x, prev.y, curr.x, curr.y);
      }

      // Draw meteor head with glow
      const headAlpha = meteor.life * meteor.brightness * 255;

      // Outer glow
      const glowColor = p.color(meteor.color);
      glowColor.setAlpha(headAlpha * 0.3);
      p.noStroke();
      p.fill(glowColor);
      p.ellipse(meteor.x, meteor.y, meteor.size * 6, meteor.size * 6);

      // Inner glow
      glowColor.setAlpha(headAlpha * 0.5);
      p.fill(glowColor);
      p.ellipse(meteor.x, meteor.y, meteor.size * 3, meteor.size * 3);

      // Core
      const coreColor = p.color(255, 255, 255);
      coreColor.setAlpha(headAlpha);
      p.fill(coreColor);
      p.ellipse(meteor.x, meteor.y, meteor.size, meteor.size);
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
      this.initStars();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldStarCount = this.config.starCount;
    this.config = { ...this.config, ...config } as MeteorShowerConfig;

    if (this.p5Instance && this.config.starCount !== oldStarCount) {
      this.initStars();
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.stars = [];
    this.meteors = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      meteorDensity: {
        type: "number",
        label: "Meteor Density",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      starCount: {
        type: "number",
        label: "Star Count",
        default: 150,
        min: 50,
        max: 300,
        step: 25,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "fire",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
