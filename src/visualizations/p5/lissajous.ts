import p5 from 'p5';
import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

interface LissajousConfig extends VisualizationConfig {
  lineCount: number;
  trailLength: number;
  colorScheme: string;
  complexity: number;
  speed: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  cyanMagenta: { primary: '#00ffff', secondary: '#ff00ff', accent: '#ffffff' },
  darkTechno: { primary: '#4a00e0', secondary: '#8000ff', accent: '#1a1a2e' },
  neon: { primary: '#39ff14', secondary: '#ff073a', accent: '#ffff00' },
  monochrome: { primary: '#ffffff', secondary: '#808080', accent: '#404040' },
  acid: { primary: '#00ff00', secondary: '#ffff00', accent: '#88ff00' },
  fire: { primary: '#ff4500', secondary: '#ffd700', accent: '#ff6600' },
  ice: { primary: '#00bfff', secondary: '#e0ffff', accent: '#87ceeb' },
  synthwave: { primary: '#ff00ff', secondary: '#00ffff', accent: '#ff00aa' },
};

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

export class LissajousVisualization implements Visualization {
  id = 'lissajous';
  name = 'Lissajous Curves';
  author = 'Vizec';
  description = 'Classic Lissajous curves with audio-reactive frequency ratios';
  renderer: 'p5' = 'p5';
  transitionType: 'crossfade' = 'crossfade';

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: LissajousConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
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
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

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
    const amplitude = Math.min(this.width, this.height) * 0.35;

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
          const alpha = (1 - ageProgress) * 60;

          // Color gradient along trail
          const colorProgress = (i / curve.trail.length + curve.colorOffset) % 1;
          const strokeColor = p.lerpColor(
            p.color(colors.primary),
            p.color(colors.secondary),
            colorProgress
          );
          strokeColor.setAlpha(alpha);
          p.stroke(strokeColor);

          // Line width varies with volume and trail position
          const lineWidth = (1 + volume * 2) * (1 - ageProgress * 0.5);
          p.strokeWeight(lineWidth);

          p.line(prevPoint.x, prevPoint.y, point.x, point.y);
        }
      }

      // Draw glow at current point
      if (curve.trail.length > 0) {
        const current = curve.trail[curve.trail.length - 1];
        const glowColor = p.color(colors.accent);
        glowColor.setAlpha(40 + volume * 30);
        p.fill(glowColor);
        p.noStroke();

        const glowSize = 6 + volume * 10;
        p.ellipse(current.x, current.y, glowSize, glowSize);

        // Inner bright core
        const coreColor = p.color(colors.accent);
        coreColor.setAlpha(70);
        p.fill(coreColor);
        p.ellipse(current.x, current.y, glowSize * 0.4, glowSize * 0.4);
      }
    }

    // Draw center reference point
    const centerColor = p.color(colors.primary);
    centerColor.setAlpha(20 + bass * 20);
    p.fill(centerColor);
    p.noStroke();
    const centerSize = 10 + bass * sensitivity * 15;
    p.ellipse(0, 0, centerSize, centerSize);

    p.pop();
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
  }

  getConfigSchema(): ConfigSchema {
    return {
      lineCount: {
        type: 'number',
        label: 'Line Count',
        default: 3,
        min: 1,
        max: 5,
        step: 1,
      },
      trailLength: {
        type: 'number',
        label: 'Trail Length',
        default: 150,
        min: 50,
        max: 400,
        step: 25,
      },
      colorScheme: {
        type: 'select',
        label: 'Color Scheme',
        default: 'cyanMagenta',
        options: [
          { value: 'cyanMagenta', label: 'Cyan/Magenta' },
          { value: 'darkTechno', label: 'Dark Techno' },
          { value: 'neon', label: 'Neon' },
          { value: 'monochrome', label: 'Monochrome' },
          { value: 'acid', label: 'Acid' },
          { value: 'fire', label: 'Fire' },
          { value: 'ice', label: 'Ice' },
          { value: 'synthwave', label: 'Synthwave' },
        ],
      },
      complexity: {
        type: 'number',
        label: 'Complexity',
        default: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.25,
      },
      speed: {
        type: 'number',
        label: 'Speed',
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
    };
  }
}
