import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

interface SpiralWaveformConfig extends VisualizationConfig {
  spiralTightness: number;
  expansionSpeed: number;
  colorScheme: string;
  trailLength: number;
  rotationSpeed: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  cyanMagenta: { primary: "#00ffff", secondary: "#ff00ff", accent: "#ffffff" },
  darkTechno: { primary: "#4a00e0", secondary: "#8000ff", accent: "#1a1a2e" },
  neon: { primary: "#39ff14", secondary: "#ff073a", accent: "#ffff00" },
  monochrome: { primary: "#ffffff", secondary: "#808080", accent: "#404040" },
  acid: { primary: "#00ff00", secondary: "#ffff00", accent: "#88ff00" },
  fire: { primary: "#ff4500", secondary: "#ffd700", accent: "#ff6600" },
  ice: { primary: "#00bfff", secondary: "#e0ffff", accent: "#87ceeb" },
  synthwave: { primary: "#ff00ff", secondary: "#00ffff", accent: "#ff00aa" },
};

interface SpiralPoint {
  angle: number;
  radius: number;
  value: number;
  age: number;
}

export class SpiralWaveformVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "spiralWaveform",
    name: "Spiral Waveform",
    author: "Vizec",
    description: "Waveform drawn as an expanding spiral from center",
    renderer: "p5",
    transitionType: "zoom",
  };

  readonly id = (this.constructor as any).meta.id;
  readonly name = (this.constructor as any).meta.name;
  readonly author = (this.constructor as any).meta.author;
  readonly description = (this.constructor as any).meta.description;
  readonly renderer = (this.constructor as any).meta.renderer;
  readonly transitionType = (this.constructor as any).meta.transitionType;

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: SpiralWaveformConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    spiralTightness: 0.5,
    expansionSpeed: 1.0,
    trailLength: 200,
    rotationSpeed: 0.5,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private spiralPoints: SpiralPoint[] = [];
  private currentAngle = 0;
  private baseRadius = 20;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

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

  private drawVisualization(p: p5): void {
    const {
      spiralTightness,
      expansionSpeed,
      colorScheme,
      trailLength,
      rotationSpeed,
      sensitivity,
    } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) {
      return;
    }

    const { timeDomainData, bass, volume, treble } = this.currentAudioData;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.45;

    // Update rotation based on bass
    const bassInfluence = 1 + bass * sensitivity * 2;
    this.currentAngle += rotationSpeed * 0.05 * bassInfluence;

    // Sample waveform and add new spiral points
    const samplesPerFrame = Math.max(4, Math.floor(timeDomainData.length / 32));
    for (let i = 0; i < samplesPerFrame; i++) {
      const sampleIndex = Math.floor(i * (timeDomainData.length / samplesPerFrame));
      const waveValue = (timeDomainData[sampleIndex] / 128 - 1) * sensitivity;

      // Calculate spiral position
      const spiralProgress = this.spiralPoints.length / trailLength;
      const tightnessFactor = spiralTightness * 0.1;
      const radius = this.baseRadius + spiralProgress * maxRadius * 0.8;

      this.spiralPoints.push({
        angle: this.currentAngle + spiralProgress * p.TWO_PI * 3,
        radius: radius + waveValue * 50 * (1 + volume),
        value: waveValue,
        age: 0,
      });

      this.currentAngle += tightnessFactor * expansionSpeed;
    }

    // Age and remove old points
    for (let i = this.spiralPoints.length - 1; i >= 0; i--) {
      this.spiralPoints[i].age += expansionSpeed * 0.5;
      this.spiralPoints[i].radius += expansionSpeed * 0.3;

      if (this.spiralPoints[i].age > trailLength || this.spiralPoints[i].radius > maxRadius) {
        this.spiralPoints.splice(i, 1);
      }
    }

    // Limit total points
    while (this.spiralPoints.length > trailLength * 2) {
      this.spiralPoints.shift();
    }

    p.push();
    p.translate(centerX, centerY);

    // Draw spiral trail
    if (this.spiralPoints.length > 1) {
      p.noFill();
      p.strokeWeight(2 + volume * 2);

      for (let i = 1; i < this.spiralPoints.length; i++) {
        const point = this.spiralPoints[i];
        const prevPoint = this.spiralPoints[i - 1];

        // Calculate age-based alpha (newer = more opaque)
        const ageProgress = point.age / trailLength;
        const alpha = (1 - ageProgress) * 70;

        // Color interpolation based on position and value
        const colorProgress = i / this.spiralPoints.length;
        const strokeColor = p.lerpColor(
          p.color(colors.primary),
          p.color(colors.secondary),
          colorProgress,
        );
        strokeColor.setAlpha(alpha);
        p.stroke(strokeColor);

        const x1 = Math.cos(prevPoint.angle) * prevPoint.radius;
        const y1 = Math.sin(prevPoint.angle) * prevPoint.radius;
        const x2 = Math.cos(point.angle) * point.radius;
        const y2 = Math.sin(point.angle) * point.radius;

        p.line(x1, y1, x2, y2);
      }
    }

    // Draw accent highlights at peak values
    for (let i = 0; i < this.spiralPoints.length; i++) {
      const point = this.spiralPoints[i];
      if (Math.abs(point.value) > 0.5) {
        const x = Math.cos(point.angle) * point.radius;
        const y = Math.sin(point.angle) * point.radius;

        const ageProgress = point.age / trailLength;
        const alpha = (1 - ageProgress) * 50 * Math.abs(point.value);

        const accentColor = p.color(colors.accent);
        accentColor.setAlpha(alpha);
        p.fill(accentColor);
        p.noStroke();

        const size = 3 + Math.abs(point.value) * 8;
        p.ellipse(x, y, size, size);
      }
    }

    // Center glow based on bass
    const centerGlow = p.color(colors.primary);
    centerGlow.setAlpha(20 + bass * 40);
    p.fill(centerGlow);
    p.noStroke();
    const glowSize = this.baseRadius * (1 + bass * sensitivity * 2);
    p.ellipse(0, 0, glowSize * 2, glowSize * 2);

    // Inner core
    const coreColor = p.color(colors.accent);
    coreColor.setAlpha(60 + treble * 30);
    p.fill(coreColor);
    p.ellipse(0, 0, this.baseRadius, this.baseRadius);

    p.pop();
  }

  render(audioData: AudioData, _deltaTime: number): void {
    this.currentAudioData = audioData;
    // p5 handles its own draw loop, we just update the data
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as SpiralWaveformConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.spiralPoints = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      spiralTightness: {
        type: "number",
        label: "Spiral Tightness",
        default: 0.5,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      expansionSpeed: {
        type: "number",
        label: "Expansion Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "darkTechno", label: "Dark Techno" },
          { value: "neon", label: "Neon" },
          { value: "monochrome", label: "Monochrome" },
          { value: "acid", label: "Acid" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
          { value: "synthwave", label: "Synthwave" },
        ],
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 200,
        min: 50,
        max: 500,
        step: 25,
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 0.5,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
