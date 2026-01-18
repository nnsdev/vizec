import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface DeepSeaCreaturesConfig extends VisualizationConfig {
  jellyfishCount: number;
  fishCount: number;
  debrisCount: number;
  glowIntensity: number;
  colorScheme: string;
}

interface Jellyfish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  tentacleCount: number;
  tentacleLength: number;
  pulsePhase: number;
  pulseSpeed: number;
  glowColor: string;
  bodyColor: string;
}

interface DeepFish {
  x: number;
  y: number;
  vx: number;
  size: number;
  tailPhase: number;
  lureSize: number;
  glowColor: string;
  isAnglerfish: boolean;
}

interface Debris {
  x: number;
  y: number;
  vy: number;
  size: number;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
}

// Deep sea color palettes
const DEEP_SEA_PALETTES: Record<string, {
  glow: string[];
  body: string;
  background: string;
}> = {
  abyss: {
    glow: ["#00FFFF", "#0099FF", "#00CCFF", "#66FFFF"],
    body: "#0A1525",
    background: "#030810",
  },
  biolume: {
    glow: ["#00FF88", "#00FFCC", "#88FF00", "#CCFF00"],
    body: "#0A1510",
    background: "#020805",
  },
  crimson: {
    glow: ["#FF0066", "#FF3399", "#CC0033", "#FF6699"],
    body: "#150A0A",
    background: "#080303",
  },
  electric: {
    glow: ["#FF00FF", "#00FFFF", "#FF66FF", "#66FFFF"],
    body: "#100A15",
    background: "#050308",
  },
};

export class DeepSeaCreaturesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "deepSeaCreatures",
    name: "Deep Sea Creatures",
    author: "Vizec",
    description: "Bioluminescent deep sea creatures floating in darkness",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: DeepSeaCreaturesConfig = {
    sensitivity: 1.0,
    jellyfishCount: 4,
    fishCount: 6,
    debrisCount: 30,
    glowIntensity: 1.0,
    colorScheme: "abyss",
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;

  private jellyfish: Jellyfish[] = [];
  private fish: DeepFish[] = [];
  private debris: Debris[] = [];
  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.RGB, 255, 255, 255, 255);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.initCreatures();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initCreatures(): void {
    this.initJellyfish();
    this.initFish();
    this.initDebris();
  }

  private initJellyfish(): void {
    this.jellyfish = [];
    const { jellyfishCount, colorScheme } = this.config;
    const palette = DEEP_SEA_PALETTES[colorScheme] || DEEP_SEA_PALETTES.abyss;

    for (let i = 0; i < jellyfishCount; i++) {
      this.jellyfish.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: -0.3 - Math.random() * 0.5,
        size: 30 + Math.random() * 40,
        tentacleCount: 5 + Math.floor(Math.random() * 4),
        tentacleLength: 60 + Math.random() * 60,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 1 + Math.random() * 0.5,
        glowColor: palette.glow[Math.floor(Math.random() * palette.glow.length)],
        bodyColor: palette.body,
      });
    }
  }

  private initFish(): void {
    this.fish = [];
    const { fishCount, colorScheme } = this.config;
    const palette = DEEP_SEA_PALETTES[colorScheme] || DEEP_SEA_PALETTES.abyss;

    for (let i = 0; i < fishCount; i++) {
      const isAnglerfish = Math.random() < 0.3;
      this.fish.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() > 0.5 ? 1 : -1) * (0.5 + Math.random() * 1),
        size: isAnglerfish ? 25 + Math.random() * 15 : 10 + Math.random() * 15,
        tailPhase: Math.random() * Math.PI * 2,
        lureSize: isAnglerfish ? 5 + Math.random() * 5 : 0,
        glowColor: palette.glow[Math.floor(Math.random() * palette.glow.length)],
        isAnglerfish,
      });
    }
  }

  private initDebris(): void {
    this.debris = [];
    const { debrisCount } = this.config;

    for (let i = 0; i < debrisCount; i++) {
      this.debris.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vy: 0.1 + Math.random() * 0.3,
        size: 1 + Math.random() * 3,
        alpha: 0.1 + Math.random() * 0.2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
      });
    }
  }

  private drawVisualization(p: p5): void {
    const { glowIntensity, sensitivity, colorScheme } = this.config;
    const palette = DEEP_SEA_PALETTES[colorScheme] || DEEP_SEA_PALETTES.abyss;

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) return;

    const { bass, mid, treble, volume } = this.currentAudioData;
    const dt = 1 / 60;

    // Smooth audio values
    this.bassSmooth += (bass - this.bassSmooth) * 0.15;
    this.midSmooth += (mid - this.midSmooth) * 0.15;
    this.trebleSmooth += (treble - this.trebleSmooth) * 0.15;

    this.time += dt;

    // Update and draw debris (background layer)
    this.updateDebris(p, dt, glowIntensity, sensitivity);

    // Update and draw fish
    this.updateFish(p, dt, glowIntensity, sensitivity);

    // Update and draw jellyfish (foreground)
    this.updateJellyfish(p, dt, glowIntensity, sensitivity);
  }

  private updateDebris(p: p5, dt: number, glowIntensity: number, sensitivity: number): void {
    for (const d of this.debris) {
      // Gentle floating movement
      d.y += d.vy + this.midSmooth * sensitivity * 0.2;
      d.x += Math.sin(this.time + d.rotation * 10) * 0.2;
      d.rotation += d.rotationSpeed;

      // Wrap around
      if (d.y > this.height + 10) {
        d.y = -10;
        d.x = Math.random() * this.width;
      }

      // Draw debris particle
      const alpha = d.alpha * glowIntensity * (0.5 + this.trebleSmooth * sensitivity * 0.5);
      const debrisColor = p.color(150, 180, 200);
      debrisColor.setAlpha(alpha * 255);

      p.noStroke();
      p.fill(debrisColor);
      p.ellipse(d.x, d.y, d.size, d.size);
    }
  }

  private updateFish(p: p5, dt: number, glowIntensity: number, sensitivity: number): void {
    for (const fish of this.fish) {
      // Update position
      fish.x += fish.vx * (1 + this.midSmooth * sensitivity * 0.5);
      fish.tailPhase += 0.2 * (1 + this.midSmooth * sensitivity);

      // Gentle vertical movement
      fish.y += Math.sin(this.time + fish.tailPhase) * 0.5;

      // Wrap around horizontally
      if (fish.vx > 0 && fish.x > this.width + fish.size * 2) {
        fish.x = -fish.size * 2;
        fish.y = Math.random() * this.height;
      } else if (fish.vx < 0 && fish.x < -fish.size * 2) {
        fish.x = this.width + fish.size * 2;
        fish.y = Math.random() * this.height;
      }

      // Keep in vertical bounds
      if (fish.y < 50) fish.y = 50;
      if (fish.y > this.height - 50) fish.y = this.height - 50;

      // Draw fish
      this.drawFish(p, fish, glowIntensity, sensitivity);
    }
  }

  private drawFish(p: p5, fish: DeepFish, glowIntensity: number, sensitivity: number): void {
    const direction = fish.vx > 0 ? 1 : -1;
    const tailWave = Math.sin(fish.tailPhase) * 0.3;

    p.push();
    p.translate(fish.x, fish.y);
    p.scale(direction, 1);

    const glowAlpha = (0.4 + this.bassSmooth * sensitivity * 0.4) * glowIntensity;

    if (fish.isAnglerfish) {
      // Draw anglerfish
      // Body
      const bodyColor = p.color(15, 25, 35);
      bodyColor.setAlpha(140);
      p.fill(bodyColor);
      p.noStroke();

      p.beginShape();
      p.vertex(-fish.size, 0);
      p.bezierVertex(
        -fish.size * 0.5, -fish.size * 0.8,
        fish.size * 0.5, -fish.size * 0.6,
        fish.size, -fish.size * 0.2
      );
      p.bezierVertex(
        fish.size * 1.2, 0,
        fish.size * 1.2, fish.size * 0.3,
        fish.size, fish.size * 0.4
      );
      p.bezierVertex(
        fish.size * 0.5, fish.size * 0.6,
        -fish.size * 0.5, fish.size * 0.5,
        -fish.size, 0
      );
      p.endShape(p.CLOSE);

      // Tail
      p.beginShape();
      p.vertex(-fish.size, 0);
      p.vertex(-fish.size * 1.5 + tailWave * 10, -fish.size * 0.3);
      p.vertex(-fish.size * 1.8 + tailWave * 15, 0);
      p.vertex(-fish.size * 1.5 + tailWave * 10, fish.size * 0.3);
      p.endShape(p.CLOSE);

      // Lure antenna
      const lureX = fish.size * 0.8;
      const lureY = -fish.size * 0.8 + Math.sin(this.time * 3) * 5;

      p.stroke(p.color(20, 30, 40));
      p.strokeWeight(1);
      p.noFill();
      p.bezier(
        fish.size * 0.3, -fish.size * 0.5,
        fish.size * 0.5, -fish.size * 1,
        lureX - 10, lureY - 10,
        lureX, lureY
      );

      // Lure glow
      const lureGlow = p.color(fish.glowColor);
      lureGlow.setAlpha(glowAlpha * 255 * 0.5);
      p.noStroke();
      p.fill(lureGlow);
      p.ellipse(lureX, lureY, fish.lureSize * 4, fish.lureSize * 4);

      lureGlow.setAlpha(glowAlpha * 255);
      p.fill(lureGlow);
      p.ellipse(lureX, lureY, fish.lureSize * 2, fish.lureSize * 2);

      // Lure core
      p.fill(255, 255, 255, glowAlpha * 255);
      p.ellipse(lureX, lureY, fish.lureSize, fish.lureSize);

      // Eye
      p.fill(30, 40, 50);
      p.ellipse(fish.size * 0.5, -fish.size * 0.1, fish.size * 0.3, fish.size * 0.25);
      p.fill(255, 255, 255);
      p.ellipse(fish.size * 0.55, -fish.size * 0.1, fish.size * 0.1, fish.size * 0.1);

    } else {
      // Draw small bioluminescent fish
      // Body glow
      const glowColor = p.color(fish.glowColor);
      glowColor.setAlpha(glowAlpha * 255 * 0.3);
      p.noStroke();
      p.fill(glowColor);
      p.ellipse(0, 0, fish.size * 3, fish.size * 2);

      // Body
      const bodyColor = p.color(fish.glowColor);
      bodyColor.setAlpha(glowAlpha * 255 * 0.55);
      p.fill(bodyColor);

      p.beginShape();
      p.vertex(-fish.size, 0);
      p.bezierVertex(
        -fish.size * 0.5, -fish.size * 0.4,
        fish.size * 0.5, -fish.size * 0.4,
        fish.size, 0
      );
      p.bezierVertex(
        fish.size * 0.5, fish.size * 0.4,
        -fish.size * 0.5, fish.size * 0.4,
        -fish.size, 0
      );
      p.endShape(p.CLOSE);

      // Tail
      p.beginShape();
      p.vertex(-fish.size, 0);
      p.vertex(-fish.size * 1.5 + tailWave * 8, -fish.size * 0.3);
      p.vertex(-fish.size * 1.8 + tailWave * 12, 0);
      p.vertex(-fish.size * 1.5 + tailWave * 8, fish.size * 0.3);
      p.endShape(p.CLOSE);

      // Center glow
      p.fill(255, 255, 255, glowAlpha * 255 * 0.6);
      p.ellipse(fish.size * 0.3, 0, fish.size * 0.3, fish.size * 0.2);
    }

    p.pop();
  }

  private updateJellyfish(p: p5, dt: number, glowIntensity: number, sensitivity: number): void {
    for (const jelly of this.jellyfish) {
      // Pulsing movement
      jelly.pulsePhase += jelly.pulseSpeed * dt * (1 + this.bassSmooth * sensitivity);
      const pulse = Math.sin(jelly.pulsePhase);

      // Movement
      jelly.x += jelly.vx + Math.sin(this.time * 0.5 + jelly.pulsePhase) * 0.5;
      jelly.vy = -0.3 - Math.random() * 0.2 - pulse * 0.5 * (1 + this.bassSmooth * sensitivity);
      jelly.y += jelly.vy;

      // Wrap around
      if (jelly.y < -jelly.size - jelly.tentacleLength) {
        jelly.y = this.height + jelly.size;
        jelly.x = Math.random() * this.width;
      }
      if (jelly.x < -jelly.size) jelly.x = this.width + jelly.size;
      if (jelly.x > this.width + jelly.size) jelly.x = -jelly.size;

      // Draw jellyfish
      this.drawJellyfish(p, jelly, pulse, glowIntensity, sensitivity);
    }
  }

  private drawJellyfish(
    p: p5,
    jelly: Jellyfish,
    pulse: number,
    glowIntensity: number,
    sensitivity: number
  ): void {
    const bellPulse = 1 + pulse * 0.15;
    const bellWidth = jelly.size * bellPulse;
    const bellHeight = jelly.size * 0.6 * (1 - pulse * 0.1);

    const glowAlpha = (0.3 + this.bassSmooth * sensitivity * 0.4) * glowIntensity;

    // Outer glow
    const outerGlow = p.color(jelly.glowColor);
    outerGlow.setAlpha(glowAlpha * 255 * 0.2);
    p.noStroke();
    p.fill(outerGlow);
    p.ellipse(jelly.x, jelly.y, bellWidth * 2.5, bellHeight * 3);

    // Bell body
    const bellGlow = p.color(jelly.glowColor);
    bellGlow.setAlpha(glowAlpha * 255 * 0.4);
    p.fill(bellGlow);

    p.beginShape();
    for (let a = 0; a <= p.PI; a += 0.1) {
      const x = jelly.x + Math.cos(a) * bellWidth;
      const y = jelly.y - Math.sin(a) * bellHeight;
      p.curveVertex(x, y);
    }
    p.endShape();

    // Bell rim
    bellGlow.setAlpha(glowAlpha * 255 * 0.55);
    p.fill(bellGlow);
    p.arc(jelly.x, jelly.y, bellWidth * 2, bellHeight * 0.5, 0, p.PI);

    // Internal organs/pattern
    const organGlow = p.color(jelly.glowColor);
    organGlow.setAlpha(glowAlpha * 255 * 0.6);
    p.fill(organGlow);

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * p.PI;
      const ox = jelly.x + Math.cos(p.PI / 2 + angle * 0.5 - p.PI / 4) * bellWidth * 0.3;
      const oy = jelly.y - bellHeight * 0.4;
      p.ellipse(ox, oy, bellWidth * 0.15, bellHeight * 0.3);
    }

    // Tentacles
    for (let i = 0; i < jelly.tentacleCount; i++) {
      const tentacleX = jelly.x + (i - (jelly.tentacleCount - 1) / 2) * (bellWidth * 2 / jelly.tentacleCount);
      this.drawTentacle(p, tentacleX, jelly.y + bellHeight * 0.2, jelly, i, glowAlpha);
    }
  }

  private drawTentacle(
    p: p5,
    startX: number,
    startY: number,
    jelly: Jellyfish,
    index: number,
    glowAlpha: number
  ): void {
    const segments = 8;
    const segmentLength = jelly.tentacleLength / segments;

    const tentacleGlow = p.color(jelly.glowColor);
    tentacleGlow.setAlpha(glowAlpha * 255 * 0.4);
    p.stroke(tentacleGlow);
    p.strokeWeight(2);
    p.noFill();

    let x = startX;
    let y = startY;

    p.beginShape();
    p.vertex(x, y);

    for (let i = 0; i < segments; i++) {
      const wave = Math.sin(this.time * 2 + index + i * 0.5) * (10 + this.trebleSmooth * 10);
      x += wave * 0.3;
      y += segmentLength;
      p.curveVertex(x, y);
    }

    p.endShape();
    p.noStroke();

    // Glowing tips
    const tipGlow = p.color(jelly.glowColor);
    tipGlow.setAlpha(glowAlpha * 255 * 0.6);
    p.fill(tipGlow);
    p.ellipse(x, y, 4, 4);
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
    this.initCreatures();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldJellyfishCount = this.config.jellyfishCount;
    const oldFishCount = this.config.fishCount;
    this.config = { ...this.config, ...config } as DeepSeaCreaturesConfig;

    if (
      (this.config.jellyfishCount !== oldJellyfishCount ||
        this.config.fishCount !== oldFishCount) &&
      this.width > 0
    ) {
      this.initCreatures();
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.jellyfish = [];
    this.fish = [];
    this.debris = [];
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
        default: "abyss",
        options: [
          { label: "Abyss (Cyan)", value: "abyss" },
          { label: "Bioluminescence (Green)", value: "biolume" },
          { label: "Crimson Depths", value: "crimson" },
          { label: "Electric", value: "electric" },
        ],
      },
      jellyfishCount: {
        type: "number",
        label: "Jellyfish",
        default: 4,
        min: 1,
        max: 8,
        step: 1,
      },
      fishCount: {
        type: "number",
        label: "Fish",
        default: 6,
        min: 2,
        max: 12,
        step: 1,
      },
      debrisCount: {
        type: "number",
        label: "Debris Particles",
        default: 30,
        min: 10,
        max: 60,
        step: 5,
      },
      glowIntensity: {
        type: "number",
        label: "Glow Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
