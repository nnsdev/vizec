import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface TrafficTrailsConfig extends VisualizationConfig {
  speedMultiplier: number;
  density: number;
  trailLength: number;
  verticalSpread: number; // 0-1, how much of the screen height to use
  perspective: boolean;
  colorScheme: string;
}

interface TrafficLight {
  x: number;
  y: number;
  z: number; // For perspective scaling
  speed: number;
  length: number;
  color: string;
  direction: 1 | -1; // 1 = right (tail lights), -1 = left (headlights)
  thickness: number;
  alpha: number;
}

export class TrafficTrailsVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "trafficTrails",
    name: "Traffic Trails",
    author: "Vizec",
    description: "Long-exposure city traffic lights moving at high speed",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: TrafficTrailsConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    speedMultiplier: 1.0,
    density: 1.0,
    trailLength: 1.0,
    verticalSpread: 0.6,
    perspective: true,
  };

  private width = 0;
  private height = 0;
  private lights: TrafficLight[] = [];
  private spawnTimer = 0;

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

    const { bass, treble, mid, volume } = audioData;
    const {
      sensitivity,
      speedMultiplier,
      density,
      trailLength,
      verticalSpread,
      perspective,
      colorScheme,
    } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Spawn logic
    // Bass triggers "tail lights" (usually red/warm - moving away/right)
    // Treble/Mid triggers "head lights" (usually white/cool - moving close/left)

    const frameScale = deltaTime / 16.67;
    this.spawnTimer += deltaTime;

    // Normalize spawn rate based on density
    const spawnThreshold = 60 / density;

    if (this.spawnTimer > spawnThreshold) {
      this.spawnTimer = 0;

      // Baseline probability for "idle" traffic so the road isn't empty
      const baseline = 0.1;

      // Calculate spawn probability based on audio + baseline
      // Bass is punchy, so it spawns bursts (tail lights)
      if (Math.random() < bass * sensitivity + baseline) {
        this.spawnLight(1, colors.end, Math.max(bass, 0.2));
      } else
      // Treble is continuous, spawns stream (headlights)
      if (Math.random() < (treble * 1.5 + mid * 0.5) * sensitivity + baseline) {
        this.spawnLight(-1, colors.start, Math.max((treble + mid) / 2, 0.2));
      }
    }

    // Update and Draw
    // Sort by Z for proper perspective drawing (back to front)
    // In our case, higher Y is "closer" in typical road perspective (bottom of screen is close)
    // Or if we do a center-vanishing point perspective:
    // Let's do a simple "horizon is at center" or "horizon is variable".
    // Let's stick to: Horizon is at centerY.
    // Top half: maybe sky? Or we just draw roads on bottom half?
    // "Cityscapes" usually implies we look at a road.
    // Let's use full height or Configurable spread.

    const centerY = this.height / 2;
    // Horizon is at centerY

    // Filter out dead lights
    this.lights = this.lights.filter((light) => {
      // Update position
      // Speed scales with audio volume slightly for "turbo boost" feel (reduced by 4x)
      const boost = 1 + volume * 0.125 * sensitivity;
      light.x += light.speed * light.direction * speedMultiplier * boost * frameScale;

      // Draw

      // Perspective calculations
      let renderY = light.y;
      let renderH = light.thickness;
      let renderX = light.x;
      let renderL = light.length * trailLength * (1 + light.speed * 0.1);

      if (perspective) {
        const roadHeight = this.height * verticalSpread;
        const yOffset = (light.z - 0.5) * roadHeight;
        renderY = centerY + yOffset;

        const scale = 0.5 + light.z * 1.5;
        renderH *= scale;
        renderL *= scale;
      }

      // If off screen in Y, don't draw
      if (renderY < -50 || renderY > this.height + 50) return true;

      this.ctx!.fillStyle = light.color;
      this.ctx!.globalAlpha = Math.max(0.3, light.alpha);

      // Draw a rounded rect or just a rect with gradient trail
      // Trail should fade out at the tail.
      // Direction 1 (Right): Tail is left. Gradient Right(Opaque) -> Left(Transparent)
      // Direction -1 (Left): Tail is right. Gradient Left(Opaque) -> Right(Transparent)

      const grad = this.ctx!.createLinearGradient(
        renderX,
        0,
        renderX + renderL * -light.direction,
        0,
      );
      grad.addColorStop(0, light.color);
      grad.addColorStop(1, "rgba(0,0,0,0)");

      this.ctx!.fillStyle = grad;

      // To avoid "sharp" look, use a thin rect
      this.ctx!.fillRect(
        light.direction === 1 ? renderX - renderL : renderX,
        renderY - renderH / 2,
        renderL,
        renderH,
      );

      // Check bounds using ORIGINAL length (not scaled)
      const checkL = light.length * trailLength * (1 + light.speed * 0.1);
      if (light.direction === 1 && light.x - checkL > this.width) return false;
      if (light.direction === -1 && light.x + checkL < 0) return false;

      return true;
    });

    this.ctx.globalAlpha = 1.0;
  }

  private spawnLight(direction: 1 | -1, color: string, intensity: number): void {
    // Z determines "depth" (0=far, 1=close)
    // Random Z, but bias towards density? Uniform is fine.
    const z = Math.random();

    // Y offset is derived from Z in render, or we just store Z.

    // Speed: Closer objects appear faster.
    // Base speed + Z boost
    const baseSpeed = 10 + Math.random() * 5;
    const zSpeed = baseSpeed * (0.5 + z * 1.5); // Far=Slow, Close=Fast

    // Start Position
    // Right (1): Start at -length (left side)
    // Left (-1): Start at width + length (right side)
    const startX = direction === 1 ? -100 : this.width + 100;

    // Thickness
    const thickness = 2 + intensity * 4; // Louder = thicker lights

    // Length
    const length = 50 + Math.random() * 100 + intensity * 100;

    this.lights.push({
      x: startX,
      y: 0, // Calculated in render based on Z
      z,
      speed: zSpeed,
      length,
      color,
      direction,
      thickness,
      alpha: 0.5 + Math.random() * 0.5,
    });
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
    this.config = { ...this.config, ...config } as TrafficTrailsConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.lights = [];
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
        default: "cyanMagenta",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      speedMultiplier: {
        type: "number",
        label: "Traffic Speed",
        default: 1.0,
        min: 0.1,
        max: 5.0,
        step: 0.1,
      },
      density: {
        type: "number",
        label: "Traffic Density",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      trailLength: {
        type: "number",
        label: "Trail Length",
        default: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.1,
      },
      verticalSpread: {
        type: "number",
        label: "Road Width",
        default: 0.6,
        min: 0.1,
        max: 1.0,
        step: 0.1,
      },
      perspective: {
        type: "boolean",
        label: "3D Perspective",
        default: true,
      },
    };
  }
}
