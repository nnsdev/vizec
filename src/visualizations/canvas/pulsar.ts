import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

const COLOR_SCHEMES: Record<
  string,
  {
    core: string;
    beam: string;
    jets: string;
    glow: string;
    stars: string;
    accent: string;
  }
> = {
  magnetar: {
    core: "#00ffff",
    beam: "#ffffff",
    jets: "#ff00ff",
    glow: "#00aaff",
    stars: "#aaddff",
    accent: "#00ffaa",
  },
  xray: {
    core: "#ff00ff",
    beam: "#ffffff",
    jets: "#00ffff",
    glow: "#ff00aa",
    stars: "#ffccff",
    accent: "#aa00ff",
  },
  radio: {
    core: "#ff6600",
    beam: "#ffff00",
    jets: "#ff3300",
    glow: "#ffaa00",
    stars: "#ffffcc",
    accent: "#ff8800",
  },
  gamma: {
    core: "#00ff00",
    beam: "#ffffff",
    jets: "#88ff00",
    glow: "#00ff44",
    stars: "#ccffcc",
    accent: "#44ff00",
  },
  millisecond: {
    core: "#ffffff",
    beam: "#00ffff",
    jets: "#ff00ff",
    glow: "#aaaaff",
    stars: "#ffffff",
    accent: "#88aaff",
  },
  binary: {
    core: "#ff3366",
    beam: "#ffff00",
    jets: "#ff6600",
    glow: "#ff0066",
    stars: "#ffccdd",
    accent: "#ff9900",
  },
};

interface JetParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  angle: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  brightness: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface PulsarConfig extends VisualizationConfig {
  colorScheme: string;
  beamWidth: number;
  beamLength: number;
  rotationSpeed: number;
  jetIntensity: number;
  coreSize: number;
  starCount: number;
}

export class PulsarVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "pulsar",
    name: "Pulsar",
    author: "Vizec",
    description: "Rotating neutron star with sweeping light beams that pulse with the beat",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  readonly id = (this.constructor as any).meta.id;
  readonly name = (this.constructor as any).meta.name;
  readonly author = (this.constructor as any).meta.author;
  readonly description = (this.constructor as any).meta.description;
  readonly renderer = (this.constructor as any).meta.renderer;
  readonly transitionType = (this.constructor as any).meta.transitionType;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  private config: PulsarConfig = {
    sensitivity: 1.0,
    colorScheme: "magnetar",
    beamWidth: 15,
    beamLength: 1.0,
    rotationSpeed: 1.0,
    jetIntensity: 1.0,
    coreSize: 30,
    starCount: 200,
  };

  private rotation = 0;
  private jetParticles: JetParticle[] = [];
  private stars: Star[] = [];

  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private volumeSmooth = 0;
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

    this.initStars();
  }

  private initStars(): void {
    this.stars = [];
    const { starCount } = this.config;

    for (let i = 0; i < starCount; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: 0.5 + Math.random() * 2,
        brightness: 0.3 + Math.random() * 0.7,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.5 + Math.random() * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const {
      sensitivity,
      colorScheme,
      beamWidth,
      beamLength,
      rotationSpeed,
      jetIntensity,
      coreSize,
    } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.magnetar;

    this.time += deltaTime;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;
    this.volumeSmooth += (volume - this.volumeSmooth) * smoothing;

    const bassBoost = Math.pow(this.bassSmooth, 0.7) * sensitivity;
    const midBoost = Math.pow(this.midSmooth, 0.7) * sensitivity;
    const trebleBoost = Math.pow(this.trebleSmooth, 0.7) * sensitivity;
    const volumeBoost = Math.pow(this.volumeSmooth, 0.5) * sensitivity;

    // Clear canvas for transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;

    // Update rotation - speed increases with mid frequencies
    this.rotation += deltaTime * rotationSpeed * 2 * (1 + midBoost * 2);

    // Draw stars
    this.drawStars(colors, trebleBoost);

    // Draw particle jets from poles
    this.updateAndDrawJets(
      centerX,
      centerY,
      colors,
      bassBoost,
      trebleBoost,
      jetIntensity,
      deltaTime,
    );

    // Draw light beams
    this.drawBeams(centerX, centerY, colors, beamWidth, beamLength, bassBoost, volumeBoost);

    // Draw magnetic field lines
    this.drawMagneticField(centerX, centerY, colors, midBoost);

    // Draw core (neutron star)
    this.drawCore(centerX, centerY, colors, coreSize, bassBoost, volumeBoost);

    // Draw corona/atmosphere
    this.drawCorona(centerX, centerY, colors, coreSize, volumeBoost);
  }

  private drawStars(colors: (typeof COLOR_SCHEMES)["magnetar"], trebleBoost: number): void {
    if (!this.ctx) return;

    for (const star of this.stars) {
      star.twinklePhase += star.twinkleSpeed * 0.02;
      const twinkle = 0.5 + 0.5 * Math.sin(star.twinklePhase);

      const alpha = star.brightness * twinkle * (0.5 + trebleBoost * 0.5);
      this.ctx.globalAlpha = alpha * 0.7;
      this.ctx.fillStyle = colors.stars;
      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1.0;
  }

  private updateAndDrawJets(
    centerX: number,
    centerY: number,
    colors: (typeof COLOR_SCHEMES)["magnetar"],
    bassBoost: number,
    trebleBoost: number,
    intensity: number,
    deltaTime: number,
  ): void {
    if (!this.ctx) return;

    // Spawn new particles from poles
    const spawnRate = 5 + bassBoost * 10;
    const { coreSize } = this.config;

    for (let i = 0; i < spawnRate; i++) {
      // Top jet
      const topAngle = -Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      const speed = 2 + Math.random() * 3 + bassBoost * 5;
      this.jetParticles.push({
        x: centerX + (Math.random() - 0.5) * coreSize * 0.3,
        y: centerY - coreSize * 0.5,
        vx: Math.cos(topAngle) * speed,
        vy: Math.sin(topAngle) * speed,
        life: 1.0,
        maxLife: 1.0,
        size: 1 + Math.random() * 3 + bassBoost * 2,
        angle: topAngle,
      });

      // Bottom jet
      const bottomAngle = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
      this.jetParticles.push({
        x: centerX + (Math.random() - 0.5) * coreSize * 0.3,
        y: centerY + coreSize * 0.5,
        vx: Math.cos(bottomAngle) * speed,
        vy: Math.sin(bottomAngle) * speed,
        life: 1.0,
        maxLife: 1.0,
        size: 1 + Math.random() * 3 + bassBoost * 2,
        angle: bottomAngle,
      });
    }

    // Update and draw particles
    for (let i = this.jetParticles.length - 1; i >= 0; i--) {
      const p = this.jetParticles[i];

      // Update position
      p.x += p.vx * deltaTime * 60;
      p.y += p.vy * deltaTime * 60;

      // Slight spread
      p.vx += (Math.random() - 0.5) * 0.2;

      // Decay
      p.life -= deltaTime * 0.8;

      // Remove dead particles
      if (p.life <= 0 || p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
        this.jetParticles.splice(i, 1);
        continue;
      }

      // Draw particle
      const alpha = p.life * intensity * 0.7;
      this.ctx.globalAlpha = alpha;
      this.ctx.fillStyle = colors.jets;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      this.ctx.fill();

      // Glow
      if (p.life > 0.5) {
        const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        gradient.addColorStop(0, colors.jets + "60");
        gradient.addColorStop(1, "transparent");
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Limit particle count
    if (this.jetParticles.length > 500) {
      this.jetParticles.splice(0, this.jetParticles.length - 500);
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawBeams(
    centerX: number,
    centerY: number,
    colors: (typeof COLOR_SCHEMES)["magnetar"],
    beamWidth: number,
    beamLength: number,
    bassBoost: number,
    volumeBoost: number,
  ): void {
    if (!this.ctx) return;

    const maxLength = Math.max(this.width, this.height) * beamLength;
    const actualBeamWidth = beamWidth * (1 + bassBoost * 0.5);

    // Draw two opposing beams
    for (let beam = 0; beam < 2; beam++) {
      const beamAngle = this.rotation + beam * Math.PI;

      // Calculate beam endpoints
      const endX = centerX + Math.cos(beamAngle) * maxLength;
      const endY = centerY + Math.sin(beamAngle) * maxLength;

      // Main beam gradient
      const gradient = this.ctx.createLinearGradient(centerX, centerY, endX, endY);
      const baseAlpha = 0.6 + volumeBoost * 0.4;

      gradient.addColorStop(0, colors.beam + "ff");
      gradient.addColorStop(0.1, colors.beam + "cc");
      gradient.addColorStop(0.3, colors.beam + "88");
      gradient.addColorStop(0.6, colors.beam + "44");
      gradient.addColorStop(1, "transparent");

      // Draw main beam as a triangle fan
      this.ctx.globalAlpha = baseAlpha * 0.7;
      this.ctx.fillStyle = gradient;

      const perpAngle = beamAngle + Math.PI / 2;
      const halfWidth = actualBeamWidth;

      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(
        endX + Math.cos(perpAngle) * halfWidth * 2,
        endY + Math.sin(perpAngle) * halfWidth * 2,
      );
      this.ctx.lineTo(
        endX - Math.cos(perpAngle) * halfWidth * 2,
        endY - Math.sin(perpAngle) * halfWidth * 2,
      );
      this.ctx.closePath();
      this.ctx.fill();

      // Core bright line
      this.ctx.globalAlpha = (0.8 + bassBoost * 0.2) * 0.7;
      this.ctx.strokeStyle = colors.beam;
      this.ctx.lineWidth = 2 + bassBoost * 3;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();

      // Edge glow
      this.ctx.globalAlpha = 0.3 * 0.7;
      this.ctx.strokeStyle = colors.glow;
      this.ctx.lineWidth = actualBeamWidth * 0.5;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, centerY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawMagneticField(
    centerX: number,
    centerY: number,
    colors: (typeof COLOR_SCHEMES)["magnetar"],
    midBoost: number,
  ): void {
    if (!this.ctx) return;

    const { coreSize } = this.config;
    const fieldLines = 8;
    const maxRadius = coreSize * 4;

    this.ctx.globalAlpha = 0.2 + midBoost * 0.3;
    this.ctx.strokeStyle = colors.accent;
    this.ctx.lineWidth = 1;

    for (let i = 0; i < fieldLines; i++) {
      const startAngle = (i / fieldLines) * Math.PI * 2 + this.rotation * 0.2;

      this.ctx.beginPath();

      for (let t = 0; t <= 1; t += 0.02) {
        // Dipole field line shape
        const theta = startAngle + t * Math.PI;
        const r = maxRadius * Math.sin(theta) * Math.sin(theta);

        const x = centerX + r * Math.sin(theta) * Math.cos(startAngle);
        const y = centerY + r * Math.cos(theta);

        if (t === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }

      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawCore(
    centerX: number,
    centerY: number,
    colors: (typeof COLOR_SCHEMES)["magnetar"],
    baseSize: number,
    bassBoost: number,
    volumeBoost: number,
  ): void {
    if (!this.ctx) return;

    const size = baseSize * (1 + bassBoost * 0.2);

    // Outer glow
    const glowGradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      size * 0.5,
      centerX,
      centerY,
      size * 3,
    );
    glowGradient.addColorStop(0, colors.glow + "60");
    glowGradient.addColorStop(0.5, colors.glow + "30");
    glowGradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = 0.7;
    this.ctx.fillStyle = glowGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, size * 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Core gradient
    const coreGradient = this.ctx.createRadialGradient(
      centerX - size * 0.2,
      centerY - size * 0.2,
      0,
      centerX,
      centerY,
      size,
    );
    coreGradient.addColorStop(0, "#ffffff");
    coreGradient.addColorStop(0.3, colors.core);
    coreGradient.addColorStop(0.7, colors.glow);
    coreGradient.addColorStop(1, colors.glow + "88");

    this.ctx.globalAlpha = 0.9 * 0.7;
    this.ctx.fillStyle = coreGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, size, 0, Math.PI * 2);
    this.ctx.fill();

    // Bright center
    const brightGradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      size * 0.5,
    );
    brightGradient.addColorStop(0, "#ffffff");
    brightGradient.addColorStop(0.5, colors.core + "cc");
    brightGradient.addColorStop(1, "transparent");

    this.ctx.globalAlpha = (0.8 + volumeBoost * 0.2) * 0.7;
    this.ctx.fillStyle = brightGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, size * 0.5, 0, Math.PI * 2);
    this.ctx.fill();

    // Surface hotspots (rotating with the star)
    const hotspotCount = 3;
    for (let i = 0; i < hotspotCount; i++) {
      const angle = this.rotation * 3 + (i / hotspotCount) * Math.PI * 2;
      const spotX = centerX + Math.cos(angle) * size * 0.6;
      const spotY = centerY + Math.sin(angle) * size * 0.6;

      const spotGradient = this.ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, size * 0.3);
      spotGradient.addColorStop(0, "#ffffff88");
      spotGradient.addColorStop(0.5, colors.beam + "44");
      spotGradient.addColorStop(1, "transparent");

      this.ctx.globalAlpha = 0.5 * 0.7;
      this.ctx.fillStyle = spotGradient;
      this.ctx.beginPath();
      this.ctx.arc(spotX, spotY, size * 0.3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawCorona(
    centerX: number,
    centerY: number,
    colors: (typeof COLOR_SCHEMES)["magnetar"],
    baseSize: number,
    volumeBoost: number,
  ): void {
    if (!this.ctx) return;

    // Animated corona rays
    const rayCount = 12;
    const time = this.time;

    this.ctx.globalAlpha = 0.3 + volumeBoost * 0.2;

    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + time * 0.5;
      const length = baseSize * (1.5 + Math.sin(time * 3 + i) * 0.5 + volumeBoost);

      const gradient = this.ctx.createLinearGradient(
        centerX,
        centerY,
        centerX + Math.cos(angle) * length,
        centerY + Math.sin(angle) * length,
      );
      gradient.addColorStop(0, colors.glow + "00");
      gradient.addColorStop(0.3, colors.glow + "44");
      gradient.addColorStop(1, "transparent");

      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX + Math.cos(angle) * baseSize, centerY + Math.sin(angle) * baseSize);
      this.ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Reposition stars
    for (const star of this.stars) {
      if (star.x > width) star.x = Math.random() * width;
      if (star.y > height) star.y = Math.random() * height;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldStarCount = this.config.starCount;
    this.config = { ...this.config, ...config } as PulsarConfig;

    if (
      (config as PulsarConfig).starCount !== undefined &&
      (config as PulsarConfig).starCount !== oldStarCount
    ) {
      this.initStars();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.jetParticles = [];
    this.stars = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Audio Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [
          { value: "magnetar", label: "Magnetar" },
          { value: "xray", label: "X-Ray" },
          { value: "radio", label: "Radio" },
          { value: "gamma", label: "Gamma Ray" },
          { value: "millisecond", label: "Millisecond" },
          { value: "binary", label: "Binary" },
        ],
        default: "magnetar",
        label: "Color Scheme",
      },
      beamWidth: { type: "number", min: 5, max: 40, step: 5, default: 15, label: "Beam Width" },
      beamLength: {
        type: "number",
        min: 0.3,
        max: 1.5,
        step: 0.1,
        default: 1.0,
        label: "Beam Length",
      },
      rotationSpeed: {
        type: "number",
        min: 0.2,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Rotation Speed",
      },
      jetIntensity: {
        type: "number",
        min: 0.2,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Jet Intensity",
      },
      coreSize: { type: "number", min: 15, max: 60, step: 5, default: 30, label: "Core Size" },
      starCount: { type: "number", min: 50, max: 400, step: 50, default: 200, label: "Star Count" },
    };
  }
}
