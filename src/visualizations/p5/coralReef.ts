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

interface CoralReefConfig extends VisualizationConfig {
  coralCount: number;
  fishCount: number;
  swayAmount: number;
}

interface Coral {
  x: number;
  baseY: number;
  height: number;
  branches: number;
  phase: number;
  type: "branching" | "fan" | "tube";
  color: string;
}

interface Fish {
  x: number;
  y: number;
  size: number;
  speed: number;
  direction: number;
  wigglePhase: number;
  color: string;
}

export class CoralReefVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "coralReef",
    name: "Coral Reef",
    author: "Vizec",
    description: "Swaying coral formations with small fish reacting to sound",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: CoralReefConfig = {
    sensitivity: 1.0,
    colorScheme: "ocean",
    coralCount: 8,
    fishCount: 15,
    swayAmount: 1.0,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private corals: Coral[] = [];
  private fish: Fish[] = [];
  private smoothedMid = 0;
  private smoothedTreble = 0;
  private smoothedBass = 0;
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
        this.initCorals(p);
        this.initFish(p);
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initCorals(p: p5): void {
    this.corals = [];
    const { coralCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);
    const coralColors = [colors.primary, colors.secondary, colors.accent];

    for (let i = 0; i < coralCount; i++) {
      const types: Array<"branching" | "fan" | "tube"> = ["branching", "fan", "tube"];
      this.corals.push({
        x: (this.width / (coralCount + 1)) * (i + 1) + (Math.random() - 0.5) * 40,
        baseY: this.height * 0.85 + Math.random() * 30,
        height: 60 + Math.random() * 100,
        branches: 3 + Math.floor(Math.random() * 4),
        phase: Math.random() * Math.PI * 2,
        type: types[Math.floor(Math.random() * types.length)],
        color: coralColors[Math.floor(Math.random() * coralColors.length)],
      });
    }
  }

  private initFish(p: p5): void {
    this.fish = [];
    const { fishCount, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    for (let i = 0; i < fishCount; i++) {
      const direction = Math.random() > 0.5 ? 1 : -1;
      this.fish.push({
        x: Math.random() * this.width,
        y: this.height * 0.3 + Math.random() * this.height * 0.4,
        size: 5 + Math.random() * 10,
        speed: 0.5 + Math.random() * 1,
        direction,
        wigglePhase: Math.random() * Math.PI * 2,
        color: Math.random() > 0.5 ? colors.accent : colors.primary,
      });
    }
  }

  private drawVisualization(p: p5): void {
    const { colorScheme, sensitivity, swayAmount } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, colorScheme);

    p.clear();

    if (!this.currentAudioData) return;

    const { mid, treble, bass } = this.currentAudioData;

    // Smooth audio
    const smoothing = 0.12;
    this.smoothedMid = this.smoothedMid * (1 - smoothing) + mid * sensitivity * smoothing;
    this.smoothedTreble = this.smoothedTreble * (1 - smoothing) + treble * sensitivity * smoothing;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * smoothing;

    this.time += 0.02;

    // Draw seafloor
    this.drawSeafloor(p, colors);

    // Draw corals
    for (const coral of this.corals) {
      this.drawCoral(p, coral, swayAmount);
    }

    // Update and draw fish
    this.updateFish();
    for (const fish of this.fish) {
      this.drawFish(p, fish);
    }

    // Draw light rays
    this.drawLightRays(p, colors);
  }

  private drawSeafloor(p: p5, colors: { primary: string; secondary: string; accent: string }): void {
    const floorY = this.height * 0.85;

    p.noStroke();
    const floorColor = p.color(colors.secondary);
    floorColor.setAlpha(80);
    p.fill(floorColor);

    p.beginShape();
    p.vertex(0, this.height);
    for (let x = 0; x <= this.width; x += 20) {
      const y = floorY + Math.sin(x * 0.02 + this.time * 0.5) * 10;
      p.vertex(x, y);
    }
    p.vertex(this.width, this.height);
    p.endShape(p.CLOSE);
  }

  private drawCoral(p: p5, coral: Coral, swayAmount: number): void {
    const sway = Math.sin(this.time + coral.phase) * 5 * swayAmount * (1 + this.smoothedMid);

    p.push();
    p.translate(coral.x, coral.baseY);

    const coralColor = p.color(coral.color);
    coralColor.setAlpha(150);

    if (coral.type === "branching") {
      this.drawBranchingCoral(p, coral, sway, coralColor);
    } else if (coral.type === "fan") {
      this.drawFanCoral(p, coral, sway, coralColor);
    } else {
      this.drawTubeCoral(p, coral, sway, coralColor);
    }

    p.pop();
  }

  private drawBranchingCoral(p: p5, coral: Coral, sway: number, color: p5.Color): void {
    p.stroke(color);
    p.strokeWeight(3);
    p.noFill();

    for (let i = 0; i < coral.branches; i++) {
      const angle = -Math.PI / 2 + (i - coral.branches / 2) * 0.3;
      const branchSway = sway * (1 + i * 0.2);

      p.beginShape();
      p.vertex(0, 0);

      for (let t = 0; t <= 1; t += 0.1) {
        const branchHeight = coral.height * t;
        const x = Math.sin(angle) * branchHeight * 0.5 + branchSway * t;
        const y = -branchHeight;
        p.vertex(x, y);
      }

      p.endShape();

      // Draw sub-branches
      const subBranchCount = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < subBranchCount; j++) {
        const t = 0.4 + j * 0.2;
        const startX = Math.sin(angle) * coral.height * t * 0.5 + sway * t;
        const startY = -coral.height * t;
        const subAngle = angle + (Math.random() - 0.5) * 0.5;
        const subLength = coral.height * 0.3;

        p.beginShape();
        p.vertex(startX, startY);
        p.vertex(
          startX + Math.sin(subAngle) * subLength + branchSway * 0.5,
          startY - subLength * 0.8
        );
        p.endShape();
      }
    }
  }

  private drawFanCoral(p: p5, coral: Coral, sway: number, color: p5.Color): void {
    p.noStroke();
    p.fill(color);

    // Fan shape using bezier
    const fanWidth = coral.height * 0.8;

    p.beginShape();
    p.vertex(0, 0);

    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * 0.6;
      const r = coral.height * Math.sin(t * Math.PI);
      const x = Math.cos(angle) * fanWidth * (t * 0.5 + 0.5) + sway * t;
      const y = -r;
      p.vertex(x, y);
    }

    p.endShape(p.CLOSE);

    // Fan ribs
    p.stroke(color);
    p.strokeWeight(1);
    color.setAlpha(100);
    p.stroke(color);

    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      const angle = -Math.PI / 2 + (t - 0.5) * Math.PI * 0.5;
      p.line(0, 0, Math.cos(angle) * coral.height * 0.7 + sway, -Math.sin(-angle) * coral.height * 0.8);
    }
  }

  private drawTubeCoral(p: p5, coral: Coral, sway: number, color: p5.Color): void {
    p.noStroke();

    const tubes = coral.branches;
    const tubeWidth = 8;

    for (let i = 0; i < tubes; i++) {
      const offsetX = (i - tubes / 2) * 15;
      const tubeHeight = coral.height * (0.6 + Math.random() * 0.4);
      const tubeSway = sway * (1 + i * 0.1);

      // Tube body
      const tubeColor = p.color(coral.color);
      tubeColor.setAlpha(140);
      p.fill(tubeColor);

      p.beginShape();
      p.vertex(offsetX - tubeWidth, 0);
      p.bezierVertex(
        offsetX - tubeWidth + tubeSway * 0.3, -tubeHeight * 0.3,
        offsetX - tubeWidth * 0.8 + tubeSway * 0.6, -tubeHeight * 0.7,
        offsetX + tubeSway, -tubeHeight
      );
      p.bezierVertex(
        offsetX + tubeWidth * 0.8 + tubeSway * 0.6, -tubeHeight * 0.7,
        offsetX + tubeWidth + tubeSway * 0.3, -tubeHeight * 0.3,
        offsetX + tubeWidth, 0
      );
      p.endShape(p.CLOSE);

      // Tube opening
      tubeColor.setAlpha(180);
      p.fill(tubeColor);
      p.ellipse(offsetX + tubeSway, -tubeHeight, tubeWidth * 2, tubeWidth);
    }
  }

  private updateFish(): void {
    const trebleBoost = 1 + this.smoothedTreble * 3;

    for (const fish of this.fish) {
      fish.x += fish.speed * fish.direction * trebleBoost;
      fish.wigglePhase += 0.2 * trebleBoost;

      // Wrap around
      if (fish.direction > 0 && fish.x > this.width + 20) {
        fish.x = -20;
        fish.y = this.height * 0.3 + Math.random() * this.height * 0.4;
      } else if (fish.direction < 0 && fish.x < -20) {
        fish.x = this.width + 20;
        fish.y = this.height * 0.3 + Math.random() * this.height * 0.4;
      }
    }
  }

  private drawFish(p: p5, fish: Fish): void {
    const wiggle = Math.sin(fish.wigglePhase) * 3;

    p.push();
    p.translate(fish.x, fish.y + wiggle);
    p.scale(fish.direction, 1);

    const fishColor = p.color(fish.color);
    fishColor.setAlpha(180);
    p.fill(fishColor);
    p.noStroke();

    // Fish body
    p.ellipse(0, 0, fish.size * 2, fish.size);

    // Tail
    p.triangle(
      -fish.size,
      0,
      -fish.size * 1.5,
      -fish.size * 0.5,
      -fish.size * 1.5,
      fish.size * 0.5
    );

    // Eye
    p.fill(255);
    p.ellipse(fish.size * 0.5, -fish.size * 0.15, fish.size * 0.3, fish.size * 0.3);
    p.fill(0);
    p.ellipse(fish.size * 0.55, -fish.size * 0.15, fish.size * 0.15, fish.size * 0.15);

    p.pop();
  }

  private drawLightRays(p: p5, colors: { primary: string; secondary: string; accent: string }): void {
    const rayCount = 5;
    const rayColor = p.color(colors.accent);
    rayColor.setAlpha(20 + this.smoothedBass * 20);

    p.noStroke();
    p.fill(rayColor);

    for (let i = 0; i < rayCount; i++) {
      const x = (this.width / (rayCount + 1)) * (i + 1);
      const sway = Math.sin(this.time * 0.5 + i) * 30;

      p.beginShape();
      p.vertex(x + sway - 20, 0);
      p.vertex(x + sway + 20, 0);
      p.vertex(x + sway * 2 + 60, this.height);
      p.vertex(x + sway * 2 - 60, this.height);
      p.endShape(p.CLOSE);
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
      this.initCorals(this.p5Instance);
      this.initFish(this.p5Instance);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCoralCount = this.config.coralCount;
    const oldFishCount = this.config.fishCount;

    this.config = { ...this.config, ...config } as CoralReefConfig;

    if (this.p5Instance && (
      this.config.coralCount !== oldCoralCount ||
      this.config.fishCount !== oldFishCount
    )) {
      this.initCorals(this.p5Instance);
      this.initFish(this.p5Instance);
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.corals = [];
    this.fish = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      coralCount: {
        type: "number",
        label: "Coral Count",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      fishCount: {
        type: "number",
        label: "Fish Count",
        default: 15,
        min: 5,
        max: 30,
        step: 1,
      },
      swayAmount: {
        type: "number",
        label: "Sway Amount",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "ocean",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
