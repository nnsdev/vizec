import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface BioluminescentForestConfig extends VisualizationConfig {
  treeCount: number;
  mushroomCount: number;
  sporeCount: number;
  glowIntensity: number;
  colorScheme: string;
}

interface Tree {
  x: number;
  baseY: number;
  trunkWidth: number;
  height: number;
  branches: Branch[];
  swayPhase: number;
  swayAmount: number;
}

interface Branch {
  startX: number;
  startY: number;
  length: number;
  angle: number;
  depth: number;
  glowNodes: GlowNode[];
}

interface GlowNode {
  x: number;
  y: number;
  size: number;
  phase: number;
  color: string;
}

interface Mushroom {
  x: number;
  y: number;
  stemHeight: number;
  capWidth: number;
  capHeight: number;
  glowPhase: number;
  glowColor: string;
}

interface Spore {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  color: string;
}

export class BioluminescentForestVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "bioluminescentForest",
    name: "Bioluminescent Forest",
    author: "Vizec",
    description: "Glowing forest with bioluminescent plants, mushrooms, and floating spores",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: BioluminescentForestConfig = {
    sensitivity: 1.0,
    treeCount: 5,
    mushroomCount: 8,
    sporeCount: 50,
    glowIntensity: 1.0,
    colorScheme: "nature",
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;

  private trees: Tree[] = [];
  private mushrooms: Mushroom[] = [];
  private spores: Spore[] = [];
  private groundY = 0;
  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

  // Bioluminescent color palettes
  private bioColors = {
    nature: ["#00FF7F", "#00FA9A", "#7FFFD4", "#40E0D0", "#00CED1"],
    ocean: ["#00BFFF", "#00D4FF", "#00FFFF", "#7DF9FF", "#00E5EE"],
    fire: ["#FF6600", "#FF8C00", "#FFA500", "#FFD700", "#FFFF00"],
    ice: ["#87CEEB", "#B0E0E6", "#ADD8E6", "#E0FFFF", "#F0FFFF"],
    cyanMagenta: ["#00FFFF", "#FF00FF", "#00E5EE", "#EE00EE", "#8B008B"],
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.RGB, 255, 255, 255, 255);
        p.noStroke();
        this.width = container.clientWidth;
        this.height = container.clientHeight;
        this.groundY = this.height * 0.85;
        this.initScene();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initScene(): void {
    this.initTrees();
    this.initMushrooms();
    this.initSpores();
  }

  private initTrees(): void {
    this.trees = [];
    const { treeCount } = this.config;
    const palette = this.getBioColors();

    for (let i = 0; i < treeCount; i++) {
      const x = (this.width / (treeCount + 1)) * (i + 1) + (Math.random() - 0.5) * 50;
      const height = 150 + Math.random() * 150;

      const tree: Tree = {
        x,
        baseY: this.groundY,
        trunkWidth: 8 + Math.random() * 8,
        height,
        branches: [],
        swayPhase: Math.random() * Math.PI * 2,
        swayAmount: 2 + Math.random() * 3,
      };

      // Generate branches recursively
      this.generateBranches(
        tree,
        x,
        this.groundY - height * 0.3,
        height * 0.7,
        -Math.PI / 2,
        0,
        palette,
      );

      this.trees.push(tree);
    }
  }

  private generateBranches(
    tree: Tree,
    x: number,
    y: number,
    length: number,
    angle: number,
    depth: number,
    palette: string[],
  ): void {
    if (depth > 4 || length < 20) return;

    const branch: Branch = {
      startX: x,
      startY: y,
      length,
      angle,
      depth,
      glowNodes: [],
    };

    // Add glow nodes along branch
    const nodeCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nodeCount; i++) {
      const t = 0.3 + Math.random() * 0.6;
      const nodeX = x + Math.cos(angle) * length * t;
      const nodeY = y + Math.sin(angle) * length * t;

      branch.glowNodes.push({
        x: nodeX,
        y: nodeY,
        size: 3 + Math.random() * 8,
        phase: Math.random() * Math.PI * 2,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }

    tree.branches.push(branch);

    // End of branch
    const endX = x + Math.cos(angle) * length;
    const endY = y + Math.sin(angle) * length;

    // Create sub-branches
    const branchCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < branchCount; i++) {
      const newAngle = angle + ((Math.random() - 0.5) * Math.PI) / 2;
      const newLength = length * (0.5 + Math.random() * 0.3);
      this.generateBranches(tree, endX, endY, newLength, newAngle, depth + 1, palette);
    }
  }

  private initMushrooms(): void {
    this.mushrooms = [];
    const { mushroomCount } = this.config;
    const palette = this.getBioColors();

    for (let i = 0; i < mushroomCount; i++) {
      this.mushrooms.push({
        x: Math.random() * this.width,
        y: this.groundY + Math.random() * 10,
        stemHeight: 15 + Math.random() * 25,
        capWidth: 20 + Math.random() * 30,
        capHeight: 10 + Math.random() * 15,
        glowPhase: Math.random() * Math.PI * 2,
        glowColor: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  private initSpores(): void {
    this.spores = [];
    const { sporeCount } = this.config;
    const palette = this.getBioColors();

    for (let i = 0; i < sporeCount; i++) {
      this.addSpore(palette);
    }
  }

  private addSpore(palette: string[]): void {
    this.spores.push({
      x: Math.random() * this.width,
      y: this.groundY - Math.random() * (this.height * 0.7),
      vx: (Math.random() - 0.5) * 0.5,
      vy: -0.2 - Math.random() * 0.3,
      size: 2 + Math.random() * 4,
      alpha: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      color: palette[Math.floor(Math.random() * palette.length)],
    });
  }

  private getBioColors(): string[] {
    const schemeKey = this.config.colorScheme as keyof typeof this.bioColors;
    return this.bioColors[schemeKey] || this.bioColors.nature;
  }

  private drawVisualization(p: p5): void {
    const { glowIntensity, sensitivity, colorScheme } = this.config;

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

    // Draw ground glow
    this.drawGroundGlow(p, glowIntensity, sensitivity);

    // Update and draw trees
    this.drawTrees(p, glowIntensity, sensitivity);

    // Update and draw mushrooms
    this.drawMushrooms(p, glowIntensity, sensitivity);

    // Update and draw spores
    this.updateSpores(p, dt, glowIntensity, sensitivity);

    // Emit new spores on mid
    if (this.midSmooth > 0.5 && Math.random() < 0.2 * this.midSmooth) {
      this.addSpore(this.getBioColors());
    }
  }

  private drawGroundGlow(p: p5, glowIntensity: number, sensitivity: number): void {
    const palette = this.getBioColors();
    const glowHeight = 30 + this.bassSmooth * 30 * sensitivity;

    for (let i = 0; i < 3; i++) {
      const color = p.color(palette[i % palette.length]);
      const y = this.groundY + i * 5;
      const alpha = (20 - i * 5) * glowIntensity * (0.5 + this.bassSmooth * sensitivity * 0.5);
      color.setAlpha(alpha);

      p.noStroke();
      p.fill(color);
      p.rect(0, y - glowHeight / 2, this.width, glowHeight);
    }
  }

  private drawTrees(p: p5, glowIntensity: number, sensitivity: number): void {
    for (const tree of this.trees) {
      // Update sway
      tree.swayPhase += 0.02 * (1 + this.midSmooth * sensitivity);
      const swayX = Math.sin(tree.swayPhase) * tree.swayAmount * this.midSmooth * sensitivity;

      p.push();
      p.translate(swayX, 0);

      // Draw trunk silhouette
      const trunkColor = p.color(20, 30, 25);
      trunkColor.setAlpha(140);
      p.fill(trunkColor);
      p.noStroke();

      p.beginShape();
      p.vertex(tree.x - tree.trunkWidth, tree.baseY);
      p.vertex(tree.x - tree.trunkWidth * 0.6, tree.baseY - tree.height * 0.3);
      p.vertex(tree.x - tree.trunkWidth * 0.4, tree.baseY - tree.height);
      p.vertex(tree.x + tree.trunkWidth * 0.4, tree.baseY - tree.height);
      p.vertex(tree.x + tree.trunkWidth * 0.6, tree.baseY - tree.height * 0.3);
      p.vertex(tree.x + tree.trunkWidth, tree.baseY);
      p.endShape(p.CLOSE);

      // Draw branches
      for (const branch of tree.branches) {
        this.drawBranch(p, branch, glowIntensity, sensitivity, swayX);
      }

      p.pop();
    }
  }

  private drawBranch(
    p: p5,
    branch: Branch,
    glowIntensity: number,
    sensitivity: number,
    swayX: number,
  ): void {
    // Branch line (dark silhouette)
    const branchWidth = 3 - branch.depth * 0.5;
    const endX =
      branch.startX + Math.cos(branch.angle) * branch.length + swayX * (branch.depth * 0.2);
    const endY = branch.startY + Math.sin(branch.angle) * branch.length;

    const branchColor = p.color(15, 25, 20);
    branchColor.setAlpha(120);
    p.stroke(branchColor);
    p.strokeWeight(branchWidth);
    p.line(branch.startX + swayX * (branch.depth * 0.1), branch.startY, endX, endY);

    // Draw glow nodes
    for (const node of branch.glowNodes) {
      const nodeX = node.x + swayX * (branch.depth * 0.15);
      const pulse = Math.sin(this.time * 3 + node.phase) * 0.5 + 0.5;
      const audioBoost = this.bassSmooth * sensitivity;
      const size = node.size * (0.8 + pulse * 0.4 + audioBoost * 0.5);
      const alpha = (40 + pulse * 30 + audioBoost * 50) * glowIntensity;

      // Outer glow
      const glowColor = p.color(node.color);
      glowColor.setAlpha(alpha * 0.3);
      p.noStroke();
      p.fill(glowColor);
      p.ellipse(nodeX, node.y, size * 4, size * 4);

      // Inner glow
      glowColor.setAlpha(alpha * 0.6);
      p.fill(glowColor);
      p.ellipse(nodeX, node.y, size * 2, size * 2);

      // Core
      glowColor.setAlpha(alpha);
      p.fill(glowColor);
      p.ellipse(nodeX, node.y, size, size);
    }

    p.noStroke();
  }

  private drawMushrooms(p: p5, glowIntensity: number, sensitivity: number): void {
    for (const mushroom of this.mushrooms) {
      mushroom.glowPhase += 0.03 * (1 + this.trebleSmooth * sensitivity);

      const pulse = Math.sin(mushroom.glowPhase) * 0.5 + 0.5;
      const audioBoost = this.trebleSmooth * sensitivity;

      // Stem silhouette
      const stemColor = p.color(25, 35, 30);
      stemColor.setAlpha(140);
      p.fill(stemColor);
      p.noStroke();

      const stemTop = mushroom.y - mushroom.stemHeight;
      p.rect(
        mushroom.x - mushroom.capWidth * 0.1,
        stemTop,
        mushroom.capWidth * 0.2,
        mushroom.stemHeight,
      );

      // Cap glow (underneath)
      const glowAlpha = (30 + pulse * 30 + audioBoost * 40) * glowIntensity;
      const glowColor = p.color(mushroom.glowColor);
      glowColor.setAlpha(glowAlpha * 0.4);
      p.fill(glowColor);
      p.ellipse(
        mushroom.x,
        stemTop + mushroom.capHeight * 0.3,
        mushroom.capWidth * 1.5,
        mushroom.capHeight * 2,
      );

      // Cap
      const capColor = p.color(20, 30, 25);
      capColor.setAlpha(140);
      p.fill(capColor);
      p.arc(mushroom.x, stemTop, mushroom.capWidth, mushroom.capHeight * 2, p.PI, p.TWO_PI);

      // Cap spots (glowing)
      const spotCount = 3 + Math.floor(Math.random() * 0.01); // Mostly static
      for (let i = 0; i < 4; i++) {
        const spotAngle = p.PI + (i / 4) * p.PI;
        const spotDist = mushroom.capWidth * 0.3;
        const spotX = mushroom.x + Math.cos(spotAngle) * spotDist;
        const spotY = stemTop - Math.sin(spotAngle) * (mushroom.capHeight * 0.4);

        const spotGlow = p.color(mushroom.glowColor);
        spotGlow.setAlpha(glowAlpha * 0.8);
        p.fill(spotGlow);
        p.ellipse(spotX, spotY, 5 + pulse * 2, 5 + pulse * 2);
      }
    }
  }

  private updateSpores(p: p5, dt: number, glowIntensity: number, sensitivity: number): void {
    const palette = this.getBioColors();

    for (let i = this.spores.length - 1; i >= 0; i--) {
      const spore = this.spores[i];

      // Update position with gentle floating motion
      spore.phase += 0.05;
      spore.x += spore.vx + Math.sin(spore.phase) * 0.5 * (1 + this.midSmooth * sensitivity);
      spore.y += spore.vy - this.midSmooth * sensitivity * 0.5;

      // Remove if out of bounds
      if (spore.y < -50 || spore.x < -50 || spore.x > this.width + 50) {
        this.spores.splice(i, 1);
        continue;
      }

      // Keep spore count stable
      if (this.spores.length < this.config.sporeCount) {
        this.addSpore(palette);
      }

      // Draw spore
      const pulse = Math.sin(this.time * 4 + spore.phase) * 0.5 + 0.5;
      const size = spore.size * (0.8 + pulse * 0.4 + this.trebleSmooth * sensitivity * 0.3);
      const alpha = spore.alpha * (0.7 + pulse * 0.3) * glowIntensity * 255;

      // Outer glow
      const glowColor = p.color(spore.color);
      glowColor.setAlpha(alpha * 0.3);
      p.noStroke();
      p.fill(glowColor);
      p.ellipse(spore.x, spore.y, size * 4, size * 4);

      // Core
      glowColor.setAlpha(alpha);
      p.fill(glowColor);
      p.ellipse(spore.x, spore.y, size, size);
    }
  }

  render(audioData: AudioData, _deltaTime: number): void {
    this.currentAudioData = audioData;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.groundY = height * 0.85;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
    this.initScene();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldTreeCount = this.config.treeCount;
    const oldMushroomCount = this.config.mushroomCount;
    this.config = { ...this.config, ...config } as BioluminescentForestConfig;

    if (
      (this.config.treeCount !== oldTreeCount || this.config.mushroomCount !== oldMushroomCount) &&
      this.width > 0
    ) {
      this.initScene();
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.trees = [];
    this.mushrooms = [];
    this.spores = [];
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
        default: "nature",
        options: [
          { label: "Nature (Green)", value: "nature" },
          { label: "Ocean (Blue)", value: "ocean" },
          { label: "Fire (Orange)", value: "fire" },
          { label: "Ice (Light Blue)", value: "ice" },
          { label: "Cyan/Magenta", value: "cyanMagenta" },
        ],
      },
      treeCount: {
        type: "number",
        label: "Tree Count",
        default: 5,
        min: 2,
        max: 8,
        step: 1,
      },
      mushroomCount: {
        type: "number",
        label: "Mushroom Count",
        default: 8,
        min: 3,
        max: 15,
        step: 1,
      },
      sporeCount: {
        type: "number",
        label: "Spore Count",
        default: 50,
        min: 20,
        max: 100,
        step: 10,
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
