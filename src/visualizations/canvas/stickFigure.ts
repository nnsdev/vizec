import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_ACCENT, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface StickFigureConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  movementIntensity: number;
  jointFlexibility: number;
  bounciness: number;
}

interface Joint {
  x: number;
  y: number;
  radius?: number;
}

export class StickFigureVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "stickFigure",
    name: "Stick Figure",
    author: "Vizec",
    description: "Animated stick figure that dances to the music",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: StickFigureConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    movementIntensity: 1.0,
    jointFlexibility: 0.5,
    bounciness: 0.5,
  };

  private time = 0;
  private jointAngles: Record<string, number> = {
    leftUpperArm: 0,
    leftLowerArm: 0,
    rightUpperArm: 0,
    rightLowerArm: 0,
    leftUpperLeg: 0,
    leftLowerLeg: 0,
    rightUpperLeg: 0,
    rightLowerLeg: 0,
    head: 0,
    torso: 0,
  };

  private jointTargets: Record<string, number> = {
    leftUpperArm: 0,
    leftLowerArm: 0,
    rightUpperArm: 0,
    rightLowerArm: 0,
    leftUpperLeg: 0,
    leftLowerLeg: 0,
    rightUpperLeg: 0,
    rightLowerLeg: 0,
    head: 0,
    torso: 0,
  };

  private joints: Record<string, Joint> = {};
  private bodyY = 0;
  private hipSway = 0;
  private lastBass = 0;
  private beatHit = false;
  private dancePhase = 0;

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

    this.time += deltaTime;
    const { bass, mid, treble, volume } = audioData;

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    const colors = getColorScheme(COLOR_SCHEMES_ACCENT, this.config.colorScheme);

    // Detect beat hits (bass spike)
    this.beatHit = bass > 0.5 && bass > this.lastBass + 0.1;
    if (this.beatHit) {
      this.dancePhase = (this.dancePhase + 1) % 4;
    }
    this.lastBass = bass;

    // Calculate joint angles based on audio
    this.calculateJointAngles(bass, mid, treble, volume, deltaTime);

    // Update body position with bounce - faster, more reactive
    const baseY = this.height / 2 + 40;
    const bounceAmt = this.config.bounciness * 40;
    const bounceOffset = -Math.abs(Math.sin(this.time * 8)) * bass * bounceAmt;

    // Hip sway side to side
    this.hipSway += (Math.sin(this.time * 4) * mid * 30 - this.hipSway) * 0.1;

    // Recalculate joint positions with bounce and sway
    this.calculateJointPositions(this.width / 2 + this.hipSway, baseY + bounceOffset);

    // Draw stick figure with animated joints
    this.drawStickFigure(this.ctx, colors, volume);
  }

  private calculateJointAngles(
    bass: number,
    mid: number,
    treble: number,
    volume: number,
    deltaTime: number,
  ): void {
    const { sensitivity, movementIntensity, jointFlexibility } = this.config;
    const intensity = (0.3 + volume * 0.7) * sensitivity * movementIntensity;
    const time = this.time;
    const flex = jointFlexibility;

    // Head bob - nod to the beat
    this.jointTargets.head = Math.sin(time * 8) * 0.2 * intensity + treble * 0.15;

    // Torso groove - lean into the beat
    this.jointTargets.torso = Math.sin(time * 4) * 0.15 * intensity;

    // Dance moves based on phase (changes on beat hits)
    const phase = this.dancePhase;
    const beatPump = this.beatHit ? 0.3 : 0;

    // ARM CHOREOGRAPHY - different moves per phase
    if (phase === 0) {
      // Arms pump up and down alternating
      const pump = Math.sin(time * 8) * 0.5 * intensity;
      this.jointTargets.leftUpperArm = -Math.PI * 0.3 + pump * flex - beatPump;
      this.jointTargets.rightUpperArm = -Math.PI * 0.3 - pump * flex - beatPump;
      this.jointTargets.leftLowerArm = -0.5 - bass * 0.3 * flex;
      this.jointTargets.rightLowerArm = 0.5 + bass * 0.3 * flex;
    } else if (phase === 1) {
      // Arms wave side to side (disco point)
      const wave = Math.sin(time * 6) * intensity;
      this.jointTargets.leftUpperArm = -Math.PI * 0.4 + wave * 0.4 * flex;
      this.jointTargets.rightUpperArm = -Math.PI * 0.1 - wave * 0.3 * flex - beatPump;
      this.jointTargets.leftLowerArm = 0.3;
      this.jointTargets.rightLowerArm = -0.8 - treble * 0.3;
    } else if (phase === 2) {
      // Both arms up (hands in the air)
      const raise = Math.sin(time * 4) * 0.2 * intensity;
      this.jointTargets.leftUpperArm = -Math.PI * 0.6 + raise - beatPump * 0.5;
      this.jointTargets.rightUpperArm = Math.PI * 0.6 - Math.PI - raise - beatPump * 0.5;
      this.jointTargets.leftLowerArm = -0.3 + mid * 0.4 * flex;
      this.jointTargets.rightLowerArm = 0.3 - mid * 0.4 * flex;
    } else {
      // Robot arms (angular movements)
      const robot = Math.floor(time * 4) % 2 === 0 ? 1 : -1;
      this.jointTargets.leftUpperArm = robot * 0.3 * flex;
      this.jointTargets.rightUpperArm = -robot * 0.3 * flex;
      this.jointTargets.leftLowerArm = Math.PI * 0.25 * robot * flex;
      this.jointTargets.rightLowerArm = -Math.PI * 0.25 * robot * flex;
    }

    // LEG CHOREOGRAPHY - stepping dance
    const stepSpeed = 6;
    const stepAmt = 0.4 * intensity * flex;
    const leftPhase = Math.sin(time * stepSpeed);
    const rightPhase = Math.sin(time * stepSpeed + Math.PI);

    // Upper legs - step forward/back
    this.jointTargets.leftUpperLeg = Math.PI * 0.5 + leftPhase * stepAmt;
    this.jointTargets.rightUpperLeg = Math.PI * 0.5 + rightPhase * stepAmt;

    // Knees bend when leg lifts (positive phase = leg forward = knee bends)
    this.jointTargets.leftLowerLeg = Math.max(0, leftPhase * 0.6 * flex) + bass * 0.2;
    this.jointTargets.rightLowerLeg = Math.max(0, rightPhase * 0.6 * flex) + bass * 0.2;

    // Smooth interpolation - faster for snappier movement
    const lerpFactor = 1 - Math.pow(0.0001, deltaTime);
    for (const joint in this.jointAngles) {
      this.jointAngles[joint] += (this.jointTargets[joint] - this.jointAngles[joint]) * lerpFactor;
    }
  }

  private calculateJointPositions(centerX: number, centerY: number): void {
    const { height, width: canvasWidth } = this;
    const scale = Math.min(height, canvasWidth) / 600;

    // Body proportions (relative to figure height)
    const headRadius = 20 * scale;
    const torsoLength = 80 * scale;

    // Base positions
    const neckY = centerY - torsoLength * 0.5;
    const hipY = centerY + torsoLength * 0.5;

    // Store joint positions
    this.joints.head = { x: centerX, y: neckY - headRadius * 2, radius: headRadius };
    this.joints.neck = { x: centerX, y: neckY };
    this.joints.leftShoulder = { x: centerX - 25 * scale, y: neckY };
    this.joints.rightShoulder = { x: centerX + 25 * scale, y: neckY };
    this.joints.hip = { x: centerX, y: hipY };
    this.joints.leftHip = { x: centerX - 20 * scale, y: hipY };
    this.joints.rightHip = { x: centerX + 20 * scale, y: hipY };
  }

  private drawStickFigure(
    ctx: CanvasRenderingContext2D,
    colors: { primary: string; secondary: string; accent: string },
    volume: number,
  ): void {
    ctx.strokeStyle = colors.primary;
    ctx.fillStyle = colors.primary;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Add glow effect for visibility on dark backgrounds
    ctx.shadowColor = colors.accent;
    ctx.shadowBlur = 10 + volume * 20;

    // Draw head
    const head = this.joints.head;
    if (head && head.radius) {
      ctx.beginPath();
      ctx.arc(head.x, head.y, head.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw torso
    const neck = this.joints.neck;
    const hip = this.joints.hip;
    if (neck && hip) {
      ctx.beginPath();
      ctx.moveTo(neck.x, neck.y);
      ctx.lineTo(hip.x, hip.y);
      ctx.stroke();
    }

    // Draw arms with angles
    this.drawArm(ctx, "left");
    this.drawArm(ctx, "right");

    // Draw legs with angles
    this.drawLeg(ctx, "left");
    this.drawLeg(ctx, "right");

    // Reset shadow
    ctx.shadowBlur = 0;
  }

  private drawArm(ctx: CanvasRenderingContext2D, side: "left" | "right"): void {
    const shoulder = side === "left" ? this.joints.leftShoulder : this.joints.rightShoulder;
    const upperArmAngle =
      side === "left" ? this.jointAngles.leftUpperArm : this.jointAngles.rightUpperArm;
    const lowerArmBend =
      side === "left" ? this.jointAngles.leftLowerArm : this.jointAngles.rightLowerArm;
    const armLength = (50 * Math.min(this.height, this.width)) / 600;

    if (!shoulder) return;

    // Upper arm extends from shoulder
    const elbow = {
      x: shoulder.x + Math.cos(upperArmAngle) * armLength,
      y: shoulder.y + Math.sin(upperArmAngle) * armLength,
    };

    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.stroke();

    // Lower arm bends relative to upper arm direction
    const forearmAngle = upperArmAngle + lowerArmBend;
    const hand = {
      x: elbow.x + Math.cos(forearmAngle) * armLength,
      y: elbow.y + Math.sin(forearmAngle) * armLength,
    };

    ctx.beginPath();
    ctx.moveTo(elbow.x, elbow.y);
    ctx.lineTo(hand.x, hand.y);
    ctx.stroke();

    // Store hand position
    if (side === "left") {
      this.joints.leftHand = hand;
    } else {
      this.joints.rightHand = hand;
    }
  }

  private drawLeg(ctx: CanvasRenderingContext2D, side: "left" | "right"): void {
    const hip = side === "left" ? this.joints.leftHip : this.joints.rightHip;
    const upperLegAngle =
      side === "left" ? this.jointAngles.leftUpperLeg : this.jointAngles.rightUpperLeg;
    const lowerLegBend =
      side === "left" ? this.jointAngles.leftLowerLeg : this.jointAngles.rightLowerLeg;
    const legLength = (70 * Math.min(this.height, this.width)) / 600;

    if (!hip) return;

    // Upper leg extends from hip
    const knee = {
      x: hip.x + Math.cos(upperLegAngle) * legLength,
      y: hip.y + Math.sin(upperLegAngle) * legLength,
    };

    ctx.beginPath();
    ctx.moveTo(hip.x, hip.y);
    ctx.lineTo(knee.x, knee.y);
    ctx.stroke();

    // Lower leg bends relative to upper leg (knees bend backward)
    const shinAngle = upperLegAngle - lowerLegBend;
    const foot = {
      x: knee.x + Math.cos(shinAngle) * legLength,
      y: knee.y + Math.sin(shinAngle) * legLength,
    };

    ctx.beginPath();
    ctx.moveTo(knee.x, knee.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Recalculate joint positions for new size
    this.calculateJointPositions(width / 2, height / 2);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as StickFigureConfig;
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
        description: "Multiplier for audio reactivity",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        description: "Color theme for the stick figure",
        default: "cyanMagenta",
        options: COLOR_SCHEME_OPTIONS,
      },
      movementIntensity: {
        type: "number",
        label: "Movement Intensity",
        description: "Overall range of movement",
        default: 1.0,
        min: 0.1,
        max: 2.0,
        step: 0.1,
      },
      jointFlexibility: {
        type: "number",
        label: "Joint Flexibility",
        description: "How much joints can bend",
        default: 0.5,
        min: 0.1,
        max: 1.0,
        step: 0.1,
      },
      bounciness: {
        type: "number",
        label: "Bounciness",
        description: "Body bounce intensity on bass",
        default: 0.5,
        min: 0.0,
        max: 1.0,
        step: 0.1,
      },
    };
  }
}
