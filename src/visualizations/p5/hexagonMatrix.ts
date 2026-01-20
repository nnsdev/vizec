import p5 from "p5";
import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";

interface HexagonMatrixConfig extends VisualizationConfig {
  hexSize: number;
  spacing: number;
  bassWaveIntensity: number;
  colorScheme: string;
  showGrid: boolean;
}

const COLOR_SCHEMES: Record<
  string,
  { primary: string; secondary: string; tertiary: string; accent: string }
> = {
  cyberpunk: {
    primary: "#00ffff",
    secondary: "#ff00ff",
    tertiary: "#8000ff",
    accent: "#39ff14",
  },
  neon: {
    primary: "#ff0080",
    secondary: "#00ff80",
    tertiary: "#8000ff",
    accent: "#ffff00",
  },
  sunset: {
    primary: "#ff6600",
    secondary: "#ff0066",
    tertiary: "#ffcc00",
    accent: "#ff0080",
  },
  ice: {
    primary: "#00d4ff",
    secondary: "#ffffff",
    tertiary: "#0099cc",
    accent: "#80e5ff",
  },
  fire: {
    primary: "#ff4400",
    secondary: "#ff8800",
    tertiary: "#ffcc00",
    accent: "#ff0000",
  },
};

class HexCell {
  x: number;
  y: number;
  q: number; // Axial coordinate q
  r: number; // Axial coordinate r
  energy: number = 0;
  targetEnergy: number = 0;
  wavePhase: number = 0;

  constructor(x: number, y: number, q: number, r: number) {
    this.x = x;
    this.y = y;
    this.q = q;
    this.r = r;
    this.wavePhase = Math.sqrt(q * q + r * r);
  }

  update(freqValue: number, _bass: number, deltaTime: number): void {
    this.targetEnergy = freqValue / 255;
    // Smooth energy transition
    this.energy += (this.targetEnergy - this.energy) * 5 * deltaTime;
  }
}

export class HexagonMatrixVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "hexagonMatrix",
    name: "Hexagon Matrix",
    author: "Vizec",
    renderer: "p5",
    transitionType: "crossfade",
  };

  private container: HTMLElement | null = null;
  private sketch: p5 | null = null;
  private hexes: HexCell[][] = [];
  private hexesFlat: HexCell[] = [];
  private time = 0;
  private lastBassTime = 0;

  private config: HexagonMatrixConfig = {
    sensitivity: 1.0,
    hexSize: 15,
    spacing: 2,
    bassWaveIntensity: 1.0,
    colorScheme: "cyberpunk",
    showGrid: false,
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.container = container;
    this.updateConfig(config);

    // Create p5 instance
    this.sketch = new p5((p: p5) => {
      p.setup = () => this.setup(p);
      p.draw = () => this.draw(p);
      p.windowResized = () => this.resize(container.clientWidth, container.clientHeight);
    }, container);
  }

  private setup(p: p5): void {
    p.colorMode(p.HSB, 360, 100, 100, 100);
    this.createHexGrid(p);
  }

  private createHexGrid(p: p5): void {
    this.hexes = [];
    this.hexesFlat = [];

    const { hexSize, spacing } = this.config;
    const hexWidth = Math.sqrt(3) * hexSize + spacing;
    const hexHeight = 2 * hexSize + spacing * 0.866;

    // Create grid that covers the screen
    const cols = Math.ceil(p.width / hexWidth) + 2;
    const rows = Math.ceil(p.height / hexHeight) + 2;

    for (let r = 0; r < rows; r++) {
      const row: HexCell[] = [];
      const y = r * hexHeight * 0.75 - hexHeight;

      for (let q = 0; q < cols; q++) {
        const x = q * hexWidth + (r % 2) * (hexWidth / 2) - hexWidth / 2;
        const hex = new HexCell(x, y, q, r);
        row.push(hex);
        this.hexesFlat.push(hex);
      }
      this.hexes.push(row);
    }
  }

  private draw(p: p5): void {
    // Clear with transparent background
    p.clear();

    const colors = COLOR_SCHEMES[this.config.colorScheme] || COLOR_SCHEMES.cyberpunk;
    const { sensitivity, hexSize, bassWaveIntensity, showGrid } = this.config;

    const maxDist = Math.sqrt((p.width / 2) ** 2 + (p.height / 2) ** 2);
    const bottomCutoff = p.height * 0.67; // Only render top 2/3

    this.hexesFlat.forEach((hex) => {
      // Skip hexes in bottom third
      if (hex.y > bottomCutoff) return;
      // Calculate distance from center for radial wave
      const dx = hex.x - p.width / 2;
      const dy = hex.y - p.height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Radial wave pulse effect (matches render logic)
      const waveTime = this.time * 3;
      const waveRadius = (waveTime % 2) * maxDist;
      const waveProximity = 1 - Math.min(1, Math.abs(dist - waveRadius) / 150);
      const waveEffect = waveProximity * bassWaveIntensity;

      // Color based on energy and wave
      const energyLevel = Math.min(1, hex.energy * sensitivity * (1 + waveEffect * 1.5));

      if (energyLevel > 0.02) {
        // Color interpolation based on energy
        const c1 = p.color(colors.primary);
        const c2 = p.color(colors.secondary);
        const c3 = p.color(colors.tertiary);
        const c4 = p.color(colors.accent);

        let color;
        if (energyLevel < 0.25) {
          color = p.lerpColor(c1, c2, energyLevel * 4);
        } else if (energyLevel < 0.5) {
          color = p.lerpColor(c2, c3, (energyLevel - 0.25) * 4);
        } else if (energyLevel < 0.75) {
          color = p.lerpColor(c3, c4, (energyLevel - 0.5) * 4);
        } else {
          color = c4;
        }

        // Apply brightness based on energy - more vibrant
        const brightness = 40 + energyLevel * 60;
        const hue = p.hue(color);
        const saturation = Math.min(100, p.saturation(color) * 1.2);
        p.colorMode(p.HSB, 360, 100, 100, 100);
        color = p.color(hue, saturation, brightness, 40 + energyLevel * 60);

        p.fill(color);

        // Add glow effect on high energy
        if (energyLevel > 0.5) {
          p.stroke(hue, saturation * 0.8, 100, energyLevel * 30);
          p.strokeWeight(2);
        } else {
          p.noStroke();
        }

        // Draw hexagon - more size variation
        this.drawHexagon(p, hex.x, hex.y, hexSize * (0.6 + energyLevel * 0.6));
      } else if (showGrid) {
        // Draw faint grid
        p.stroke(220, 20, 30, 10);
        p.strokeWeight(1);
        p.noFill();
        this.drawHexagon(p, hex.x, hex.y, hexSize * 0.6);
      }
    });
  }

  private drawHexagon(p: p5, x: number, y: number, size: number): void {
    p.beginShape();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + size * Math.cos(angle);
      const py = y + size * Math.sin(angle);
      p.vertex(px, py);
    }
    p.endShape(p.CLOSE);
  }

  render(audioData: AudioData, deltaTime: number): void {
    const { frequencyData, bass } = audioData;
    const { sensitivity, bassWaveIntensity } = this.config;

    // Normalize deltaTime to seconds
    let dt = deltaTime || 0.016;
    if (dt > 1) dt = dt / 1000;
    dt = Math.max(0.001, Math.min(0.1, dt));

    this.time += dt;

    // Calculate center and max distance for normalization
    const centerX = this.sketch ? this.sketch.width / 2 : 960;
    const centerY = this.sketch ? this.sketch.height / 2 : 540;
    const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

    // Update hexes with frequency data based on distance from center
    this.hexesFlat.forEach((hex) => {
      // Calculate distance from center
      const dx = hex.x - centerX;
      const dy = hex.y - centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = dist / maxDist;

      // Map distance to frequency band (center = bass, edges = treble)
      const freqIndex = Math.floor(normalizedDist * frequencyData.length * 0.8);
      const freqValue = frequencyData[Math.min(freqIndex, frequencyData.length - 1)];

      // Radial wave that pulses outward from center
      const waveTime = this.time * 3;
      const waveRadius = (waveTime % 2) * maxDist; // Wave expands outward
      const waveProximity = 1 - Math.min(1, Math.abs(dist - waveRadius) / 150);
      const bassWave = waveProximity * bass * bassWaveIntensity * sensitivity;

      hex.update(freqValue * (1 + bassWave * 2), bass, dt);
    });
  }

  resize(width: number, height: number): void {
    if (!this.sketch) return;
    this.sketch.resizeCanvas(width, height);
    this.createHexGrid(this.sketch);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldHexSize = this.config.hexSize;
    const oldSpacing = this.config.spacing;
    const oldColorScheme = this.config.colorScheme;
    const oldShowGrid = this.config.showGrid;

    this.config = { ...this.config, ...config } as HexagonMatrixConfig;

    // Recreate grid if dimensions changed
    if (
      this.sketch &&
      (this.config.hexSize !== oldHexSize ||
        this.config.spacing !== oldSpacing ||
        this.config.colorScheme !== oldColorScheme ||
        this.config.showGrid !== oldShowGrid)
    ) {
      this.createHexGrid(this.sketch);
    }
  }

  destroy(): void {
    if (this.sketch && this.container) {
      this.sketch.remove();
    }
    this.sketch = null;
    this.container = null;
    this.hexes = [];
    this.hexesFlat = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      hexSize: {
        type: "number",
        label: "Hexagon Size",
        default: 15,
        min: 5,
        max: 30,
        step: 1,
      },
      spacing: {
        type: "number",
        label: "Spacing",
        default: 2,
        min: 0,
        max: 10,
        step: 1,
      },
      bassWaveIntensity: {
        type: "number",
        label: "Bass Wave Intensity",
        default: 1.0,
        min: 0,
        max: 3,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "cyberpunk",
        options: [
          { value: "cyberpunk", label: "Cyberpunk" },
          { value: "neon", label: "Neon" },
          { value: "sunset", label: "Sunset" },
          { value: "ice", label: "Ice" },
          { value: "fire", label: "Fire" },
        ],
      },
      showGrid: {
        type: "boolean",
        label: "Show Grid",
        default: false,
      },
    };
  }
}
