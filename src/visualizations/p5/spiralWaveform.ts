import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface SpiralWaveformConfig extends VisualizationConfig {
  spiralTightness: number;
  expansionSpeed: number;
  colorScheme: string;
  trailLength: number;
  rotationSpeed: number;
}

interface SpiralPoint {
  angle: number;
  radius: number;
  value: number;
  age: number;
}

export class SpiralWaveformVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "spiralWaveform",
    name: "Spiral Waveform",
    author: "Vizec",
    description: "Waveform drawn as an expanding spiral from center",
    renderer: "p5",
    transitionType: "zoom",
  };

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
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

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

    // Age points and mark for removal (avoid splice in loop)
    let writeIndex = 0;
    for (let i = 0; i < this.spiralPoints.length; i++) {
      const point = this.spiralPoints[i];
      point.age += expansionSpeed * 0.5;
      point.radius += expansionSpeed * 0.3;

      // Keep point if still valid
      if (point.age <= trailLength && point.radius <= maxRadius) {
        this.spiralPoints[writeIndex++] = point;
      }
    }
    // Truncate array efficiently
    this.spiralPoints.length = writeIndex;

    // Hard cap on points for performance
    const maxPoints = Math.min(trailLength, 400);
    if (this.spiralPoints.length > maxPoints) {
      this.spiralPoints = this.spiralPoints.slice(-maxPoints);
    }

    p.push();
    p.translate(centerX, centerY);

    // Draw spiral trail - batch by color segments for performance
    if (this.spiralPoints.length > 1) {
      p.noFill();
      const baseWeight = 2 + volume * 2;
      p.strokeWeight(baseWeight);

      // Draw in segments with less frequent color updates
      const segmentSize = 8; // Update color every N points
      const primaryColor = p.color(colors.primary);
      const secondaryColor = p.color(colors.secondary);

      for (let i = 1; i < this.spiralPoints.length; i++) {
        const point = this.spiralPoints[i];
        const prevPoint = this.spiralPoints[i - 1];

        // Only recalculate color every segmentSize points
        if (i % segmentSize === 1 || i === 1) {
          const ageProgress = point.age / trailLength;
          const alpha = (1 - ageProgress) * 70;
          const colorProgress = i / this.spiralPoints.length;
          const strokeColor = p.lerpColor(primaryColor, secondaryColor, colorProgress);
          strokeColor.setAlpha(alpha);
          p.stroke(strokeColor);
        }

        const x1 = Math.cos(prevPoint.angle) * prevPoint.radius;
        const y1 = Math.sin(prevPoint.angle) * prevPoint.radius;
        const x2 = Math.cos(point.angle) * point.radius;
        const y2 = Math.sin(point.angle) * point.radius;

        p.line(x1, y1, x2, y2);
      }
    }

    // Draw accent highlights - only check every few points for performance
    const highlightStep = Math.max(1, Math.floor(this.spiralPoints.length / 50));
    p.noStroke();
    const accentColor = p.color(colors.accent);

    for (let i = 0; i < this.spiralPoints.length; i += highlightStep) {
      const point = this.spiralPoints[i];
      if (Math.abs(point.value) > 0.5) {
        const x = Math.cos(point.angle) * point.radius;
        const y = Math.sin(point.angle) * point.radius;

        const ageProgress = point.age / trailLength;
        const alpha = (1 - ageProgress) * 50 * Math.abs(point.value);

        accentColor.setAlpha(alpha);
        p.fill(accentColor);

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
        options: [...COLOR_SCHEME_OPTIONS],
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 200,
        min: 50,
        max: 350,
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
