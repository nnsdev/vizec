import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface WindyGrassConfig extends VisualizationConfig {
  density: number;
  windSpeed: number;
  colorScheme: string;
}

interface GrassBlade {
  x: number;
  height: number;
  lean: number; // Current bend
  stiffness: number; // How hard it is to bend
  phase: number;
}

export class WindyGrassVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "windyGrass",
    name: "Windy Grass",
    author: "Vizec",
    description: "Field of grass that waves with the sound waves",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: WindyGrassConfig = {
    sensitivity: 1.0,
    density: 100,
    windSpeed: 1.0,
    colorScheme: "nature",
  };
  private width = 0;
  private height = 0;
  private blades: GrassBlade[] = [];
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
  }

  private initGrass(): void {
    this.blades = [];
    const { density } = this.config;
    
    // We want to fill the width
    // Density is just a number, let's say "blades per screen width approx"
    const count = density;
    const spacing = this.width / count;
    
    for (let i = 0; i < count; i++) {
        // Randomize position slightly so it's not a perfect grid
        const x = (i * spacing) + (Math.random() * spacing * 0.5);
        
        // Parallax depth? Let's keep it 2D for now, maybe vary height
        const height = this.height * (0.15 + Math.random() * 0.15); // Bottom 15-30% of screen

        this.blades.push({
            x,
            height,
            lean: 0,
            stiffness: 0.5 + Math.random() * 0.5, // 0.5 - 1.0
            phase: Math.random() * Math.PI * 2
        });
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, colorScheme, windSpeed } = this.config;
    const { timeDomainData, bass } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Audio Mapping:
    // Waveform (timeDomainData) maps to wind flowing across the screen.
    // The timeDomainData is an array of 0-255 values (128 is center).
    // We scroll through this buffer or map x-pos to index?
    // Mapping x-pos to index creates a standing wave effect which is nice.
    
    // Also add some base "wind" that moves.
    
    const waveData = timeDomainData;
    const dataLen = waveData.length;

    this.ctx.lineCap = "round";
    
    // Draw from back to front? Or just one layer.
    // Gradient: Bottom is dark, tip is bright
    
    const gradient = this.ctx.createLinearGradient(0, this.height, 0, this.height - 200);
    gradient.addColorStop(0, colors.start);
    gradient.addColorStop(1, colors.end);
    this.ctx.strokeStyle = gradient;

    this.blades.forEach((blade) => {
        // Get local audio value
        // Map blade X to buffer index
        const idx = Math.floor((blade.x / this.width) * dataLen) % dataLen;
        const waveVal = (waveData[idx] - 128) / 128; // -1 to 1
        
        // Physics
        // Natural sway
        const sway = Math.sin(this.time * windSpeed + blade.phase) * 10;
        
        // Audio force
        // Waveform bends the grass directly
        const force = waveVal * 50 * sensitivity * blade.stiffness;
        
        // Bass kick adds vertical scale?
        // Let's make it grow/stretch
        const stretch = 1.0 + (bass * sensitivity * 0.1);

        const tipX = blade.x + sway + force;
        const tipY = this.height - (blade.height * stretch);
        
        // Control point for Quadratic curve
        // Put it somewhere between base and tip, but offset to make it curve nicely
        const ctrlX = blade.x + (tipX - blade.x) * 0.3;
        const ctrlY = this.height - (blade.height * 0.5);

        // Draw Blade
        this.ctx!.beginPath();
        this.ctx!.moveTo(blade.x, this.height);
        this.ctx!.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
        
        // Width based on bass?
        this.ctx!.lineWidth = 2 + (bass * 2);
        
        // Color variation
        this.ctx!.stroke();
    });
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initGrass();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldDensity = this.config.density;
    this.config = { ...this.config, ...config } as WindyGrassConfig;
    
    if (this.config.density !== oldDensity) {
        this.initGrass();
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
        label: "Color Scheme",
        default: "nature",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      density: {
        type: "number",
        label: "Grass Density",
        default: 100,
        min: 20,
        max: 300,
        step: 10,
      },
      windSpeed: {
        type: "number",
        label: "Wind Speed",
        default: 1.0,
        min: 0.1,
        max: 5.0,
        step: 0.1,
      },
    };
  }
}
