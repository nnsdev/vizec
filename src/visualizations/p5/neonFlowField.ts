import p5 from 'p5';
import {
  Visualization,
  AudioData,
  VisualizationConfig,
  ConfigSchema,
} from '../types';

interface NeonFlowFieldConfig extends VisualizationConfig {
  particleCount: number;
  colorScheme: string;
  flowSpeed: number;
  trailLength: number;
  baseColor: string;
}

const COLOR_SCHEMES: Record<
  string,
  { primary: string; secondary: string; tertiary: string }
> = {
  cyanMagenta: {
    primary: '#00ffff',
    secondary: '#ff00ff',
    tertiary: '#8000ff',
  },
  neon: { primary: '#39ff14', secondary: '#ff073a', tertiary: '#ffff00' },
  sunset: { primary: '#ff6600', secondary: '#ff0066', tertiary: '#ffcc00' },
  ocean: { primary: '#00bfff', secondary: '#00ffcc', tertiary: '#0066ff' },
  plasma: { primary: '#ff0080', secondary: '#00ff80', tertiary: '#8000ff' },
};

export class NeonFlowFieldVisualization implements Visualization {
  id = 'neonFlowField';
  name = 'Neon Flow Fields';
  author = 'Vizec';
  description =
    'Particles following flow vectors determined by audio energy, surging with beats';
  renderer: 'p5' = 'p5';
  transitionType: 'crossfade' = 'crossfade';

  private p5Instance: p5 | null = null;
  private container: HTMLElement | null = null;
  private config: NeonFlowFieldConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    particleCount: 2000,
    flowSpeed: 1.0,
    trailLength: 0.15,
    baseColor: 'cyanMagenta',
  };

  private width = 0;
  private height = 0;
  private currentAudioData: AudioData | null = null;
  private particles: Particle[] = [];
  private flowField: number[][] = [];
  private cols = 0;
  private rows = 0;
  private resolution = 20;
  private time = 0;

  private currentDeltaTime = 0.016;

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Initialize flow field
    this.cols = Math.ceil(container.clientWidth / this.resolution);
    this.rows = Math.ceil(container.clientHeight / this.resolution);
    this.flowField = new Array(this.cols)
      .fill(0)
      .map(() => new Array(this.rows).fill(0));

    // Initialize particles
    this.particles = [];
    for (let i = 0; i < this.config.particleCount; i++) {
      this.particles.push(new Particle());
    }

    // Create p5 instance
    this.p5Instance = new p5((p: p5) => {
      p.setup = () => {
        const canvas = p.createCanvas(
          container.clientWidth,
          container.clientHeight,
        );
        canvas.parent(container);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        this.width = container.clientWidth;
        this.height = container.clientHeight;
      };

      p.draw = () => {
        this.drawVisualization(p);
      };
    });
  }

  private drawVisualization(p: p5): void {
    if (!this.currentAudioData) return;

    const { frequencyData, bass, mid, treble, volume } = this.currentAudioData;
    const { flowSpeed, trailLength, colorScheme, sensitivity } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    this.time += 0.6 * this.currentDeltaTime;

    // Clear with transparent background
    p.clear();

    // Update flow field based on audio
    this.updateFlowField(p, frequencyData, bass, mid, treble);

    // Update and draw particles
    p.noStroke();

    for (let particle of this.particles) {
      particle.update(
        this.flowField,
        this.resolution,
        this.cols,
        this.rows,
        flowSpeed,
        sensitivity,
      );
      particle.checkEdges(this.width, this.height);
      particle.draw(p, colors, bass, volume, sensitivity);
    }
  }

  private updateFlowField(
    p: p5,
    frequencyData: Uint8Array,
    bass: number,
    mid: number,
    treble: number,
  ): void {
    const xOff = this.time;
    const yOff = this.time * 0.5;

    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        // Sample frequency data for this cell
        const freqIndex = Math.floor(
          (i + j * this.cols) *
            (frequencyData.length / (this.cols * this.rows)),
        );
        const freqValue = frequencyData[freqIndex] / 255;

        // Perlin noise angle modified by audio
        const noiseVal = p.noise(i * 0.1 + xOff, j * 0.1 + yOff, this.time);
        const angle = noiseVal * p.TWO_PI * 2;

        // Audio influences the flow field strength and direction
        const bassInfluence = bass * 2;
        const midInfluence = mid * 1;
        const trebleInfluence = treble * 0.5;

        // Combine influences
        const audioModulation =
          (bassInfluence + midInfluence + trebleInfluence) / 3.5;
        const finalAngle = angle + audioModulation;

        this.flowField[i][j] = finalAngle;
      }
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    this.currentAudioData = audioData;
    this.currentDeltaTime = deltaTime || 0.016;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    // Recalculate grid
    this.cols = Math.ceil(width / this.resolution);
    this.rows = Math.ceil(height / this.resolution);
    this.flowField = new Array(this.cols)
      .fill(0)
      .map(() => new Array(this.rows).fill(0));

    if (this.p5Instance) {
      this.p5Instance.resizeCanvas(width, height);
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as NeonFlowFieldConfig;

    // Reinitialize particles if count changed
    if (this.particles.length !== this.config.particleCount) {
      this.particles = [];
      for (let i = 0; i < this.config.particleCount; i++) {
        this.particles.push(new Particle());
      }
    }
  }

  destroy(): void {
    if (this.p5Instance) {
      this.p5Instance.remove();
      this.p5Instance = null;
    }
    this.container = null;
    this.currentAudioData = null;
    this.particles = [];
    this.flowField = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      particleCount: {
        type: 'number',
        label: 'Particle Count',
        default: 2000,
        min: 500,
        max: 5000,
        step: 100,
      },
      colorScheme: {
        type: 'select',
        label: 'Color Scheme',
        default: 'cyanMagenta',
        options: [
          { value: 'cyanMagenta', label: 'Cyan/Magenta' },
          { value: 'neon', label: 'Neon' },
          { value: 'sunset', label: 'Sunset' },
          { value: 'ocean', label: 'Ocean' },
          { value: 'plasma', label: 'Plasma' },
        ],
      },
      flowSpeed: {
        type: 'number',
        label: 'Flow Speed',
        default: 1.0,
        min: 0.1,
        max: 3,
        step: 0.1,
      },
      trailLength: {
        type: 'number',
        label: 'Trail Length',
        default: 0.15,
        min: 0.01,
        max: 0.5,
        step: 0.01,
      },
    };
  }
}

class Particle {
  pos;
  vel;
  acc;
  maxSpeed: number;
  prevPos;
  colorOffset: number;

  constructor() {
    this.pos = new p5.Vector(Math.random() * 1920, Math.random() * 1080);
    this.vel = new p5.Vector(0, 0);
    this.acc = new p5.Vector(0, 0);
    this.maxSpeed = 2 + Math.random() * 2;
    this.prevPos = this.pos.copy();
    this.colorOffset = Math.random();
  }

  update(
    flowField: number[][],
    resolution: number,
    cols: number,
    rows: number,
    speedMult: number,
    sensitivity: number,
  ): void {
    // Find grid cell
    const x = Math.floor(this.pos.x / resolution);
    const y = Math.floor(this.pos.y / resolution);

    // Get flow angle
    let angle = 0;
    if (x >= 0 && x < cols && y >= 0 && y < rows) {
      angle = flowField[x][y];
    }

    // Apply force from flow field
    const force = new p5.Vector(Math.cos(angle), Math.sin(angle));
    force.mult(0.5 * speedMult * sensitivity);
    this.applyForce(force);

    // Physics update
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed * speedMult * sensitivity);
    this.prevPos = this.pos.copy();
    this.pos.add(this.vel);
    this.acc.mult(0);
  }

  applyForce(force: ReturnType<typeof p5.Vector.prototype.copy>): void {
    this.acc.add(force);
  }

  checkEdges(width: number, height: number): void {
    if (this.pos.x > width) {
      this.pos.x = 0;
      this.prevPos.x = 0;
    } else if (this.pos.x < 0) {
      this.pos.x = width;
      this.prevPos.x = width;
    }

    if (this.pos.y > height) {
      this.pos.y = 0;
      this.prevPos.y = 0;
    } else if (this.pos.y < 0) {
      this.pos.y = height;
      this.prevPos.y = height;
    }
  }

  draw(
    p: p5,
    colors: { primary: string; secondary: string; tertiary: string },
    bass: number,
    volume: number,
    sensitivity: number,
  ): void {
    // Color based on position and bass
    const speed = this.vel.mag();
    const brightness = Math.min(100, 50 + volume * 50 * sensitivity);
    const saturation = 80 + bass * 20;

    // Interpolate between colors
    const c1 = p.color(colors.primary);
    const c2 = p.color(colors.secondary);
    const c3 = p.color(colors.tertiary);

    let finalColor;
    if (this.colorOffset < 0.33) {
      finalColor = p.lerpColor(c1, c2, this.colorOffset * 3);
    } else if (this.colorOffset < 0.66) {
      finalColor = p.lerpColor(c2, c3, (this.colorOffset - 0.33) * 3);
    } else {
      finalColor = p.lerpColor(c3, c1, (this.colorOffset - 0.66) * 3);
    }

    // Create new color with desired HSB values (p5 doesn't have setSaturation/setBrightness)
    const hue = p.hue(finalColor);
    p.colorMode(p.HSB, 360, 100, 100, 100);
    finalColor = p.color(hue, saturation, brightness, 60 + speed * 10);

    p.stroke(finalColor);
    p.strokeWeight(1 + bass * 2 * sensitivity);
    p.line(this.prevPos.x, this.prevPos.y, this.pos.x, this.pos.y);
  }
}
