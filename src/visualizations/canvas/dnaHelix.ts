import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";

// Color schemes
const COLOR_SCHEMES: Record<string, { start: string; end: string; glow: string }> = {
  cyanMagenta: { start: "#00ffff", end: "#ff00ff", glow: "#00ffff" },
  darkTechno: { start: "#1a1a2e", end: "#4a00e0", glow: "#8000ff" },
  neon: { start: "#39ff14", end: "#ff073a", glow: "#ffff00" },
  fire: { start: "#ff4500", end: "#ffd700", glow: "#ff6600" },
  ice: { start: "#00bfff", end: "#e0ffff", glow: "#87ceeb" },
  acid: { start: "#00ff00", end: "#ffff00", glow: "#00ff00" },
  monochrome: { start: "#ffffff", end: "#808080", glow: "#ffffff" },
  purpleHaze: { start: "#8b00ff", end: "#ff1493", glow: "#9400d3" },
  sunset: { start: "#ff6b6b", end: "#feca57", glow: "#ff9f43" },
  ocean: { start: "#0077be", end: "#00d4aa", glow: "#00b4d8" },
  toxic: { start: "#00ff41", end: "#0aff0a", glow: "#39ff14" },
  bloodMoon: { start: "#8b0000", end: "#ff4500", glow: "#dc143c" },
  synthwave: { start: "#ff00ff", end: "#00ffff", glow: "#ff00aa" },
  golden: { start: "#ffd700", end: "#ff8c00", glow: "#ffb347" },
};

interface DNAHelixConfig extends VisualizationConfig {
  rotationSpeed: number;
  strandCount: number;
  pulseIntensity: number;
}

export class DNAHelixVisualization implements Visualization {
  static readonly meta: VisualizationMeta = {
    id: "dnaHelix",
    name: "DNA Helix",
    author: "Vizec",
    description: "Double helix rotating around vertical center axis with audio-reactive pulsing",
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
  private config: DNAHelixConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    rotationSpeed: 1.0,
    strandCount: 30,
    pulseIntensity: 1.0,
  };
  private width = 0;
  private height = 0;
  private rotation = 0;
  private smoothedBass = 0;
  private smoothedMid = 0;

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

    // Initial resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass, mid } = audioData;
    const { rotationSpeed, strandCount, pulseIntensity, sensitivity, colorScheme } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Smooth audio values
    this.smoothedBass = this.smoothedBass * 0.85 + bass * 0.15;
    this.smoothedMid = this.smoothedMid * 0.85 + mid * 0.15;

    // Update rotation
    this.rotation += deltaTime * rotationSpeed * 2;

    // Set transparency
    this.ctx.globalAlpha = 0.75;

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const helixHeight = this.height * 0.8;
    const baseRadius = Math.min(this.width, this.height) * 0.15;

    // Pulse radius with bass
    const pulsedRadius = baseRadius * (1 + this.smoothedBass * pulseIntensity * 0.5);

    // Store points for both strands to draw connections
    const strand1Points: { x: number; y: number; z: number }[] = [];
    const strand2Points: { x: number; y: number; z: number }[] = [];

    // Calculate helix points
    for (let i = 0; i < strandCount; i++) {
      const t = i / (strandCount - 1);
      const y = centerY - helixHeight / 2 + t * helixHeight;
      const angle = this.rotation + t * Math.PI * 4; // Two full rotations

      // Strand 1
      const x1 = centerX + Math.cos(angle) * pulsedRadius;
      const z1 = Math.sin(angle);
      strand1Points.push({ x: x1, y, z: z1 });

      // Strand 2 (opposite side)
      const x2 = centerX + Math.cos(angle + Math.PI) * pulsedRadius;
      const z2 = Math.sin(angle + Math.PI);
      strand2Points.push({ x: x2, y, z: z2 });
    }

    // Draw connections (base pairs) between strands
    for (let i = 0; i < strandCount; i++) {
      const p1 = strand1Points[i];
      const p2 = strand2Points[i];

      // Get frequency value for this connection
      const freqIndex = Math.floor((i / strandCount) * frequencyData.length * 0.5);
      const freqValue = (frequencyData[freqIndex] / 255) * sensitivity;

      // Only draw if both points are in front (z > 0) or create depth effect
      const avgZ = (p1.z + p2.z) / 2;
      const alpha = 0.3 + avgZ * 0.3 + freqValue * 0.4;

      // Connection thickness based on frequency
      const thickness = 1 + freqValue * 4;

      // Create gradient for connection
      const gradient = this.ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      gradient.addColorStop(0, colors.start);
      gradient.addColorStop(0.5, colors.glow);
      gradient.addColorStop(1, colors.end);

      this.ctx.beginPath();
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = thickness;
      this.ctx.globalAlpha = Math.max(0.1, alpha) * 0.75;
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();

      // Draw glowing dots at connection points
      if (freqValue > 0.3) {
        this.ctx.shadowBlur = 10 * freqValue;
        this.ctx.shadowColor = colors.glow;

        // Midpoint glow
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        this.ctx.beginPath();
        this.ctx.fillStyle = colors.glow;
        this.ctx.arc(midX, midY, 2 + freqValue * 4, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
      }
    }

    // Draw strand 1 backbone
    this.drawStrandBackbone(strand1Points, colors.start, colors.glow);

    // Draw strand 2 backbone
    this.drawStrandBackbone(strand2Points, colors.end, colors.glow);

    // Draw nucleotide spheres at strand points
    for (let i = 0; i < strandCount; i++) {
      const p1 = strand1Points[i];
      const p2 = strand2Points[i];

      const freqIndex = Math.floor((i / strandCount) * frequencyData.length * 0.5);
      const freqValue = (frequencyData[freqIndex] / 255) * sensitivity;

      // Sphere size based on z-depth and frequency
      const size1 = (4 + p1.z * 3) * (1 + freqValue * 0.5);
      const size2 = (4 + p2.z * 3) * (1 + freqValue * 0.5);

      // Draw spheres with glow when active
      if (this.smoothedMid > 0.3 || freqValue > 0.4) {
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = colors.glow;
      }

      // Strand 1 sphere
      const alpha1 = 0.5 + p1.z * 0.3;
      this.ctx.globalAlpha = alpha1 * 0.8;
      this.ctx.beginPath();
      this.ctx.fillStyle = colors.start;
      this.ctx.arc(p1.x, p1.y, Math.max(2, size1), 0, Math.PI * 2);
      this.ctx.fill();

      // Strand 2 sphere
      const alpha2 = 0.5 + p2.z * 0.3;
      this.ctx.globalAlpha = alpha2 * 0.8;
      this.ctx.beginPath();
      this.ctx.fillStyle = colors.end;
      this.ctx.arc(p2.x, p2.y, Math.max(2, size2), 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.shadowBlur = 0;
    }

    // Reset alpha
    this.ctx.globalAlpha = 1.0;
  }

  private drawStrandBackbone(
    points: { x: number; y: number; z: number }[],
    color: string,
    glowColor: string,
  ): void {
    if (!this.ctx || points.length < 2) return;

    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // Draw smooth curve through points
    this.ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];

      // Calculate depth-based alpha
      const alpha = 0.4 + curr.z * 0.4;
      this.ctx.globalAlpha = alpha * 0.75;

      // Use quadratic curves for smoothness
      const cpX = curr.x;
      const cpY = curr.y;
      const endX = (curr.x + next.x) / 2;
      const endY = (curr.y + next.y) / 2;

      this.ctx.quadraticCurveTo(cpX, cpY, endX, endY);
    }

    // Draw to last point
    const lastPoint = points[points.length - 1];
    this.ctx.lineTo(lastPoint.x, lastPoint.y);

    // Add glow
    if (this.smoothedBass > 0.4) {
      this.ctx.shadowBlur = 5;
      this.ctx.shadowColor = glowColor;
    }

    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
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
    this.config = { ...this.config, ...config } as DNAHelixConfig;
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
      rotationSpeed: {
        type: "number",
        label: "Rotation Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      strandCount: {
        type: "number",
        label: "Strand Segments",
        default: 30,
        min: 15,
        max: 60,
        step: 5,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyanMagenta",
        options: [
          { value: "cyanMagenta", label: "Cyan/Magenta" },
          { value: "darkTechno", label: "Dark Techno" },
          { value: "neon", label: "Neon" },
          { value: "fire", label: "Fire" },
          { value: "ice", label: "Ice" },
          { value: "acid", label: "Acid" },
          { value: "monochrome", label: "Monochrome" },
          { value: "purpleHaze", label: "Purple Haze" },
          { value: "sunset", label: "Sunset" },
          { value: "ocean", label: "Ocean" },
          { value: "toxic", label: "Toxic" },
          { value: "bloodMoon", label: "Blood Moon" },
          { value: "synthwave", label: "Synthwave" },
          { value: "golden", label: "Golden" },
        ],
      },
      pulseIntensity: {
        type: "number",
        label: "Pulse Intensity",
        default: 1.0,
        min: 0.0,
        max: 2.0,
        step: 0.1,
      },
    };
  }
}
