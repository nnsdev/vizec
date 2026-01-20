import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface MagneticFieldConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  sourceCount: number;
  fieldStrength: number;
  particleDensity: number;
}

export class MagneticFieldVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "magneticField",
    name: "Magnetic Field",
    author: "Vizec",
    description: "Field lines that distort with audio directionality",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private p5Instance: p5 | null = null;
  private config: MagneticFieldConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    sourceCount: 3,
    fieldStrength: 1.0,
    particleDensity: 200,
  };

  private sources: MagneticSource[] = [];

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
        p.noFill();
        this.initSources(p);
      };

      p.draw = () => {
        this.drawVisualization(p);
      };

      p.windowResized = () => {
        p.resizeCanvas(
          container.clientWidth || window.innerWidth,
          container.clientHeight || window.innerHeight,
        );
        this.initSources(p);
      };
    });
  }

  private initSources(p: p5): void {
    this.sources = [];
    const { sourceCount } = this.config;

    for (let i = 0; i < sourceCount; i++) {
      const angle = (i / sourceCount) * Math.PI * 2;
      const distance = Math.min(p.width, p.height) * 0.25;
      this.sources.push({
        x: p.width / 2 + Math.cos(angle) * distance,
        y: p.height / 2 + Math.sin(angle) * distance,
        baseX: p.width / 2 + Math.cos(angle) * distance,
        baseY: p.height / 2 + Math.sin(angle) * distance,
        strength: 0.5 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      });
    }
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

    const { sensitivity, colorScheme, fieldStrength, particleDensity } = this.config;
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

    // Update source positions based on audio
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      const freqIndex = Math.floor((i / this.sources.length) * frequencyData.length * 0.3);
      const freqValue = frequencyData[freqIndex] / 255;

      const moveAmount = freqValue * 50 * sensitivity + bassBoost * 20;
      const angle = source.phase + p.frameCount * 0.02 * (1 + volumeBoost);

      source.x = source.baseX + Math.cos(angle) * moveAmount;
      source.y = source.baseY + Math.sin(angle) * moveAmount;
    }

    // Draw field lines
    const centerX = p.width / 2;
    const centerY = p.height / 2;

    for (let i = 0; i < particleDensity; i++) {
      // Start particles near sources
      const sourceIndex = Math.floor(Math.random() * this.sources.length);
      const source = this.sources[sourceIndex];

      // Get frequency data
      const freqIndex = Math.floor(Math.random() * frequencyData.length * 0.5);
      const freqValue = frequencyData[freqIndex] / 255;

      // Calculate particle position with field influence
      let x = source.x + (Math.random() - 0.5) * 100;
      let y = source.y + (Math.random() - 0.5) * 100;

      // Apply field influence
      let fieldX = 0;
      let fieldY = 0;

      for (const otherSource of this.sources) {
        if (otherSource === source) continue;

        const dx = otherSource.x - x;
        const dy = otherSource.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 10) {
          const strength = (otherSource.strength * fieldStrength * 1000) / (dist * dist);
          fieldX += (dx / dist) * strength;
          fieldY += (dy / dist) * strength;
        }
      }

      // Move particle along field lines
      x += fieldX * (1 + midBoost);
      y += fieldY * (1 + midBoost);

      // Determine color
      const colorT = i / particleDensity;
      let particleColor: number[];
      if (colorT < 0.5) {
        particleColor = this.lerpColor(primaryColor, secondaryColor, colorT * 2);
      } else {
        particleColor = this.lerpColor(secondaryColor, accentColor, (colorT - 0.5) * 2);
      }

      // Adjust brightness based on audio
      particleColor[2] = Math.min(100, particleColor[2] + freqValue * 40 * sensitivity);

      // Draw particle trail
      const alpha = 30 + freqValue * 40 + trebleBoost * 20;
      p.stroke(particleColor[0], particleColor[1], particleColor[2], alpha);
      p.strokeWeight(1 + freqValue * 2);
      p.point(x, y);
    }

    // Draw source points
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      const freqIndex = Math.floor((i / this.sources.length) * frequencyData.length);
      const freqValue = frequencyData[freqIndex] / 255;

      let sourceColor: number[];
      if (i === 0) {
        sourceColor = primaryColor;
      } else if (i === 1) {
        sourceColor = secondaryColor;
      } else {
        sourceColor = accentColor;
      }

      // Draw source glow
      const glowSize = 20 + freqValue * 30 * sensitivity + bassBoost * 15;
      const glow = p.drawingContext.createRadialGradient(
        source.x,
        source.y,
        0,
        source.x,
        source.y,
        glowSize,
      );
      glow.addColorStop(0, colors.primary + "80");
      glow.addColorStop(0.5, colors.secondary + "40");
      glow.addColorStop(1, "transparent");

      p.drawingContext.fillStyle = glow as string;
      p.drawingContext.beginPath();
      p.drawingContext.arc(source.x, source.y, glowSize, 0, Math.PI * 2);
      p.drawingContext.fill();

      // Draw source core
      p.fill(sourceColor[0], sourceColor[1], sourceColor[2], 80 + freqValue * 20);
      p.noStroke();
      p.ellipse(source.x, source.y, 8 + freqValue * 10, 8 + freqValue * 10);
    }

    // Draw center connection
    if (midBoost > 0.3) {
      p.stroke(primaryColor[0], primaryColor[1], primaryColor[2], 30);
      p.strokeWeight(1);
      p.noFill();

      for (const source of this.sources) {
        p.line(source.x, source.y, centerX, centerY);
      }
    }
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
    this.config = { ...this.config, ...config } as MagneticFieldConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.sources = [];
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
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      sourceCount: {
        type: "number",
        min: 2,
        max: 8,
        step: 1,
        default: 3,
        label: "Source Count",
      },
      fieldStrength: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Field Strength",
      },
      particleDensity: {
        type: "number",
        min: 50,
        max: 500,
        step: 50,
        default: 200,
        label: "Particle Density",
      },
    };
  }
}

interface MagneticSource {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  strength: number;
  phase: number;
}
