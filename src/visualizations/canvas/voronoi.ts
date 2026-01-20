import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

// Color schemes for voronoi cells
const COLOR_SCHEMES: Record<
  string,
  { cellColors: string[]; borderColor: string; glowColor: string }
> = {
  cyanMagenta: {
    cellColors: ["#00ffff", "#ff00ff", "#00ccff", "#ff00cc", "#00ffcc", "#cc00ff"],
    borderColor: "#ffffff",
    glowColor: "#00ffff",
  },
  darkTechno: {
    cellColors: ["#1a1a2e", "#4a00e0", "#8000ff", "#3d0066", "#2a0052", "#5c00a3"],
    borderColor: "#8000ff",
    glowColor: "#4a00e0",
  },
  neon: {
    cellColors: ["#39ff14", "#ff073a", "#ffff00", "#00ff80", "#ff00ff", "#00ffff"],
    borderColor: "#ffffff",
    glowColor: "#39ff14",
  },
  fire: {
    cellColors: ["#ff4500", "#ffd700", "#ff6600", "#ff0000", "#ff8c00", "#ffcc00"],
    borderColor: "#ffffff",
    glowColor: "#ff4500",
  },
  ice: {
    cellColors: ["#00bfff", "#e0ffff", "#87ceeb", "#b0e0e6", "#add8e6", "#87cefa"],
    borderColor: "#ffffff",
    glowColor: "#00bfff",
  },
  acid: {
    cellColors: ["#00ff00", "#ffff00", "#00ff41", "#80ff00", "#40ff00", "#ccff00"],
    borderColor: "#ffffff",
    glowColor: "#00ff00",
  },
  monochrome: {
    cellColors: ["#ffffff", "#cccccc", "#999999", "#666666", "#b3b3b3", "#e6e6e6"],
    borderColor: "#ffffff",
    glowColor: "#ffffff",
  },
  purpleHaze: {
    cellColors: ["#8b00ff", "#ff1493", "#9400d3", "#ba55d3", "#da70d6", "#ee82ee"],
    borderColor: "#ffffff",
    glowColor: "#8b00ff",
  },
  sunset: {
    cellColors: ["#ff6b6b", "#feca57", "#ff9f43", "#ff4757", "#ff6348", "#ffa502"],
    borderColor: "#ffffff",
    glowColor: "#ff6b6b",
  },
  ocean: {
    cellColors: ["#0077be", "#00d4aa", "#00b4d8", "#0096c7", "#48cae4", "#90e0ef"],
    borderColor: "#ffffff",
    glowColor: "#00b4d8",
  },
  toxic: {
    cellColors: ["#00ff41", "#0aff0a", "#39ff14", "#00c832", "#00e639", "#66ff66"],
    borderColor: "#00ff00",
    glowColor: "#39ff14",
  },
  bloodMoon: {
    cellColors: ["#8b0000", "#ff4500", "#dc143c", "#b22222", "#cd5c5c", "#ff6347"],
    borderColor: "#ff4500",
    glowColor: "#dc143c",
  },
  synthwave: {
    cellColors: ["#ff00ff", "#00ffff", "#ff00aa", "#00aaff", "#ff55ff", "#55ffff"],
    borderColor: "#ffffff",
    glowColor: "#ff00ff",
  },
  golden: {
    cellColors: ["#ffd700", "#ff8c00", "#ffb347", "#daa520", "#f4a460", "#ffc125"],
    borderColor: "#ffffff",
    glowColor: "#ffd700",
  },
};

interface SeedPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
  colorIndex: number;
}

interface VoronoiConfig extends VisualizationConfig {
  cellCount: number;
  borderGlow: boolean;
  speed: number;
}

export class VoronoiVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "voronoi",
    name: "Voronoi",
    author: "Vizec",
    description: "Voronoi diagram with animated seed points reacting to audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: VoronoiConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
    cellCount: 24,
    borderGlow: true,
    speed: 1.0,
  };
  private width = 0;
  private height = 0;
  private seeds: SeedPoint[] = [];
  private beatGlow = 0;
  private lastBass = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d");
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    this.initSeeds();
  }

  private initSeeds(): void {
    this.seeds = [];
    for (let i = 0; i < this.config.cellCount; i++) {
      this.seeds.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        colorIndex: i,
      });
    }
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass } = audioData;
    const { cellCount, borderGlow, speed, sensitivity, colorScheme } = this.config;
    const scheme = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.synthwave;

    // Detect beat for border glow
    if (bass > this.lastBass + 0.15 && bass > 0.5) {
      this.beatGlow = 1.0;
    }
    this.lastBass = bass;

    // Decay beat glow
    this.beatGlow *= 0.92;

    // Update seed positions - bass makes them move faster
    const speedMultiplier = speed * (1 + bass * sensitivity * 3);
    const dt = deltaTime * 0.001;

    for (const seed of this.seeds) {
      seed.x += seed.vx * speedMultiplier * dt * 60;
      seed.y += seed.vy * speedMultiplier * dt * 60;

      // Bounce off edges
      if (seed.x < 0 || seed.x > this.width) {
        seed.vx *= -1;
        seed.x = Math.max(0, Math.min(this.width, seed.x));
      }
      if (seed.y < 0 || seed.y > this.height) {
        seed.vy *= -1;
        seed.y = Math.max(0, Math.min(this.height, seed.y));
      }
    }

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.globalAlpha = 0.55;

    // Render voronoi using pixel-by-pixel nearest seed lookup
    // For performance, use larger pixel blocks
    const pixelSize = 8;
    const scaledW = Math.ceil(this.width / pixelSize);
    const scaledH = Math.ceil(this.height / pixelSize);

    // Calculate frequency bin for each cell
    const freqStep = Math.floor(frequencyData.length / cellCount);

    for (let sy = 0; sy < scaledH; sy++) {
      for (let sx = 0; sx < scaledW; sx++) {
        const px = sx * pixelSize + pixelSize / 2;
        const py = sy * pixelSize + pixelSize / 2;

        // Find nearest seed
        let nearestIndex = 0;
        let nearestDist = Infinity;
        let secondDist = Infinity;

        for (let i = 0; i < this.seeds.length; i++) {
          const seed = this.seeds[i];
          const dx = px - seed.x;
          const dy = py - seed.y;
          const dist = dx * dx + dy * dy;

          if (dist < nearestDist) {
            secondDist = nearestDist;
            nearestDist = dist;
            nearestIndex = i;
          } else if (dist < secondDist) {
            secondDist = dist;
          }
        }

        // Get color for this cell
        const colorIdx = nearestIndex % scheme.cellColors.length;
        const baseColor = this.hexToRgb(scheme.cellColors[colorIdx]);

        // Get frequency data for this cell - each cell maps to a freq bin
        const freqIdx = Math.min(nearestIndex * freqStep, frequencyData.length - 1);
        let freqValue = 0;
        for (let f = 0; f < freqStep && freqIdx + f < frequencyData.length; f++) {
          freqValue += frequencyData[freqIdx + f];
        }
        freqValue = (freqValue / freqStep / 255) * sensitivity;

        // Pulse cell brightness based on frequency
        const pulse = 0.5 + freqValue * 0.8;

        // Check if near cell border (edge detection)
        const edgeDist = Math.sqrt(secondDist) - Math.sqrt(nearestDist);
        const isNearBorder = edgeDist < pixelSize * 2;

        let r = baseColor.r * pulse;
        let g = baseColor.g * pulse;
        let b = baseColor.b * pulse;

        // Apply border glow on beats
        if (isNearBorder && borderGlow && this.beatGlow > 0.05) {
          const glowColor = this.hexToRgb(scheme.glowColor);
          const glowIntensity = this.beatGlow * (1 - edgeDist / (pixelSize * 2));
          r = r + glowColor.r * glowIntensity;
          g = g + glowColor.g * glowIntensity;
          b = b + glowColor.b * glowIntensity;
        }

        // Draw the cell pixel block
        this.ctx.fillStyle = `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
        this.ctx.fillRect(sx * pixelSize, sy * pixelSize, pixelSize, pixelSize);
      }
    }

    // Draw cell borders with glow effect
    if (borderGlow) {
      this.ctx.strokeStyle = scheme.borderColor;
      this.ctx.lineWidth = 1 + this.beatGlow * 3;

      if (this.beatGlow > 0.1) {
        this.ctx.shadowBlur = 15 * this.beatGlow;
        this.ctx.shadowColor = scheme.glowColor;
      }

      // Draw borders by finding edge pixels
      // For performance, just draw seed points with glow
      for (const seed of this.seeds) {
        this.ctx.beginPath();
        this.ctx.arc(seed.x, seed.y, 3 + this.beatGlow * 5, 0, Math.PI * 2);
        this.ctx.fillStyle = scheme.glowColor;
        this.ctx.fill();
      }

      this.ctx.shadowBlur = 0;
    }

    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    const oldWidth = this.width;
    const oldHeight = this.height;

    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Scale seed positions if resizing
    if (oldWidth > 0 && oldHeight > 0) {
      for (const seed of this.seeds) {
        seed.x = (seed.x / oldWidth) * width;
        seed.y = (seed.y / oldHeight) * height;
      }
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCellCount = this.config.cellCount;
    this.config = { ...this.config, ...config } as VoronoiConfig;

    // Reinitialize seeds if cell count changed
    if (this.config.cellCount !== oldCellCount && this.width > 0) {
      this.initSeeds();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.seeds = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      cellCount: {
        type: "number",
        label: "Cell Count",
        default: 24,
        min: 8,
        max: 64,
        step: 4,
      },
      speed: {
        type: "number",
        label: "Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      borderGlow: {
        type: "boolean",
        label: "Border Glow",
        default: true,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "synthwave",
        options: [
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "darkTechno", label: "Dark Techno" },
          { value: "neon", label: "Neon" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
          { value: "acid", label: "Acid" },
          { value: "monochrome", label: "Monochrome" },
          { value: "purpleHaze", label: "Purple Haze" },
          { value: "sunset", label: "Sunset" },
          { value: "ocean", label: "Ocean" },
          { value: "toxic", label: "Toxic" },
          { value: "bloodMoon", label: "Blood Moon" },
          { value: "synthwave", label: "Synthwave" },
          { value: "golden", label: "Golden" },
        ],
      },
    };
  }
}
