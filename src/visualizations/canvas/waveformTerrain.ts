import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

// Color schemes
const COLOR_SCHEMES: Record<string, { start: string; end: string; glow: string }> = {
  cyanMagenta: { start: "#00ffff", end: "#ff00ff", glow: "#00ffff" },
  darkTechno: { start: "#1a1a2e", end: "#4a00e0", glow: "#8000ff" },
  neon: { start: "#39ff14", end: "#ff073a", glow: "#ffff00" },
  fire: { start: "#ff4500", end: "#ffd700", glow: "#ff6600" },
  ice: { start: "#00bfff", end: "#e0ffff", glow: "#87ceeb" },
  acid: { start: "#00ff00", end: "#ffff00", glow: "#00ff00" },
  monochrome: { start: "#ffffff", end: "#808080", glow: "#ffffff" },
  purpleHaze: { start: "#8b00ff", end: "#ff1493", glow: "#9400d3" },
  sunset: { start: "#ff6b6b", end: "#feca57", glow: "#ff9f43" },
  ocean: { start: "#0077be", end: "#00d4aa", glow: "#00b4d8" },
  toxic: { start: "#00ff41", end: "#0aff0a", glow: "#39ff14" },
  bloodMoon: { start: "#8b0000", end: "#ff4500", glow: "#dc143c" },
  synthwave: { start: "#ff00ff", end: "#00ffff", glow: "#ff00aa" },
  golden: { start: "#ffd700", end: "#ff8c00", glow: "#ffb347" },
};

interface WaveformTerrainConfig extends VisualizationConfig {
  speed: number;
  lineCount: number;
  perspectiveIntensity: number;
}

export class WaveformTerrainVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "waveformTerrain",
    name: "Waveform Terrain",
    author: "Vizec",
    description: "Scrolling pseudo-3D terrain where audio waveform shapes mountain ridges",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  readonly id = (this.constructor as any).meta.id;
  readonly name = (this.constructor as any).meta.name;
  readonly author = (this.constructor as any).meta.author;
  readonly description = (this.constructor as any).meta.description;
  readonly renderer = (this.constructor as any).meta.renderer;
  readonly transitionType = (this.constructor as any).meta.transitionType;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: WaveformTerrainConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    speed: 1.0,
    lineCount: 40,
    perspectiveIntensity: 0.8,
  };
  private width = 0;
  private height = 0;
  private terrainHistory: number[][] = [];
  private scrollOffset = 0;

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

    // Initial resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    // Initialize terrain history
    this.initializeTerrainHistory();
  }

  private initializeTerrainHistory(): void {
    const pointsPerLine = 128;
    this.terrainHistory = [];
    for (let i = 0; i < this.config.lineCount; i++) {
      this.terrainHistory.push(Array.from({ length: pointsPerLine }, () => 0));
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { timeDomainData, bass } = audioData;
    const { speed, lineCount, perspectiveIntensity, sensitivity, colorScheme } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update scroll offset
    this.scrollOffset += deltaTime * speed * 60;

    // Every frame, shift the terrain history and add new line from audio
    if (this.scrollOffset >= 1) {
      this.scrollOffset = 0;

      // Shift all lines back
      this.terrainHistory.pop();

      // Create new line from waveform data
      const newLine: number[] = [];
      const step = Math.floor(timeDomainData.length / 128);
      for (let i = 0; i < 128; i++) {
        const value = (timeDomainData[i * step] - 128) / 128;
        newLine.push(value * sensitivity);
      }
      this.terrainHistory.unshift(newLine);
    }

    // Calculate perspective parameters
    const horizonY = this.height * 0.35;
    const baseY = this.height * 0.95;
    const vanishX = this.width / 2;

    // Set transparency
    this.ctx.globalAlpha = 0.75;

    // Draw terrain lines from back to front
    for (let z = lineCount - 1; z >= 0; z--) {
      const line = this.terrainHistory[z];
      if (!line) continue;

      // Calculate perspective scale for this depth
      const depthRatio = z / lineCount;
      const perspective = 1 - depthRatio * perspectiveIntensity;
      const y = horizonY + (baseY - horizonY) * (1 - depthRatio);
      const lineWidth = this.width * perspective;
      const startX = vanishX - lineWidth / 2;

      // Calculate color fade with depth
      const alpha = 0.3 + (1 - depthRatio) * 0.7;

      // Create gradient for this line
      const gradient = this.ctx.createLinearGradient(startX, y, startX + lineWidth, y);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(0.5, colors.end);
      gradient.addColorStop(1, colors.start);

      this.ctx.beginPath();
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 1 + (1 - depthRatio) * 2;
      this.ctx.globalAlpha = alpha * 0.75;

      // Draw the terrain line
      const pointCount = line.length;
      for (let i = 0; i < pointCount; i++) {
        const xRatio = i / (pointCount - 1);
        const x = startX + xRatio * lineWidth;

        // Height displacement based on audio
        const heightScale = this.height * 0.15 * (1 - depthRatio * 0.5);
        const displacement = line[i] * heightScale * (1 + bass * 0.5);
        const pointY = y - Math.abs(displacement);

        if (i === 0) {
          this.ctx.moveTo(x, pointY);
        } else {
          this.ctx.lineTo(x, pointY);
        }
      }

      this.ctx.stroke();

      // Add glow effect for front lines
      if (depthRatio < 0.3 && bass > 0.5) {
        this.ctx.shadowBlur = 10 * bass;
        this.ctx.shadowColor = colors.glow;
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
      }
    }

    // Reset alpha
    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldLineCount = this.config.lineCount;
    this.config = { ...this.config, ...config } as WaveformTerrainConfig;

    // Reinitialize terrain if line count changed
    if (this.config.lineCount !== oldLineCount) {
      this.initializeTerrainHistory();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.terrainHistory = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      speed: {
        type: "number",
        label: "Scroll Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      lineCount: {
        type: "number",
        label: "Line Count",
        default: 40,
        min: 20,
        max: 80,
        step: 5,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
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
      perspectiveIntensity: {
        type: "number",
        label: "Perspective Intensity",
        default: 0.8,
        min: 0.3,
        max: 1.0,
        step: 0.1,
      },
    };
  }
}
