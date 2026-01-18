import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface ConcentricRipplesConfig extends VisualizationConfig {
  maxRipples: number;
  expansionSpeed: number;
  lineWidth: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  color: string;
  lineWidth: number;
}

export class ConcentricRipplesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "concentricRipples",
    name: "Concentric Ripples",
    author: "Vizec",
    description: "Minimal expanding ripple circles triggered by beats",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: ConcentricRipplesConfig = {
    sensitivity: 1.0,
    colorScheme: "ice",
    maxRipples: 15,
    expansionSpeed: 1.0,
    lineWidth: 2,
  };
  private width = 0;
  private height = 0;
  private ripples: Ripple[] = [];
  private smoothedBass = 0;
  private smoothedVolume = 0;
  private lastBassHit = 0;
  private bassThreshold = 0.3;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement("canvas");
    this.canvas.style.position = "absolute";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext("2d", { alpha: true });
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, volume } = audioData;
    const { sensitivity, colorScheme, maxRipples, expansionSpeed, lineWidth } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values - faster response
    const smoothing = 0.3;
    this.smoothedBass = this.smoothedBass * (1 - smoothing) + bass * sensitivity * 2 * smoothing;
    this.smoothedVolume = this.smoothedVolume * (1 - smoothing) + volume * sensitivity * 2 * smoothing;

    this.time += deltaTime * 0.001;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Detect bass hit and create new ripple
    const cooldownPassed = this.time - this.lastBassHit > 0.08;
    
    if (cooldownPassed && this.ripples.length < maxRipples) {
      // Spawn on bass hits OR periodically for ambient ripples
      const bassHit = bass * sensitivity > 0.15;
      const ambientSpawn = this.time - this.lastBassHit > 0.5;
      
      if (bassHit || ambientSpawn) {
        this.createRipple(colors, lineWidth);
        this.lastBassHit = this.time;
      }
    }

    // Update and draw ripples
    this.updateRipples(deltaTime, expansionSpeed);
    this.drawRipples();

    // Reset context
    this.ctx.globalAlpha = 1.0;
  }

  private createRipple(colors: { start: string; end: string; glow: string }, lineWidth: number): void {
    // Alternate between center and random positions
    const useCenter = this.ripples.length % 3 === 0;
    const x = useCenter ? this.width / 2 : Math.random() * this.width;
    const y = useCenter ? this.height / 2 : Math.random() * this.height;

    // Choose color based on ripple count
    const colorOptions = [colors.start, colors.end, colors.glow];
    const color = colorOptions[this.ripples.length % colorOptions.length];

    const maxRadius = Math.max(this.width, this.height) * (0.4 + Math.random() * 0.3);

    this.ripples.push({
      x,
      y,
      radius: 0,
      maxRadius,
      life: 1.0,
      color,
      lineWidth: lineWidth + Math.random() * 2,
    });
  }

  private updateRipples(deltaTime: number, expansionSpeed: number): void {
    const dt = deltaTime * 0.001;
    const volumeBoost = 0.5 + this.smoothedVolume;

    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const ripple = this.ripples[i];

      // Expand radius
      ripple.radius += expansionSpeed * 150 * dt * volumeBoost;

      // Calculate life based on radius
      ripple.life = 1 - ripple.radius / ripple.maxRadius;

      if (ripple.life <= 0) {
        this.ripples.splice(i, 1);
      }
    }
  }

  private drawRipples(): void {
    if (!this.ctx) return;

    for (const ripple of this.ripples) {
      // Alpha fades as ripple expands
      const alpha = ripple.life * 0.6;
      if (alpha <= 0) continue;

      this.ctx.globalAlpha = alpha;
      this.ctx.strokeStyle = ripple.color;
      this.ctx.lineWidth = ripple.lineWidth * ripple.life;

      // Draw main circle
      this.ctx.beginPath();
      this.ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
      this.ctx.stroke();

      // Draw inner echo circle (thinner, smaller)
      if (ripple.radius > 50) {
        this.ctx.globalAlpha = alpha * 0.5;
        this.ctx.lineWidth = ripple.lineWidth * ripple.life * 0.5;
        this.ctx.beginPath();
        this.ctx.arc(ripple.x, ripple.y, ripple.radius * 0.6, 0, Math.PI * 2);
        this.ctx.stroke();
      }
    }
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
    this.config = { ...this.config, ...config } as ConcentricRipplesConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.ripples = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      maxRipples: {
        type: "number",
        label: "Max Ripples",
        default: 15,
        min: 5,
        max: 30,
        step: 1,
      },
      expansionSpeed: {
        type: "number",
        label: "Expansion Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      lineWidth: {
        type: "number",
        label: "Line Width",
        default: 2,
        min: 1,
        max: 5,
        step: 0.5,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "ice",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
