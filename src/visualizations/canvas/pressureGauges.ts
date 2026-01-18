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

interface PressureGaugesConfig extends VisualizationConfig {
  gaugeCount: number;
  gaugeSize: number;
  colorScheme: string;
}

interface Gauge {
  x: number;
  y: number;
  radius: number;
  label: string;
  audioSource: "bass" | "mid" | "treble" | "volume";
  currentValue: number;
  targetValue: number;
  dangerZone: number;
}

export class PressureGaugesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "pressureGauges",
    name: "Pressure Gauges",
    author: "Vizec",
    description: "Victorian-style pressure gauges reacting to audio levels",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PressureGaugesConfig = {
    sensitivity: 1.0,
    gaugeCount: 4,
    gaugeSize: 1.0,
    colorScheme: "golden",
  };
  private width = 0;
  private height = 0;
  private gauges: Gauge[] = [];
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

  private initGauges(): void {
    this.gauges = [];
    const { gaugeCount, gaugeSize } = this.config;

    const audioSources: Array<"bass" | "mid" | "treble" | "volume"> = ["bass", "mid", "treble", "volume"];
    const labels = ["BASS", "MID", "TREBLE", "VOLUME"];

    // Calculate gauge layout
    const baseRadius = Math.min(this.width, this.height) * 0.12 * gaugeSize;
    const spacing = baseRadius * 2.8;

    // Center the gauges
    const totalWidth = (gaugeCount - 1) * spacing;
    const startX = (this.width - totalWidth) / 2;
    const centerY = this.height / 2;

    for (let i = 0; i < gaugeCount; i++) {
      this.gauges.push({
        x: startX + i * spacing,
        y: centerY,
        radius: baseRadius * (0.9 + Math.random() * 0.2),
        label: labels[i % labels.length],
        audioSource: audioSources[i % audioSources.length],
        currentValue: 0,
        targetValue: 0,
        dangerZone: 0.7 + Math.random() * 0.2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme } = this.config;
    const { volume, bass, mid, treble } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Clear canvas (transparent background)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update and draw each gauge
    this.gauges.forEach((gauge) => {
      // Get target value from audio source
      let targetValue = 0;
      switch (gauge.audioSource) {
        case "bass":
          targetValue = bass * sensitivity;
          break;
        case "mid":
          targetValue = mid * sensitivity;
          break;
        case "treble":
          targetValue = treble * sensitivity;
          break;
        case "volume":
          targetValue = volume * sensitivity;
          break;
      }

      // Clamp to 0-1 range
      targetValue = Math.min(1, targetValue);
      gauge.targetValue = targetValue;

      // Smooth needle movement
      const smoothing = 0.12;
      gauge.currentValue += (gauge.targetValue - gauge.currentValue) * smoothing;

      // Draw the gauge
      this.drawGauge(gauge, colors);
    });

    // Draw connecting pipes
    this.drawConnectingPipes(colors);
  }

  private drawGauge(
    gauge: Gauge,
    colors: { start: string; end: string; glow: string }
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const { x, y, radius, label, currentValue, dangerZone } = gauge;

    // Outer brass bezel
    const bezelGradient = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
    bezelGradient.addColorStop(0, "#c4a144");
    bezelGradient.addColorStop(0.3, "#d4b154");
    bezelGradient.addColorStop(0.5, "#e4c164");
    bezelGradient.addColorStop(0.7, "#c4a144");
    bezelGradient.addColorStop(1, "#a48134");

    ctx.beginPath();
    ctx.arc(x, y, radius * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = bezelGradient;
    ctx.fill();

    // Bezel shadow/depth ring
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.05, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Glass face background
    const glassGradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, 0, x, y, radius);
    glassGradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    glassGradient.addColorStop(0.5, "rgba(200, 200, 200, 0.08)");
    glassGradient.addColorStop(1, "rgba(150, 150, 150, 0.05)");

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30, 25, 20, 0.85)";
    ctx.fill();
    ctx.fillStyle = glassGradient;
    ctx.fill();

    // Draw gauge zones (green, yellow, red)
    const startAngle = Math.PI * 0.75;
    const endAngle = Math.PI * 2.25;
    const angleRange = endAngle - startAngle;

    // Green zone
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.85, startAngle, startAngle + angleRange * dangerZone * 0.7, false);
    ctx.arc(x, y, radius * 0.65, startAngle + angleRange * dangerZone * 0.7, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = "rgba(50, 180, 80, 0.3)";
    ctx.fill();

    // Yellow zone
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.85, startAngle + angleRange * dangerZone * 0.7, startAngle + angleRange * dangerZone, false);
    ctx.arc(x, y, radius * 0.65, startAngle + angleRange * dangerZone, startAngle + angleRange * dangerZone * 0.7, true);
    ctx.closePath();
    ctx.fillStyle = "rgba(220, 180, 50, 0.4)";
    ctx.fill();

    // Red zone (danger)
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.85, startAngle + angleRange * dangerZone, endAngle, false);
    ctx.arc(x, y, radius * 0.65, endAngle, startAngle + angleRange * dangerZone, true);
    ctx.closePath();
    ctx.fillStyle = "rgba(200, 50, 50, 0.4)";
    ctx.fill();

    // Draw tick marks
    const tickCount = 10;
    for (let i = 0; i <= tickCount; i++) {
      const tickAngle = startAngle + (i / tickCount) * angleRange;
      const isMajor = i % 2 === 0;
      const innerRadius = radius * (isMajor ? 0.55 : 0.6);
      const outerRadius = radius * 0.65;

      const x1 = x + Math.cos(tickAngle) * innerRadius;
      const y1 = y + Math.sin(tickAngle) * innerRadius;
      const x2 = x + Math.cos(tickAngle) * outerRadius;
      const y2 = y + Math.sin(tickAngle) * outerRadius;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isMajor ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.stroke();

      // Draw numbers on major ticks
      if (isMajor) {
        const numberRadius = radius * 0.45;
        const nx = x + Math.cos(tickAngle) * numberRadius;
        const ny = y + Math.sin(tickAngle) * numberRadius;
        const value = i * 10;

        ctx.font = `${radius * 0.12}px Arial`;
        ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(value.toString(), nx, ny);
      }
    }

    // Draw label
    ctx.font = `bold ${radius * 0.14}px Arial`;
    ctx.fillStyle = colors.glow;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y + radius * 0.3);

    // Draw unit label
    ctx.font = `${radius * 0.1}px Arial`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("PSI", x, y + radius * 0.45);

    // Calculate needle angle
    const needleAngle = startAngle + currentValue * angleRange;

    // Draw needle glow when in danger zone
    if (currentValue > dangerZone) {
      const glowIntensity = (currentValue - dangerZone) / (1 - dangerZone);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + Math.cos(needleAngle) * radius * 0.75,
        y + Math.sin(needleAngle) * radius * 0.75
      );
      ctx.strokeStyle = `rgba(255, 50, 50, ${glowIntensity * 0.5})`;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.stroke();
    }

    // Draw needle shadow
    ctx.beginPath();
    ctx.moveTo(x + 2, y + 2);
    ctx.lineTo(
      x + Math.cos(needleAngle) * radius * 0.7 + 2,
      y + Math.sin(needleAngle) * radius * 0.7 + 2
    );
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();

    // Draw needle
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x + Math.cos(needleAngle) * radius * 0.7,
      y + Math.sin(needleAngle) * radius * 0.7
    );
    ctx.strokeStyle = currentValue > dangerZone ? "#ff3333" : colors.end;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();

    // Draw needle back extension
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(
      x + Math.cos(needleAngle + Math.PI) * radius * 0.15,
      y + Math.sin(needleAngle + Math.PI) * radius * 0.15
    );
    ctx.strokeStyle = currentValue > dangerZone ? "#ff3333" : colors.end;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.stroke();

    // Draw center hub
    const hubGradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.1);
    hubGradient.addColorStop(0, "#d4b154");
    hubGradient.addColorStop(0.5, "#a48134");
    hubGradient.addColorStop(1, "#745824");

    ctx.beginPath();
    ctx.arc(x, y, radius * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = hubGradient;
    ctx.fill();

    // Center hub highlight
    ctx.beginPath();
    ctx.arc(x - radius * 0.03, y - radius * 0.03, radius * 0.04, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();

    // Glass reflection
    ctx.beginPath();
    ctx.ellipse(x - radius * 0.3, y - radius * 0.3, radius * 0.4, radius * 0.2, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
    ctx.fill();
  }

  private drawConnectingPipes(_colors: { start: string; end: string; glow: string }): void {
    if (!this.ctx || this.gauges.length < 2) return;

    const ctx = this.ctx;

    for (let i = 0; i < this.gauges.length - 1; i++) {
      const gauge1 = this.gauges[i];
      const gauge2 = this.gauges[i + 1];

      const y1 = gauge1.y + gauge1.radius * 1.2;
      const y2 = gauge2.y + gauge2.radius * 1.2;

      // Draw pipe shadow
      ctx.beginPath();
      ctx.moveTo(gauge1.x + 2, y1 + 2);
      ctx.lineTo(gauge2.x + 2, y2 + 2);
      ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
      ctx.lineWidth = 10;
      ctx.stroke();

      // Draw pipe
      const pipeGradient = ctx.createLinearGradient(gauge1.x, y1 - 5, gauge1.x, y1 + 5);
      pipeGradient.addColorStop(0, "#a48134");
      pipeGradient.addColorStop(0.3, "#d4b154");
      pipeGradient.addColorStop(0.7, "#c4a144");
      pipeGradient.addColorStop(1, "#946b24");

      ctx.beginPath();
      ctx.moveTo(gauge1.x, y1);
      ctx.lineTo(gauge2.x, y2);
      ctx.strokeStyle = pipeGradient;
      ctx.lineWidth = 8;
      ctx.stroke();

      // Pipe highlight
      ctx.beginPath();
      ctx.moveTo(gauge1.x, y1 - 2);
      ctx.lineTo(gauge2.x, y2 - 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw joints
      [gauge1.x, gauge2.x].forEach((jx, ji) => {
        const jy = ji === 0 ? y1 : y2;

        ctx.beginPath();
        ctx.arc(jx, jy, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#b49144";
        ctx.fill();
        ctx.strokeStyle = "#745824";
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initGauges();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldCount = this.config.gaugeCount;
    const oldSize = this.config.gaugeSize;
    this.config = { ...this.config, ...config } as PressureGaugesConfig;

    if ((this.config.gaugeCount !== oldCount || this.config.gaugeSize !== oldSize) && this.width > 0) {
      this.initGauges();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.gauges = [];
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
        default: "golden",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      gaugeCount: {
        type: "number",
        label: "Gauge Count",
        default: 4,
        min: 2,
        max: 5,
        step: 1,
      },
      gaugeSize: {
        type: "number",
        label: "Gauge Size",
        default: 1.0,
        min: 0.5,
        max: 1.5,
        step: 0.1,
      },
    };
  }
}
