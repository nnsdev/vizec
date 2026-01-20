import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface BreathingOrbConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  noiseScale: number;
  pulseSpeed: number;
  orbSize: number;
}

export class BreathingOrbVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "breathingOrb",
    name: "Breathing Orb",
    author: "Vizec",
    description: "Organic pulsing sphere with Perlin noise displacement",
    renderer: "p5",
    transitionType: "zoom",
  };

  private container: HTMLElement | null = null;
  private p5Instance: p5 | null = null;
  private config: BreathingOrbConfig = {
    sensitivity: 1.0,
    colorScheme: "nature",
    noiseScale: 0.005,
    pulseSpeed: 0.5,
    orbSize: 100,
  };

  private noiseOffset = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight,
        );
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        p.noStroke();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight,
        );
      };
    });
  }

  private drawVisualization(p: p5): void {
    if (!this.container) return;

    // Clear for transparent background
    p.clear();

    const { bass, treble, volume, frequencyData } = this.currentAudioData || {
      bass: 0,
      mid: 0,
      treble: 0,
      volume: 0,
      frequencyData: new Uint8Array(256).fill(0),
      timeDomainData: new Uint8Array(256).fill(128),
    };

    const { sensitivity, colorScheme, noiseScale, pulseSpeed, orbSize } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Convert hex colors to p5 HSB
    const primaryColor = this.hexToHsb(colors.primary, p);
    const secondaryColor = this.hexToHsb(colors.secondary, p);
    const accentColor = this.hexToHsb(colors.accent, p);

    // Calculate audio boosts
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;
    const volumeBoost = volume * sensitivity;

    // Calculate orb properties
    const pulseAmount = Math.sin(this.noiseOffset * pulseSpeed) * 0.2 + 0.8;
    const baseRadius = orbSize * (1 + bassBoost * 0.3) * pulseAmount;
    const noiseDetail = 1 + trebleBoost * 2;

    // Update noise offset
    this.noiseOffset += 0.01 * (1 + volumeBoost);

    const centerX = p.width / 2;
    const centerY = p.height / 2;

    // Draw orb with noise displacement
    const points = 100;
    for (let i = 0; i < points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const noiseVal = p.noise(
        Math.cos(angle) * noiseDetail * noiseScale * 100 + this.noiseOffset,
        Math.sin(angle) * noiseDetail * noiseScale * 100 + this.noiseOffset,
      );

      const displacement = p.map(noiseVal, 0, 1, -10, 10) * (1 + trebleBoost * 0.5);
      const radius = baseRadius + displacement;

      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      // Get frequency data for this point
      const freqIndex = Math.floor((i / points) * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIndex] / 255;

      // Determine color based on angle and audio
      const colorMix = i / points;
      let pointColor: number[];
      if (colorMix < 0.5) {
        pointColor = this.lerpColor(primaryColor, secondaryColor, colorMix * 2);
      } else {
        pointColor = this.lerpColor(secondaryColor, accentColor, (colorMix - 0.5) * 2);
      }

      // Adjust brightness based on audio
      pointColor[2] = Math.min(100, pointColor[2] + freqValue * 30 * sensitivity);

      // Draw point with glow
      const pointSize = 3 + freqValue * 5 * sensitivity;
      p.fill(pointColor[0], pointColor[1], pointColor[2], 80);
      p.ellipse(x, y, pointSize * 2, pointSize * 2);

      p.fill(pointColor[0], pointColor[1], pointColor[2], 100);
      p.ellipse(x, y, pointSize, pointSize);
    }

    // Draw inner glow
    const innerGlow = p.drawingContext.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      baseRadius * 1.5,
    );
    innerGlow.addColorStop(0, colors.primary + "40");
    innerGlow.addColorStop(0.5, colors.secondary + "20");
    innerGlow.addColorStop(1, "transparent");

    p.drawingContext.fillStyle = innerGlow as string;
    p.drawingContext.beginPath();
    p.drawingContext.arc(centerX, centerY, baseRadius * 1.5, 0, Math.PI * 2);
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
    this.config = { ...this.config, ...config } as BreathingOrbConfig;
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
        default: "nature",
        label: "Color Scheme",
      },
      noiseScale: {
        type: "number",
        min: 0.001,
        max: 0.01,
        step: 0.001,
        default: 0.005,
        label: "Noise Scale",
      },
      pulseSpeed: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 0.5,
        label: "Pulse Speed",
      },
      orbSize: {
        type: "number",
        min: 50,
        max: 200,
        step: 10,
        default: 100,
        label: "Orb Size",
      },
    };
  }
}
