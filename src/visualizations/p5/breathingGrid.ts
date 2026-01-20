import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface BreathingGridConfig extends VisualizationConfig {
  gridSize: number;
  waveSpeed: number;
  dotSizeRange: number;
  colorScheme: string;
}

interface GridDot {
  baseX: number;
  baseY: number;
  currentX: number;
  currentY: number;
  baseSize: number;
  currentSize: number;
  phase: number;
  distance: number; // Distance from center for wave propagation
}

// Minimalist color palettes (single or dual color)
const MINIMALIST_PALETTES: Record<
  string,
  {
    primary: string;
    secondary: string;
  }
> = {
  mono: {
    primary: "#FFFFFF",
    secondary: "#FFFFFF",
  },
  cyan: {
    primary: "#00FFFF",
    secondary: "#00BFFF",
  },
  warm: {
    primary: "#FF6B6B",
    secondary: "#FFE66D",
  },
  cool: {
    primary: "#4ECDC4",
    secondary: "#44A08D",
  },
  lavender: {
    primary: "#9B59B6",
    secondary: "#8E44AD",
  },
};

export class BreathingGridVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "breathingGrid",
    name: "Breathing Grid",
    author: "Vizec",
    description: "Minimal dot grid that breathes and flows with music",
    renderer: "p5",
    transitionType: "zoom",
  };

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: BreathingGridConfig = {
    sensitivity: 1.0,
    gridSize: 15,
    waveSpeed: 1.0,
    dotSizeRange: 1.0,
    colorScheme: "mono",
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;

  private dots: GridDot[] = [];
  private centerX = 0;
  private centerY = 0;
  private time = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private waveOrigin = { x: 0, y: 0 };
  private waveTime = 0;

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
        this.centerX = this.width / 2;
        this.centerY = this.height / 2;
        this.initGrid();
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private initGrid(): void {
    this.dots = [];
    const { gridSize } = this.config;

    // Calculate spacing to fill the screen
    const maxDimension = Math.max(this.width, this.height);
    const spacing = maxDimension / (gridSize - 1);

    // Calculate grid bounds to center it
    const gridWidth = spacing * (gridSize - 1);
    const gridHeight = spacing * (gridSize - 1);
    const startX = (this.width - gridWidth) / 2;
    const startY = (this.height - gridHeight) / 2;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = startX + col * spacing;
        const y = startY + row * spacing;

        // Distance from center for wave propagation
        const dx = x - this.centerX;
        const dy = y - this.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        this.dots.push({
          baseX: x,
          baseY: y,
          currentX: x,
          currentY: y,
          baseSize: 4,
          currentSize: 4,
          phase: distance * 0.02, // Phase offset based on distance
          distance,
        });
      }
    }

    this.waveOrigin = { x: this.centerX, y: this.centerY };
  }

  private drawVisualization(p: p5): void {
    const { waveSpeed, dotSizeRange, sensitivity, colorScheme } = this.config;
    const palette = MINIMALIST_PALETTES[colorScheme] || MINIMALIST_PALETTES.mono;

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) return;

    const { bass, mid, treble, volume, frequencyData } = this.currentAudioData;
    const dt = 1 / 60;

    // Smooth audio values
    this.bassSmooth += (bass - this.bassSmooth) * 0.15;
    this.midSmooth += (mid - this.midSmooth) * 0.15;
    this.trebleSmooth += (treble - this.trebleSmooth) * 0.15;

    this.time += dt * waveSpeed;
    this.waveTime += dt * waveSpeed * (1 + this.bassSmooth * sensitivity);

    // Trigger new wave on strong bass
    if (this.bassSmooth > 0.7) {
      // Occasionally shift wave origin for variety
      if (Math.random() < 0.02) {
        this.waveOrigin = {
          x: this.centerX + (Math.random() - 0.5) * this.width * 0.3,
          y: this.centerY + (Math.random() - 0.5) * this.height * 0.3,
        };
      }
    }

    // Update and draw each dot
    for (const dot of this.dots) {
      this.updateDot(dot, p, palette, dotSizeRange, sensitivity);
    }

    // Draw subtle connecting lines between nearby dots on high volume
    if (volume * sensitivity > 0.5) {
      this.drawConnections(p, palette, sensitivity);
    }
  }

  private updateDot(
    dot: GridDot,
    p: p5,
    palette: { primary: string; secondary: string },
    dotSizeRange: number,
    sensitivity: number,
  ): void {
    // Calculate distance from wave origin
    const dx = dot.baseX - this.waveOrigin.x;
    const dy = dot.baseY - this.waveOrigin.y;
    const distFromOrigin = Math.sqrt(dx * dx + dy * dy);

    // Wave propagation
    const wavePhase = this.waveTime * 3 - distFromOrigin * 0.015;
    const wave = Math.sin(wavePhase) * 0.5 + 0.5;

    // Bass creates expansion/contraction from center
    const bassWave = Math.sin(this.time * 2 - dot.distance * 0.01) * this.bassSmooth * sensitivity;

    // Mid creates horizontal wave
    const midWave =
      Math.sin(this.time * 1.5 + dot.baseX * 0.02) * this.midSmooth * sensitivity * 0.5;

    // Treble adds shimmer
    const trebleShimmer =
      Math.sin(this.time * 8 + dot.phase * 10) * this.trebleSmooth * sensitivity * 0.3;

    // Calculate size
    const sizeMultiplier = 1 + (wave * 0.5 + bassWave * 0.3 + trebleShimmer * 0.2) * dotSizeRange;
    dot.currentSize = dot.baseSize * sizeMultiplier;

    // Calculate position offset (breathing movement)
    const breatheAmount = 3 * sensitivity;
    const angle = Math.atan2(dy, dx);
    const breatheOffset = wave * breatheAmount + bassWave * breatheAmount * 0.5;

    dot.currentX = dot.baseX + Math.cos(angle) * breatheOffset;
    dot.currentY = dot.baseY + Math.sin(angle) * breatheOffset + midWave * 5;

    // Calculate alpha based on wave position
    const alpha = 0.3 + wave * 0.25 + this.bassSmooth * sensitivity * 0.2 + trebleShimmer * 0.1;

    // Choose color based on position (subtle gradient)
    const colorBlend = (dot.baseX / this.width + dot.baseY / this.height) / 2;
    const primaryColor = p.color(palette.primary);
    const secondaryColor = p.color(palette.secondary);
    const dotColor = p.lerpColor(primaryColor, secondaryColor, colorBlend);
    dotColor.setAlpha(alpha * 255 * 0.55); // ~55% max alpha for covering elements

    // Draw dot
    p.noStroke();
    p.fill(dotColor);
    p.ellipse(dot.currentX, dot.currentY, dot.currentSize, dot.currentSize);

    // Subtle glow on bright dots
    if (alpha > 0.45) {
      const glowColor = p.color(palette.primary);
      glowColor.setAlpha((alpha - 0.3) * 255 * 0.2);
      p.fill(glowColor);
      p.ellipse(dot.currentX, dot.currentY, dot.currentSize * 2, dot.currentSize * 2);
    }
  }

  private drawConnections(
    p: p5,
    palette: { primary: string; secondary: string },
    sensitivity: number,
  ): void {
    const { gridSize } = this.config;
    const connectDistance = (Math.max(this.width, this.height) / gridSize) * 1.5;

    p.strokeWeight(0.5);

    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];

      // Only connect to next row and next column to avoid duplicates
      const col = i % gridSize;
      const row = Math.floor(i / gridSize);

      // Right neighbor
      if (col < gridSize - 1) {
        const rightNeighbor = this.dots[i + 1];
        const dist = Math.hypot(
          dot.currentX - rightNeighbor.currentX,
          dot.currentY - rightNeighbor.currentY,
        );
        const alpha = (1 - dist / connectDistance) * 0.15 * this.trebleSmooth * sensitivity;

        if (alpha > 0.02) {
          const lineColor = p.color(palette.secondary);
          lineColor.setAlpha(alpha * 255);
          p.stroke(lineColor);
          p.line(dot.currentX, dot.currentY, rightNeighbor.currentX, rightNeighbor.currentY);
        }
      }

      // Bottom neighbor
      if (row < gridSize - 1) {
        const bottomNeighbor = this.dots[i + gridSize];
        const dist = Math.hypot(
          dot.currentX - bottomNeighbor.currentX,
          dot.currentY - bottomNeighbor.currentY,
        );
        const alpha = (1 - dist / connectDistance) * 0.15 * this.trebleSmooth * sensitivity;

        if (alpha > 0.02) {
          const lineColor = p.color(palette.secondary);
          lineColor.setAlpha(alpha * 255);
          p.stroke(lineColor);
          p.line(dot.currentX, dot.currentY, bottomNeighbor.currentX, bottomNeighbor.currentY);
        }
      }
    }

    p.noStroke();
  }

  render(audioData: AudioData, _deltaTime: number): void {
    this.currentAudioData = audioData;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.centerX = width / 2;
    this.centerY = height / 2;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
    this.initGrid();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldGridSize = this.config.gridSize;
    this.config = { ...this.config, ...config } as BreathingGridConfig;

    if (this.config.gridSize !== oldGridSize && this.width > 0) {
      this.initGrid();
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.dots = [];
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
        label: "Color",
        default: "mono",
        options: [
          { label: "Monochrome", value: "mono" },
          { label: "Cyan", value: "cyan" },
          { label: "Warm", value: "warm" },
          { label: "Cool", value: "cool" },
          { label: "Lavender", value: "lavender" },
        ],
      },
      gridSize: {
        type: "number",
        label: "Grid Size",
        default: 15,
        min: 8,
        max: 25,
        step: 1,
      },
      waveSpeed: {
        type: "number",
        label: "Wave Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      dotSizeRange: {
        type: "number",
        label: "Size Variation",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
