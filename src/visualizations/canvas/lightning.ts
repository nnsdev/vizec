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
  points: { x: number; y: number }[];
  branches: { x: number; y: number }[][];
  alpha: number;
  life: number;
  maxLife: number;
  isAmbient?: boolean;
}

interface ArcSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  offset: number;
  speed: number;
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
    description: "Lightning bolts that strike from top on bass hits",
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
  private flashAlpha = 0;
  private lastBass = 0;
  private bassThreshold = 0.4;
  private arcs: ArcSegment[] = [];
  private time = 0;
  private ambientTimer = 0;

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
    this.initArcs();
  }

  private initArcs(): void {
    // Create ambient electric arcs around the edges - reaching toward center
    this.arcs = [];
    const arcCount = 12;
    const maxReach = Math.min(this.width, this.height) * 0.4; // Reach 40% into screen

    for (let i = 0; i < arcCount; i++) {
      const edge = Math.floor(Math.random() * 4);
      let x1: number, y1: number, x2: number, y2: number;

      if (edge === 0) {
        // top
        x1 = Math.random() * this.width;
        y1 = 0;
        x2 = x1 + (Math.random() - 0.5) * 300;
        y2 = Math.random() * maxReach + 100;
      } else if (edge === 1) {
        // bottom
        x1 = Math.random() * this.width;
        y1 = this.height;
        x2 = x1 + (Math.random() - 0.5) * 300;
        y2 = this.height - Math.random() * maxReach - 100;
      } else if (edge === 2) {
        // left
        x1 = 0;
        y1 = Math.random() * this.height;
        x2 = Math.random() * maxReach + 100;
        y2 = y1 + (Math.random() - 0.5) * 300;
      } else {
        // right
        x1 = this.width;
        y1 = Math.random() * this.height;
        x2 = this.width - Math.random() * maxReach - 100;
        y2 = y1 + (Math.random() - 0.5) * 300;
      }

      this.arcs.push({
        x1,
        y1,
        x2,
        y2,
        offset: Math.random() * Math.PI * 2,
        speed: Math.random() * 2 + 1,
      });
    }
  }

  private generateBolt(startX: number): LightningBolt {
    const points: { x: number; y: number }[] = [];
    const branches: { x: number; y: number }[][] = [];

    let x = startX;
    let y = 0;
    const segmentCount = Math.floor(this.height / 30);
    const segmentHeight = this.height / segmentCount;

    points.push({ x, y });

    for (let i = 1; i <= segmentCount; i++) {
      // Add jagged displacement
      const displacement = (Math.random() - 0.5) * 100;
      x += displacement;
      y = i * segmentHeight;

      // Keep within bounds
      x = Math.max(50, Math.min(this.width - 50, x));

      points.push({ x, y });

      // Possibly create a branch
      if (Math.random() < this.config.branchChance && i < segmentCount - 2) {
        const branch = this.generateBranch(x, y, i < segmentCount / 2 ? 1 : -1);
        branches.push(branch);
      }
    }

    return {
      points,
      branches,
      alpha: 1.0,
      life: 1.0,
      maxLife: 1.0,
    };
  }

  private generateBranch(
    startX: number,
    startY: number,
    direction: number,
  ): { x: number; y: number }[] {
    const branch: { x: number; y: number }[] = [];
    let x = startX;
    let y = startY;
    const branchLength = Math.floor(Math.random() * 5) + 3;

    branch.push({ x, y });

    for (let i = 0; i < branchLength; i++) {
      x += direction * (Math.random() * 40 + 20);
      y += Math.random() * 30 + 10;
      branch.push({ x, y });
    }

    return branch;
  }

  private drawBolt(
    bolt: LightningBolt,
    colors: { start: string; end: string; glow: string },
    scale = 1,
  ): void {
    if (!this.ctx) return;

    const alpha = bolt.alpha * 0.7 * scale; // Base transparency

    // Draw glow
    this.ctx.shadowBlur = 30;
    this.ctx.shadowColor = colors.glow;
    this.ctx.strokeStyle = colors.glow;
    this.ctx.lineWidth = 8;
    this.ctx.globalAlpha = alpha * 0.5;
    this.drawPath(bolt.points);

    // Draw main bolt
    this.ctx.shadowBlur = 15;
    this.ctx.strokeStyle = colors.start;
    this.ctx.lineWidth = 3;
    this.ctx.globalAlpha = alpha;
    this.drawPath(bolt.points);

    // Draw core (white)
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 1;
    this.ctx.globalAlpha = alpha;
    this.drawPath(bolt.points);

    // Draw branches
    for (const branch of bolt.branches) {
      this.ctx.shadowBlur = 15;
      this.ctx.strokeStyle = colors.end;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = alpha * 0.7;
      this.drawPath(branch);
    }

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1.0;
  }

  private drawPath(points: { x: number; y: number }[]): void {
    if (!this.ctx || points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.ctx.lineTo(points[i].x, points[i].y);
    }
    this.ctx.stroke();
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    void treble; // Used in drawCenterEnergy
    const { boltCount, fadeSpeed, sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.time += deltaTime * 0.001;
    this.ambientTimer += deltaTime;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw background flash if active
    if (this.flashAlpha > 0) {
      this.ctx.fillStyle = `rgba(255, 255, 255, ${this.flashAlpha * 0.3})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.flashAlpha -= fadeSpeed * 2 * (deltaTime / 16);
      if (this.flashAlpha < 0) this.flashAlpha = 0;
    }

    // Draw ambient electric arcs (always visible, react to audio)
    this.drawAmbientArcs(colors, mid, treble);

    // Detect bass hit (rising edge)
    const scaledBass = bass * sensitivity;
    const bassHit = scaledBass > this.bassThreshold && this.lastBass <= this.bassThreshold;
    this.lastBass = scaledBass;

    // Spawn new bolts on bass hits
    if (bassHit) {
      const boltsToSpawn = Math.min(boltCount, Math.ceil(scaledBass * boltCount));
      for (let i = 0; i < boltsToSpawn; i++) {
        const startX = Math.random() * this.width;
        this.bolts.push(this.generateBolt(startX));
      }

      // Flash on big hits
      if (scaledBass > 0.7) {
        this.flashAlpha = Math.min(1, scaledBass);
      }
    }

    // Spawn ambient mini-bolts based on volume (continuous activity)
    if (this.ambientTimer > 100 && volume * sensitivity > 0.2) {
      this.ambientTimer = 0;
      if (Math.random() < volume * sensitivity * 0.5) {
        const startX = Math.random() * this.width;
        const bolt = this.generateBolt(startX);
        bolt.isAmbient = true;
        bolt.maxLife = 0.3 + Math.random() * 0.3;
        bolt.life = bolt.maxLife;
        this.bolts.push(bolt);
      }
    }

    // Update and draw bolts
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];

      // Fade out (ambient bolts fade faster)
      const fadeMultiplier = bolt.isAmbient ? 2.5 : 1;
      bolt.life -= fadeSpeed * fadeMultiplier * (deltaTime / 16);
      bolt.alpha = bolt.life / bolt.maxLife;

      if (bolt.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }

      this.drawBolt(bolt, colors, bolt.isAmbient ? 0.5 : 1);
    }

    // Draw crackling energy in center - always visible with base level
    const energyLevel = Math.max(0.3, volume * sensitivity);
    this.drawCenterEnergy(colors, energyLevel, mid, treble);

    // Limit max bolts for performance
    while (this.bolts.length > 30) {
      this.bolts.shift();
    }
  }

  private drawAmbientArcs(
    colors: { start: string; end: string; glow: string },
    mid: number,
    treble: number,
  ): void {
    if (!this.ctx) return;

    for (const arc of this.arcs) {
      const intensity = 0.5 + mid * 0.3 + treble * 0.2;
      const flicker = Math.sin(this.time * arc.speed + arc.offset) * 0.5 + 0.5;

      if (flicker < 0.2) continue; // Flicker off sometimes

      // Generate jagged path between arc endpoints
      const points: { x: number; y: number }[] = [];
      const segments = 8;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const baseX = arc.x1 + (arc.x2 - arc.x1) * t;
        const baseY = arc.y1 + (arc.y2 - arc.y1) * t;
        const jitter = (Math.random() - 0.5) * 30 * intensity;
        points.push({
          x: baseX + jitter,
          y: baseY + jitter,
        });
      }

      // Draw glow
      this.ctx.shadowBlur = 20;
      this.ctx.shadowColor = colors.glow;
      this.ctx.strokeStyle = colors.glow;
      this.ctx.lineWidth = 4;
      this.ctx.globalAlpha = intensity * flicker * 0.6;
      this.drawPath(points);

      // Draw main arc
      this.ctx.shadowBlur = 8;
      this.ctx.strokeStyle = colors.start;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = intensity * flicker * 0.8;
      this.drawPath(points);

      this.ctx.shadowBlur = 0;
      this.ctx.globalAlpha = 1;
    }
  }

  private drawCenterEnergy(
    colors: { start: string; end: string; glow: string },
    volume: number,
    mid: number,
    treble: number,
  ): void {
    if (!this.ctx) return;

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const radius = 80 + volume * 150;
    const boltCount = Math.floor(5 + mid * 6);

    for (let i = 0; i < boltCount; i++) {
      const angle = (i / boltCount) * Math.PI * 2 + this.time * 2;
      const length = radius * (0.6 + treble * 0.4);

      const points: { x: number; y: number }[] = [];
      const segments = 8;
      for (let j = 0; j <= segments; j++) {
        const t = j / segments;
        const dist = t * length;
        const jitter = (Math.random() - 0.5) * 40 * volume;
        points.push({
          x: centerX + Math.cos(angle) * dist + jitter,
          y: centerY + Math.sin(angle) * dist + jitter,
        });
      }

      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = colors.glow;
      this.ctx.strokeStyle = colors.end;
      this.ctx.lineWidth = 2.5;
      this.ctx.globalAlpha = 0.4 + volume * 0.4;
      this.drawPath(points);
    }

    // Draw center orb
    const orbSize = 20 + volume * 30;
    this.ctx.shadowBlur = 25;
    this.ctx.shadowColor = colors.glow;
    this.ctx.fillStyle = colors.start;
    this.ctx.globalAlpha = 0.3 + volume * 0.3;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, orbSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Inner bright core
    this.ctx.fillStyle = "#ffffff";
    this.ctx.globalAlpha = 0.2 + volume * 0.4;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, orbSize * 0.4, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Reinitialize arcs for new dimensions
    this.initArcs();
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
    this.arcs = [];
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
