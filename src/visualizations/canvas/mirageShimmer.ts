import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";

interface MirageShimmerConfig extends VisualizationConfig {
  shimmerIntensity: number;
  silhouetteCount: number;
  heatWaveSpeed: number;
  sunIntensity: number;
  colorScheme: string;
}

interface Silhouette {
  x: number;
  baseY: number;
  width: number;
  height: number;
  type: "pyramid" | "cactus" | "rock" | "dune";
  swayPhase: number;
  swayAmount: number;
}

interface HeatWave {
  y: number;
  amplitude: number;
  frequency: number;
  speed: number;
  phase: number;
}

interface Sparkle {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
}

// Desert color palettes
const DESERT_PALETTES: Record<string, {
  sky: string[];
  sun: string;
  sand: string[];
  silhouette: string;
  heat: string;
}> = {
  sunset: {
    sky: ["#FF6B35", "#FF8C42", "#FFD166", "#F8E16C"],
    sun: "#FFE66D",
    sand: ["#E6B800", "#D4A574", "#C19A6B"],
    silhouette: "#2D1B0E",
    heat: "#FF9500",
  },
  noon: {
    sky: ["#87CEEB", "#B0E0E6", "#F5F5DC"],
    sun: "#FFFACD",
    sand: ["#F4A460", "#DEB887", "#D2B48C"],
    silhouette: "#4A3728",
    heat: "#FFE4B5",
  },
  dawn: {
    sky: ["#E8B4B8", "#F5D6C6", "#FFF0DB"],
    sun: "#FFEFD5",
    sand: ["#D2691E", "#CD853F", "#DEB887"],
    silhouette: "#3D2914",
    heat: "#FFB6C1",
  },
};

export class MirageShimmerVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "mirageShimmer",
    name: "Mirage Shimmer",
    author: "Vizec",
    description: "Heat distortion mirage effect with desert horizon and silhouettes",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: MirageShimmerConfig = {
    sensitivity: 1.0,
    shimmerIntensity: 1.0,
    silhouetteCount: 5,
    heatWaveSpeed: 1.0,
    sunIntensity: 1.0,
    colorScheme: "sunset",
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private silhouettes: Silhouette[] = [];
  private heatWaves: HeatWave[] = [];
  private sparkles: Sparkle[] = [];
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private horizonY = 0;

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

  private initScene(): void {
    this.horizonY = this.height * 0.65;
    this.initSilhouettes();
    this.initHeatWaves();
    this.sparkles = [];
  }

  private initSilhouettes(): void {
    this.silhouettes = [];
    const { silhouetteCount } = this.config;

    const types: ("pyramid" | "cactus" | "rock" | "dune")[] = ["pyramid", "cactus", "rock", "dune"];

    for (let i = 0; i < silhouetteCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      let width = 0, height = 0;

      switch (type) {
        case "pyramid":
          width = 80 + Math.random() * 120;
          height = 60 + Math.random() * 100;
          break;
        case "cactus":
          width = 20 + Math.random() * 30;
          height = 50 + Math.random() * 80;
          break;
        case "rock":
          width = 40 + Math.random() * 60;
          height = 30 + Math.random() * 50;
          break;
        case "dune":
          width = 150 + Math.random() * 200;
          height = 40 + Math.random() * 60;
          break;
      }

      this.silhouettes.push({
        x: Math.random() * this.width,
        baseY: this.horizonY,
        width,
        height,
        type,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmount: 2 + Math.random() * 4,
      });
    }

    // Sort by size (larger in back)
    this.silhouettes.sort((a, b) => b.height - a.height);
  }

  private initHeatWaves(): void {
    this.heatWaves = [];
    const waveCount = 8;

    for (let i = 0; i < waveCount; i++) {
      const y = this.horizonY + (i / waveCount) * (this.height - this.horizonY);
      this.heatWaves.push({
        y,
        amplitude: 3 + Math.random() * 8,
        frequency: 0.01 + Math.random() * 0.02,
        speed: 0.5 + Math.random() * 1,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, shimmerIntensity, heatWaveSpeed, sunIntensity, colorScheme } = this.config;
    const { bass, mid, treble, volume } = audioData;
    const palette = DESERT_PALETTES[colorScheme] || DESERT_PALETTES.sunset;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Render sun glow
    this.renderSun(palette, sunIntensity, sensitivity);

    // Render distant silhouettes with mirage distortion
    this.renderSilhouettes(palette, sensitivity);

    // Render heat waves rising from ground
    this.renderHeatWaves(palette, shimmerIntensity, heatWaveSpeed, sensitivity);

    // Render sparkles/glitter
    this.updateSparkles(deltaTime, palette, sensitivity);

    // Add new sparkles on treble
    if (this.trebleSmooth > 0.4 && Math.random() < 0.3 * this.trebleSmooth) {
      this.addSparkle();
    }
  }

  private renderSun(
    palette: typeof DESERT_PALETTES.sunset,
    sunIntensity: number,
    sensitivity: number
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const sunX = this.width * 0.7;
    const sunY = this.horizonY * 0.4;
    const sunRadius = 40 + this.bassSmooth * 20 * sensitivity;

    // Outer glow
    const glowRadius = sunRadius * 3 * sunIntensity;
    const gradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowRadius);
    gradient.addColorStop(0, this.hexToRgba(palette.sun, 0.4));
    gradient.addColorStop(0.3, this.hexToRgba(palette.sun, 0.2));
    gradient.addColorStop(0.7, this.hexToRgba(palette.sky[0], 0.1));
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Sun core with pulse
    const coreGradient = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
    coreGradient.addColorStop(0, this.hexToRgba(palette.sun, 0.6));
    coreGradient.addColorStop(0.7, this.hexToRgba(palette.sun, 0.3));
    coreGradient.addColorStop(1, this.hexToRgba(palette.sun, 0.1));

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderSilhouettes(
    palette: typeof DESERT_PALETTES.sunset,
    sensitivity: number
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    for (const sil of this.silhouettes) {
      // Update sway based on mid
      sil.swayPhase += 0.02 * (1 + this.midSmooth * sensitivity);
      const swayX = Math.sin(sil.swayPhase) * sil.swayAmount * this.midSmooth * sensitivity;

      // Mirage distortion - objects appear to float/shimmer
      const mirageOffset = Math.sin(this.time * 2 + sil.x * 0.01) * 3 * this.bassSmooth;
      const drawY = sil.baseY + mirageOffset;

      ctx.save();
      ctx.translate(sil.x + swayX, drawY);

      // Draw with slight transparency for depth
      ctx.fillStyle = this.hexToRgba(palette.silhouette, 0.55);

      switch (sil.type) {
        case "pyramid":
          this.drawPyramid(sil.width, sil.height);
          break;
        case "cactus":
          this.drawCactus(sil.width, sil.height);
          break;
        case "rock":
          this.drawRock(sil.width, sil.height);
          break;
        case "dune":
          this.drawDune(sil.width, sil.height);
          break;
      }

      ctx.restore();

      // Draw reflection/mirage beneath
      ctx.save();
      ctx.translate(sil.x + swayX, drawY);
      ctx.scale(1, -0.3);

      const reflectionAlpha = 0.15 + this.bassSmooth * 0.1;
      ctx.fillStyle = this.hexToRgba(palette.silhouette, reflectionAlpha);

      switch (sil.type) {
        case "pyramid":
          this.drawPyramid(sil.width, sil.height);
          break;
        case "cactus":
          this.drawCactus(sil.width, sil.height);
          break;
        case "rock":
          this.drawRock(sil.width, sil.height);
          break;
        case "dune":
          this.drawDune(sil.width, sil.height);
          break;
      }

      ctx.restore();
    }
  }

  private drawPyramid(width: number, height: number): void {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(-width / 2, 0);
    this.ctx.lineTo(0, -height);
    this.ctx.lineTo(width / 2, 0);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawCactus(width: number, height: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Main trunk
    ctx.fillRect(-width / 4, -height, width / 2, height);

    // Left arm
    ctx.fillRect(-width / 2 - width / 4, -height * 0.6, width / 3, height * 0.3);
    ctx.fillRect(-width / 2 - width / 4, -height * 0.6, width / 4, -height * 0.2);

    // Right arm
    ctx.fillRect(width / 4, -height * 0.4, width / 3, height * 0.25);
    ctx.fillRect(width / 4 + width / 4, -height * 0.4, width / 4, -height * 0.15);
  }

  private drawRock(width: number, height: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.quadraticCurveTo(-width / 3, -height * 0.8, -width / 6, -height);
    ctx.quadraticCurveTo(width / 6, -height * 0.9, width / 3, -height * 0.6);
    ctx.quadraticCurveTo(width / 2, -height * 0.3, width / 2, 0);
    ctx.closePath();
    ctx.fill();
  }

  private drawDune(width: number, height: number): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.quadraticCurveTo(-width / 4, -height, 0, -height * 0.8);
    ctx.quadraticCurveTo(width / 3, -height * 0.6, width / 2, 0);
    ctx.closePath();
    ctx.fill();
  }

  private renderHeatWaves(
    palette: typeof DESERT_PALETTES.sunset,
    shimmerIntensity: number,
    heatWaveSpeed: number,
    sensitivity: number
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    for (const wave of this.heatWaves) {
      wave.phase += 0.05 * heatWaveSpeed * (1 + this.bassSmooth * sensitivity);

      const amplitude = wave.amplitude * shimmerIntensity * (0.5 + this.bassSmooth * sensitivity);

      ctx.beginPath();
      ctx.moveTo(0, wave.y);

      for (let x = 0; x <= this.width; x += 5) {
        const y = wave.y + Math.sin(x * wave.frequency + wave.phase) * amplitude;
        ctx.lineTo(x, y);
      }

      // Create gradient for heat wave
      const gradient = ctx.createLinearGradient(0, wave.y - amplitude, 0, wave.y + amplitude * 2);
      const distFromHorizon = (wave.y - this.horizonY) / (this.height - this.horizonY);
      const alpha = 0.2 * (1 - distFromHorizon) * shimmerIntensity;

      gradient.addColorStop(0, this.hexToRgba(palette.heat, 0));
      gradient.addColorStop(0.5, this.hexToRgba(palette.heat, alpha));
      gradient.addColorStop(1, this.hexToRgba(palette.heat, 0));

      ctx.lineTo(this.width, this.height);
      ctx.lineTo(0, this.height);
      ctx.closePath();

      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  private updateSparkles(
    deltaTime: number,
    palette: typeof DESERT_PALETTES.sunset,
    sensitivity: number
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dt = deltaTime * 0.001;

    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const sparkle = this.sparkles[i];
      sparkle.life -= dt;
      sparkle.y -= dt * 20; // Rise upward

      if (sparkle.life <= 0) {
        this.sparkles.splice(i, 1);
        continue;
      }

      const progress = sparkle.life / sparkle.maxLife;
      const alpha = progress * 0.6 * (0.5 + this.trebleSmooth * sensitivity);
      const size = sparkle.size * (0.5 + progress * 0.5);

      // Draw sparkle with glow
      const glowGradient = ctx.createRadialGradient(
        sparkle.x, sparkle.y, 0,
        sparkle.x, sparkle.y, size * 2
      );
      glowGradient.addColorStop(0, this.hexToRgba(palette.sun, alpha));
      glowGradient.addColorStop(0.5, this.hexToRgba(palette.heat, alpha * 0.5));
      glowGradient.addColorStop(1, "rgba(0,0,0,0)");

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(sparkle.x, sparkle.y, size * 2, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = this.hexToRgba("#FFFFFF", alpha);
      ctx.beginPath();
      ctx.arc(sparkle.x, sparkle.y, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private addSparkle(): void {
    if (this.sparkles.length > 50) return;

    this.sparkles.push({
      x: Math.random() * this.width,
      y: this.horizonY + Math.random() * (this.height - this.horizonY) * 0.5,
      life: 0.5 + Math.random() * 1,
      maxLife: 0.5 + Math.random() * 1,
      size: 3 + Math.random() * 5,
    });
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initScene();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldSilhouetteCount = this.config.silhouetteCount;
    this.config = { ...this.config, ...config } as MirageShimmerConfig;

    if (this.config.silhouetteCount !== oldSilhouetteCount && this.width > 0) {
      this.initSilhouettes();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.silhouettes = [];
    this.heatWaves = [];
    this.sparkles = [];
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
        label: "Time of Day",
        default: "sunset",
        options: [
          { label: "Sunset", value: "sunset" },
          { label: "Noon", value: "noon" },
          { label: "Dawn", value: "dawn" },
        ],
      },
      shimmerIntensity: {
        type: "number",
        label: "Shimmer Intensity",
        default: 1.0,
        min: 0.2,
        max: 2.0,
        step: 0.1,
      },
      silhouetteCount: {
        type: "number",
        label: "Silhouettes",
        default: 5,
        min: 2,
        max: 10,
        step: 1,
      },
      heatWaveSpeed: {
        type: "number",
        label: "Heat Wave Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      sunIntensity: {
        type: "number",
        label: "Sun Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
