import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

interface Ring {
  radius: number;
  opacity: number;
  color: string;
  lineWidth: number;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  cyanMagenta: { primary: '#00ffff', secondary: '#ff00ff', accent: '#ffffff' },
  darkTechno: { primary: '#1a1a2e', secondary: '#4a00e0', accent: '#8e2de2' },
  neon: { primary: '#39ff14', secondary: '#ff073a', accent: '#ffff00' },
  fire: { primary: '#ff4500', secondary: '#ff8c00', accent: '#ffd700' },
  ice: { primary: '#00bfff', secondary: '#1e90ff', accent: '#e0ffff' },
  acid: { primary: '#adff2f', secondary: '#7fff00', accent: '#00ff00' },
  monochrome: { primary: '#ffffff', secondary: '#aaaaaa', accent: '#666666' },
  purpleHaze: { primary: '#8b00ff', secondary: '#ff1493', accent: '#9400d3' },
  sunset: { primary: '#ff6b6b', secondary: '#feca57', accent: '#ff9f43' },
  ocean: { primary: '#0077be', secondary: '#00d4aa', accent: '#00b4d8' },
  toxic: { primary: '#00ff41', secondary: '#0aff0a', accent: '#39ff14' },
  bloodMoon: { primary: '#8b0000', secondary: '#ff4500', accent: '#dc143c' },
  synthwave: { primary: '#ff00ff', secondary: '#00ffff', accent: '#ff00aa' },
  golden: { primary: '#ffd700', secondary: '#ff8c00', accent: '#ffb347' },
};

export class BeatPulseRingsVisualization implements Visualization {
  id = 'beatPulseRings';
  name = 'Beat Pulse Rings';
  author = 'Vizec';
  description = 'Concentric rings that pulse outward on beats';
  renderer = 'canvas2d' as const;
  transitionType = 'crossfade' as const;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    maxRings: 15,
    ringSpeed: 4,
    beatThreshold: 0.25,
    lineWidth: 3,
  };

  private rings: Ring[] = [];
  private lastBass = 0;
  private beatCooldown = 0;

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
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, maxRings, ringSpeed, beatThreshold, lineWidth } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.max(this.width, this.height) * 0.8;

    // Beat detection - spawn new ring on bass hit
    this.beatCooldown -= deltaTime;
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const bassIncrease = bassBoost - this.lastBass;
    
    if (bassIncrease > beatThreshold && this.beatCooldown <= 0 && this.rings.length < maxRings) {
      // Spawn a new ring
      const colorChoice = Math.random();
      let ringColor: string;
      if (colorChoice < 0.5) {
        ringColor = colors.primary;
      } else if (colorChoice < 0.85) {
        ringColor = colors.secondary;
      } else {
        ringColor = colors.accent;
      }

      this.rings.push({
        radius: 10 + bassBoost * 20,
        opacity: 0.8,
        color: ringColor,
        lineWidth: lineWidth + bassBoost * 3,
      });
      
      this.beatCooldown = 0.1; // Cooldown to prevent too many rings
    }
    this.lastBass = bassBoost;

    // Update and draw rings
    this.ctx.globalAlpha = 0.7;
    
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const ring = this.rings[i];
      
      // Expand ring
      ring.radius += ringSpeed * (100 + volume * 100) * deltaTime;
      
      // Fade out as it expands
      ring.opacity -= deltaTime * 0.5;
      ring.lineWidth *= 0.995; // Gradually thin out
      
      // Remove if faded or too large
      if (ring.opacity <= 0 || ring.radius > maxRadius) {
        this.rings.splice(i, 1);
        continue;
      }

      // Draw ring
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = ring.color;
      this.ctx.lineWidth = ring.lineWidth;
      this.ctx.globalAlpha = ring.opacity * 0.7;
      
      // Add glow effect
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = ring.color;
      
      this.ctx.stroke();
    }

    // Draw center pulse
    const centerSize = 5 + bassBoost * 25;
    const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, centerSize);
    gradient.addColorStop(0, colors.accent);
    gradient.addColorStop(1, 'transparent');
    
    this.ctx.globalAlpha = 0.5 + volume * 0.3;
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, centerSize, 0, Math.PI * 2);
    this.ctx.fill();

    // Reset
    this.ctx.shadowBlur = 0;
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
    this.config = { ...this.config, ...config };
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.rings = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: { type: 'number', min: 0.1, max: 3, step: 0.1, default: 1.0, label: 'Sensitivity' },
      colorScheme: {
        type: 'select',
        options: [
          { value: 'cyanMagenta', label: 'Cyan/Magenta' },
          { value: 'darkTechno', label: 'Dark Techno' },
          { value: 'neon', label: 'Neon' },
          { value: 'fire', label: 'Fire' },
          { value: 'ice', label: 'Ice' },
          { value: 'acid', label: 'Acid' },
          { value: 'monochrome', label: 'Monochrome' },
          { value: 'purpleHaze', label: 'Purple Haze' },
          { value: 'sunset', label: 'Sunset' },
          { value: 'ocean', label: 'Ocean' },
          { value: 'toxic', label: 'Toxic' },
          { value: 'bloodMoon', label: 'Blood Moon' },
          { value: 'synthwave', label: 'Synthwave' },
          { value: 'golden', label: 'Golden' },
        ],
        default: 'cyanMagenta',
        label: 'Color Scheme',
      },
      maxRings: { type: 'number', min: 5, max: 30, step: 1, default: 15, label: 'Max Rings' },
      ringSpeed: { type: 'number', min: 1, max: 10, step: 0.5, default: 4, label: 'Ring Speed' },
      beatThreshold: { type: 'number', min: 0.1, max: 0.8, step: 0.05, default: 0.25, label: 'Beat Threshold' },
    };
  }
}
