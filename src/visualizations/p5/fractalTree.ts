import p5 from "p5";
import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

interface FractalTreeConfig extends VisualizationConfig {
  depth: number;
  branchAngle: number;
  colorScheme: string;
  swayAmount: number;
  growth: number;
}

const COLOR_SCHEMES: Record<string, { trunk: string; branch: string; leaf: string; glow: string }> =
  {
    cyanMagenta: { trunk: "#4a00e0", branch: "#00ffff", leaf: "#ff00ff", glow: "#00ffff" },
    darkTechno: { trunk: "#1a1a2e", branch: "#4a00e0", leaf: "#8000ff", glow: "#8000ff" },
    neon: { trunk: "#ff073a", branch: "#39ff14", leaf: "#ffff00", glow: "#39ff14" },
    monochrome: { trunk: "#404040", branch: "#808080", leaf: "#ffffff", glow: "#ffffff" },
    acid: { trunk: "#006600", branch: "#00ff00", leaf: "#88ff00", glow: "#00ff00" },
    autumn: { trunk: "#8b4513", branch: "#cd853f", leaf: "#ff4500", glow: "#ffd700" },
    sakura: { trunk: "#4a3728", branch: "#8b6b61", leaf: "#ffb7c5", glow: "#ff69b4" },
    ice: { trunk: "#1e3a5f", branch: "#4682b4", leaf: "#e0ffff", glow: "#87ceeb" },
  };

export class FractalTreeVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "fractalTree",
    name: "Fractal Tree",
    author: "Vizec",
    description: "Recursive fractal tree that sways and pulses with audio",
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
  private config: FractalTreeConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    depth: 8,
    branchAngle: 25,
    swayAmount: 0.5,
    growth: 0.7,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private windOffset = 0;
  private growthPhase = 0;
  private leafGlow: number[] = [];

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Initialize leaf glow array
    this.leafGlow = Array.from({ length: 100 }, () => 0);

    // Create p5 instance in instance mode
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private drawVisualization(p: p5): void {
    const { depth, branchAngle, colorScheme, swayAmount, growth, sensitivity } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) {
      return;
    }

    const { bass, mid, treble, volume, frequencyData } = this.currentAudioData;

    // Update wind effect based on bass/mid
    this.windOffset += 0.02 + bass * 0.05 * sensitivity;

    // Update growth phase
    this.growthPhase += 0.01 + volume * 0.02 * sensitivity;

    // Update leaf glow based on treble hits
    for (let i = 0; i < this.leafGlow.length; i++) {
      this.leafGlow[i] *= 0.9; // Decay
      if (treble > 0.5 && Math.random() < treble * 0.3) {
        this.leafGlow[i] = 1;
      }
    }

    // Calculate base branch length with volume pulse
    const baseLength = Math.min(this.width, this.height) * 0.18 * growth;
    const lengthPulse = 1 + volume * 0.3 * sensitivity;

    // Position tree at bottom center
    p.push();
    p.translate(this.width / 2, this.height);

    // Draw the trunk first
    const trunkColor = p.color(colors.trunk);
    trunkColor.setAlpha(80);
    p.stroke(trunkColor);
    p.strokeWeight(12 + bass * 8 * sensitivity);
    p.line(0, 0, 0, -baseLength * lengthPulse * 0.8);

    // Start recursive branch drawing
    p.translate(0, -baseLength * lengthPulse * 0.8);

    let leafIndex = 0;
    this.drawBranch(
      p,
      baseLength * lengthPulse,
      branchAngle,
      depth,
      0,
      colors,
      bass,
      mid,
      treble,
      sensitivity,
      swayAmount,
      frequencyData,
      { value: leafIndex },
    );

    p.pop();
  }

  private drawBranch(
    p: p5,
    length: number,
    angle: number,
    depth: number,
    currentDepth: number,
    colors: { trunk: string; branch: string; leaf: string; glow: string },
    bass: number,
    mid: number,
    treble: number,
    sensitivity: number,
    swayAmount: number,
    frequencyData: Uint8Array,
    leafIndexRef: { value: number },
  ): void {
    if (currentDepth >= depth) {
      // Draw leaf/endpoint with glow
      const glowIntensity = this.leafGlow[leafIndexRef.value % this.leafGlow.length];
      leafIndexRef.value++;

      const leafSize = 4 + treble * 12 * sensitivity + glowIntensity * 10;

      if (glowIntensity > 0.1) {
        // Draw glow effect
        const glowColor = p.color(colors.glow);
        glowColor.setAlpha(glowIntensity * 50);
        p.noStroke();
        p.fill(glowColor);
        p.ellipse(0, 0, leafSize * 3, leafSize * 3);
      }

      // Draw leaf
      const leafColor = p.color(colors.leaf);
      leafColor.setAlpha(60 + glowIntensity * 40);
      p.fill(leafColor);
      p.noStroke();
      p.ellipse(0, 0, leafSize, leafSize);

      return;
    }

    // Calculate sway based on audio and wind
    const freqIndex = Math.floor((currentDepth / depth) * (frequencyData.length / 4));
    const freqValue = frequencyData[freqIndex] / 255;

    const sway =
      Math.sin(this.windOffset + currentDepth * 0.5) * swayAmount * 15 * (1 + mid * sensitivity);
    const audioSway = (freqValue - 0.5) * swayAmount * 20 * sensitivity;

    // Branch reduction factor
    const reduction = 0.67 + bass * 0.1 * sensitivity;
    const newLength = length * reduction;

    // Calculate stroke weight based on depth
    const weight = Math.max(1, (depth - currentDepth) * 1.5 + bass * 3 * sensitivity);

    // Interpolate color from trunk to branch based on depth
    const depthRatio = currentDepth / depth;
    const branchColor = p.lerpColor(p.color(colors.trunk), p.color(colors.branch), depthRatio);
    branchColor.setAlpha(70 - depthRatio * 20);

    p.stroke(branchColor);
    p.strokeWeight(weight);

    // Left branch
    p.push();
    p.rotate(p.radians(-angle + sway + audioSway));
    p.line(0, 0, 0, -newLength);
    p.translate(0, -newLength);
    this.drawBranch(
      p,
      newLength,
      angle * (0.9 + freqValue * 0.2),
      depth,
      currentDepth + 1,
      colors,
      bass,
      mid,
      treble,
      sensitivity,
      swayAmount,
      frequencyData,
      leafIndexRef,
    );
    p.pop();

    // Right branch
    p.push();
    p.rotate(p.radians(angle + sway + audioSway));
    p.line(0, 0, 0, -newLength);
    p.translate(0, -newLength);
    this.drawBranch(
      p,
      newLength,
      angle * (0.9 + freqValue * 0.2),
      depth,
      currentDepth + 1,
      colors,
      bass,
      mid,
      treble,
      sensitivity,
      swayAmount,
      frequencyData,
      leafIndexRef,
    );
    p.pop();

    // Occasional third branch at higher depths
    if (currentDepth > 2 && currentDepth < depth - 1 && mid > 0.4) {
      p.push();
      p.rotate(p.radians(sway * 0.5));
      p.line(0, 0, 0, -newLength * 0.7);
      p.translate(0, -newLength * 0.7);
      this.drawBranch(
        p,
        newLength * 0.7,
        angle,
        depth,
        currentDepth + 2,
        colors,
        bass,
        mid,
        treble,
        sensitivity,
        swayAmount,
        frequencyData,
        leafIndexRef,
      );
      p.pop();
    }
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
    this.config = { ...this.config, ...config } as FractalTreeConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      depth: {
        type: "number",
        label: "Branch Depth",
        default: 8,
        min: 4,
        max: 12,
        step: 1,
      },
      branchAngle: {
        type: "number",
        label: "Branch Angle",
        default: 25,
        min: 10,
        max: 45,
        step: 1,
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
          { value: "autumn", label: "Autumn" },
          { value: "sakura", label: "Sakura" },
          { value: "ice", label: "Ice" },
        ],
      },
      swayAmount: {
        type: "number",
        label: "Sway Amount",
        default: 0.5,
        min: 0,
        max: 1,
        step: 0.1,
      },
      growth: {
        type: "number",
        label: "Tree Size",
        default: 0.7,
        min: 0.3,
        max: 1.0,
        step: 0.1,
      },
    };
  }
}
