import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

// Color schemes for plasma effect
const COLOR_SCHEMES: Record<string, { colors: [number, number, number][] }> = {
  cyanMagenta: {
    colors: [
      [0, 255, 255],    // cyan
      [255, 0, 255],    // magenta
      [0, 128, 255],    // blue
      [255, 0, 128],    // pink
    ],
  },
  darkTechno: {
    colors: [
      [26, 26, 46],     // dark blue
      [74, 0, 224],     // purple
      [128, 0, 255],    // violet
      [0, 0, 128],      // navy
    ],
  },
  neon: {
    colors: [
      [57, 255, 20],    // neon green
      [255, 7, 58],     // neon red
      [255, 255, 0],    // yellow
      [0, 255, 128],    // mint
    ],
  },
  fire: {
    colors: [
      [255, 69, 0],     // red-orange
      [255, 215, 0],    // gold
      [255, 140, 0],    // dark orange
      [255, 0, 0],      // red
    ],
  },
  ice: {
    colors: [
      [0, 191, 255],    // deep sky blue
      [224, 255, 255],  // light cyan
      [135, 206, 235],  // sky blue
      [176, 224, 230],  // powder blue
    ],
  },
  acid: {
    colors: [
      [0, 255, 0],      // green
      [255, 255, 0],    // yellow
      [0, 255, 65],     // bright green
      [128, 255, 0],    // lime
    ],
  },
  monochrome: {
    colors: [
      [255, 255, 255],  // white
      [128, 128, 128],  // gray
      [200, 200, 200],  // light gray
      [64, 64, 64],     // dark gray
    ],
  },
  purpleHaze: {
    colors: [
      [139, 0, 255],    // violet
      [255, 20, 147],   // deep pink
      [148, 0, 211],    // dark violet
      [186, 85, 211],   // medium orchid
    ],
  },
  sunset: {
    colors: [
      [255, 107, 107],  // coral
      [254, 202, 87],   // yellow
      [255, 159, 67],   // orange
      [255, 71, 87],    // red
    ],
  },
  ocean: {
    colors: [
      [0, 119, 190],    // blue
      [0, 212, 170],    // teal
      [0, 180, 216],    // cyan
      [0, 150, 199],    // ocean
    ],
  },
  toxic: {
    colors: [
      [0, 255, 65],     // toxic green
      [10, 255, 10],    // bright green
      [57, 255, 20],    // neon
      [0, 200, 50],     // dark green
    ],
  },
  bloodMoon: {
    colors: [
      [139, 0, 0],      // dark red
      [255, 69, 0],     // orange red
      [220, 20, 60],    // crimson
      [178, 34, 34],    // firebrick
    ],
  },
  synthwave: {
    colors: [
      [255, 0, 255],    // magenta
      [0, 255, 255],    // cyan
      [255, 0, 170],    // hot pink
      [0, 170, 255],    // light blue
    ],
  },
  golden: {
    colors: [
      [255, 215, 0],    // gold
      [255, 140, 0],    // dark orange
      [255, 179, 71],   // light orange
      [218, 165, 32],   // goldenrod
    ],
  },
};

interface PlasmaConfig extends VisualizationConfig {
  speed: number;
  scale: number;
  intensity: number;
}

export class PlasmaVisualization implements Visualization {
  id = 'plasma';
  name = 'Plasma';
  author = 'Vizec';
  description = 'Classic demoscene plasma effect with sine wave interference patterns';
  renderer: 'canvas2d' = 'canvas2d';
  transitionType: 'crossfade' = 'crossfade';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: PlasmaConfig = {
    sensitivity: 1.0,
    colorScheme: 'synthwave',
    speed: 1.0,
    scale: 1.0,
    intensity: 1.0,
  };
  private width = 0;
  private height = 0;
  private time = 0;
  private imageData: ImageData | null = null;

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
    if (!this.ctx || !this.canvas || !this.imageData) return;

    const { frequencyData, bass, mid, treble } = audioData;
    const { speed, scale, intensity, sensitivity, colorScheme } = this.config;
    const schemeData = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.synthwave;
    const colors = schemeData.colors;

    // Audio-reactive parameters
    const audioSpeed = speed * (1 + bass * sensitivity * 2);
    const audioScale = scale * (1 + mid * sensitivity * 0.5);
    const audioIntensity = intensity * (1 + treble * sensitivity);

    // Bass increases color saturation/vividness
    const saturationBoost = 1 + bass * sensitivity * 0.5;

    // Update time based on audio-reactive speed
    this.time += deltaTime * audioSpeed * 0.001;

    const data = this.imageData.data;
    const w = this.width;
    const h = this.height;

    // Downscale for performance (render at 1/4 resolution)
    const pixelSize = 4;
    const scaledW = Math.ceil(w / pixelSize);
    const scaledH = Math.ceil(h / pixelSize);

    // Generate plasma using sine wave interference patterns
    for (let y = 0; y < scaledH; y++) {
      for (let x = 0; x < scaledW; x++) {
        const px = x * pixelSize;
        const py = y * pixelSize;

        // Normalized coordinates
        const nx = (px / w - 0.5) * audioScale;
        const ny = (py / h - 0.5) * audioScale;

        // Classic plasma formula with multiple sine waves
        const t = this.time;

        // Sine wave interference patterns
        const v1 = Math.sin(nx * 10 + t);
        const v2 = Math.sin(10 * (nx * Math.sin(t / 2) + ny * Math.cos(t / 3)) + t);
        const v3 = Math.sin(Math.sqrt(100 * (nx * nx + ny * ny) + 1) + t);

        const cx = nx + 0.5 * Math.sin(t / 5);
        const cy = ny + 0.5 * Math.cos(t / 3);
        const v4 = Math.sin(Math.sqrt(100 * (cx * cx + cy * cy) + 1) + t);

        // Combine the waves
        const value = (v1 + v2 + v3 + v4) / 4;

        // Map to color using the scheme
        const colorIndex = (value + 1) / 2; // Normalize to 0-1
        const colorPos = colorIndex * (colors.length - 1);
        const c1Index = Math.floor(colorPos);
        const c2Index = Math.min(c1Index + 1, colors.length - 1);
        const blend = colorPos - c1Index;

        // Interpolate between colors
        const c1 = colors[c1Index];
        const c2 = colors[c2Index];

        let r = c1[0] + (c2[0] - c1[0]) * blend;
        let g = c1[1] + (c2[1] - c1[1]) * blend;
        let b = c1[2] + (c2[2] - c1[2]) * blend;

        // Apply saturation boost from bass
        const avg = (r + g + b) / 3;
        r = avg + (r - avg) * saturationBoost;
        g = avg + (g - avg) * saturationBoost;
        b = avg + (b - avg) * saturationBoost;

        // Apply intensity
        r = Math.min(255, r * audioIntensity);
        g = Math.min(255, g * audioIntensity);
        b = Math.min(255, b * audioIntensity);

        // Fill the pixel block
        for (let dy = 0; dy < pixelSize && py + dy < h; dy++) {
          for (let dx = 0; dx < pixelSize && px + dx < w; dx++) {
            const idx = ((py + dy) * w + (px + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 140; // ~55% opacity for transparency
          }
        }
      }
    }

    // Clear and draw
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    if (this.ctx) {
      this.imageData = this.ctx.createImageData(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as PlasmaConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.imageData = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      speed: {
        type: 'number',
        label: 'Speed',
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      scale: {
        type: 'number',
        label: 'Scale',
        default: 1.0,
        min: 0.5,
        max: 3.0,
        step: 0.1,
      },
      intensity: {
        type: 'number',
        label: 'Intensity',
        default: 1.0,
        min: 0.5,
        max: 2.0,
        step: 0.1,
      },
      colorScheme: {
        type: 'select',
        label: 'Color Scheme',
        default: 'synthwave',
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
      },
    };
  }
}
