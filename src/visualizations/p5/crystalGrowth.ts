import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface CrystalGrowthConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  maxCrystals: number;
  branchChance: number;
  growthSpeed: number;
}

export class CrystalGrowthVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "crystalGrowth",
    name: "Crystal Growth",
    author: "Vizec",
    description: "Crystal formations that grow based on frequency",
    renderer: "p5",
    transitionType: "zoom",
  };

  private container: HTMLElement | null = null;
  private p5Instance: p5 | null = null;
  private config: CrystalGrowthConfig = {
    sensitivity: 1.0,
    colorScheme: "ice",
    maxCrystals: 15,
    branchChance: 0.3,
    growthSpeed: 1.5,
  };

  private crystals: Crystal[] = [];

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

    const { bass, mid, treble, volume, frequencyData } = this.currentAudioData || {
      bass: 0,
      mid: 0,
      treble: 0,
      volume: 0,
      frequencyData: new Uint8Array(256).fill(0),
      timeDomainData: new Uint8Array(256).fill(128),
    };

    const { sensitivity, colorScheme, maxCrystals, branchChance, growthSpeed } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    // Convert hex colors to p5 HSB
    const primaryColor = this.hexToHsb(colors.primary, p);
    const secondaryColor = this.hexToHsb(colors.secondary, p);
    const accentColor = this.hexToHsb(colors.accent, p);

    // Calculate audio boosts
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const _trebleBoost = Math.pow(treble, 0.7) * sensitivity;
    const volumeBoost = volume * sensitivity;

    // Cleanup old stopped crystals periodically
    const MAX_SEGMENTS = 80;
    if (this.crystals.length > 40) {
      const stoppedCrystals = this.crystals.filter((c) => !c.growing);
      if (stoppedCrystals.length > 10) {
        this.crystals = this.crystals.filter((c) => c.growing).concat(stoppedCrystals.slice(-10));
      }
    }

    // Spawn new crystals
    const growingCount = this.crystals.filter((c) => c.growing).length;
    if (growingCount < maxCrystals) {
      const spawnChance = 0.06 + bassBoost * 0.15 + (this.crystals.length === 0 ? 0.5 : 0);
      if (Math.random() < spawnChance) {
        const x = p.width * 0.1 + Math.random() * p.width * 0.8;
        const y = p.height + 10;
        // Main stem goes mostly upward
        const baseAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
        this.crystals.push({
          x,
          y,
          segments: [{ x, y, width: 6 + bassBoost * 6 }],
          growing: true,
          color: Math.random() < 0.33 ? "primary" : Math.random() < 0.5 ? "secondary" : "accent",
          growthRate: growthSpeed * (1.5 + volumeBoost),
          angle: baseAngle,
        });
      }
    }

    // Update and draw crystals
    for (const crystal of this.crystals) {
      // Get crystal color once per crystal
      let crystalColor: number[];
      if (crystal.color === "primary") {
        crystalColor = [...primaryColor];
      } else if (crystal.color === "secondary") {
        crystalColor = [...secondaryColor];
      } else {
        crystalColor = [...accentColor];
      }

      const freqIndex = Math.floor((crystal.x / p.width) * frequencyData.length * 0.3);
      const freqValue = frequencyData[freqIndex] / 255;

      if (crystal.growing) {
        const lastSegment = crystal.segments[crystal.segments.length - 1];
        const segCount = crystal.segments.length;

        // Add slight angular jitter for crystalline look
        const jitter = (Math.random() - 0.5) * 0.08;
        crystal.angle += jitter;

        // Grow the crystal
        const growth = crystal.growthRate * (2 + midBoost * 0.5);
        const newX = lastSegment.x + Math.cos(crystal.angle) * growth;
        const newY = lastSegment.y + Math.sin(crystal.angle) * growth;

        // Check if crystal should stop growing
        if (newY < p.height * 0.08 || newX < 20 || newX > p.width - 20 || segCount > MAX_SEGMENTS) {
          crystal.growing = false;
        } else {
          // Create branch points - spawn symmetric branches at intervals
          const branchInterval = 6 + Math.floor(Math.random() * 4);
          if (segCount > 3 && segCount % branchInterval === 0 && growingCount < maxCrystals + 8) {
            // Spawn 1-2 branches at crystalline angles (60° typical for ice crystals)
            const numBranches = Math.random() < branchChance ? 2 : 1;
            for (let b = 0; b < numBranches; b++) {
              const side = b === 0 ? 1 : -1;
              // Branch angle: 45-75 degrees from main stem
              const branchAngle =
                crystal.angle + side * (Math.PI / 4 + (Math.random() * Math.PI) / 6);
              this.crystals.push({
                x: lastSegment.x,
                y: lastSegment.y,
                segments: [{ x: lastSegment.x, y: lastSegment.y, width: lastSegment.width * 0.6 }],
                growing: true,
                color: crystal.color,
                growthRate: crystal.growthRate * 0.7,
                angle: branchAngle,
              });
            }
          }

          // Add new segment
          crystal.segments.push({
            x: newX,
            y: newY,
            width: Math.max(1.5, lastSegment.width - 0.02),
          });
        }
      }

      // Adjust color brightness based on audio
      const brightness = Math.min(100, crystalColor[2] + freqValue * 40 * sensitivity);

      // Draw crystal with glow effect
      const segAlpha = 50 + freqValue * 40;

      // Outer glow
      p.stroke(crystalColor[0], crystalColor[1], brightness, segAlpha * 0.5);
      for (let i = 1; i < crystal.segments.length; i++) {
        const seg = crystal.segments[i];
        const prevSeg = crystal.segments[i - 1];
        p.strokeWeight(seg.width + 3);
        p.line(prevSeg.x, prevSeg.y, seg.x, seg.y);
      }

      // Inner bright core
      p.stroke(
        crystalColor[0],
        Math.max(20, crystalColor[1] - 30),
        Math.min(100, brightness + 20),
        segAlpha,
      );
      for (let i = 1; i < crystal.segments.length; i++) {
        const seg = crystal.segments[i];
        const prevSeg = crystal.segments[i - 1];
        p.strokeWeight(seg.width);
        p.line(prevSeg.x, prevSeg.y, seg.x, seg.y);
      }

      // Draw bright tip for growing crystals
      if (crystal.growing && crystal.segments.length > 1) {
        const tip = crystal.segments[crystal.segments.length - 1];
        p.fill(crystalColor[0], 30, 100, 80);
        p.noStroke();
        p.ellipse(tip.x, tip.y, 6 + bassBoost * 4, 6 + bassBoost * 4);
      }
    }

    // Draw ambient background crystals
    const numBackgroundCrystals = Math.floor(3 + volumeBoost * 5);
    for (let i = 0; i < numBackgroundCrystals; i++) {
      const x = (p.width / numBackgroundCrystals) * i + p.width / (numBackgroundCrystals * 2);
      const freqIndex = Math.floor((x / p.width) * frequencyData.length * 0.2);
      const freqValue = frequencyData[freqIndex] / 255;

      let bgColor: number[];
      if (i % 3 === 0) {
        bgColor = primaryColor;
      } else if (i % 3 === 1) {
        bgColor = secondaryColor;
      } else {
        bgColor = accentColor;
      }

      const crystalHeight = 50 + freqValue * 100 * sensitivity;
      p.stroke(bgColor[0], bgColor[1], bgColor[2], 20 + freqValue * 20);
      p.strokeWeight(3 + freqValue * 5);
      p.line(x, p.height, x, p.height - crystalHeight);
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
    this.config = { ...this.config, ...config } as CrystalGrowthConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.crystals = [];
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
        default: "ice",
        label: "Color Scheme",
      },
      maxCrystals: {
        type: "number",
        min: 5,
        max: 30,
        step: 1,
        default: 15,
        label: "Max Crystals",
      },
      branchChance: {
        type: "number",
        min: 0.1,
        max: 0.5,
        step: 0.05,
        default: 0.3,
        label: "Branch Chance",
      },
      growthSpeed: {
        type: "number",
        min: 0.5,
        max: 4,
        step: 0.5,
        default: 1.5,
        label: "Growth Speed",
      },
    };
  }
}

interface Crystal {
  x: number;
  y: number;
  segments: { x: number; y: number; width: number }[];
  growing: boolean;
  color: "primary" | "secondary" | "accent";
  growthRate: number;
  angle: number;
}
