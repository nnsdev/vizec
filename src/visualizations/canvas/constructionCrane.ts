import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface ConstructionCraneConfig extends VisualizationConfig {
  colorScheme: string;
  swingSpeed: number;
  lightIntensity: number;
}

interface WarningLight {
  x: number;
  y: number;
  phase: number;
  on: boolean;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export class ConstructionCraneVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "constructionCrane",
    name: "Construction Crane",
    author: "Vizec",
    description: "Urban construction crane with warning lights",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: ConstructionCraneConfig = {
    sensitivity: 1.0,
    colorScheme: "warmSunset",
    swingSpeed: 1.0,
    lightIntensity: 1.0,
  };

  private width = 0;
  private height = 0;
  private craneAngle = 0;
  private hookY = 0;
  private targetHookY = 0;
  private warningLights: WarningLight[] = [];
  private sparks: Spark[] = [];
  private time = 0;
  private cableSwing = 0;

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
    this.initLights();
  }

  private initLights(): void {
    this.warningLights = [];

    // Lights along the jib and tower
    const craneX = this.width * 0.3;
    const towerTop = this.height * 0.15;
    const jibLength = this.width * 0.5;

    // Tower lights
    for (let i = 0; i < 4; i++) {
      const y = towerTop + i * ((this.height - towerTop) / 4);
      this.warningLights.push({
        x: craneX,
        y,
        phase: i * 0.5,
        on: true,
      });
    }

    // Jib tip light
    this.warningLights.push({
      x: craneX + jibLength,
      y: towerTop,
      phase: 0,
      on: true,
    });

    // Counter-jib light
    this.warningLights.push({
      x: craneX - 100,
      y: towerTop + 20,
      phase: 0.5,
      on: true,
    });
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, swingSpeed, lightIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Crane dimensions
    const craneX = this.width * 0.3;
    const towerTop = this.height * 0.15;
    const towerWidth = 30;
    const jibLength = this.width * 0.5;
    const counterJibLength = 100;

    // Crane rotation based on audio
    const targetAngle =
      Math.sin(this.time * swingSpeed * 0.3) * 0.15 + (mid - 0.5) * 0.1 * sensitivity;
    this.craneAngle += (targetAngle - this.craneAngle) * 0.02;

    // Hook movement
    this.targetHookY = 100 + bass * 200 * sensitivity;
    this.hookY += (this.targetHookY - this.hookY) * 0.05;

    // Cable swing
    this.cableSwing = Math.sin(this.time * 2 * swingSpeed) * (0.05 + treble * 0.05);

    // Draw tower (lattice structure)
    this.ctx.strokeStyle = "rgba(80, 80, 90, 0.85)";
    this.ctx.lineWidth = 4;

    // Main tower legs
    this.ctx.beginPath();
    this.ctx.moveTo(craneX - towerWidth / 2, this.height);
    this.ctx.lineTo(craneX - towerWidth / 4, towerTop);
    this.ctx.moveTo(craneX + towerWidth / 2, this.height);
    this.ctx.lineTo(craneX + towerWidth / 4, towerTop);
    this.ctx.stroke();

    // Tower cross bracing
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "rgba(70, 70, 80, 0.7)";
    const sections = 8;
    for (let i = 0; i < sections; i++) {
      const y1 = towerTop + (this.height - towerTop) * (i / sections);
      const y2 = towerTop + (this.height - towerTop) * ((i + 1) / sections);
      const w1 = (towerWidth / 2) * (0.5 + (i / sections) * 0.5);
      const w2 = (towerWidth / 2) * (0.5 + ((i + 1) / sections) * 0.5);

      // Cross braces
      this.ctx.beginPath();
      this.ctx.moveTo(craneX - w1, y1);
      this.ctx.lineTo(craneX + w2, y2);
      this.ctx.moveTo(craneX + w1, y1);
      this.ctx.lineTo(craneX - w2, y2);
      this.ctx.stroke();

      // Horizontal brace
      this.ctx.beginPath();
      this.ctx.moveTo(craneX - w1, y1);
      this.ctx.lineTo(craneX + w1, y1);
      this.ctx.stroke();
    }

    // Draw rotating parts (jib and counter-jib)
    this.ctx.save();
    this.ctx.translate(craneX, towerTop);
    this.ctx.rotate(this.craneAngle);

    // Slewing unit
    this.ctx.fillStyle = "rgba(70, 70, 80, 0.9)";
    this.ctx.fillRect(-25, -10, 50, 20);

    // Main jib
    this.ctx.strokeStyle = "rgba(90, 90, 100, 0.85)";
    this.ctx.lineWidth = 3;

    // Top chord
    this.ctx.beginPath();
    this.ctx.moveTo(0, -15);
    this.ctx.lineTo(jibLength, -5);
    this.ctx.stroke();

    // Bottom chord
    this.ctx.beginPath();
    this.ctx.moveTo(0, 5);
    this.ctx.lineTo(jibLength, 5);
    this.ctx.stroke();

    // Jib lattice
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeStyle = "rgba(80, 80, 90, 0.7)";
    const jibSections = 12;
    for (let i = 0; i <= jibSections; i++) {
      const x = (jibLength / jibSections) * i;
      const topY = -15 + (10 / jibLength) * x;

      // Verticals
      this.ctx.beginPath();
      this.ctx.moveTo(x, topY);
      this.ctx.lineTo(x, 5);
      this.ctx.stroke();

      // Diagonals
      if (i < jibSections) {
        const nextX = (jibLength / jibSections) * (i + 1);
        const nextTopY = -15 + (10 / jibLength) * nextX;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 5);
        this.ctx.lineTo(nextX, nextTopY);
        this.ctx.stroke();
      }
    }

    // Counter-jib
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = "rgba(90, 90, 100, 0.85)";
    this.ctx.beginPath();
    this.ctx.moveTo(0, -10);
    this.ctx.lineTo(-counterJibLength, 10);
    this.ctx.moveTo(0, 5);
    this.ctx.lineTo(-counterJibLength, 20);
    this.ctx.stroke();

    // Counterweight
    this.ctx.fillStyle = "rgba(60, 60, 70, 0.9)";
    this.ctx.fillRect(-counterJibLength - 30, 5, 40, 40);

    // Trolley position (moves with mid frequency)
    const trolleyX = jibLength * 0.3 + jibLength * 0.5 * mid;
    const trolleyY = -5 + ((10 / jibLength) * trolleyX) / 2;

    // Trolley
    this.ctx.fillStyle = "rgba(100, 100, 110, 0.9)";
    this.ctx.fillRect(trolleyX - 15, trolleyY - 5, 30, 15);

    // Cable
    const cableEndX = trolleyX + Math.sin(this.cableSwing) * this.hookY * 0.3;
    this.ctx.strokeStyle = "rgba(40, 40, 50, 0.8)";
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(trolleyX, trolleyY + 10);
    this.ctx.quadraticCurveTo(
      trolleyX + Math.sin(this.cableSwing) * this.hookY * 0.5,
      trolleyY + this.hookY / 2,
      cableEndX,
      trolleyY + this.hookY,
    );
    this.ctx.stroke();

    // Hook block
    this.ctx.fillStyle = "rgba(80, 80, 90, 0.9)";
    this.ctx.fillRect(cableEndX - 12, trolleyY + this.hookY - 5, 24, 20);

    // Hook
    this.ctx.strokeStyle = "rgba(100, 100, 110, 0.9)";
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.arc(cableEndX, trolleyY + this.hookY + 20, 15, 0, Math.PI);
    this.ctx.stroke();

    // Load (appears on bass hit)
    if (bass > 0.5) {
      this.ctx.globalAlpha = bass;
      this.ctx.fillStyle = colors.mid;
      this.ctx.fillRect(cableEndX - 20, trolleyY + this.hookY + 40, 40, 30);
      this.ctx.globalAlpha = 1;
    }

    this.ctx.restore();

    // Warning lights
    for (const light of this.warningLights) {
      light.phase += deltaTime * 3;
      light.on = Math.sin(light.phase) > 0;

      if (light.on) {
        const intensity = lightIntensity * (0.7 + volume * 0.3 * sensitivity);

        // Glow
        this.ctx.shadowColor = "#ff3300";
        this.ctx.shadowBlur = 20 * intensity;

        this.ctx.fillStyle = `rgba(255, 100, 0, ${intensity})`;
        this.ctx.beginPath();
        this.ctx.arc(light.x, light.y, 6, 0, Math.PI * 2);
        this.ctx.fill();

        // Core
        this.ctx.fillStyle = `rgba(255, 200, 100, ${intensity})`;
        this.ctx.beginPath();
        this.ctx.arc(light.x, light.y, 3, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
      }
    }

    // Welding sparks on treble
    if (treble > 0.6 && Math.random() < treble * 0.3) {
      const sparkX = craneX + Math.random() * 200;
      const sparkY = this.height * 0.7 + Math.random() * 100;

      for (let i = 0; i < 8; i++) {
        this.sparks.push({
          x: sparkX,
          y: sparkY,
          vx: (Math.random() - 0.5) * 10,
          vy: -Math.random() * 8 - 2,
          life: 0.5 + Math.random() * 0.5,
          color: Math.random() > 0.5 ? colors.end : "#ffaa00",
        });
      }

      // Flash
      this.ctx.fillStyle = `rgba(255, 255, 200, ${treble * 0.3})`;
      this.ctx.beginPath();
      this.ctx.arc(sparkX, sparkY, 20, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Update and draw sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.x += spark.vx * deltaTime * 60;
      spark.y += spark.vy * deltaTime * 60;
      spark.vy += 0.5 * deltaTime * 60;
      spark.life -= deltaTime * 2;

      if (spark.life <= 0) {
        this.sparks.splice(i, 1);
        continue;
      }

      this.ctx.globalAlpha = spark.life;
      this.ctx.fillStyle = spark.color;
      this.ctx.beginPath();
      this.ctx.arc(spark.x, spark.y, 2, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.initLights();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as ConstructionCraneConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.warningLights = [];
    this.sparks = [];
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
        default: "warmSunset",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      swingSpeed: {
        type: "number",
        label: "Swing Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      lightIntensity: {
        type: "number",
        label: "Light Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
