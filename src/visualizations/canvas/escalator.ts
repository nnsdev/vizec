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

interface EscalatorConfig extends VisualizationConfig {
  colorScheme: string;
  stepSpeed: number;
  neonIntensity: number;
}

interface Step {
  position: number; // 0-1 along the escalator path
  pulsePhase: number;
}

interface Person {
  stepIndex: number;
  bobPhase: number;
  height: number;
}

export class EscalatorVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "escalator",
    name: "Escalator",
    author: "Vizec",
    description: "Neon-lit escalator steps moving to the beat",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: EscalatorConfig = {
    sensitivity: 1.0,
    colorScheme: "neonCity",
    stepSpeed: 1.0,
    neonIntensity: 1.0,
  };

  private width = 0;
  private height = 0;
  private steps: Step[] = [];
  private people: Person[] = [];
  private time = 0;
  private stepCount = 20;

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
    this.initSteps();
  }

  private initSteps(): void {
    this.steps = [];
    for (let i = 0; i < this.stepCount; i++) {
      this.steps.push({
        position: i / this.stepCount,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, stepSpeed, neonIntensity } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += deltaTime;

    // Escalator path - diagonal across screen
    const startX = this.width * 0.15;
    const startY = this.height * 0.85;
    const endX = this.width * 0.85;
    const endY = this.height * 0.15;
    const escalatorWidth = 120;

    // Side rails
    this.ctx.strokeStyle = `rgba(60, 60, 80, 0.7)`;
    this.ctx.lineWidth = 6;

    // Left rail
    this.ctx.beginPath();
    this.ctx.moveTo(startX - escalatorWidth / 2, startY);
    this.ctx.lineTo(endX - escalatorWidth / 2, endY);
    this.ctx.stroke();

    // Right rail
    this.ctx.beginPath();
    this.ctx.moveTo(startX + escalatorWidth / 2, startY);
    this.ctx.lineTo(endX + escalatorWidth / 2, endY);
    this.ctx.stroke();

    // Moving handrails with glow
    this.ctx.shadowColor = colors.end;
    this.ctx.shadowBlur = 10 * neonIntensity;
    this.ctx.strokeStyle = colors.end;
    this.ctx.lineWidth = 4;

    // Animate handrail segments
    const handrailSegments = 30;
    for (let i = 0; i < handrailSegments; i++) {
      const t1 = ((i / handrailSegments) + this.time * 0.1 * stepSpeed) % 1;
      const t2 = (((i + 0.5) / handrailSegments) + this.time * 0.1 * stepSpeed) % 1;

      if (t2 > t1) {
        const x1 = startX + (endX - startX) * t1 - escalatorWidth / 2 - 10;
        const y1 = startY + (endY - startY) * t1;
        const x2 = startX + (endX - startX) * t2 - escalatorWidth / 2 - 10;
        const y2 = startY + (endY - startY) * t2;

        this.ctx.globalAlpha = 0.3 + bass * 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();

        // Right handrail
        this.ctx.beginPath();
        this.ctx.moveTo(x1 + escalatorWidth + 20, y1);
        this.ctx.lineTo(x2 + escalatorWidth + 20, y2);
        this.ctx.stroke();
      }
    }

    this.ctx.shadowBlur = 0;
    this.ctx.globalAlpha = 1;

    // Update and draw steps
    const speed = 0.1 * stepSpeed * (0.7 + volume * 0.5) * sensitivity;

    for (const step of this.steps) {
      step.position = (step.position + speed * deltaTime) % 1;
      step.pulsePhase += deltaTime * 5;

      const t = step.position;
      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;

      // Step perspective (wider at bottom, narrower at top)
      const perspectiveScale = 1.2 - t * 0.4;
      const stepWidth = escalatorWidth * perspectiveScale;
      const stepHeight = 15 * perspectiveScale;

      // Calculate angle
      const angle = Math.atan2(endY - startY, endX - startX);

      this.ctx.save();
      this.ctx.translate(x, y);
      this.ctx.rotate(angle);

      // Step surface
      const pulse = Math.sin(step.pulsePhase) * 0.3 + 0.7;
      const stepBrightness = 0.5 + mid * pulse * sensitivity;

      // Step edge neon
      this.ctx.shadowColor = colors.start;
      this.ctx.shadowBlur = 15 * neonIntensity * stepBrightness;
      this.ctx.strokeStyle = colors.start;
      this.ctx.lineWidth = 2;
      this.ctx.globalAlpha = stepBrightness;

      // Front edge
      this.ctx.beginPath();
      this.ctx.moveTo(-stepWidth / 2, stepHeight / 2);
      this.ctx.lineTo(stepWidth / 2, stepHeight / 2);
      this.ctx.stroke();

      // Step grooves
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = `rgba(100, 100, 120, ${0.3 * stepBrightness})`;
      this.ctx.lineWidth = 1;
      for (let g = -stepWidth / 2 + 10; g < stepWidth / 2; g += 8) {
        this.ctx.beginPath();
        this.ctx.moveTo(g, -stepHeight / 2);
        this.ctx.lineTo(g, stepHeight / 2);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }

    // Spawn people occasionally on bass
    if (bass > 0.6 && Math.random() < 0.02 && this.people.length < 5) {
      this.people.push({
        stepIndex: 0,
        bobPhase: Math.random() * Math.PI * 2,
        height: 30 + Math.random() * 20,
      });
    }

    // Update and draw people (stick figures)
    for (let i = this.people.length - 1; i >= 0; i--) {
      const person = this.people[i];

      // Find closest step
      const targetStep = this.steps[Math.floor(person.stepIndex) % this.steps.length];
      const t = targetStep.position;

      if (t > 0.95) {
        this.people.splice(i, 1);
        continue;
      }

      const x = startX + (endX - startX) * t;
      const y = startY + (endY - startY) * t;
      const perspectiveScale = 1.2 - t * 0.4;

      person.bobPhase += deltaTime * 3;
      const bob = Math.sin(person.bobPhase) * 3;

      // Simple stick figure
      const h = person.height * perspectiveScale;
      this.ctx.strokeStyle = `rgba(200, 200, 220, ${0.5 + treble * 0.3})`;
      this.ctx.lineWidth = 2;
      this.ctx.lineCap = "round";

      // Head
      this.ctx.beginPath();
      this.ctx.arc(x, y - h + bob, 6 * perspectiveScale, 0, Math.PI * 2);
      this.ctx.stroke();

      // Body
      this.ctx.beginPath();
      this.ctx.moveTo(x, y - h + 10 * perspectiveScale + bob);
      this.ctx.lineTo(x, y - h / 2 + bob);
      this.ctx.stroke();

      // Arms (swaying)
      const armSway = Math.sin(person.bobPhase * 2) * 5;
      this.ctx.beginPath();
      this.ctx.moveTo(x - 8 * perspectiveScale + armSway, y - h + 20 * perspectiveScale + bob);
      this.ctx.lineTo(x, y - h + 15 * perspectiveScale + bob);
      this.ctx.lineTo(x + 8 * perspectiveScale - armSway, y - h + 20 * perspectiveScale + bob);
      this.ctx.stroke();

      // Legs
      this.ctx.beginPath();
      this.ctx.moveTo(x - 5 * perspectiveScale, y + bob);
      this.ctx.lineTo(x, y - h / 2 + bob);
      this.ctx.lineTo(x + 5 * perspectiveScale, y + bob);
      this.ctx.stroke();

      person.stepIndex += speed * deltaTime * 10;
    }

    // Add ambient glow at entry/exit
    const entryGlow = this.ctx.createRadialGradient(
      startX, startY, 0,
      startX, startY, 100
    );
    entryGlow.addColorStop(0, `rgba(${this.hexToRgb(colors.start)}, ${0.2 * neonIntensity})`);
    entryGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = entryGlow;
    this.ctx.fillRect(startX - 100, startY - 100, 200, 200);

    const exitGlow = this.ctx.createRadialGradient(
      endX, endY, 0,
      endX, endY, 100
    );
    exitGlow.addColorStop(0, `rgba(${this.hexToRgb(colors.end)}, ${0.2 * neonIntensity})`);
    exitGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    this.ctx.fillStyle = exitGlow;
    this.ctx.fillRect(endX - 100, endY - 100, 200, 200);

    this.ctx.globalAlpha = 1;
  }

  private hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
    }
    return "255, 255, 255";
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
    this.config = { ...this.config, ...config } as EscalatorConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.steps = [];
    this.people = [];
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
      stepSpeed: {
        type: "number",
        label: "Step Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      neonIntensity: {
        type: "number",
        label: "Neon Intensity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
