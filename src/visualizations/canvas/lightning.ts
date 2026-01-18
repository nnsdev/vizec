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

interface LightningBolt {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  life: number;
  maxLife: number;
  segments: { x: number; y: number }[];
  branches: { x: number; y: number }[][];
  intensity: number;
}

interface LightningConfig extends VisualizationConfig {
  boltCount: number;
  branchChance: number;
  fadeSpeed: number;
}

export class LightningVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "lightning",
    name: "Lightning",
    author: "Vizec",
    description: "Dynamic lightning bolts that animate across the screen",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: LightningConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    boltCount: 3,
    branchChance: 0.3,
    fadeSpeed: 0.05,
  };
  private width = 0;
  private height = 0;
  private bolts: LightningBolt[] = [];
  private time = 0;
  private lastBass = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;
  private smoothedTreble = 0;

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

  private createBolt(intensity: number): LightningBolt {
    // Random start point (edges or top)
    const edge = Math.floor(Math.random() * 4);
    let startX: number, startY: number, endX: number, endY: number;

    if (edge === 0) {
      // Top
      startX = Math.random() * this.width;
      startY = 0;
      endX = startX + (Math.random() - 0.5) * this.width * 0.5;
      endY = this.height * (0.5 + Math.random() * 0.5);
    } else if (edge === 1) {
      // Left
      startX = 0;
      startY = Math.random() * this.height * 0.5;
      endX = this.width * (0.3 + Math.random() * 0.4);
      endY = startY + Math.random() * this.height * 0.5;
    } else if (edge === 2) {
      // Right
      startX = this.width;
      startY = Math.random() * this.height * 0.5;
      endX = this.width * (0.3 + Math.random() * 0.4);
      endY = startY + Math.random() * this.height * 0.5;
    } else {
      // Diagonal from corner
      startX = Math.random() < 0.5 ? 0 : this.width;
      startY = 0;
      endX = this.width / 2 + (Math.random() - 0.5) * this.width * 0.3;
      endY = this.height * (0.4 + Math.random() * 0.4);
    }

    const bolt: LightningBolt = {
      startX,
      startY,
      endX,
      endY,
      life: 1,
      maxLife: 0.3 + Math.random() * 0.4 + intensity * 0.3,
      segments: [],
      branches: [],
      intensity,
    };

    this.generateBoltPath(bolt);
    return bolt;
  }

  private generateBoltPath(bolt: LightningBolt): void {
    bolt.segments = [];
    bolt.branches = [];

    const dx = bolt.endX - bolt.startX;
    const dy = bolt.endY - bolt.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const segmentCount = Math.max(8, Math.floor(distance / 30));

    let x = bolt.startX;
    let y = bolt.startY;
    bolt.segments.push({ x, y });

    const perpX = -dy / distance;
    const perpY = dx / distance;

    for (let i = 1; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const baseX = bolt.startX + dx * t;
      const baseY = bolt.startY + dy * t;

      // Add jagged displacement, more in middle, less at ends
      const midFactor = Math.sin(t * Math.PI);
      const displacement = (Math.random() - 0.5) * 80 * midFactor * bolt.intensity;

      x = baseX + perpX * displacement;
      y = baseY + perpY * displacement;

      bolt.segments.push({ x, y });

      // Create branches
      if (Math.random() < this.config.branchChance && i < segmentCount - 1) {
        const branch = this.createBranch(x, y, bolt.intensity * 0.6);
        bolt.branches.push(branch);
      }
    }
  }

  private createBranch(startX: number, startY: number, intensity: number): { x: number; y: number }[] {
    const branch: { x: number; y: number }[] = [];
    const length = 50 + Math.random() * 100 * intensity;
    const angle = Math.random() * Math.PI * 2;
    const segments = 4 + Math.floor(Math.random() * 4);

    let x = startX;
    let y = startY;
    branch.push({ x, y });

    for (let i = 1; i <= segments; i++) {
      x += Math.cos(angle + (Math.random() - 0.5) * 0.8) * (length / segments);
      y += Math.sin(angle + (Math.random() - 0.5) * 0.8) * (length / segments);
      branch.push({ x, y });
    }

    return branch;
  }

  private regenerateBoltPath(bolt: LightningBolt): void {
    // Regenerate path while keeping start/end points - creates animation
    this.generateBoltPath(bolt);
  }

  private drawPath(points: { x: number; y: number }[], alpha: number, lineWidth: number, color: string): void {
    if (!this.ctx || points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = lineWidth;
    this.ctx.globalAlpha = alpha;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.stroke();
  }

  private drawBolt(bolt: LightningBolt, colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx) return;

    const alpha = bolt.life * 0.8;

    // Outer glow
    this.ctx.shadowBlur = 25;
    this.ctx.shadowColor = colors.glow;
    this.drawPath(bolt.segments, alpha * 0.4, 12, colors.glow);

    // Mid glow
    this.ctx.shadowBlur = 15;
    this.drawPath(bolt.segments, alpha * 0.6, 6, colors.start);

    // Core
    this.ctx.shadowBlur = 8;
    this.drawPath(bolt.segments, alpha, 2, "#ffffff");

    // Draw branches
    for (const branch of bolt.branches) {
      this.ctx.shadowBlur = 12;
      this.drawPath(branch, alpha * 0.5, 4, colors.end);
      this.ctx.shadowBlur = 4;
      this.drawPath(branch, alpha * 0.7, 1.5, "#ffffff");
    }

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;
  }

  private drawCenterOrb(colors: { start: string; end: string; glow: string }, energy: number): void {
    if (!this.ctx) return;

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const baseSize = 30 + energy * 50;

    // Outer glow
    const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseSize * 2);
    gradient.addColorStop(0, this.hexToRgba(colors.glow, 0.3 * energy));
    gradient.addColorStop(0.5, this.hexToRgba(colors.start, 0.1 * energy));
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, baseSize * 2, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner core
    const coreGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseSize * 0.5);
    coreGradient.addColorStop(0, this.hexToRgba("#ffffff", 0.4 * energy));
    coreGradient.addColorStop(1, this.hexToRgba(colors.start, 0.1 * energy));

    this.ctx.fillStyle = coreGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, baseSize * 0.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Electric tendrils from center
    const tendrilCount = Math.floor(4 + energy * 6);
    for (let i = 0; i < tendrilCount; i++) {
      const angle = (i / tendrilCount) * Math.PI * 2 + this.time * 2;
      const length = baseSize * (0.8 + this.smoothedMid * 0.5);

      const points: { x: number; y: number }[] = [];
      const segments = 6;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const dist = t * length;
        const jitter = (Math.random() - 0.5) * 20 * energy;
        points.push({
          x: centerX + Math.cos(angle) * dist + jitter,
          y: centerY + Math.sin(angle) * dist + jitter,
        });
      }

      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = colors.glow;
      this.drawPath(points, 0.4 + energy * 0.3, 2, colors.end);
    }

    this.ctx.shadowBlur = 0;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { boltCount, fadeSpeed, sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.time += deltaTime * 0.001;

    // Smooth audio values
    const smoothing = 0.15;
    this.smoothedBass += (bass - this.smoothedBass) * smoothing;
    this.smoothedMid += (mid - this.smoothedMid) * smoothing;
    this.smoothedTreble += (treble - this.smoothedTreble) * smoothing;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Detect bass hit
    const bassThreshold = 0.35;
    const scaledBass = bass * sensitivity;
    const bassHit = scaledBass > bassThreshold && this.lastBass <= bassThreshold;
    this.lastBass = scaledBass;

    // Spawn new bolts on bass hits
    if (bassHit) {
      const boltsToSpawn = Math.min(boltCount, Math.ceil(scaledBass * boltCount));
      for (let i = 0; i < boltsToSpawn; i++) {
        this.bolts.push(this.createBolt(scaledBass));
      }
    }

    // Spawn ambient bolts based on volume
    if (volume * sensitivity > 0.25 && Math.random() < 0.02 * volume * sensitivity) {
      const bolt = this.createBolt(volume * sensitivity * 0.6);
      bolt.maxLife *= 0.5; // Shorter lived
      this.bolts.push(bolt);
    }

    // Update and draw bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];

      // Decay life
      bolt.life -= fadeSpeed * (deltaTime / 16);

      // Regenerate path periodically for animation (every ~50ms)
      if (Math.random() < 0.3) {
        this.regenerateBoltPath(bolt);
      }

      if (bolt.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }

      this.drawBolt(bolt, colors);
    }

    // Draw center energy orb
    const energyLevel = Math.max(0.2, this.smoothedBass * sensitivity);
    this.drawCenterOrb(colors, energyLevel);

    // Limit bolts for performance
    while (this.bolts.length > 20) {
      this.bolts.shift();
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
    this.config = { ...this.config, ...config } as LightningConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.bolts = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      boltCount: {
        type: "number",
        label: "Max Bolts Per Hit",
        default: 3,
        min: 1,
        max: 10,
        step: 1,
      },
      branchChance: {
        type: "number",
        label: "Branch Chance",
        default: 0.3,
        min: 0,
        max: 1,
        step: 0.1,
      },
      fadeSpeed: {
        type: "number",
        label: "Fade Speed",
        default: 0.05,
        min: 0.01,
        max: 0.2,
        step: 0.01,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
