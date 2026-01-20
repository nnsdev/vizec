import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface SubwayTrainConfig extends VisualizationConfig {
  colorScheme: string;
  trainSpeed: number;
  windowGlow: number;
}

interface TrainCar {
  x: number;
  windows: Array<{ lit: boolean; brightness: number; flickerPhase: number }>;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export class SubwayTrainVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "subwayTrain",
    name: "Subway Train",
    author: "Vizec",
    description: "Late night subway cars passing with lit windows",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: SubwayTrainConfig = {
    sensitivity: 1.0,
    colorScheme: "warmSunset",
    trainSpeed: 1.0,
    windowGlow: 1.0,
  };

  private width = 0;
  private height = 0;
  private cars: TrainCar[] = [];
  private sparks: Spark[] = [];
  private time = 0;
  private nextSpawnTime = 0;

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

    // Spawn initial train immediately, starting visible
    this.spawnTrain(200, true);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    // Clamp deltaTime to prevent issues on first frame
    const dt = Math.min(deltaTime, 0.05);

    const { bass, mid, volume } = audioData;
    const { sensitivity, colorScheme, trainSpeed, windowGlow } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);
    this.time += dt;

    const carWidth = 200;
    const carHeight = 80;

    // Force spawn cars if none exist and dimensions are valid
    if (this.cars.length === 0 && this.width > 0) {
      this.spawnTrain(carWidth, true);
    }

    const windowWidth = 25;
    const windowHeight = 40;
    const windowGap = 10;
    const trainY = this.height * 0.5;

    // Spawn new train periodically
    if (this.time > this.nextSpawnTime && this.cars.length < 12) {
      this.spawnTrain(carWidth, false);
      this.nextSpawnTime = this.time + 4 + Math.random() * 4;
    }

    // Track rail effect
    const railY = trainY + carHeight / 2 + 5;
    this.ctx.strokeStyle = `rgba(100, 100, 100, 0.3)`;
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, railY);
    this.ctx.lineTo(this.width, railY);
    this.ctx.stroke();

    // Update and draw cars
    const speed = (4 + volume * 2) * trainSpeed * sensitivity; // Slower base speed

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      car.x += speed * dt * 60;

      // Remove off-screen cars (only after they fully exit right side)
      if (car.x > this.width + carWidth + 50) {
        this.cars.splice(i, 1);
        continue;
      }

      // Car body - more visible with gradient
      const carGradient = this.ctx.createLinearGradient(
        car.x,
        trainY - carHeight / 2,
        car.x,
        trainY + carHeight / 2,
      );
      carGradient.addColorStop(0, "rgba(70, 75, 85, 0.95)");
      carGradient.addColorStop(0.5, "rgba(50, 55, 65, 0.95)");
      carGradient.addColorStop(1, "rgba(40, 45, 55, 0.95)");
      this.ctx.fillStyle = carGradient;
      this.ctx.fillRect(car.x, trainY - carHeight / 2, carWidth, carHeight);

      // Car outline - brighter
      this.ctx.strokeStyle = `rgba(100, 105, 115, 0.8)`;
      this.ctx.lineWidth = 3;
      this.ctx.strokeRect(car.x, trainY - carHeight / 2, carWidth, carHeight);

      // Car roof line
      this.ctx.strokeStyle = `rgba(120, 125, 135, 0.6)`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(car.x, trainY - carHeight / 2 + 5);
      this.ctx.lineTo(car.x + carWidth, trainY - carHeight / 2 + 5);
      this.ctx.stroke();

      // Door lines
      this.ctx.strokeStyle = `rgba(80, 85, 95, 0.6)`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(car.x + carWidth * 0.3, trainY - carHeight / 2 + 10);
      this.ctx.lineTo(car.x + carWidth * 0.3, trainY + carHeight / 2 - 5);
      this.ctx.moveTo(car.x + carWidth * 0.7, trainY - carHeight / 2 + 10);
      this.ctx.lineTo(car.x + carWidth * 0.7, trainY + carHeight / 2 - 5);
      this.ctx.stroke();

      // Windows
      const windowY = trainY - windowHeight / 2 - 5;
      let windowX = car.x + 20;

      for (let w = 0; w < car.windows.length; w++) {
        const window = car.windows[w];

        // Update flicker based on audio
        window.flickerPhase += dt * 10;
        if (window.lit) {
          const flicker = Math.sin(window.flickerPhase) * 0.1;
          window.brightness = 0.6 + mid * 0.4 * windowGlow + flicker;
        }

        // Window glow
        if (window.lit) {
          const glowColor = colors.start;
          const brightness = window.brightness;

          // Outer glow
          this.ctx.shadowColor = glowColor;
          this.ctx.shadowBlur = 20 * windowGlow;
          this.ctx.fillStyle = glowColor;
          this.ctx.globalAlpha = brightness * 0.3;
          this.ctx.fillRect(windowX - 5, windowY - 5, windowWidth + 10, windowHeight + 10);

          // Window
          this.ctx.shadowBlur = 0;
          this.ctx.globalAlpha = brightness;
          this.ctx.fillStyle = colors.mid;
          this.ctx.fillRect(windowX, windowY, windowWidth, windowHeight);

          // Interior warm light
          const gradient = this.ctx.createLinearGradient(
            windowX,
            windowY,
            windowX,
            windowY + windowHeight,
          );
          gradient.addColorStop(0, `rgba(255, 220, 150, ${brightness * 0.5})`);
          gradient.addColorStop(1, `rgba(255, 180, 100, ${brightness * 0.3})`);
          this.ctx.fillStyle = gradient;
          this.ctx.fillRect(windowX, windowY, windowWidth, windowHeight);
        } else {
          // Dark window
          this.ctx.globalAlpha = 0.5;
          this.ctx.fillStyle = "rgba(20, 20, 30, 0.8)";
          this.ctx.fillRect(windowX, windowY, windowWidth, windowHeight);
        }

        this.ctx.globalAlpha = 1;
        windowX += windowWidth + windowGap;
      }

      // Wheels
      this.ctx.fillStyle = "rgba(40, 40, 50, 0.9)";
      const wheelY = trainY + carHeight / 2 - 5;
      const wheelRadius = 8;
      // Front wheels
      this.ctx.beginPath();
      this.ctx.arc(car.x + 30, wheelY, wheelRadius, 0, Math.PI * 2);
      this.ctx.arc(car.x + 60, wheelY, wheelRadius, 0, Math.PI * 2);
      this.ctx.fill();
      // Back wheels
      this.ctx.beginPath();
      this.ctx.arc(car.x + carWidth - 30, wheelY, wheelRadius, 0, Math.PI * 2);
      this.ctx.arc(car.x + carWidth - 60, wheelY, wheelRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // Wheel sparks on bass hits
      if (bass > 0.7 && Math.random() < 0.3) {
        this.createSparks(car.x + carWidth / 2, railY, colors.end);
      }
    }

    // Update and draw sparks
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const spark = this.sparks[i];
      spark.x += spark.vx * dt * 60;
      spark.y += spark.vy * dt * 60;
      spark.vy += 0.3 * dt * 60;
      spark.life -= dt * 2;

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
    this.ctx.shadowBlur = 0;
  }

  private spawnTrain(carWidth: number, startVisible = false): void {
    const numCars = 3 + Math.floor(Math.random() * 3);

    for (let i = 0; i < numCars; i++) {
      const windows: TrainCar["windows"] = [];
      for (let w = 0; w < 5; w++) {
        windows.push({
          lit: Math.random() > 0.2, // More lit windows
          brightness: 0.7 + Math.random() * 0.3,
          flickerPhase: Math.random() * Math.PI * 2,
        });
      }

      // Start visible on screen or off-screen
      const startX = startVisible
        ? i * (carWidth + 10) // Start from left edge, visible
        : -(i + 1) * (carWidth + 10); // Start off-screen

      this.cars.push({
        x: startX,
        windows,
      });
    }
  }

  private createSparks(x: number, y: number, color: string): void {
    for (let i = 0; i < 5; i++) {
      this.sparks.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 2,
        life: 0.5 + Math.random() * 0.5,
        color,
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as SubwayTrainConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.cars = [];
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
      trainSpeed: {
        type: "number",
        label: "Train Speed",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      windowGlow: {
        type: "number",
        label: "Window Glow",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
