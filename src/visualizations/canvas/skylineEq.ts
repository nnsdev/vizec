import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface SkylineEqConfig extends VisualizationConfig {
  buildingCount: number;
  windowSize: number;
  windowGap: number;
  colorScheme: string;
  glow: boolean;
  cityDepth: number; // How many layers of buildings
}

interface Building {
  x: number;
  width: number;
  height: number;
  floors: number;
  windowsPerFloor: number;
  layer: number; // 0 = front, 1 = back
  freqIndex: number; // Which frequency bin controls this building
}

export class SkylineEqVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "skylineEq",
    name: "Skyline EQ",
    author: "Vizec",
    description: "City skyline where windows light up as a spectrum analyzer",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: SkylineEqConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    buildingCount: 20,
    windowSize: 4,
    windowGap: 2,
    glow: true,
    cityDepth: 2,
  };
  private width = 0;
  private height = 0;
  private buildings: Building[] = [];

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
  }

  private generateBuildings(): void {
    if (!this.width || !this.height) return;

    this.buildings = [];
    const { buildingCount, cityDepth, windowSize, windowGap } = this.config;

    // We want buildings to cover the width.
    // Front layer covers full width. Back layers might be offset or parallaxed in a real game,
    // but here we just want density.

    for (let layer = 0; layer < cityDepth; layer++) {
      let currentX = 0;
      // Depending on layer, we might want more or fewer buildings?
      // Let's just try to fill the width roughly.

      const layerBuildingCount = Math.floor(buildingCount * (layer === 0 ? 1 : 1.5));
      const avgWidth = this.width / layerBuildingCount;

      for (let i = 0; i < layerBuildingCount; i++) {
        // Randomize dimensions
        const buildingWidth = avgWidth * (0.8 + Math.random() * 0.4);

        // Height: Back layers are taller/higher (simulate distance or density)
        // OR front layers are shorter?
        // Let's make varied heights.
        // Layer 0 (front): shorter to medium
        // Layer 1 (back): medium to tall
        const heightScale = layer === 0 ? 0.3 + Math.random() * 0.3 : 0.4 + Math.random() * 0.4;
        const buildingHeight = this.height * heightScale;

        // Calculate windows
        const totalWindowWidth = windowSize + windowGap;
        const windowsPerFloor = Math.max(
          1,
          Math.floor((buildingWidth - windowGap) / totalWindowWidth),
        );

        const totalWindowHeight = windowSize + windowGap;
        const floors = Math.max(1, Math.floor((buildingHeight - windowGap) / totalWindowHeight));

        // Assign frequency index.
        // Map left-to-right to low-to-high frequencies? Or random?
        // Left-to-right looks like a standard EQ.
        // We use 60-70% of the spectrum (low-mids) mostly for buildings.
        const freqIndex = Math.floor((i / layerBuildingCount) * 100);

        this.buildings.push({
          x: currentX,
          width: buildingWidth,
          height: buildingHeight,
          floors,
          windowsPerFloor,
          layer,
          freqIndex,
        });

        currentX += buildingWidth;

        // If we exceeded width significantly, stop (for this layer)
        if (currentX > this.width + 50) break;
      }
    }

    // Sort by layer (back first, then front) so we draw back-to-front
    this.buildings.sort((a, b) => b.layer - a.layer);
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData } = audioData;
    const { sensitivity, colorScheme, glow, windowSize, windowGap } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    const windowBlockH = windowSize + windowGap;
    const windowBlockW = windowSize + windowGap;

    this.buildings.forEach((b) => {
      // Layer styling
      const layerAlpha = b.layer === 0 ? 0.9 : 0.5;
      const buildingBaseAlpha = b.layer === 0 ? 0.3 : 0.15;

      // Draw Building Body (Background)
      this.ctx!.fillStyle = `rgba(10, 10, 15, ${buildingBaseAlpha})`;
      const yPos = this.height - b.height;
      this.ctx!.fillRect(b.x, yPos, b.width, b.height);

      // Calculate Lit Floors
      const val = frequencyData[b.freqIndex] || 0;
      const normalized = (val / 255) * sensitivity;
      const litFloors = Math.floor(Math.pow(normalized, 1.2) * b.floors);

      if (litFloors <= 0) return;

      // OPTIMIZATION 1: Batch Glow Effect
      // Instead of applying shadowBlur to every single window (thousands of calls),
      // we draw a SINGLE glowing rectangle behind the lit area of the building.
      if (glow) {
        const litHeight = litFloors * windowBlockH;
        const glowY = this.height - windowGap - litHeight + windowGap; // approx top of lit area

        this.ctx!.save();
        this.ctx!.shadowBlur = 20;
        this.ctx!.shadowColor = colors.glow;
        this.ctx!.globalAlpha = 0.3 * layerAlpha;
        this.ctx!.fillStyle = colors.end; // Use the "hot" color for glow
        this.ctx!.fillRect(b.x, glowY, b.width, litHeight);
        this.ctx!.restore();
      }

      // OPTIMIZATION 2: Batch Window Drawing
      // We group windows by floor (color) to reduce context state changes and fill calls.

      for (let f = 0; f < litFloors; f++) {
        // Gradient mapping
        const ratio = f / b.floors;
        this.ctx!.fillStyle = ratio > 0.5 ? colors.end : colors.start;
        this.ctx!.globalAlpha = layerAlpha;

        // Begin a path for ALL windows on this floor
        this.ctx!.beginPath();

        const floorY = this.height - windowGap - f * windowBlockH - windowSize;

        for (let w = 0; w < b.windowsPerFloor; w++) {
          const winX = b.x + windowGap + w * windowBlockW;
          this.ctx!.rect(winX, floorY, windowSize, windowSize);
        }

        // Single fill for the whole row
        this.ctx!.fill();
      }
    });

    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Regenerate buildings on resize to fit new dimensions
    this.generateBuildings();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCounts = this.config.buildingCount;
    this.config = { ...this.config, ...config } as SkylineEqConfig;

    if (this.config.buildingCount !== oldCounts) {
      this.generateBuildings();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
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
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
      buildingCount: {
        type: "number",
        label: "Building Density",
        default: 20,
        min: 5,
        max: 50,
        step: 1,
      },
      windowSize: {
        type: "number",
        label: "Window Size",
        default: 4,
        min: 2,
        max: 10,
        step: 1,
      },
      windowGap: {
        type: "number",
        label: "Window Gap",
        default: 2,
        min: 1,
        max: 5,
        step: 1,
      },
      cityDepth: {
        type: "number",
        label: "City Layers",
        default: 2,
        min: 1,
        max: 3,
        step: 1,
      },
      glow: {
        type: "boolean",
        label: "Glow Effect",
        default: true,
      },
    };
  }
}
