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

interface FlowerOfLifeConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  layerCount: number;
  rotationSpeed: number;
  expansionRate: number;
}

export class FlowerOfLifeVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "flowerOfLife",
    name: "Flower of Life",
    author: "Vizec",
    description: "Sacred geometry pattern that expands with music",
    renderer: "p5",
    transitionType: "zoom",
  };

  private container: HTMLElement | null = null;
  private p5Instance: p5 | null = null;
  private config: FlowerOfLifeConfig = {
    sensitivity: 1.0,
    colorScheme: "sunset",
    layerCount: 5,
    rotationSpeed: 0.2,
    expansionRate: 0.5,
  };

  private rotation = 0;
  private expansion = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        p.noFill();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
      };
    });
  }

  private drawVisualization(p: p5): void {
    if (!this.container) return;

    // Clear for transparent background
    p.clear();

    const { bass, mid, treble, volume, frequencyData } = this.currentAudioData || {
      bass: 0,
      mid: 0,
      treble: 0,
      volume: 0,
      frequencyData: new Uint8Array(256).fill(0),
      timeDomainData: new Uint8Array(256).fill(128),
    };

    const { sensitivity, colorScheme, layerCount, rotationSpeed, expansionRate } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Convert hex colors to p5 HSB
    const primaryColor = this.hexToHsb(colors.primary, p);
    const secondaryColor = this.hexToHsb(colors.secondary, p);
    const accentColor = this.hexToHsb(colors.accent, p);

    // Calculate audio boosts
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;
    const volumeBoost = volume * sensitivity;

    // Update rotation and expansion
    this.rotation += (rotationSpeed * 0.01 + volumeBoost * 0.02) * p.deltaTime / 16.67;
    this.expansion += (expansionRate * 0.01 + bassBoost * 0.02) * p.deltaTime / 16.67;

    const centerX = p.width / 2;
    const centerY = p.height / 2;
    const baseRadius = Math.min(p.width, p.height) * 0.35;

    // Draw each layer
    for (let layer = 0; layer < layerCount; layer++) {
      const layerT = layer / (layerCount - 1);
      const freqIndex = Math.floor(layerT * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIndex] / 255;

      // Calculate layer radius with audio reactivity
      const layerRadius = baseRadius * (0.2 + layerT * 0.8) * (1 + freqValue * 0.3 * sensitivity);
      const layerRotation = this.rotation * (layer % 2 === 0 ? 1 : -1);

      // Determine color for this layer
      let layerColor: number[];
      if (layerT < 0.5) {
        layerColor = this.lerpColor(primaryColor, secondaryColor, layerT * 2);
      } else {
        layerColor = this.lerpColor(secondaryColor, accentColor, (layerT - 0.5) * 2);
      }

      // Adjust saturation and brightness based on audio
      layerColor[1] = Math.max(30, layerColor[1] - bassBoost * 20);
      layerColor[2] = Math.min(100, layerColor[2] + trebleBoost * 15 + volumeBoost * 20);

      // Draw the Flower of Life pattern for this layer
      p.push();
      p.translate(centerX, centerY);
      p.rotate(layerRotation);

      // Draw main circle
      p.stroke(layerColor[0], layerColor[1], layerColor[2], 70 + freqValue * 30);
      p.strokeWeight(2 + freqValue * 3 * sensitivity);
      p.ellipse(0, 0, layerRadius * 2, layerRadius * 2);

      // Draw surrounding circles (Flower of Life pattern)
      const numCircles = 6;
      for (let i = 0; i < numCircles; i++) {
        const circleAngle = (i / numCircles) * Math.PI * 2 + this.expansion;
        const circleX = Math.cos(circleAngle) * layerRadius;
        const circleY = Math.sin(circleAngle) * layerRadius;

        p.stroke(layerColor[0], layerColor[1], layerColor[2], 50 + freqValue * 20);
        p.strokeWeight(1.5 + freqValue * 2);
        p.ellipse(circleX, circleY, layerRadius, layerRadius);
      }

      // Draw inner detail circles
      if (midBoost > 0.3) {
        p.stroke(layerColor[0], layerColor[1], layerColor[2], 40);
        p.strokeWeight(1);
        for (let i = 0; i < numCircles; i++) {
          const circleAngle = (i / numCircles) * Math.PI * 2 - this.rotation * 2;
          const circleX = Math.cos(circleAngle) * layerRadius * 0.5;
          const circleY = Math.sin(circleAngle) * layerRadius * 0.5;
          p.ellipse(circleX, circleY, layerRadius * 0.5, layerRadius * 0.5);
        }
      }

      p.pop();
    }

    // Draw center glow
    const centerGlow = p.drawingContext.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      baseRadius * 0.5,
    );
    centerGlow.addColorStop(0, colors.primary + "60");
    centerGlow.addColorStop(0.5, colors.secondary + "30");
    centerGlow.addColorStop(1, "transparent");

    p.drawingContext.fillStyle = centerGlow as string;
    p.drawingContext.beginPath();
    p.drawingContext.arc(centerX, centerY, baseRadius * 0.5, 0, Math.PI * 2);
    p.drawingContext.fill();
  }

  private hexToHsb(hex: string, _p: p5): number[] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff) % 6;
      } else if (max === g) {
        h = (b - r) / diff + 2;
      } else {
        h = (r - g) / diff + 4;
      }
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : (diff / max) * 100;
    const bVal = max * 100;

    return [h, s, bVal];
  }

  private lerpColor(color1: number[], color2: number[], t: number): number[] {
    return [
      color1[0] + (color2[0] - color1[0]) * t,
      color1[1] + (color2[1] - color1[1]) * t,
      color1[2] + (color2[2] - color1[2]) * t,
    ];
  }

  private currentAudioData: AudioData | null = null;

  render(audioData: AudioData, _deltaTime: number): void {
    this.currentAudioData = audioData;
  }

  resize(width: number, height: number): void {
    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as FlowerOfLifeConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [...COLOR_SCHEME_OPTIONS],
        default: "sunset",
        label: "Color Scheme",
      },
      layerCount: {
        type: "number",
        min: 3,
        max: 8,
        step: 1,
        default: 5,
        label: "Layer Count",
      },
      rotationSpeed: {
        type: "number",
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.2,
        label: "Rotation Speed",
      },
      expansionRate: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Expansion Rate",
      },
    };
  }
}
