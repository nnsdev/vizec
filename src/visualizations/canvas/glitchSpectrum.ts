import {
  Visualization,
  AudioData,
  VisualizationConfig,
  ConfigSchema,
} from '../types';

interface GlitchSpectrumConfig extends VisualizationConfig {
  barCount: number;
  colorScheme: string;
  glitchIntensity: number;
  mirror: boolean;
}

const COLOR_SCHEMES: Record<
  string,
  { primary: string; secondary: string; glitch: string }
> = {
  cyanMagenta: { primary: '#00ffff', secondary: '#ff00ff', glitch: '#ffffff' },
  darkTechno: { primary: '#1a1a2e', secondary: '#4a00e0', glitch: '#00ffff' },
  neon: { primary: '#39ff14', secondary: '#ff073a', glitch: '#ffff00' },
  monochrome: { primary: '#ffffff', secondary: '#808080', glitch: '#000000' },
  acid: { primary: '#00ff00', secondary: '#ffff00', glitch: '#ff0080' },
};

export class GlitchSpectrumVisualization implements Visualization {
  id = 'glitchSpectrum';
  name = 'Glitch Spectrum';
  author = 'Vizec';
  description = 'Frequency bars with intentional glitch effects on bass kicks';
  renderer: 'canvas2d' = 'canvas2d';
  transitionType: 'crossfade' = 'crossfade';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: GlitchSpectrumConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    barCount: 64,
    glitchIntensity: 1.0,
    mirror: true,
  };
  private width = 0;
  private height = 0;
  private smoothedData: number[] = [];
  private glitchOffset: number = 0;
  private colorOffset: number = 0;
  private lastBassPeak: boolean = false;
  private glitchFrames: number = 0;
  private lastGlitchTime: number = 0;
  private lastFlashTime: number = 0;

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

    // Initial resize
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    this.resize(width, height);

    // Initialize smoothed data
    this.smoothedData = new Array(this.config.barCount).fill(0);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { frequencyData, bass } = audioData;
    const { barCount, glitchIntensity, mirror, sensitivity, colorScheme } =
      this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    const now = performance.now();

    // Clear canvas
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Detect bass peaks for glitch triggers with safety cooldown
    const bassThreshold = 0.7 / (sensitivity > 1 ? Math.sqrt(sensitivity) : 1);
    const bassPeak = bass * sensitivity > bassThreshold;
    const canGlitch = now - this.lastGlitchTime > 200; // Max 5 glitches per second

    if (bassPeak && !this.lastBassPeak && canGlitch) {
      this.glitchFrames = Math.floor(2 + Math.random() * 4); // Reduced duration: 2-6 frames
      this.glitchOffset = (Math.random() - 0.5) * glitchIntensity * 20;
      this.colorOffset = (Math.random() - 0.5) * glitchIntensity * 50;
      this.lastGlitchTime = now;
    }

    this.lastBassPeak = bassPeak;

    // Decrement glitch frames
    if (this.glitchFrames > 0) {
      this.glitchFrames--;
    }

    const isGlitching = this.glitchFrames > 0;

    // Apply global glitch offset
    this.ctx.save();
    if (isGlitching) {
      this.ctx.translate(this.glitchOffset, 0);
    }

    // Calculate bar dimensions
    const totalBars = mirror ? barCount / 2 : barCount;
    const barWidth = (this.width - (totalBars - 1) * 2) / totalBars;
    const centerY = this.height / 2;

    // Sample frequency data
    const step = Math.floor(frequencyData.length / totalBars);

    for (let i = 0; i < totalBars; i++) {
      // Average frequency data
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += frequencyData[i * step + j];
      }

      // Apply frequency-dependent scaling
      const freqPosition = i / totalBars;
      const freqCompensation = 1 + freqPosition * 2.5;
      const bassAttenuation = freqPosition < 0.2 ? 0.5 + freqPosition * 2.5 : 1;

      const rawValue = (sum / step) * freqCompensation * bassAttenuation;
      const normalizedValue = Math.min(1, rawValue / 180);
      const boostedValue = Math.pow(normalizedValue, 0.8) * sensitivity;

      // Smooth the value
      this.smoothedData[i] = this.smoothedData[i] * 0.5 + boostedValue * 0.1;
      const smoothedValue = this.smoothedData[i];

      // Calculate bar height
      const barHeight = smoothedValue * this.height * 0.6;

      const x = i * (barWidth + 2);

      // Determine color with glitch effect
      let barColor;
      if (isGlitching && Math.random() < 0.3 * glitchIntensity) {
        barColor = colors.glitch;
      } else {
        // Gradient between colors
        const progress = freqPosition;
        barColor = this.lerpColor(colors.primary, colors.secondary, progress);
      }

      // Horizontal offset glitch
      let offsetX = 0;
      if (isGlitching && Math.random() < 0.4 * glitchIntensity) {
        offsetX = (Math.random() - 0.5) * glitchIntensity * 20;
      }

      // Vertical slice glitch (split bars)
      if (isGlitching && Math.random() < 0.2 * glitchIntensity) {
        const sliceY = Math.random() * this.height;
        const sliceHeight = Math.random() * 50 * glitchIntensity;

        // Top part
        this.ctx.fillStyle = barColor;
        this.ctx.fillRect(
          x + offsetX,
          centerY - barHeight,
          barWidth,
          sliceY - (centerY - barHeight),
        );

        // Bottom part (offset)
        const bottomOffset = (Math.random() - 0.5) * glitchIntensity * 15;
        this.ctx.fillRect(
          x + offsetX + bottomOffset,
          sliceY,
          barWidth,
          centerY + barHeight - sliceY,
        );
      } else {
        // Normal drawing
        this.ctx.fillStyle = barColor;

        if (mirror) {
          this.ctx.fillRect(
            x + offsetX,
            centerY - barHeight,
            barWidth,
            barHeight,
          );
          this.ctx.fillRect(x + offsetX, centerY, barWidth, barHeight);

          const mirrorX = this.width - x - barWidth - offsetX;
          this.ctx.fillRect(mirrorX, centerY - barHeight, barWidth, barHeight);
          this.ctx.fillRect(mirrorX, centerY, barWidth, barHeight);
        } else {
          this.ctx.fillRect(
            x + offsetX,
            this.height - barHeight * 2,
            barWidth,
            barHeight * 2,
          );
        }
      }

      // Color shift glitch (random bars change color)
      if (isGlitching && Math.random() < 0.1 * glitchIntensity) {
        this.ctx.fillStyle = colors.glitch;
        const randomHeight = Math.random() * barHeight * 0.3;
        const randomY = centerY - barHeight + Math.random() * barHeight * 2;
        this.ctx.fillRect(x + offsetX, randomY, barWidth, randomHeight);
      }
    }

    // Scanline effect during glitch - throttled for safety
    const canFlash = now - this.lastFlashTime > 150;
    if (isGlitching && canFlash && Math.random() < 0.2 * glitchIntensity) {
      const scanlineY = Math.random() * this.height;
      const scanlineHeight = Math.random() * 6 + 1;
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.15 * glitchIntensity})`;
      this.ctx.fillRect(0, scanlineY, this.width, scanlineHeight);
      this.lastFlashTime = now;
    }

    // RGB split effect on strong beats - throttled for safety
    if (isGlitching && canFlash && Math.random() < 0.15 * glitchIntensity) {
      const splitOffset = glitchIntensity * 3;
      this.ctx.globalCompositeOperation = 'screen';
      this.ctx.fillStyle = `rgba(255, 0, 0, 0.15)`;
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.globalCompositeOperation = 'source-over';
      this.lastFlashTime = now;
    }

    this.ctx.restore();
  }

  private lerpColor(color1: string, color2: string, t: number): string {
    const c1 = this.hexToRgb(color1);
    const c2 = this.hexToRgb(color2);

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);

    return `rgb(${r}, ${g}, ${b})`;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
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
    this.config = { ...this.config, ...config } as GlitchSpectrumConfig;

    if (this.smoothedData.length !== this.config.barCount) {
      this.smoothedData = new Array(this.config.barCount).fill(0);
    }
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
      barCount: {
        type: 'number',
        label: 'Bar Count',
        default: 64,
        min: 16,
        max: 256,
        step: 8,
      },
      colorScheme: {
        type: 'select',
        label: 'Color Scheme',
        default: 'cyanMagenta',
        options: [
          { value: 'cyanMagenta', label: 'Cyan/Magenta' },
          { value: 'darkTechno', label: 'Dark Techno' },
          { value: 'neon', label: 'Neon' },
          { value: 'monochrome', label: 'Monochrome' },
          { value: 'acid', label: 'Acid' },
        ],
      },
      glitchIntensity: {
        type: 'number',
        label: 'Glitch Intensity',
        default: 1.0,
        min: 0,
        max: 3,
        step: 0.1,
      },
      mirror: {
        type: 'boolean',
        label: 'Mirror Mode',
        default: true,
      },
    };
  }
}
