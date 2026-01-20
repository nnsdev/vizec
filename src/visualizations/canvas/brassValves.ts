import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface BrassValvesConfig extends VisualizationConfig {
  valveCount: number;
  steamIntensity: number;
  rotationSpeed: number;
  pressureReactivity: number;
  colorScheme: string;
}

interface ValveWheel {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  rotationSpeed: number;
  spokeCount: number;
  pressureLevel: number;
  connectedTo: number[]; // Indices of connected valves
  steamActive: boolean;
  steamTimer: number;
}

interface Pipe {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  segments: { x: number; y: number }[];
  pressure: number;
  glowIntensity: number;
  flowOffset: number; // For animated flow
  totalLength: number; // Pre-calculated pipe length
}

interface SteamParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

// Steampunk color palettes
const STEAMPUNK_PALETTES: Record<
  string,
  {
    brass: string;
    copper: string;
    bronze: string;
    iron: string;
    steam: string;
    glow: string;
    rivet: string;
  }
> = {
  classic: {
    brass: "#B5A642",
    copper: "#B87333",
    bronze: "#CD7F32",
    iron: "#48494B",
    steam: "#E8E8E8",
    glow: "#FF6600",
    rivet: "#4A4A4A",
  },
  aged: {
    brass: "#8B7355",
    copper: "#8B4513",
    bronze: "#8B6914",
    iron: "#2F2F2F",
    steam: "#D0D0D0",
    glow: "#FF4500",
    rivet: "#3A3A3A",
  },
  polished: {
    brass: "#D4AF37",
    copper: "#DA8A67",
    bronze: "#E5A864",
    iron: "#5A5A5A",
    steam: "#FFFFFF",
    glow: "#FFD700",
    rivet: "#6A6A6A",
  },
};

export class BrassValvesVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "brassValves",
    name: "Brass Valves",
    author: "Vizec",
    description: "Victorian brass valve system with spinning wheels and steam effects",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: BrassValvesConfig = {
    sensitivity: 1.0,
    valveCount: 5,
    steamIntensity: 1.0,
    rotationSpeed: 1.0,
    pressureReactivity: 1.0,
    colorScheme: "classic",
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private valves: ValveWheel[] = [];
  private pipes: Pipe[] = [];
  private steamParticles: SteamParticle[] = [];
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

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

  private initValves(): void {
    this.valves = [];
    this.pipes = [];
    const { valveCount } = this.config;

    // Create valves in a grid-like arrangement
    const cols = Math.ceil(Math.sqrt(valveCount));
    const rows = Math.ceil(valveCount / cols);

    const cellWidth = this.width / (cols + 1);
    const cellHeight = this.height / (rows + 1);

    for (let i = 0; i < valveCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = cellWidth * (col + 1) + (Math.random() - 0.5) * cellWidth * 0.3;
      const y = cellHeight * (row + 1) + (Math.random() - 0.5) * cellHeight * 0.3;
      const radius = 30 + Math.random() * 40;

      this.valves.push({
        x,
        y,
        radius,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 2,
        spokeCount: 4 + Math.floor(Math.random() * 5),
        pressureLevel: 0.3 + Math.random() * 0.4,
        connectedTo: [],
        steamActive: false,
        steamTimer: 0,
      });
    }

    // Create connections between nearby valves
    for (let i = 0; i < this.valves.length; i++) {
      const valve = this.valves[i];

      for (let j = i + 1; j < this.valves.length; j++) {
        const other = this.valves[j];
        const dist = Math.hypot(valve.x - other.x, valve.y - other.y);

        // Connect if reasonably close
        if (dist < Math.max(cellWidth, cellHeight) * 1.5 && Math.random() < 0.6) {
          valve.connectedTo.push(j);
          other.connectedTo.push(i);
          this.createPipe(valve, other);
        }
      }
    }
  }

  private createPipe(valve1: ValveWheel, valve2: ValveWheel): void {
    const segments: { x: number; y: number }[] = [];

    // Create L-shaped or straight pipe
    const dx = valve2.x - valve1.x;
    const dy = valve2.y - valve1.y;

    segments.push({ x: valve1.x, y: valve1.y });

    if (Math.random() < 0.7) {
      // L-shaped pipe
      if (Math.abs(dx) > Math.abs(dy)) {
        segments.push({ x: valve1.x + dx * 0.5, y: valve1.y });
        segments.push({ x: valve1.x + dx * 0.5, y: valve2.y });
      } else {
        segments.push({ x: valve1.x, y: valve1.y + dy * 0.5 });
        segments.push({ x: valve2.x, y: valve1.y + dy * 0.5 });
      }
    }

    segments.push({ x: valve2.x, y: valve2.y });

    // Calculate total pipe length
    let totalLength = 0;
    for (let i = 1; i < segments.length; i++) {
      totalLength += Math.hypot(
        segments[i].x - segments[i - 1].x,
        segments[i].y - segments[i - 1].y,
      );
    }

    this.pipes.push({
      startX: valve1.x,
      startY: valve1.y,
      endX: valve2.x,
      endY: valve2.y,
      segments,
      pressure: 0.5,
      glowIntensity: 0,
      flowOffset: Math.random() * 100,
      totalLength,
    });
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, steamIntensity, rotationSpeed, pressureReactivity, colorScheme } =
      this.config;
    const { bass, mid, treble, volume } = audioData;
    const palette = STEAMPUNK_PALETTES[colorScheme] || STEAMPUNK_PALETTES.classic;

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update and render pipes
    this.updatePipes(palette, pressureReactivity, sensitivity);

    // Update and render valves
    this.updateValves(deltaTime, palette, rotationSpeed, pressureReactivity, sensitivity);

    // Update and render steam
    this.updateSteam(deltaTime, palette, steamIntensity, sensitivity);
  }

  private updatePipes(
    palette: typeof STEAMPUNK_PALETTES.classic,
    pressureReactivity: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    for (const pipe of this.pipes) {
      // Update pressure based on mid frequencies
      pipe.pressure = 0.3 + this.midSmooth * pressureReactivity * sensitivity * 0.7;
      pipe.glowIntensity = this.midSmooth * pressureReactivity * sensitivity;

      // Animate flow - speed based on bass
      pipe.flowOffset += (2 + this.bassSmooth * sensitivity * 8) * 0.016;

      // Draw pipe segments (outer)
      ctx.strokeStyle = this.hexToRgba(palette.iron, 0.55);
      ctx.lineWidth = 10;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.beginPath();
      ctx.moveTo(pipe.segments[0].x, pipe.segments[0].y);
      for (let i = 1; i < pipe.segments.length; i++) {
        ctx.lineTo(pipe.segments[i].x, pipe.segments[i].y);
      }
      ctx.stroke();

      // Inner pipe (copper)
      ctx.strokeStyle = this.hexToRgba(palette.copper, 0.45);
      ctx.lineWidth = 6;

      ctx.beginPath();
      ctx.moveTo(pipe.segments[0].x, pipe.segments[0].y);
      for (let i = 1; i < pipe.segments.length; i++) {
        ctx.lineTo(pipe.segments[i].x, pipe.segments[i].y);
      }
      ctx.stroke();

      // Animated flow particles inside pipes
      this.drawPipeFlow(pipe, palette, sensitivity);

      // Pressure glow - pulsing with bass
      const pulseGlow =
        pipe.glowIntensity * (0.8 + Math.sin(this.time * 6) * 0.2 * this.bassSmooth);
      if (pulseGlow > 0.15) {
        ctx.strokeStyle = this.hexToRgba(palette.glow, pulseGlow * 0.4);
        ctx.lineWidth = 14 + this.bassSmooth * 6;
        ctx.filter = "blur(6px)";

        ctx.beginPath();
        ctx.moveTo(pipe.segments[0].x, pipe.segments[0].y);
        for (let i = 1; i < pipe.segments.length; i++) {
          ctx.lineTo(pipe.segments[i].x, pipe.segments[i].y);
        }
        ctx.stroke();
        ctx.filter = "none";
      }

      // Draw pipe joints/fittings
      for (const segment of pipe.segments) {
        this.drawRivet(segment.x, segment.y, 6, palette);
      }
    }
  }

  private drawPipeFlow(
    pipe: Pipe,
    palette: typeof STEAMPUNK_PALETTES.classic,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Draw flowing energy/steam particles along the pipe
    const particleSpacing = 25;
    const particleCount = Math.floor(pipe.totalLength / particleSpacing);
    const flowSpeed = pipe.flowOffset;

    for (let i = 0; i < particleCount; i++) {
      // Calculate position along pipe as percentage
      let t = ((i * particleSpacing + flowSpeed * 30) % pipe.totalLength) / pipe.totalLength;

      // Get position on pipe path
      const pos = this.getPointOnPipe(pipe, t);
      if (!pos) continue;

      // Particle size pulses with audio
      const basePulse = Math.sin(t * Math.PI * 4 + this.time * 3) * 0.5 + 0.5;
      const audioPulse = this.midSmooth * sensitivity;
      const size = 2 + basePulse * 2 + audioPulse * 3;

      // Alpha based on pressure and pulse
      const alpha = (0.3 + pipe.pressure * 0.4) * (0.5 + basePulse * 0.5);

      // Glow effect
      const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, size * 2);
      gradient.addColorStop(0, this.hexToRgba(palette.glow, alpha));
      gradient.addColorStop(0.5, this.hexToRgba(palette.copper, alpha * 0.5));
      gradient.addColorStop(1, this.hexToRgba(palette.glow, 0));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * 2, 0, Math.PI * 2);
      ctx.fill();

      // Bright core
      ctx.fillStyle = this.hexToRgba(palette.steam, alpha * 0.8);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private getPointOnPipe(pipe: Pipe, t: number): { x: number; y: number } | null {
    if (pipe.segments.length < 2) return null;

    // Find which segment we're on
    const targetDist = t * pipe.totalLength;
    let accumulatedDist = 0;

    for (let i = 1; i < pipe.segments.length; i++) {
      const segLength = Math.hypot(
        pipe.segments[i].x - pipe.segments[i - 1].x,
        pipe.segments[i].y - pipe.segments[i - 1].y,
      );

      if (accumulatedDist + segLength >= targetDist) {
        // Interpolate within this segment
        const segT = (targetDist - accumulatedDist) / segLength;
        return {
          x: pipe.segments[i - 1].x + (pipe.segments[i].x - pipe.segments[i - 1].x) * segT,
          y: pipe.segments[i - 1].y + (pipe.segments[i].y - pipe.segments[i - 1].y) * segT,
        };
      }

      accumulatedDist += segLength;
    }

    // Return last point if we somehow overshot
    return pipe.segments[pipe.segments.length - 1];
  }

  private updateValves(
    deltaTime: number,
    palette: typeof STEAMPUNK_PALETTES.classic,
    rotationSpeed: number,
    pressureReactivity: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dt = deltaTime * 0.001;

    for (const valve of this.valves) {
      // Update rotation based on bass
      const speedMultiplier = 1 + this.bassSmooth * sensitivity * 3;
      valve.rotation += valve.rotationSpeed * dt * rotationSpeed * speedMultiplier;

      // Update pressure level
      valve.pressureLevel = 0.3 + this.midSmooth * pressureReactivity * sensitivity * 0.5;

      // Check for steam burst on bass hit
      valve.steamTimer -= dt;
      if (this.bassSmooth > 0.7 && valve.steamTimer <= 0 && Math.random() < 0.3) {
        valve.steamActive = true;
        valve.steamTimer = 0.5 + Math.random() * 0.5;
        this.emitSteam(valve);
      } else if (valve.steamTimer <= -0.3) {
        valve.steamActive = false;
      }

      // Draw valve wheel
      this.drawValveWheel(valve, palette, sensitivity);
    }
  }

  private drawValveWheel(
    valve: ValveWheel,
    palette: typeof STEAMPUNK_PALETTES.classic,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(valve.x, valve.y);

    // Outer ring (brass)
    ctx.beginPath();
    ctx.arc(0, 0, valve.radius, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(palette.brass, 0.55);
    ctx.fill();
    ctx.strokeStyle = this.hexToRgba(palette.bronze, 0.6);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner ring
    ctx.beginPath();
    ctx.arc(0, 0, valve.radius * 0.7, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(palette.iron, 0.5);
    ctx.fill();

    // Rotating spokes
    ctx.rotate(valve.rotation);

    ctx.strokeStyle = this.hexToRgba(palette.brass, 0.6);
    ctx.lineWidth = 4;

    for (let i = 0; i < valve.spokeCount; i++) {
      const angle = (i / valve.spokeCount) * Math.PI * 2;
      const innerR = valve.radius * 0.2;
      const outerR = valve.radius * 0.85;

      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
      ctx.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
      ctx.stroke();

      // Spoke end caps
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * outerR, Math.sin(angle) * outerR, 5, 0, Math.PI * 2);
      ctx.fillStyle = this.hexToRgba(palette.copper, 0.55);
      ctx.fill();
    }

    // Center hub
    ctx.beginPath();
    ctx.arc(0, 0, valve.radius * 0.25, 0, Math.PI * 2);
    const hubGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, valve.radius * 0.25);
    hubGradient.addColorStop(0, this.hexToRgba(palette.brass, 0.6));
    hubGradient.addColorStop(1, this.hexToRgba(palette.bronze, 0.5));
    ctx.fillStyle = hubGradient;
    ctx.fill();

    // Center bolt
    ctx.beginPath();
    ctx.arc(0, 0, valve.radius * 0.1, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(palette.iron, 0.7);
    ctx.fill();

    ctx.restore();

    // Draw pressure indicator
    this.drawPressureGauge(valve, palette, sensitivity);

    // Draw rivets around the valve
    const rivetCount = 8;
    for (let i = 0; i < rivetCount; i++) {
      const angle = (i / rivetCount) * Math.PI * 2;
      const rx = valve.x + Math.cos(angle) * (valve.radius + 8);
      const ry = valve.y + Math.sin(angle) * (valve.radius + 8);
      this.drawRivet(rx, ry, 3, palette);
    }

    // Draw steam emission indicator if active
    if (valve.steamActive) {
      ctx.beginPath();
      ctx.arc(valve.x, valve.y, valve.radius + 15, 0, Math.PI * 2);
      ctx.strokeStyle = this.hexToRgba(palette.glow, 0.3);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawPressureGauge(
    valve: ValveWheel,
    palette: typeof STEAMPUNK_PALETTES.classic,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const gaugeX = valve.x + valve.radius + 20;
    const gaugeY = valve.y - valve.radius * 0.5;
    const gaugeRadius = 15;

    // Gauge background
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY, gaugeRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(palette.iron, 0.55);
    ctx.fill();
    ctx.strokeStyle = this.hexToRgba(palette.brass, 0.5);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Gauge arc (pressure indicator)
    const pressureAngle = -Math.PI * 0.75 + valve.pressureLevel * Math.PI * 1.5;
    ctx.beginPath();
    ctx.arc(gaugeX, gaugeY, gaugeRadius - 3, -Math.PI * 0.75, pressureAngle);
    ctx.strokeStyle =
      valve.pressureLevel > 0.7
        ? this.hexToRgba(palette.glow, 0.7)
        : this.hexToRgba(palette.copper, 0.6);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Gauge needle
    ctx.beginPath();
    ctx.moveTo(gaugeX, gaugeY);
    ctx.lineTo(
      gaugeX + Math.cos(pressureAngle) * (gaugeRadius - 4),
      gaugeY + Math.sin(pressureAngle) * (gaugeRadius - 4),
    );
    ctx.strokeStyle = this.hexToRgba(palette.brass, 0.8);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawRivet(
    x: number,
    y: number,
    size: number,
    palette: typeof STEAMPUNK_PALETTES.classic,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba(palette.rivet, 0.55);
    ctx.fill();

    // Highlight
    ctx.beginPath();
    ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = this.hexToRgba("#888888", 0.3);
    ctx.fill();
  }

  private emitSteam(valve: ValveWheel): void {
    const particleCount = 10 + Math.floor(Math.random() * 15);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;

      this.steamParticles.push({
        x: valve.x + Math.cos(angle) * valve.radius,
        y: valve.y + Math.sin(angle) * valve.radius,
        vx: Math.cos(angle) * speed * 0.5,
        vy: -speed * (0.5 + Math.random() * 0.5), // Mostly upward
        life: 0.5 + Math.random() * 1,
        maxLife: 0.5 + Math.random() * 1,
        size: 5 + Math.random() * 15,
      });
    }
  }

  private updateSteam(
    deltaTime: number,
    palette: typeof STEAMPUNK_PALETTES.classic,
    steamIntensity: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dt = deltaTime * 0.001;

    // Also emit ambient steam from random valves
    if (this.trebleSmooth > 0.3 && Math.random() < 0.1 * steamIntensity) {
      const randomValve = this.valves[Math.floor(Math.random() * this.valves.length)];
      if (randomValve) {
        this.steamParticles.push({
          x: randomValve.x,
          y: randomValve.y - randomValve.radius,
          vx: (Math.random() - 0.5) * 20,
          vy: -30 - Math.random() * 30,
          life: 0.3 + Math.random() * 0.5,
          maxLife: 0.3 + Math.random() * 0.5,
          size: 3 + Math.random() * 8,
        });
      }
    }

    for (let i = this.steamParticles.length - 1; i >= 0; i--) {
      const particle = this.steamParticles[i];

      // Update position
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 10 * dt; // Slight upward deceleration

      // Expand and fade
      particle.size += dt * 20;
      particle.life -= dt;

      if (particle.life <= 0) {
        this.steamParticles.splice(i, 1);
        continue;
      }

      // Draw steam particle
      const progress = particle.life / particle.maxLife;
      const alpha = progress * 0.35 * steamIntensity;

      const gradient = ctx.createRadialGradient(
        particle.x,
        particle.y,
        0,
        particle.x,
        particle.y,
        particle.size,
      );
      gradient.addColorStop(0, this.hexToRgba(palette.steam, alpha));
      gradient.addColorStop(0.5, this.hexToRgba(palette.steam, alpha * 0.5));
      gradient.addColorStop(1, this.hexToRgba(palette.steam, 0));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
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
    this.initValves();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldValveCount = this.config.valveCount;
    this.config = { ...this.config, ...config } as BrassValvesConfig;

    if (this.config.valveCount !== oldValveCount && this.width > 0) {
      this.initValves();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.valves = [];
    this.pipes = [];
    this.steamParticles = [];
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
        label: "Metal Style",
        default: "classic",
        options: [
          { label: "Classic", value: "classic" },
          { label: "Aged", value: "aged" },
          { label: "Polished", value: "polished" },
        ],
      },
      valveCount: {
        type: "number",
        label: "Valve Count",
        default: 5,
        min: 2,
        max: 9,
        step: 1,
      },
      steamIntensity: {
        type: "number",
        label: "Steam Intensity",
        default: 1.0,
        min: 0,
        max: 2.0,
        step: 0.1,
      },
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      pressureReactivity: {
        type: "number",
        label: "Pressure Reactivity",
        default: 1.0,
        min: 0.3,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
