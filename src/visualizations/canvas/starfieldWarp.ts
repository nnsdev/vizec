import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

const COLOR_SCHEMES: Record<string, {
  stars: string;
  streaks: string;
  glow: string;
  center: string;
  accent: string;
  ambient: string;
}> = {
  hyperspace: { stars: '#ffffff', streaks: '#aaccff', glow: '#4488ff', center: '#ffffff', accent: '#00aaff', ambient: '#001133' },
  warpCore: { stars: '#ffcc00', streaks: '#ff8800', glow: '#ff4400', center: '#ffffff', accent: '#ffaa00', ambient: '#331100' },
  quantum: { stars: '#ff00ff', streaks: '#aa00ff', glow: '#6600ff', center: '#ffffff', accent: '#ff00aa', ambient: '#220033' },
  emerald: { stars: '#00ff88', streaks: '#00ffaa', glow: '#00ff44', center: '#ffffff', accent: '#88ffaa', ambient: '#002211' },
  crimson: { stars: '#ff4444', streaks: '#ff0066', glow: '#ff0000', center: '#ffffff', accent: '#ff6688', ambient: '#220000' },
  arctic: { stars: '#ffffff', streaks: '#88ddff', glow: '#00ccff', center: '#ffffff', accent: '#aaeeff', ambient: '#001122' },
};

interface WarpStar {
  x: number;
  y: number;
  z: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  size: number;
  brightness: number;
  colorOffset: number;
}

interface StarfieldWarpConfig extends VisualizationConfig {
  colorScheme: string;
  starCount: number;
  baseSpeed: number;
  maxSpeed: number;
  streakLength: number;
  centerGlow: number;
  starSize: number;
}

export class StarfieldWarpVisualization implements Visualization {
  id = 'starfieldWarp';
  name = 'Starfield Warp';
  author = 'Vizec';
  description = 'Classic hyperspace/warp speed effect with stars streaking past from center';
  renderer = 'canvas2d' as const;
  transitionType = 'crossfade' as const;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;

  private config: StarfieldWarpConfig = {
    sensitivity: 1.0,
    colorScheme: 'hyperspace',
    starCount: 600,
    baseSpeed: 2,
    maxSpeed: 20,
    streakLength: 1.0,
    centerGlow: 1.0,
    starSize: 1.0,
  };

  private stars: WarpStar[] = [];
  private currentSpeed = 2;
  private targetSpeed = 2;

  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;
  private volumeSmooth = 0;
  private time = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.ctx = this.canvas.getContext('2d');
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    this.initStars();
  }

  private initStars(): void {
    const { starCount } = this.config;
    this.stars = [];

    for (let i = 0; i < starCount; i++) {
      this.stars.push(this.createStar(false));
    }
  }

  private createStar(fromCenter: boolean): WarpStar {
    const angle = Math.random() * Math.PI * 2;
    const maxDist = Math.max(this.width, this.height);

    let x: number, y: number, z: number;

    if (fromCenter) {
      // Stars spawn near center and move outward
      const dist = Math.random() * 50;
      x = Math.cos(angle) * dist;
      y = Math.sin(angle) * dist;
      z = 1000;
    } else {
      // Initial distribution across the field
      const dist = Math.random() * maxDist * 0.8;
      x = Math.cos(angle) * dist;
      y = Math.sin(angle) * dist;
      z = Math.random() * 1000;
    }

    return {
      x,
      y,
      z,
      prevX: x,
      prevY: y,
      prevZ: z,
      size: 0.5 + Math.random() * 2,
      brightness: 0.5 + Math.random() * 0.5,
      colorOffset: Math.random(),
    };
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, baseSpeed, maxSpeed, streakLength, centerGlow, starSize } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.hyperspace;

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

    // Calculate speed from volume
    this.targetSpeed = baseSpeed + volumeBoost * (maxSpeed - baseSpeed);
    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * 0.1;

    // Star density based on treble
    const targetStarCount = Math.floor(this.config.starCount * (0.5 + trebleBoost * 0.7));
    while (this.stars.length < targetStarCount && this.stars.length < this.config.starCount * 1.5) {
      this.stars.push(this.createStar(true));
    }

    // Draw center glow
    this.drawCenterGlow(centerX, centerY, colors, centerGlow, bassBoost, volumeBoost);

    // Update and draw stars
    this.updateAndDrawStars(centerX, centerY, colors, deltaTime, streakLength, starSize, bassBoost, trebleBoost);

    // Draw speed lines effect on high bass
    if (bassBoost > 0.5) {
      this.drawSpeedLines(centerX, centerY, colors, bassBoost);
    }

    // Draw subtle ambient rings
    this.drawAmbientRings(centerX, centerY, colors, midBoost);
  }

  private drawCenterGlow(
    centerX: number,
    centerY: number,
    colors: typeof COLOR_SCHEMES['hyperspace'],
    intensity: number,
    bassBoost: number,
    volumeBoost: number
  ): void {
    if (!this.ctx) return;

    const baseSize = 50 + bassBoost * 100;
    const pulseSize = baseSize * (1 + Math.sin(this.time * 3) * 0.1);

    // Outer glow
    const outerGradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, pulseSize * 3
    );
    outerGradient.addColorStop(0, colors.center + '40');
    outerGradient.addColorStop(0.3, colors.glow + '20');
    outerGradient.addColorStop(0.7, colors.accent + '10');
    outerGradient.addColorStop(1, 'transparent');

    this.ctx.globalAlpha = intensity * (0.5 + volumeBoost * 0.5) * 0.7;
    this.ctx.fillStyle = outerGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, pulseSize * 3, 0, Math.PI * 2);
    this.ctx.fill();

    // Core glow
    const coreGradient = this.ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, pulseSize
    );
    coreGradient.addColorStop(0, colors.center + '80');
    coreGradient.addColorStop(0.5, colors.glow + '40');
    coreGradient.addColorStop(1, 'transparent');

    this.ctx.globalAlpha = intensity * (0.6 + bassBoost * 0.4) * 0.7;
    this.ctx.fillStyle = coreGradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, pulseSize, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.globalAlpha = 1.0;
  }

  private updateAndDrawStars(
    centerX: number,
    centerY: number,
    colors: typeof COLOR_SCHEMES['hyperspace'],
    deltaTime: number,
    streakLength: number,
    starSizeMultiplier: number,
    bassBoost: number,
    trebleBoost: number
  ): void {
    if (!this.ctx) return;

    const focalLength = 500;

    for (let i = this.stars.length - 1; i >= 0; i--) {
      const star = this.stars[i];

      // Store previous position for streak
      star.prevX = star.x;
      star.prevY = star.y;
      star.prevZ = star.z;

      // Move star toward camera (decrease z)
      star.z -= this.currentSpeed * deltaTime * 60;

      // Reset star if it passes the camera
      if (star.z <= 1) {
        this.stars[i] = this.createStar(true);
        continue;
      }

      // Project to screen coordinates
      const screenX = (star.x / star.z) * focalLength + centerX;
      const screenY = (star.y / star.z) * focalLength + centerY;

      // Previous position for streak
      const prevScreenX = (star.prevX / star.prevZ) * focalLength + centerX;
      const prevScreenY = (star.prevY / star.prevZ) * focalLength + centerY;

      // Skip if off screen
      const margin = 100;
      if (screenX < -margin || screenX > this.width + margin ||
          screenY < -margin || screenY > this.height + margin) {
        continue;
      }

      // Calculate depth factor (closer = brighter and larger)
      const depthFactor = 1 - star.z / 1000;
      const size = (star.size + depthFactor * 3) * starSizeMultiplier * (1 + bassBoost * 0.5);

      // Calculate streak length based on speed
      const streakMultiplier = streakLength * (this.currentSpeed / this.config.baseSpeed);

      // Color based on position and color offset
      let starColor = colors.stars;
      if (star.colorOffset > 0.7) {
        starColor = colors.accent;
      } else if (star.colorOffset > 0.4) {
        starColor = colors.streaks;
      }

      // Draw streak
      const alpha = Math.min(1, depthFactor * star.brightness * (0.5 + trebleBoost * 0.5));

      // Long streak effect
      if (streakMultiplier > 0.5 && depthFactor > 0.2) {
        const streakGradient = this.ctx.createLinearGradient(
          prevScreenX, prevScreenY,
          screenX, screenY
        );
        streakGradient.addColorStop(0, 'transparent');
        streakGradient.addColorStop(0.3, starColor + '44');
        streakGradient.addColorStop(0.7, starColor + 'aa');
        streakGradient.addColorStop(1, starColor);

        this.ctx.globalAlpha = alpha * 0.7;
        this.ctx.strokeStyle = streakGradient;
        this.ctx.lineWidth = size * 0.5;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(prevScreenX, prevScreenY);
        this.ctx.lineTo(screenX, screenY);
        this.ctx.stroke();
      }

      // Draw star point
      this.ctx.globalAlpha = alpha * 0.9 * 0.7;
      this.ctx.fillStyle = starColor;
      this.ctx.beginPath();
      this.ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
      this.ctx.fill();

      // Glow for close stars
      if (depthFactor > 0.6) {
        const glowGradient = this.ctx.createRadialGradient(
          screenX, screenY, 0,
          screenX, screenY, size * 3
        );
        glowGradient.addColorStop(0, starColor + '66');
        glowGradient.addColorStop(0.5, starColor + '22');
        glowGradient.addColorStop(1, 'transparent');

        this.ctx.globalAlpha = depthFactor * 0.5 * 0.7;
        this.ctx.fillStyle = glowGradient;
        this.ctx.beginPath();
        this.ctx.arc(screenX, screenY, size * 3, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawSpeedLines(
    centerX: number,
    centerY: number,
    colors: typeof COLOR_SCHEMES['hyperspace'],
    bassBoost: number
  ): void {
    if (!this.ctx) return;

    const lineCount = Math.floor(bassBoost * 20);
    const maxLength = Math.max(this.width, this.height) * 0.5;

    this.ctx.globalAlpha = bassBoost * 0.3 * 0.7;

    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2 + this.time * 2;
      const startDist = 50 + Math.random() * 100;
      const length = 100 + Math.random() * (maxLength - 100) * bassBoost;

      const startX = centerX + Math.cos(angle) * startDist;
      const startY = centerY + Math.sin(angle) * startDist;
      const endX = centerX + Math.cos(angle) * (startDist + length);
      const endY = centerY + Math.sin(angle) * (startDist + length);

      const gradient = this.ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.3, colors.streaks + '44');
      gradient.addColorStop(0.7, colors.streaks + '88');
      gradient.addColorStop(1, colors.streaks + '22');

      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = 1 + Math.random() * 2;
      this.ctx.beginPath();
      this.ctx.moveTo(startX, startY);
      this.ctx.lineTo(endX, endY);
      this.ctx.stroke();
    }

    this.ctx.globalAlpha = 1.0;
  }

  private drawAmbientRings(
    centerX: number,
    centerY: number,
    colors: typeof COLOR_SCHEMES['hyperspace'],
    midBoost: number
  ): void {
    if (!this.ctx) return;

    const ringCount = 3;

    for (let i = 0; i < ringCount; i++) {
      const baseRadius = 100 + i * 150;
      const radius = baseRadius + Math.sin(this.time * 2 + i) * 20;

      this.ctx.globalAlpha = (0.1 + midBoost * 0.1) * (1 - i / ringCount) * 0.7;
      this.ctx.strokeStyle = colors.glow;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
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
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldStarCount = this.config.starCount;
    this.config = { ...this.config, ...config } as StarfieldWarpConfig;

    if ((config as StarfieldWarpConfig).starCount !== undefined &&
        (config as StarfieldWarpConfig).starCount !== oldStarCount) {
      this.initStars();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.stars = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: { type: 'number', min: 0.1, max: 3, step: 0.1, default: 1.0, label: 'Audio Sensitivity' },
      colorScheme: {
        type: 'select',
        options: [
          { value: 'hyperspace', label: 'Hyperspace' },
          { value: 'warpCore', label: 'Warp Core' },
          { value: 'quantum', label: 'Quantum' },
          { value: 'emerald', label: 'Emerald' },
          { value: 'crimson', label: 'Crimson' },
          { value: 'arctic', label: 'Arctic' },
        ],
        default: 'hyperspace',
        label: 'Color Scheme',
      },
      starCount: { type: 'number', min: 200, max: 1000, step: 100, default: 600, label: 'Star Count' },
      baseSpeed: { type: 'number', min: 0.5, max: 5, step: 0.5, default: 2, label: 'Base Speed' },
      maxSpeed: { type: 'number', min: 5, max: 40, step: 5, default: 20, label: 'Max Speed' },
      streakLength: { type: 'number', min: 0.2, max: 2, step: 0.1, default: 1.0, label: 'Streak Length' },
      centerGlow: { type: 'number', min: 0, max: 2, step: 0.1, default: 1.0, label: 'Center Glow' },
      starSize: { type: 'number', min: 0.5, max: 2, step: 0.1, default: 1.0, label: 'Star Size' },
    };
  }
}
