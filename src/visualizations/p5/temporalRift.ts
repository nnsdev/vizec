import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface TemporalRiftConfig extends VisualizationConfig {
  ringCount: number;
  chromaticIntensity: number;
  echoCount: number;
  vortexStrength: number;
  colorScheme: string;
}

interface TimeRing {
  radius: number;
  maxRadius: number;
  age: number;
  speed: number;
  distortionPhase: number;
  rgbOffset: number;
  thickness: number;
}

interface TimeEcho {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  size: number;
  rotation: number;
}

export class TemporalRiftVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "temporalRift",
    name: "Temporal Rift",
    author: "Vizec",
    description: "Time distortion ripples with chromatic aberration effects",
    renderer: "p5",
    transitionType: "zoom",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: TemporalRiftConfig = {
    sensitivity: 1.0,
    ringCount: 8,
    chromaticIntensity: 1.0,
    echoCount: 5,
    vortexStrength: 1.0,
    colorScheme: "cyanMagenta",
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;

  private rings: TimeRing[] = [];
  private echoes: TimeEcho[] = [];
  private vortexRotation = 0;
  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

  // Time digits for clock effect
  private clockDigits: string[] = [];
  private digitPositions: { x: number; y: number; angle: number; dist: number }[] = [];

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.RGB, 255, 255, 255, 255);
        p.strokeCap(p.ROUND);
        p.noFill();
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.initRings();
        this.initClockDigits();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initRings(): void {
    this.rings = [];
    const { ringCount } = this.config;
    const maxRadius = Math.max(this.width, this.height) * 0.6;

    for (let i = 0; i < ringCount; i++) {
      const baseRadius = (i / ringCount) * maxRadius * 0.3;
      this.rings.push({
        radius: baseRadius,
        maxRadius: maxRadius,
        age: i / ringCount, // Stagger initial ages
        speed: 0.3 + Math.random() * 0.4,
        distortionPhase: Math.random() * Math.PI * 2,
        rgbOffset: 0,
        thickness: 2 + Math.random() * 3,
      });
    }
  }

  private initClockDigits(): void {
    this.clockDigits = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", ":", "∞", "⌛"];
    this.digitPositions = [];

    // Create positions for floating clock digits
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 200;
      this.digitPositions.push({
        x: 0,
        y: 0,
        angle,
        dist,
      });
    }
  }

  private drawVisualization(p: p5): void {
    const { chromaticIntensity, echoCount, vortexStrength, sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) return;

    const { bass, mid, treble, volume } = this.currentAudioData;
    const dt = 1 / 60; // Approximate delta time

    // Smooth audio values
    this.bassSmooth += (bass - this.bassSmooth) * 0.15;
    this.midSmooth += (mid - this.midSmooth) * 0.15;
    this.trebleSmooth += (treble - this.trebleSmooth) * 0.15;

    this.time += dt;
    this.vortexRotation += dt * 0.5 * vortexStrength * (1 + this.bassSmooth * sensitivity);

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Update and render time echoes (fading copies)
    this.updateEchoes(p, dt, colors, sensitivity);

    // Render central vortex
    this.renderVortex(p, centerX, centerY, colors, vortexStrength, sensitivity);

    // Update and render time rings
    this.updateRings(p, dt, centerX, centerY, colors, chromaticIntensity, sensitivity);

    // Render floating clock digits
    this.renderClockDigits(p, centerX, centerY, colors, sensitivity);

    // Add new echoes on beat
    if (this.midSmooth > 0.6 && Math.random() < 0.3 * this.midSmooth) {
      this.addEcho(centerX, centerY, echoCount);
    }
  }

  private updateRings(
    p: p5,
    dt: number,
    centerX: number,
    centerY: number,
    colors: { primary: string; secondary: string; accent: string },
    chromaticIntensity: number,
    sensitivity: number,
  ): void {
    const maxRadius = Math.max(this.width, this.height) * 0.6;

    for (const ring of this.rings) {
      // Update ring properties
      ring.age += dt * ring.speed * (1 + this.bassSmooth * sensitivity * 2);
      ring.distortionPhase += dt * 2 * (1 + this.trebleSmooth * sensitivity);
      ring.rgbOffset = this.bassSmooth * chromaticIntensity * 15 * sensitivity;

      // Calculate current radius with expansion
      const expansionProgress = ring.age % 1;
      ring.radius = expansionProgress * maxRadius;

      // Fade based on radius
      const fadeAlpha = 1 - Math.pow(expansionProgress, 0.5);

      if (fadeAlpha > 0.05) {
        // Chromatic aberration - draw RGB offset rings
        const offsets = [
          { color: colors.primary, offset: -ring.rgbOffset },
          { color: colors.secondary, offset: ring.rgbOffset },
          { color: colors.accent, offset: 0 },
        ];

        for (const { color, offset } of offsets) {
          this.drawDistortedRing(
            p,
            centerX + offset * 0.5,
            centerY + offset * 0.3,
            ring,
            color,
            fadeAlpha * 0.55, // Alpha for covering elements
            sensitivity,
          );
        }
      }
    }
  }

  private drawDistortedRing(
    p: p5,
    cx: number,
    cy: number,
    ring: TimeRing,
    colorStr: string,
    alpha: number,
    sensitivity: number,
  ): void {
    const color = p.color(colorStr);
    color.setAlpha(alpha * 255);
    p.stroke(color);
    p.strokeWeight(ring.thickness * (1 + this.bassSmooth * sensitivity * 0.5));
    p.noFill();

    p.beginShape();
    const segments = 72;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * p.TWO_PI;

      // Add distortion based on treble and phase
      const distortion =
        p.sin(angle * 6 + ring.distortionPhase) * this.trebleSmooth * sensitivity * 20;
      const wobble = p.sin(angle * 3 + this.time * 2) * 5;

      const r = ring.radius + distortion + wobble;
      const x = cx + p.cos(angle) * r;
      const y = cy + p.sin(angle) * r;

      p.curveVertex(x, y);
    }
    p.endShape(p.CLOSE);
  }

  private renderVortex(
    p: p5,
    cx: number,
    cy: number,
    colors: { primary: string; secondary: string; accent: string },
    vortexStrength: number,
    sensitivity: number,
  ): void {
    const vortexSize = 30 + this.bassSmooth * 40 * sensitivity;

    p.push();
    p.translate(cx, cy);
    p.rotate(this.vortexRotation);

    // Draw swirling vortex lines
    const spiralCount = 6;
    for (let s = 0; s < spiralCount; s++) {
      const spiralAngle = (s / spiralCount) * p.TWO_PI;
      const color = s % 2 === 0 ? p.color(colors.primary) : p.color(colors.secondary);
      color.setAlpha(100 + this.bassSmooth * 100 * sensitivity);
      p.stroke(color);
      p.strokeWeight(2);
      p.noFill();

      p.beginShape();
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        const r = t * vortexSize * vortexStrength;
        const angle = spiralAngle + t * p.TWO_PI * 2;
        const x = p.cos(angle) * r;
        const y = p.sin(angle) * r;
        p.vertex(x, y);
      }
      p.endShape();
    }

    // Central glow
    const glowColor = p.color(colors.accent);
    glowColor.setAlpha(50 + this.bassSmooth * 100);
    p.fill(glowColor);
    p.noStroke();
    p.ellipse(0, 0, vortexSize * 0.5, vortexSize * 0.5);

    p.pop();
  }

  private updateEchoes(
    p: p5,
    dt: number,
    colors: { primary: string; secondary: string; accent: string },
    sensitivity: number,
  ): void {
    // Update existing echoes
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const echo = this.echoes[i];
      echo.age += dt;
      echo.rotation += dt * 0.5;

      if (echo.age >= echo.maxAge) {
        this.echoes.splice(i, 1);
        continue;
      }

      // Draw echo (fading ring/shape)
      const progress = echo.age / echo.maxAge;
      const alpha = (1 - progress) * 0.4;
      const size = echo.size * (1 + progress * 2);

      p.push();
      p.translate(echo.x, echo.y);
      p.rotate(echo.rotation);

      const color = p.color(colors.accent);
      color.setAlpha(alpha * 255);
      p.stroke(color);
      p.strokeWeight(1 + (1 - progress) * 2);
      p.noFill();

      // Draw fragmented ring
      const segments = 8;
      for (let s = 0; s < segments; s++) {
        const startAngle = (s / segments) * p.TWO_PI + this.time;
        const endAngle = startAngle + (p.TWO_PI / segments) * 0.6;
        p.arc(0, 0, size, size, startAngle, endAngle);
      }

      p.pop();
    }
  }

  private addEcho(cx: number, cy: number, maxEchoes: number): void {
    if (this.echoes.length >= maxEchoes * 2) return;

    const offset = 50 + Math.random() * 100;
    const angle = Math.random() * Math.PI * 2;

    this.echoes.push({
      x: cx + Math.cos(angle) * offset,
      y: cy + Math.sin(angle) * offset,
      age: 0,
      maxAge: 1 + Math.random() * 1.5,
      size: 30 + Math.random() * 50,
      rotation: Math.random() * Math.PI * 2,
    });
  }

  private renderClockDigits(
    p: p5,
    cx: number,
    cy: number,
    colors: { primary: string; secondary: string; accent: string },
    sensitivity: number,
  ): void {
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14 + this.midSmooth * 10);

    for (let i = 0; i < this.digitPositions.length; i++) {
      const pos = this.digitPositions[i];

      // Update position with spiral motion
      pos.angle += 0.01 * (1 + this.midSmooth * sensitivity);
      pos.dist += Math.sin(this.time + i) * 0.5;

      // Keep in bounds
      if (pos.dist < 30) pos.dist = 30;
      if (pos.dist > 300) pos.dist = 300;

      const x = cx + Math.cos(pos.angle) * pos.dist;
      const y = cy + Math.sin(pos.angle) * pos.dist;

      // Only draw if on screen
      if (x < 0 || x > this.width || y < 0 || y > this.height) continue;

      const digit = this.clockDigits[i % this.clockDigits.length];

      // Alpha based on distance from center and audio
      const distNorm = pos.dist / 300;
      const alpha = (0.3 + this.trebleSmooth * 0.4) * (1 - distNorm * 0.5);

      // Chromatic offset for some digits
      if (this.bassSmooth > 0.5 && i % 3 === 0) {
        const offset = this.bassSmooth * 5;

        const redColor = p.color(colors.primary);
        redColor.setAlpha(alpha * 200);
        p.fill(redColor);
        p.noStroke();
        p.text(digit, x - offset, y);

        const blueColor = p.color(colors.secondary);
        blueColor.setAlpha(alpha * 200);
        p.fill(blueColor);
        p.text(digit, x + offset, y);
      }

      const color = p.color(colors.accent);
      color.setAlpha(alpha * 255);
      p.fill(color);
      p.noStroke();
      p.text(digit, x, y);
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
    this.initRings();
    this.initClockDigits();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldRingCount = this.config.ringCount;
    this.config = { ...this.config, ...config } as TemporalRiftConfig;

    if (this.config.ringCount !== oldRingCount && this.width > 0) {
      this.initRings();
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.rings = [];
    this.echoes = [];
    this.digitPositions = [];
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
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      ringCount: {
        type: "number",
        label: "Ring Count",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      chromaticIntensity: {
        type: "number",
        label: "Chromatic Aberration",
        default: 1.0,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
      echoCount: {
        type: "number",
        label: "Time Echoes",
        default: 5,
        min: 1,
        max: 10,
        step: 1,
      },
      vortexStrength: {
        type: "number",
        label: "Vortex Strength",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
