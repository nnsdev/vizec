import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface LissajousConfig extends VisualizationConfig {
  lineCount: number;
  trailLength: number;
  colorScheme: string;
  complexity: number;
  speed: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface LissajousCurve {
  a: number;
  b: number;
  delta: number;
  phase: number;
  trail: TrailPoint[];
  colorOffset: number;
}

export class LissajousVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "lissajous",
    name: "Lissajous Curves",
    author: "Vizec",
    description: "Classic Lissajous curves with audio-reactive frequency ratios",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: LissajousConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    lineCount: 3,
    trailLength: 150,
    complexity: 1.0,
    speed: 1.0,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private curves: LissajousCurve[] = [];
  private time = 0;

  private currentDeltaTime = 0.016;
  private frameCount = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Initialize curves
    this.initCurves();

    // Create p5 instance in instance mode
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        p.strokeCap(p.ROUND);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initCurves(): void {
    this.curves = [];
    const { lineCount, complexity } = this.config;

    // Create curves with different base ratios
    const baseRatios = [
      { a: 3, b: 2 },
      { a: 5, b: 4 },
      { a: 3, b: 4 },
      { a: 5, b: 6 },
      { a: 7, b: 6 },
    ];

    for (let i = 0; i < lineCount; i++) {
      const ratio = baseRatios[i % baseRatios.length];
      this.curves.push({
        a: ratio.a * complexity,
        b: ratio.b * complexity,
        delta: (i * Math.PI) / lineCount,
        phase: 0,
        trail: [],
        colorOffset: i / lineCount,
      });
    }
  }

  private drawVisualization(p: p5): void {
    const { colorScheme, trailLength, speed, sensitivity, lineCount, complexity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Clear with transparent background
    p.clear();

    // Reinitialize curves if count changed
    if (this.curves.length !== lineCount) {
      this.initCurves();
    }

    // Update complexity if changed
    this.curves.forEach((curve, i) => {
      const baseRatios = [
        { a: 3, b: 2 },
        { a: 5, b: 4 },
        { a: 3, b: 4 },
        { a: 5, b: 6 },
        { a: 7, b: 6 },
      ];
      const ratio = baseRatios[i % baseRatios.length];
      curve.a = ratio.a * complexity;
      curve.b = ratio.b * complexity;
    });

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const amplitude = Math.min(this.width, this.height) * 0.4;

    // Default audio values if no data
    let bass = 0.5;
    let treble = 0.5;
    let mid = 0.5;
    let volume = 0.5;

    if (this.currentAudioData) {
      bass = this.currentAudioData.bass;
      treble = this.currentAudioData.treble;
      mid = this.currentAudioData.mid;
      volume = this.currentAudioData.volume;
    }

    // Update time
    this.time += speed * 1.2 * (1 + volume * sensitivity) * this.currentDeltaTime;

    p.push();
    p.translate(centerX, centerY);

    // Process each curve
    for (let c = 0; c < this.curves.length; c++) {
      const curve = this.curves[c];

      // Audio-reactive frequency ratios
      // Bass affects the 'a' parameter (horizontal frequency)
      // Treble affects the 'b' parameter (vertical frequency)
      const audioA = curve.a + bass * sensitivity * 2;
      const audioB = curve.b + treble * sensitivity * 2;

      // Phase shift based on mid frequencies
      curve.phase += speed * 0.6 * (1 + mid * sensitivity) * this.currentDeltaTime;

      // Calculate current point
      const t = this.time + curve.delta;
      const x = Math.sin(audioA * t + curve.phase) * amplitude * (0.8 + volume * 0.4);
      const y = Math.sin(audioB * t) * amplitude * (0.8 + volume * 0.4);

      // Add point to trail
      curve.trail.push({ x, y, age: 0 });

      // Age and remove old trail points
      for (let i = curve.trail.length - 1; i >= 0; i--) {
        curve.trail[i].age += this.currentDeltaTime * 60;
        if (curve.trail[i].age > trailLength) {
          curve.trail.splice(i, 1);
        }
      }

      // Draw trail
      if (curve.trail.length > 1) {
        p.noFill();

        for (let i = 1; i < curve.trail.length; i++) {
          const point = curve.trail[i];
          const prevPoint = curve.trail[i - 1];

          // Calculate alpha based on age (newer = more opaque)
          const ageProgress = point.age / trailLength;
          const alpha = (1 - ageProgress) * 85;

          // Color gradient along trail
          const colorProgress = (i / curve.trail.length + curve.colorOffset) % 1;
          const strokeColor = p.lerpColor(
            p.color(colors.primary),
            p.color(colors.secondary),
            colorProgress,
          );
          strokeColor.setAlpha(alpha);
          p.stroke(strokeColor);

          // Line width varies with volume and trail position - thicker
          const lineWidth = (2 + volume * 4) * (1 - ageProgress * 0.4);
          p.strokeWeight(lineWidth);

          p.line(prevPoint.x, prevPoint.y, point.x, point.y);
        }
      }

      // Draw glow at current point
      if (curve.trail.length > 0) {
        const current = curve.trail[curve.trail.length - 1];

        // Outer glow
        const outerGlow = p.color(colors.accent);
        outerGlow.setAlpha(25 + volume * 20);
        p.fill(outerGlow);
        p.noStroke();
        const outerSize = 20 + volume * 25;
        p.ellipse(current.x, current.y, outerSize, outerSize);

        // Main glow
        const glowColor = p.color(colors.accent);
        glowColor.setAlpha(55 + volume * 35);
        p.fill(glowColor);
        const glowSize = 10 + volume * 15;
        p.ellipse(current.x, current.y, glowSize, glowSize);

        // Inner bright core
        const coreColor = p.color(colors.accent);
        coreColor.setAlpha(90);
        p.fill(coreColor);
        p.ellipse(current.x, current.y, glowSize * 0.35, glowSize * 0.35);
      }
    }

    // Draw center reference point
    const centerColor = p.color(colors.primary);
    centerColor.setAlpha(30 + bass * 30);
    p.fill(centerColor);
    p.noStroke();
    const centerSize = 12 + bass * sensitivity * 20;
    p.ellipse(0, 0, centerSize, centerSize);

    p.pop();
  }

  render(audioData: AudioData, deltaTime: number): void {
    this.currentAudioData = audioData;
    this.frameCount++;

    // Skip first few frames which can have bad deltaTime
    if (this.frameCount < 3) {
      this.currentDeltaTime = 0.016;
      return;
    }

    // Clamp deltaTime to reasonable range (0.001 to 0.05 seconds)
    // Handles both millisecond and second formats
    let dt = deltaTime || 0.016;
    if (dt > 1) dt = dt / 1000; // Convert ms to seconds if needed
    this.currentDeltaTime = Math.max(0.001, Math.min(0.05, dt));
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldLineCount = this.config.lineCount;
    this.config = { ...this.config, ...config } as LissajousConfig;

    // Reinitialize curves if line count changed
    if (this.config.lineCount !== oldLineCount) {
      this.initCurves();
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.curves = [];
    this.frameCount = 0;
  }

  getConfigSchema(): ConfigSchema {
    return {
      lineCount: {
        type: "number",
        label: "Line Count",
        default: 3,
        min: 1,
        max: 5,
        step: 1,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 150,
        min: 50,
        max: 400,
        step: 25,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      complexity: {
        type: "number",
        label: "Complexity",
        default: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.25,
      },
      speed: {
        type: "number",
        label: "Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
    };
  }
}
