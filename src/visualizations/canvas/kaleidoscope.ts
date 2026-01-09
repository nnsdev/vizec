import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

const COLOR_SCHEMES: Record<string, { colors: string[] }> = {
  cyanMagenta: { colors: ['#00ffff', '#ff00ff', '#8000ff', '#00ff80'] },
  darkTechno: { colors: ['#4a00e0', '#8e2de2', '#1a1a2e', '#6b21a8'] },
  neon: { colors: ['#39ff14', '#ff073a', '#ffff00', '#ff6600'] },
  fire: { colors: ['#ff4500', '#ffd700', '#ff8c00', '#ff0000'] },
  ice: { colors: ['#00bfff', '#e0ffff', '#1e90ff', '#87ceeb'] },
  acid: { colors: ['#adff2f', '#00ff00', '#7fff00', '#32cd32'] },
  monochrome: { colors: ['#ffffff', '#cccccc', '#999999', '#666666'] },
  purpleHaze: { colors: ['#8b00ff', '#ff1493', '#9400d3', '#ba55d3'] },
  sunset: { colors: ['#ff6b6b', '#feca57', '#ff9f43', '#ee5a24'] },
  ocean: { colors: ['#0077be', '#00d4aa', '#00b4d8', '#48cae4'] },
  toxic: { colors: ['#00ff41', '#0aff0a', '#39ff14', '#7cfc00'] },
  bloodMoon: { colors: ['#8b0000', '#ff4500', '#dc143c', '#b22222'] },
  synthwave: { colors: ['#ff00ff', '#00ffff', '#ff00aa', '#aa00ff'] },
  golden: { colors: ['#ffd700', '#ff8c00', '#ffb347', '#daa520'] },
};

interface Shape {
  type: 'line' | 'arc' | 'triangle';
  angle: number;
  distance: number;
  size: number;
  color: string;
  rotation: number;
  speed: number;
}

export class KaleidoscopeVisualization implements Visualization {
  id = 'kaleidoscope';
  name = 'Kaleidoscope';
  author = 'Vizec';
  description = 'Mirrored geometric patterns that morph with audio';
  renderer = 'canvas2d' as const;
  transitionType = 'crossfade' as const;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: VisualizationConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    segments: 12,
    shapeCount: 8,
    rotationSpeed: 0.5,
    complexity: 3,
  };

  private shapes: Shape[] = [];
  private globalRotation = 0;
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

    this.initShapes();
  }

  private initShapes(): void {
    const { shapeCount, colorScheme, complexity } = this.config;
    const colors = COLOR_SCHEMES[colorScheme]?.colors || COLOR_SCHEMES.cyanMagenta.colors;

    this.shapes = [];
    for (let i = 0; i < shapeCount * complexity; i++) {
      const types: ('line' | 'arc' | 'triangle')[] = ['line', 'arc', 'triangle'];
      this.shapes.push({
        type: types[Math.floor(Math.random() * types.length)],
        angle: Math.random() * Math.PI * 2,
        distance: 50 + Math.random() * 200,
        size: 20 + Math.random() * 80,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        speed: (Math.random() - 0.5) * 2,
      });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume, frequencyData } = audioData;
    const { sensitivity, colorScheme, segments, rotationSpeed } = this.config;
    const colors = COLOR_SCHEMES[colorScheme]?.colors || COLOR_SCHEMES.cyanMagenta.colors;

    this.time += deltaTime;

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) / 2;

    // Global rotation based on audio
    this.globalRotation += deltaTime * rotationSpeed * (1 + mid * sensitivity);

    // Set transparency
    this.ctx.globalAlpha = 0.6;

    // Draw kaleidoscope segments
    const segmentAngle = (Math.PI * 2) / segments;

    this.ctx.save();
    this.ctx.translate(centerX, centerY);

    for (let seg = 0; seg < segments; seg++) {
      this.ctx.save();
      this.ctx.rotate(seg * segmentAngle + this.globalRotation);

      // Clip to segment
      this.ctx.beginPath();
      this.ctx.moveTo(0, 0);
      this.ctx.lineTo(maxRadius * 1.5, 0);
      this.ctx.arc(0, 0, maxRadius * 1.5, 0, segmentAngle);
      this.ctx.closePath();
      this.ctx.clip();

      // Mirror every other segment
      if (seg % 2 === 1) {
        this.ctx.scale(1, -1);
        this.ctx.rotate(segmentAngle);
      }

      // Draw shapes
      for (let i = 0; i < this.shapes.length; i++) {
        const shape = this.shapes[i];
        
        // Get frequency influence for this shape
        const freqIndex = Math.floor((i / this.shapes.length) * frequencyData.length * 0.5);
        const freqValue = frequencyData[freqIndex] / 255;

        // Update shape based on audio
        shape.rotation += shape.speed * deltaTime * (1 + freqValue * sensitivity * 2);
        const dynamicDistance = shape.distance + freqValue * sensitivity * 100;
        const dynamicSize = shape.size * (0.5 + freqValue * sensitivity);

        const x = Math.cos(shape.angle + this.time * shape.speed * 0.5) * dynamicDistance;
        const y = Math.sin(shape.angle + this.time * shape.speed * 0.5) * dynamicDistance * 0.5;

        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(shape.rotation);

        // Set color with glow
        this.ctx.strokeStyle = shape.color;
        this.ctx.fillStyle = shape.color + '40';
        this.ctx.lineWidth = 2 + freqValue * 3;
        this.ctx.shadowBlur = 10 + freqValue * 15;
        this.ctx.shadowColor = shape.color;

        // Draw shape based on type
        switch (shape.type) {
          case 'line':
            this.ctx.beginPath();
            this.ctx.moveTo(-dynamicSize / 2, 0);
            this.ctx.lineTo(dynamicSize / 2, 0);
            this.ctx.stroke();
            break;

          case 'arc':
            this.ctx.beginPath();
            this.ctx.arc(0, 0, dynamicSize / 2, 0, Math.PI * (0.5 + freqValue));
            this.ctx.stroke();
            break;

          case 'triangle':
            this.ctx.beginPath();
            const triSize = dynamicSize / 2;
            this.ctx.moveTo(0, -triSize);
            this.ctx.lineTo(-triSize * 0.866, triSize * 0.5);
            this.ctx.lineTo(triSize * 0.866, triSize * 0.5);
            this.ctx.closePath();
            this.ctx.stroke();
            this.ctx.globalAlpha = 0.2;
            this.ctx.fill();
            this.ctx.globalAlpha = 0.6;
            break;
        }

        this.ctx.restore();
      }

      this.ctx.restore();
    }

    this.ctx.restore();

    // Center mandala
    const centerSize = 30 + bass * sensitivity * 50;
    this.ctx.globalAlpha = 0.5;
    
    for (let ring = 3; ring >= 0; ring--) {
      const ringRadius = centerSize * (ring + 1) * 0.3;
      const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, ringRadius);
      gradient.addColorStop(0, colors[ring % colors.length] + '60');
      gradient.addColorStop(1, 'transparent');
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      this.ctx.fill();
    }

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
    const oldShapeCount = this.config.shapeCount;
    const oldComplexity = this.config.complexity;
    this.config = { ...this.config, ...config };

    if ((config.shapeCount && config.shapeCount !== oldShapeCount) ||
        (config.complexity && config.complexity !== oldComplexity)) {
      this.initShapes();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.shapes = [];
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
      segments: { type: 'number', min: 4, max: 24, step: 2, default: 12, label: 'Segments' },
      shapeCount: { type: 'number', min: 4, max: 16, step: 2, default: 8, label: 'Shape Count' },
      rotationSpeed: { type: 'number', min: 0.1, max: 2, step: 0.1, default: 0.5, label: 'Rotation Speed' },
      complexity: { type: 'number', min: 1, max: 5, step: 1, default: 3, label: 'Complexity' },
    };
  }
}
