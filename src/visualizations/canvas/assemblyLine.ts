import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface AssemblyLineConfig extends VisualizationConfig {
  armCount: number;
  beltSpeed: number;
  sparkIntensity: number;
  activityLevel: number;
  colorScheme: string;
}

interface RoboticArm {
  baseX: number;
  baseY: number;
  segment1Length: number;
  segment2Length: number;
  angle1: number;
  angle2: number;
  targetAngle1: number;
  targetAngle2: number;
  moveTimer: number;
  moveInterval: number;
  isWelding: boolean;
  weldTimer: number;
}

interface ConveyorItem {
  x: number;
  y: number;
  width: number;
  height: number;
  type: "box" | "cylinder" | "gear";
  processed: boolean;
  color: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface ProgressIndicator {
  x: number;
  y: number;
  progress: number;
  targetProgress: number;
  label: string;
}

// Industrial color palettes
const INDUSTRIAL_PALETTES: Record<
  string,
  {
    metal: string;
    darkMetal: string;
    belt: string;
    arm: string;
    spark: string;
    sparkGlow: string;
    warning: string;
    accent: string;
  }
> = {
  factory: {
    metal: "#5A5A5A",
    darkMetal: "#3A3A3A",
    belt: "#2D2D2D",
    arm: "#666666",
    spark: "#FFA500",
    sparkGlow: "#FF6600",
    warning: "#FFD700",
    accent: "#00FF00",
  },
  modern: {
    metal: "#707070",
    darkMetal: "#404040",
    belt: "#1A1A1A",
    arm: "#808080",
    spark: "#00BFFF",
    sparkGlow: "#0080FF",
    warning: "#00FF7F",
    accent: "#00FFFF",
  },
  heavy: {
    metal: "#4A4A4A",
    darkMetal: "#2A2A2A",
    belt: "#1F1F1F",
    arm: "#5A5A5A",
    spark: "#FF4500",
    sparkGlow: "#FF0000",
    warning: "#FF6347",
    accent: "#FF8C00",
  },
};

export class AssemblyLineVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "assemblyLine",
    name: "Assembly Line",
    author: "Vizec",
    description: "Mechanical assembly line with robotic arms and welding sparks",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: AssemblyLineConfig = {
    sensitivity: 1.0,
    armCount: 3,
    beltSpeed: 1.0,
    sparkIntensity: 1.0,
    activityLevel: 1.0,
    colorScheme: "factory",
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private arms: RoboticArm[] = [];
  private items: ConveyorItem[] = [];
  private sparks: Spark[] = [];
  private progressIndicators: ProgressIndicator[] = [];
  private beltOffset = 0;
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private beltY = 0;
  private beltHeight = 0;

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
    this.beltY = this.height * 0.6;
    this.beltHeight = 40;
    this.initArms();
    this.initProgressIndicators();
    this.items = [];
    this.sparks = [];
    this.spawnItem();
  }

  private initArms(): void {
    this.arms = [];
    const { armCount } = this.config;

    const spacing = this.width / (armCount + 1);

    for (let i = 0; i < armCount; i++) {
      const baseX = spacing * (i + 1);
      const baseY = this.beltY - this.beltHeight / 2 - 10;

      this.arms.push({
        baseX,
        baseY,
        segment1Length: 60 + Math.random() * 30,
        segment2Length: 50 + Math.random() * 20,
        angle1: -Math.PI / 4 + (Math.random() * Math.PI) / 4,
        angle2: -Math.PI / 6 + (Math.random() * Math.PI) / 3,
        targetAngle1: -Math.PI / 4,
        targetAngle2: 0,
        moveTimer: Math.random() * 2,
        moveInterval: 1 + Math.random() * 1.5,
        isWelding: false,
        weldTimer: 0,
      });
    }
  }

  private initProgressIndicators(): void {
    this.progressIndicators = [];
    const labels = ["EFFICIENCY", "OUTPUT", "POWER"];

    for (let i = 0; i < 3; i++) {
      this.progressIndicators.push({
        x: 30 + i * 120,
        y: 30,
        progress: 0.3 + Math.random() * 0.4,
        targetProgress: 0.5,
        label: labels[i],
      });
    }
  }

  private spawnItem(): void {
    if (this.items.length > 10) return;

    const types: ("box" | "cylinder" | "gear")[] = ["box", "cylinder", "gear"];
    const type = types[Math.floor(Math.random() * types.length)];
    const colors = ["#8B4513", "#696969", "#4682B4", "#6B8E23"];

    this.items.push({
      x: -50,
      y: this.beltY - this.beltHeight / 2,
      width: 30 + Math.random() * 20,
      height: 25 + Math.random() * 15,
      type,
      processed: false,
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, beltSpeed, sparkIntensity, activityLevel, colorScheme } = this.config;
    const { bass, mid, treble, volume } = audioData;
    const palette = INDUSTRIAL_PALETTES[colorScheme] || INDUSTRIAL_PALETTES.factory;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update belt - much faster base speed
    this.beltOffset += beltSpeed * (2 + this.midSmooth * sensitivity * 6) * deltaTime;

    // Render conveyor belt
    this.renderConveyorBelt(palette, beltSpeed, sensitivity);

    // Update and render items
    this.updateItems(deltaTime, palette, beltSpeed, sensitivity);

    // Update and render robotic arms
    this.updateArms(deltaTime, palette, activityLevel, sensitivity);

    // Update and render sparks
    this.updateSparks(deltaTime, palette, sparkIntensity, sensitivity);

    // Render progress indicators
    this.renderProgressIndicators(palette, sensitivity);

    // Spawn new items periodically
    if (Math.random() < 0.02 * activityLevel * (1 + this.midSmooth)) {
      this.spawnItem();
    }
  }

  private renderConveyorBelt(
    palette: typeof INDUSTRIAL_PALETTES.factory,
    beltSpeed: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Belt main body
    ctx.fillStyle = this.hexToRgba(palette.belt, 0.55);
    ctx.fillRect(0, this.beltY - this.beltHeight / 2, this.width, this.beltHeight);

    // Belt tracks (moving lines)
    const trackSpacing = 30;
    const offset = this.beltOffset % trackSpacing;

    ctx.strokeStyle = this.hexToRgba(palette.metal, 0.4);
    ctx.lineWidth = 2;

    for (let x = -trackSpacing + offset; x < this.width + trackSpacing; x += trackSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, this.beltY - this.beltHeight / 2);
      ctx.lineTo(x, this.beltY + this.beltHeight / 2);
      ctx.stroke();
    }

    // Belt edges (metallic rails)
    ctx.fillStyle = this.hexToRgba(palette.metal, 0.55);
    ctx.fillRect(0, this.beltY - this.beltHeight / 2 - 5, this.width, 5);
    ctx.fillRect(0, this.beltY + this.beltHeight / 2, this.width, 5);

    // Support structures
    const supportSpacing = this.width / 5;
    for (let x = supportSpacing; x < this.width; x += supportSpacing) {
      ctx.fillStyle = this.hexToRgba(palette.darkMetal, 0.55);
      ctx.fillRect(
        x - 10,
        this.beltY + this.beltHeight / 2,
        20,
        this.height - this.beltY - this.beltHeight / 2,
      );
    }
  }

  private updateItems(
    deltaTime: number,
    palette: typeof INDUSTRIAL_PALETTES.factory,
    beltSpeed: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dt = deltaTime * 0.001;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];

      // Move item along belt - faster movement
      item.x += beltSpeed * 120 * (1 + this.midSmooth * sensitivity) * dt;

      // Remove if off screen
      if (item.x > this.width + 100) {
        this.items.splice(i, 1);
        continue;
      }

      // Draw item
      ctx.save();
      ctx.translate(item.x, item.y - item.height / 2);

      switch (item.type) {
        case "box":
          ctx.fillStyle = this.hexToRgba(item.color, 0.55);
          ctx.fillRect(-item.width / 2, -item.height / 2, item.width, item.height);
          ctx.strokeStyle = this.hexToRgba(palette.darkMetal, 0.4);
          ctx.lineWidth = 1;
          ctx.strokeRect(-item.width / 2, -item.height / 2, item.width, item.height);
          break;

        case "cylinder":
          ctx.fillStyle = this.hexToRgba(item.color, 0.55);
          ctx.beginPath();
          ctx.ellipse(0, 0, item.width / 2, item.height / 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = this.hexToRgba(palette.darkMetal, 0.4);
          ctx.lineWidth = 1;
          ctx.stroke();
          break;

        case "gear":
          this.drawGear(item.width / 2, item.color, palette);
          break;
      }

      // Processing indicator
      if (item.processed) {
        ctx.fillStyle = this.hexToRgba(palette.accent, 0.3);
        ctx.beginPath();
        ctx.arc(0, -item.height, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }
  }

  private drawGear(
    radius: number,
    color: string,
    palette: typeof INDUSTRIAL_PALETTES.factory,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const teeth = 8;
    const innerRadius = radius * 0.6;
    const toothHeight = radius * 0.3;

    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const angle = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? radius : radius - toothHeight;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = this.hexToRgba(color, 0.55);
    ctx.fill();

    // Center hole
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(palette.darkMetal, 0.55);
    ctx.fill();
  }

  private updateArms(
    deltaTime: number,
    palette: typeof INDUSTRIAL_PALETTES.factory,
    activityLevel: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dt = deltaTime * 0.001;

    for (const arm of this.arms) {
      // Update move timer - faster with audio
      arm.moveTimer -= dt * activityLevel * (1.5 + this.bassSmooth * sensitivity * 2);

      // Direct audio influence on arm angles - continuous movement
      const audioSwing1 =
        Math.sin(this.time * 2 + arm.baseX * 0.01) * this.bassSmooth * sensitivity * 0.3;
      const audioSwing2 =
        Math.cos(this.time * 3 + arm.baseX * 0.01) * this.midSmooth * sensitivity * 0.4;

      if (arm.moveTimer <= 0) {
        // Set new target angles - wider range
        arm.targetAngle1 = -Math.PI / 2 + Math.random() * Math.PI * 0.8;
        arm.targetAngle2 = -Math.PI / 3 + Math.random() * Math.PI * 0.6;
        arm.moveInterval = 0.2 + Math.random() * 0.5; // Much faster interval
        arm.moveTimer = arm.moveInterval;

        // Check if near an item for welding
        for (const item of this.items) {
          if (!item.processed && Math.abs(item.x - arm.baseX) < 80) {
            arm.isWelding = true;
            arm.weldTimer = 0.4;
            item.processed = true;
            this.emitSparks(arm, palette);
            break;
          }
        }
      }

      // Smoothly interpolate to target angles - much faster
      const speed = 8 * (1 + this.bassSmooth * sensitivity * 2);
      arm.angle1 += (arm.targetAngle1 + audioSwing1 - arm.angle1) * dt * speed;
      arm.angle2 += (arm.targetAngle2 + audioSwing2 - arm.angle2) * dt * speed;

      // Update welding
      if (arm.isWelding) {
        arm.weldTimer -= dt;
        if (arm.weldTimer <= 0) {
          arm.isWelding = false;
        }
      }

      // Draw arm
      this.drawRoboticArm(arm, palette, sensitivity);
    }
  }

  private drawRoboticArm(
    arm: RoboticArm,
    palette: typeof INDUSTRIAL_PALETTES.factory,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Base mount
    ctx.fillStyle = this.hexToRgba(palette.metal, 0.55);
    ctx.beginPath();
    ctx.arc(arm.baseX, arm.baseY, 15, 0, Math.PI * 2);
    ctx.fill();

    // Calculate joint positions
    const joint1X = arm.baseX + Math.cos(arm.angle1) * arm.segment1Length;
    const joint1Y = arm.baseY + Math.sin(arm.angle1) * arm.segment1Length;

    const endX = joint1X + Math.cos(arm.angle1 + arm.angle2) * arm.segment2Length;
    const endY = joint1Y + Math.sin(arm.angle1 + arm.angle2) * arm.segment2Length;

    // Draw first segment
    ctx.strokeStyle = this.hexToRgba(palette.arm, 0.6);
    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(arm.baseX, arm.baseY);
    ctx.lineTo(joint1X, joint1Y);
    ctx.stroke();

    // Inner detail
    ctx.strokeStyle = this.hexToRgba(palette.darkMetal, 0.5);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(arm.baseX, arm.baseY);
    ctx.lineTo(joint1X, joint1Y);
    ctx.stroke();

    // Joint
    ctx.fillStyle = this.hexToRgba(palette.metal, 0.55);
    ctx.beginPath();
    ctx.arc(joint1X, joint1Y, 10, 0, Math.PI * 2);
    ctx.fill();

    // Draw second segment
    ctx.strokeStyle = this.hexToRgba(palette.arm, 0.6);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(joint1X, joint1Y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = this.hexToRgba(palette.darkMetal, 0.5);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(joint1X, joint1Y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // End effector (welding tool)
    ctx.fillStyle = this.hexToRgba(palette.metal, 0.55);
    ctx.beginPath();
    ctx.arc(endX, endY, 8, 0, Math.PI * 2);
    ctx.fill();

    // Welding glow when active
    if (arm.isWelding) {
      ctx.fillStyle = this.hexToRgba(palette.sparkGlow, 0.4);
      ctx.beginPath();
      ctx.arc(endX, endY, 20 + this.bassSmooth * 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = this.hexToRgba(palette.spark, 0.6);
      ctx.beginPath();
      ctx.arc(endX, endY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private emitSparks(arm: RoboticArm, palette: typeof INDUSTRIAL_PALETTES.factory): void {
    const joint1X = arm.baseX + Math.cos(arm.angle1) * arm.segment1Length;
    const joint1Y = arm.baseY + Math.sin(arm.angle1) * arm.segment1Length;
    const endX = joint1X + Math.cos(arm.angle1 + arm.angle2) * arm.segment2Length;
    const endY = joint1Y + Math.sin(arm.angle1 + arm.angle2) * arm.segment2Length;

    const particleCount = 15 + Math.floor(Math.random() * 20);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 200;

      this.sparks.push({
        x: endX,
        y: endY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50, // Slightly upward bias
        life: 0.3 + Math.random() * 0.5,
        maxLife: 0.3 + Math.random() * 0.5,
        size: 1 + Math.random() * 3,
        color: Math.random() > 0.3 ? palette.spark : palette.sparkGlow,
      });
    }
  }

  private updateSparks(
    deltaTime: number,
    palette: typeof INDUSTRIAL_PALETTES.factory,
    sparkIntensity: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dt = deltaTime * 0.001;

    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];

      // Physics update
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 500 * dt; // Gravity
      spark.vx *= 0.98; // Air resistance

      spark.life -= dt;

      if (spark.life <= 0 || spark.y > this.height) {
        this.sparks.splice(i, 1);
        continue;
      }

      // Draw spark
      const progress = spark.life / spark.maxLife;
      const alpha = progress * 0.7 * sparkIntensity;

      // Glow
      const glowGradient = ctx.createRadialGradient(
        spark.x,
        spark.y,
        0,
        spark.x,
        spark.y,
        spark.size * 3,
      );
      glowGradient.addColorStop(0, this.hexToRgba(spark.color, alpha));
      glowGradient.addColorStop(1, this.hexToRgba(spark.color, 0));

      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = this.hexToRgba("#FFFFFF", alpha);
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.size * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Trail
      ctx.strokeStyle = this.hexToRgba(spark.color, alpha * 0.5);
      ctx.lineWidth = spark.size * 0.3;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * 0.02, spark.y - spark.vy * 0.02);
      ctx.stroke();
    }
  }

  private renderProgressIndicators(
    palette: typeof INDUSTRIAL_PALETTES.factory,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    for (const indicator of this.progressIndicators) {
      // Update target based on audio
      indicator.targetProgress = 0.3 + this.midSmooth * 0.5 * sensitivity;
      indicator.progress += (indicator.targetProgress - indicator.progress) * 0.1;

      const barWidth = 80;
      const barHeight = 10;

      // Background
      ctx.fillStyle = this.hexToRgba(palette.darkMetal, 0.55);
      ctx.fillRect(indicator.x, indicator.y, barWidth, barHeight);

      // Progress fill
      const fillColor = indicator.progress > 0.7 ? palette.warning : palette.accent;
      ctx.fillStyle = this.hexToRgba(fillColor, 0.55);
      ctx.fillRect(indicator.x, indicator.y, barWidth * indicator.progress, barHeight);

      // Border
      ctx.strokeStyle = this.hexToRgba(palette.metal, 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(indicator.x, indicator.y, barWidth, barHeight);

      // Label
      ctx.fillStyle = this.hexToRgba(palette.metal, 0.6);
      ctx.font = "10px monospace";
      ctx.fillText(indicator.label, indicator.x, indicator.y - 5);

      // Value
      ctx.fillText(
        `${Math.floor(indicator.progress * 100)}%`,
        indicator.x + barWidth + 5,
        indicator.y + 8,
      );
    }
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
    const oldArmCount = this.config.armCount;
    this.config = { ...this.config, ...config } as AssemblyLineConfig;

    if (this.config.armCount !== oldArmCount && this.width > 0) {
      this.initArms();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.arms = [];
    this.items = [];
    this.sparks = [];
    this.progressIndicators = [];
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
        label: "Factory Style",
        default: "factory",
        options: [
          { label: "Classic Factory", value: "factory" },
          { label: "Modern Tech", value: "modern" },
          { label: "Heavy Industry", value: "heavy" },
        ],
      },
      armCount: {
        type: "number",
        label: "Robotic Arms",
        default: 3,
        min: 1,
        max: 6,
        step: 1,
      },
      beltSpeed: {
        type: "number",
        label: "Belt Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      sparkIntensity: {
        type: "number",
        label: "Spark Intensity",
        default: 1.0,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
      activityLevel: {
        type: "number",
        label: "Activity Level",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
