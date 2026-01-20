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

interface ArcadeCabinetConfig extends VisualizationConfig {
  colorScheme: string;
  screenFlicker: number;
  pixelSize: number;
}

interface GameElement {
  type: "player" | "enemy" | "bullet" | "explosion";
  x: number;
  y: number;
  vx: number;
  vy: number;
  frame: number;
  life: number;
}

export class ArcadeCabinetVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "arcadeCabinet",
    name: "Arcade Cabinet",
    author: "Vizec",
    description: "Retro arcade game screen with pixel effects",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: ArcadeCabinetConfig = {
    sensitivity: 1.0,
    colorScheme: "neonCity",
    screenFlicker: 0.5,
    pixelSize: 8,
  };

  private width = 0;
  private height = 0;
  private elements: GameElement[] = [];
  private time = 0;
  private playerY = 0;
  private score = 0;
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
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, screenFlicker, pixelSize } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Screen area (no solid background - transparent)
    const screenMargin = 50;
    const screenX = screenMargin;
    const screenY = screenMargin;
    const screenW = this.width - screenMargin * 2;
    const screenH = this.height - screenMargin * 2;

    // Subtle screen border glow only
    this.ctx.shadowColor = colors.start;
    this.ctx.shadowBlur = 20 + volume * 15;
    this.ctx.strokeStyle = `rgba(${this.hexToRgb(colors.start)}, 0.4)`;
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(screenX, screenY, screenW, screenH);
    this.ctx.shadowBlur = 0;

    // Player ship movement based on mid frequencies
    this.playerY = screenY + screenH * 0.5 + Math.sin(this.time * 2) * (screenH * 0.3) * mid;
    const playerX = screenX + 60;

    // Spawn enemies regularly and on bass hits
    const bassHit = bass > 0.5 && bass > this.lastBass + 0.1;
    this.lastBass = bass;

    // Spawn on bass hit or randomly based on time
    if (bassHit || (Math.random() < 0.02 * sensitivity && this.elements.filter(e => e.type === "enemy").length < 8)) {
      this.spawnEnemy(screenX, screenY, screenW, screenH, colors);
    }

    // Shoot bullets on treble
    if (treble > 0.4 && Math.random() < treble * sensitivity * 0.3) {
      this.elements.push({
        type: "bullet",
        x: playerX + 20,
        y: this.playerY,
        vx: 15,
        vy: (Math.random() - 0.5) * 2,
        frame: 0,
        life: 1,
      });
    }

    // Collision detection first (mark elements for removal)
    const toRemove = new Set<number>();
    const explosionsToAdd: GameElement[] = [];

    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      if (el.type === "bullet") {
        for (let j = 0; j < this.elements.length; j++) {
          const target = this.elements[j];
          if (target.type === "enemy" && !toRemove.has(j)) {
            const dx = el.x - target.x;
            const dy = el.y - target.y;
            if (Math.abs(dx) < 25 && Math.abs(dy) < 25) {
              explosionsToAdd.push({
                type: "explosion",
                x: target.x,
                y: target.y,
                vx: 0,
                vy: 0,
                frame: 0,
                life: 0.5,
              });
              toRemove.add(i);
              toRemove.add(j);
              this.score += 100;
              break;
            }
          }
        }
      }
    }

    // Add explosions
    this.elements.push(...explosionsToAdd);

    // Update and draw elements
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];

      // Remove marked elements
      if (toRemove.has(i)) {
        this.elements.splice(i, 1);
        continue;
      }

      el.x += el.vx * deltaTime * 60;
      el.y += el.vy * deltaTime * 60;
      el.frame += deltaTime * 10;

      // Boundary check
      if (el.x < screenX - 50 || el.x > screenX + screenW + 50 ||
          el.y < screenY - 50 || el.y > screenY + screenH + 50) {
        this.elements.splice(i, 1);
        continue;
      }

      // Life decay for explosions
      if (el.type === "explosion") {
        el.life -= deltaTime * 2;
        if (el.life <= 0) {
          this.elements.splice(i, 1);
          continue;
        }
      }

      // Draw based on type
      this.drawGameElement(el, colors, pixelSize);
    }

    // Draw player ship
    this.drawPlayer(playerX, this.playerY, colors, pixelSize, volume);

    // Score display
    this.ctx.font = `${pixelSize * 2}px monospace`;
    this.ctx.fillStyle = colors.start;
    this.ctx.textAlign = "left";
    this.ctx.fillText(`SCORE: ${this.score}`, screenX + 10, screenY + pixelSize * 3);

    // Screen flicker effect (subtle, on game elements only)
    if (screenFlicker > 0 && Math.random() < screenFlicker * 0.03) {
      this.ctx.globalAlpha = 0.1 * screenFlicker;
      this.ctx.fillStyle = colors.start;
      this.ctx.fillRect(screenX, screenY, screenW, screenH);
      this.ctx.globalAlpha = 1;
    }
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return "255, 255, 255";
  }

  private spawnEnemy(
    screenX: number,
    screenY: number,
    screenW: number,
    screenH: number,
    _colors: { start: string; mid: string; end: string }
  ): void {
    this.elements.push({
      type: "enemy",
      x: screenX + screenW + 20,
      y: screenY + Math.random() * screenH,
      vx: -3 - Math.random() * 4,
      vy: (Math.random() - 0.5) * 2,
      frame: 0,
      life: 1,
    });
  }

  private drawPlayer(
    x: number,
    y: number,
    colors: { start: string; mid: string; end: string },
    pixelSize: number,
    volume: number
  ): void {
    if (!this.ctx) return;

    // Simple ship shape
    const shipPixels = [
      [0, 0], [1, 0], [2, 0],
      [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1],
      [0, 2], [1, 2], [2, 2],
    ];

    // Engine glow
    this.ctx.shadowColor = colors.end;
    this.ctx.shadowBlur = 10 + volume * 20;

    this.ctx.fillStyle = colors.start;
    for (const [px, py] of shipPixels) {
      this.ctx.fillRect(
        x + px * pixelSize,
        y + (py - 1) * pixelSize,
        pixelSize - 1,
        pixelSize - 1
      );
    }

    // Engine flame
    if (Math.random() < 0.7) {
      this.ctx.fillStyle = colors.end;
      this.ctx.fillRect(x - pixelSize * 2, y - pixelSize / 2, pixelSize, pixelSize);
      if (volume > 0.5) {
        this.ctx.fillRect(x - pixelSize * 3, y - pixelSize / 2, pixelSize, pixelSize);
      }
    }

    this.ctx.shadowBlur = 0;
  }

  private drawGameElement(
    el: GameElement,
    colors: { start: string; mid: string; end: string },
    pixelSize: number
  ): void {
    if (!this.ctx) return;

    switch (el.type) {
      case "enemy": {
        const enemyPixels = [
          [0, -1], [1, -1],
          [-1, 0], [0, 0], [1, 0], [2, 0],
          [0, 1], [1, 1],
        ];
        this.ctx.fillStyle = colors.end;
        for (const [px, py] of enemyPixels) {
          this.ctx.fillRect(
            el.x + px * pixelSize,
            el.y + py * pixelSize,
            pixelSize - 1,
            pixelSize - 1
          );
        }
        break;
      }

      case "bullet": {
        this.ctx.shadowColor = colors.mid;
        this.ctx.shadowBlur = 8;
        this.ctx.fillStyle = colors.mid;
        this.ctx.fillRect(el.x, el.y - pixelSize / 4, pixelSize * 2, pixelSize / 2);
        this.ctx.shadowBlur = 0;
        break;
      }

      case "explosion": {
        const size = (1 - el.life) * 40;
        const alpha = el.life;

        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + el.frame;
          const dist = size * (0.5 + Math.random() * 0.5);
          const px = el.x + Math.cos(angle) * dist;
          const py = el.y + Math.sin(angle) * dist;

          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = i % 2 === 0 ? colors.end : colors.mid;
          this.ctx.fillRect(px, py, pixelSize, pixelSize);
        }
        this.ctx.globalAlpha = 1;
        break;
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
    this.config = { ...this.config, ...config } as ArcadeCabinetConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.elements = [];
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
        default: "neonCity",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      screenFlicker: {
        type: "number",
        label: "Screen Flicker",
        default: 0.5,
        min: 0,
        max: 1.0,
        step: 0.1,
      },
      pixelSize: {
        type: "number",
        label: "Pixel Size",
        default: 8,
        min: 4,
        max: 16,
        step: 2,
      },
    };
  }
}
