import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface AudioVinesConfig extends VisualizationConfig {
  vineCount: number;
  growthSpeed: number;
  curliness: number;
  colorScheme: string;
}

interface VineNode {
  x: number;
  y: number;
  angle: number;
  width: number;
}

interface Vine {
  nodes: VineNode[];
  x: number;
  targetHeight: number;
  growth: number; // 0 to 1
  phase: number;
  speed: number;
  colorOffset: number;
}

export class AudioVinesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "audioVines",
    name: "Audio Vines",
    author: "Vizec",
    description: "Organic vines that pulse and grow with the music",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: AudioVinesConfig = {
    sensitivity: 1.0,
    vineCount: 15,
    growthSpeed: 0.5,
    curliness: 1.5,
    colorScheme: "nature",
  };
  private width = 0;
  private height = 0;
  private vines: Vine[] = [];
  private time = 0;

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

  private initVines(): void {
    this.vines = [];
    const { vineCount } = this.config;

    // Create vines spaced out at the bottom
    for (let i = 0; i < vineCount; i++) {
      this.vines.push({
        nodes: [],
        x: (this.width / (vineCount + 1)) * (i + 1),
        targetHeight: this.height * (0.6 + Math.random() * 0.4),
        growth: 0,
        phase: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.03,
        colorOffset: Math.random(),
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, curliness } = this.config;
    const { volume, bass, mid } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    const swayAmount = 0.5 + mid * sensitivity * 2.0;
    const pulseSize = 1.0 + bass * sensitivity * 0.5;

    this.vines.forEach((vine, index) => {
      if (vine.growth < 1.0) {
        vine.growth += vine.speed * (0.5 + volume) * deltaTime;
        if (vine.growth > 1.0) vine.growth = 1.0;
      }

      const currentHeight = vine.targetHeight * vine.growth;
      const segmentCount = 40;
      const segmentLen = currentHeight / segmentCount;

      this.ctx!.beginPath();
      this.ctx!.moveTo(vine.x, this.height);

      for (let i = 0; i < segmentCount; i++) {
        const sway = Math.sin(this.time * 2 + vine.phase + i * 0.1) * (i * curliness * swayAmount);
        const kick = Math.sin(this.time * 10) * bass * sensitivity * (i * 2);
        const nextX = vine.x + sway + kick;
        const nextY = this.height - i * segmentLen;
        this.ctx!.lineTo(nextX, nextY);
      }

      this.ctx!.strokeStyle = index % 2 === 0 ? colors.start : colors.end;
      this.ctx!.lineWidth = Math.max(1, 8 * pulseSize * 0.5);
      this.ctx!.lineCap = "round";
      this.ctx!.stroke();

      const leafSpacing = 5;
      for (let i = 5; i < segmentCount; i += leafSpacing) {
        if (i / segmentCount > vine.growth) break;

        const progress = i / segmentCount;
        const sway = Math.sin(this.time * 2 + vine.phase + i * 0.1) * (i * curliness * swayAmount);
        const kick = Math.sin(this.time * 10) * bass * sensitivity * (i * 2);

        const leafX = vine.x + sway + kick;
        const leafY = this.height - i * segmentLen;
        const leafSize = 6 * pulseSize * (1 - progress * 0.5);

        this.ctx!.fillStyle = colors.glow || colors.end;
        this.ctx!.beginPath();
        this.ctx!.arc(leafX, leafY, leafSize, 0, Math.PI * 2);
        this.ctx!.fill();
      }
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initVines();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCounts = this.config.vineCount;
    this.config = { ...this.config, ...config } as AudioVinesConfig;

    if (this.config.vineCount !== oldCounts) {
      this.initVines();
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
        default: "nature",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      vineCount: {
        type: "number",
        label: "Vine Count",
        default: 15,
        min: 5,
        max: 50,
        step: 1,
      },
      growthSpeed: {
        type: "number",
        label: "Growth Speed",
        default: 0.5,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      curliness: {
        type: "number",
        label: "Wind/Curl",
        default: 1.5,
        min: 0.0,
        max: 5.0,
        step: 0.5,
      },
    };
  }
}
