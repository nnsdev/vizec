import p5 from 'p5';
import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

interface CircularWaveConfig extends VisualizationConfig {
  rings: number;
  colorScheme: string;
  rotationSpeed: number;
  lineWidth: number;
  pulse: boolean;
}

const COLOR_SCHEMES: Record<string, { primary: string; secondary: string; accent: string }> = {
  cyanMagenta: { primary: '#00ffff', secondary: '#ff00ff', accent: '#ffffff' },
  darkTechno: { primary: '#4a00e0', secondary: '#8000ff', accent: '#1a1a2e' },
  neon: { primary: '#39ff14', secondary: '#ff073a', accent: '#ffff00' },
  monochrome: { primary: '#ffffff', secondary: '#808080', accent: '#404040' },
  acid: { primary: '#00ff00', secondary: '#ffff00', accent: '#88ff00' },
};

export class CircularWaveVisualization implements Visualization {
  id = 'circularWave';
  name = 'Circular Waveform';
  author = 'Vizec';
  description = 'Circular oscilloscope with geometric patterns';
  renderer: 'p5' = 'p5';
  transitionType: 'zoom' = 'zoom';

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: CircularWaveConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    rings: 3,
    rotationSpeed: 0.5,
    lineWidth: 2,
    pulse: true,
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private rotation = 0;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Create p5 instance in instance mode
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(container.clientWidth, container.clientHeight);
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        p.strokeCap(p.ROUND);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private drawVisualization(p: p5): void {
    const { rings, colorScheme, rotationSpeed, lineWidth, pulse, sensitivity } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear with transparent background
    p.clear();

    if (!this.currentAudioData) {
      return;
    }

    const { frequencyData, timeDomainData, bass, volume } = this.currentAudioData;
    const centerX = this.width / 2;
    const centerY = this.height / 2;
    const maxRadius = Math.min(this.width, this.height) * 0.4;

    // Update rotation
    this.rotation += rotationSpeed * 0.02 * (1 + bass * sensitivity);

    p.push();
    p.translate(centerX, centerY);
    p.rotate(this.rotation);

    // Draw rings
    for (let ring = 0; ring < rings; ring++) {
      const ringProgress = ring / rings;
      const baseRadius = maxRadius * (0.3 + ringProgress * 0.7);
      const pulseAmount = pulse ? bass * 20 * sensitivity : 0;
      const radius = baseRadius + pulseAmount * (1 - ringProgress * 0.5);

      // Choose color based on ring with transparency
      let strokeColor;
      if (ring === 0) {
        strokeColor = p.color(colors.primary);
      } else if (ring === rings - 1) {
        strokeColor = p.color(colors.secondary);
      } else {
        strokeColor = p.lerpColor(p.color(colors.primary), p.color(colors.secondary), ringProgress);
      }
      
      // Add transparency (70% opacity)
      strokeColor.setAlpha(70);
      p.stroke(strokeColor);
      p.strokeWeight(lineWidth * (1 + volume * 0.5));
      p.noFill();

      // Draw waveform in circular pattern using frequency data for more reactivity
      p.beginShape();
      const points = 128; // Use fewer points for smoother shape
      const angleStep = p.TWO_PI / points;
      const freqStep = Math.floor(frequencyData.length / points);

      for (let i = 0; i < points; i++) {
        const angle = i * angleStep + ring * (p.PI / rings);
        
        // Use frequency data instead of time domain for more visible reaction
        const freqValue = frequencyData[i * freqStep] / 255;
        // Also incorporate time domain for subtle wave motion
        const timeValue = (timeDomainData[i * freqStep] / 128 - 1);
        
        // Much more aggressive scaling
        const combinedValue = (freqValue * 0.8 + timeValue * 0.2) * sensitivity * 3;
        const waveRadius = radius + combinedValue * 100 * (1 + ring * 0.3);

        const x = Math.cos(angle) * waveRadius;
        const y = Math.sin(angle) * waveRadius;

        p.curveVertex(x, y);
      }
      p.endShape(p.CLOSE);
    }

    // Draw frequency spikes
    const spikeCount = 64;
    const spikeStep = Math.floor(frequencyData.length / spikeCount);

    for (let i = 0; i < spikeCount; i++) {
      const angle = (i / spikeCount) * p.TWO_PI;
      const freqValue = frequencyData[i * spikeStep] / 255 * sensitivity * 2; // Double the sensitivity

      if (freqValue > 0.02) { // Much lower threshold
        const innerRadius = maxRadius * 0.25;
        const outerRadius = innerRadius + freqValue * maxRadius * 0.8; // Longer spikes

        const x1 = Math.cos(angle) * innerRadius;
        const y1 = Math.sin(angle) * innerRadius;
        const x2 = Math.cos(angle) * outerRadius;
        const y2 = Math.sin(angle) * outerRadius;

        // Gradient from center outward
        const alpha = 30 + freqValue * 70;
        const spikeColor = p.color(colors.accent);
        spikeColor.setAlpha(alpha);

        p.stroke(spikeColor);
        p.strokeWeight(lineWidth * 0.5);
        p.line(x1, y1, x2, y2);
      }
    }

    // Center circle pulse
    if (pulse) {
      const centerRadius = 10 + bass * 80 * sensitivity; // Much bigger pulse
      const centerColor = p.color(colors.accent);
      centerColor.setAlpha(35 + bass * 35); // More transparent
      p.fill(centerColor);
      p.noStroke();
      p.ellipse(0, 0, centerRadius * 2, centerRadius * 2);
    }

    p.pop();
  }

  render(audioData: AudioData, deltaTime: number): void {
    this.currentAudioData = audioData;
    // p5 handles its own draw loop, we just update the data
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as CircularWaveConfig;
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      rings: {
        type: 'number',
        label: 'Ring Count',
        default: 3,
        min: 1,
        max: 6,
        step: 1,
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
      rotationSpeed: {
        type: 'number',
        label: 'Rotation Speed',
        default: 0.5,
        min: 0,
        max: 2,
        step: 0.1,
      },
      lineWidth: {
        type: 'number',
        label: 'Line Width',
        default: 2,
        min: 1,
        max: 5,
        step: 0.5,
      },
      pulse: {
        type: 'boolean',
        label: 'Pulse Effect',
        default: true,
      },
    };
  }
}
