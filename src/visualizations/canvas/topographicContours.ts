import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

// --- Inline simplex-style 2D noise ---

// Permutation table (doubled to avoid wrapping)
const PERM: number[] = [];
const GRAD: number[][] = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

(function initPerm() {
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  // Deterministic shuffle (seed-like)
  for (let i = 255; i > 0; i--) {
    const j = (i * 7 + 13) & 255;
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

function dot2(g: number[], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

/** Classic Perlin noise 2D, returns value in roughly [-1, 1] */
function noise2D(x: number, y: number): number {
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);

  const u = fade(xf);
  const v = fade(yf);

  const aa = PERM[PERM[xi] + yi] & 7;
  const ab = PERM[PERM[xi] + yi + 1] & 7;
  const ba = PERM[PERM[xi + 1] + yi] & 7;
  const bb = PERM[PERM[xi + 1] + yi + 1] & 7;

  const x1 = lerp(dot2(GRAD[aa], xf, yf), dot2(GRAD[ba], xf - 1, yf), u);
  const x2 = lerp(dot2(GRAD[ab], xf, yf - 1), dot2(GRAD[bb], xf - 1, yf - 1), u);

  return lerp(x1, x2, v);
}

/** Fractal Brownian Motion - layered noise for natural detail */
function fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(x * frequency, y * frequency);
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp;
}

// --- Hex color parsing ---

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbString(r: number, g: number, b: number, a: number): string {
  return `rgba(${r},${g},${b},${a})`;
}

// --- Marching Squares ---

// Line segment lookup for marching squares (maps 4-bit cell case to edge pairs)
// Edge indices: 0=top, 1=right, 2=bottom, 3=left
const MS_EDGES: number[][][] = [
  [],                   // 0
  [[3, 2]],             // 1
  [[2, 1]],             // 2
  [[3, 1]],             // 3
  [[1, 0]],             // 4
  [[1, 0], [3, 2]],    // 5 saddle
  [[2, 0]],             // 6
  [[3, 0]],             // 7
  [[0, 3]],             // 8
  [[0, 2]],             // 9
  [[0, 3], [2, 1]],    // 10 saddle
  [[0, 1]],             // 11
  [[1, 3]],             // 12
  [[1, 2]],             // 13
  [[2, 3]],             // 14
  [],                   // 15
];

interface ContourSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Extract contour line segments at a given threshold from a 2D grid.
 * Uses linear interpolation along cell edges for smooth contours.
 */
function marchingSquares(
  grid: Float64Array,
  cols: number,
  rows: number,
  threshold: number,
  cellW: number,
  cellH: number,
): ContourSegment[] {
  const segments: ContourSegment[] = [];

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const tl = grid[r * cols + c];
      const tr = grid[r * cols + c + 1];
      const br = grid[(r + 1) * cols + c + 1];
      const bl = grid[(r + 1) * cols + c];

      // Build case index (4-bit)
      let caseIndex = 0;
      if (tl >= threshold) caseIndex |= 8;
      if (tr >= threshold) caseIndex |= 4;
      if (br >= threshold) caseIndex |= 2;
      if (bl >= threshold) caseIndex |= 1;

      const edges = MS_EDGES[caseIndex];
      if (edges.length === 0) continue;

      const x = c * cellW;
      const y = r * cellH;

      // Interpolation along each edge
      // Edge 0: top (tl -> tr), Edge 1: right (tr -> br),
      // Edge 2: bottom (bl -> br), Edge 3: left (tl -> bl)
      const interpTop = (threshold - tl) / (tr - tl || 1e-10);
      const interpRight = (threshold - tr) / (br - tr || 1e-10);
      const interpBottom = (threshold - bl) / (br - bl || 1e-10);
      const interpLeft = (threshold - tl) / (bl - tl || 1e-10);

      const edgePoints: [number, number][] = [
        [x + interpTop * cellW, y],                  // 0: top
        [x + cellW, y + interpRight * cellH],        // 1: right
        [x + interpBottom * cellW, y + cellH],       // 2: bottom
        [x, y + interpLeft * cellH],                 // 3: left
      ];

      for (const pair of edges) {
        const p1 = edgePoints[pair[0]];
        const p2 = edgePoints[pair[1]];
        segments.push({ x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1] });
      }
    }
  }

  return segments;
}

// --- Visualization ---

interface TopoConfig extends VisualizationConfig {
  contourLevels: number;
  detail: number;
  speed: number;
  lineThickness: number;
}

export class TopographicContoursVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "topographicContours",
    name: "Topographic Contours",
    author: "Vizec",
    description:
      "Living topographic map with Perlin noise elevation that breathes with music",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: TopoConfig = {
    sensitivity: 1.0,
    colorScheme: "ocean",
    contourLevels: 12,
    detail: 4,
    speed: 1.0,
    lineThickness: 1.0,
  };
  private width = 0;
  private height = 0;
  private time = 0;

  // Grid data
  private gridCols = 0;
  private gridRows = 0;
  private cellSize = 4;
  private elevation!: Float64Array;

  // Smoothed audio values for stable animation
  private sBass = 0;
  private sMid = 0;
  private sTreble = 0;
  private sVolume = 0;

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

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, volume } = audioData;
    const { sensitivity, colorScheme, contourLevels, detail, speed, lineThickness } = this.config;

    // Smooth audio values (exponential decay)
    const dt = deltaTime * 0.001; // ms → seconds
    const smoothing = 1 - Math.exp(-dt * 6);
    this.sBass = this.sBass + (bass - this.sBass) * smoothing;
    this.sMid = this.sMid + (mid - this.sMid) * smoothing;
    this.sTreble = this.sTreble + (treble - this.sTreble) * smoothing;
    this.sVolume = this.sVolume + (volume - this.sVolume) * smoothing;

    const sens = sensitivity;

    // Advance time (bass speeds it up slightly)
    this.time += dt * speed * (0.3 + this.sBass * sens * 0.4);

    // Determine octaves from detail config
    const octaves = Math.max(2, Math.min(6, Math.round(detail)));

    // Build elevation grid
    const cols = this.gridCols;
    const rows = this.gridRows;
    const grid = this.elevation;

    // Bass raises overall elevation, treble adds fine ripples
    const bassLift = this.sBass * sens * 0.6;
    const trebleDetail = this.sTreble * sens * 0.3;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = c / cols;
        const ny = r / rows;

        // Base terrain from FBM noise
        let elev = fbm(nx * 3 + this.time * 0.15, ny * 3 + this.time * 0.1, octaves, 2.0, 0.5);

        // Bass raises "mountains" (centered bulge)
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        elev += bassLift * (1 - distFromCenter * 1.5);

        // Treble adds high-frequency ripples
        elev += trebleDetail * noise2D(nx * 12 + this.time * 0.5, ny * 12 - this.time * 0.3);

        // Mid-range widens the terrain undulation
        elev += this.sMid * sens * 0.2 * noise2D(nx * 6 - this.time * 0.2, ny * 6 + this.time * 0.15);

        grid[r * cols + c] = elev;
      }
    }

    // Find elevation range
    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] < minElev) minElev = grid[i];
      if (grid[i] > maxElev) maxElev = grid[i];
    }
    const elevRange = maxElev - minElev || 1;

    // Clear frame
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Get colors
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);
    const startRgb = hexToRgb(colors.start);
    const endRgb = hexToRgb(colors.end);
    const glowRgb = hexToRgb(colors.glow);

    const cellW = this.cellSize;
    const cellH = this.cellSize;
    const levels = Math.max(4, Math.min(24, contourLevels));

    // Draw contour lines at each elevation level
    for (let i = 1; i < levels; i++) {
      const t = i / levels;
      const threshold = minElev + t * elevRange;

      // Extract contour segments via marching squares
      const segments = marchingSquares(grid, cols, rows, threshold, cellW, cellH);
      if (segments.length === 0) continue;

      // Color: interpolate start -> end based on elevation, glow for highest
      const colorT = t;
      const isHigh = t > 0.7;
      let r: number, g: number, b: number;

      if (isHigh) {
        // Blend toward glow color at high elevations
        const highT = (t - 0.7) / 0.3;
        r = endRgb[0] + (glowRgb[0] - endRgb[0]) * highT;
        g = endRgb[1] + (glowRgb[1] - endRgb[1]) * highT;
        b = endRgb[2] + (glowRgb[2] - endRgb[2]) * highT;
      } else {
        r = startRgb[0] + (endRgb[0] - startRgb[0]) * colorT;
        g = startRgb[1] + (endRgb[1] - startRgb[1]) * colorT;
        b = startRgb[2] + (endRgb[2] - startRgb[2]) * colorT;
      }

      // Higher elevation = brighter, thicker lines
      const baseAlpha = 0.35 + t * 0.45; // 0.35 low -> 0.8 high
      const alpha = Math.min(1, baseAlpha + this.sVolume * sens * 0.15);
      const baseWidth = 0.6 + t * 1.4; // thinner at low, thicker at high
      const width = baseWidth * lineThickness;

      // Every 4th contour is a "major" contour (thicker, like real topo maps)
      const isMajor = i % 4 === 0;
      const finalWidth = isMajor ? width * 1.6 : width;
      const finalAlpha = isMajor ? Math.min(1, alpha + 0.1) : alpha;

      this.ctx.strokeStyle = rgbString(Math.round(r), Math.round(g), Math.round(b), finalAlpha);
      this.ctx.lineWidth = finalWidth;
      this.ctx.lineCap = "round";
      this.ctx.lineJoin = "round";

      // Draw all segments for this level
      this.ctx.beginPath();
      for (const seg of segments) {
        this.ctx.moveTo(seg.x1, seg.y1);
        this.ctx.lineTo(seg.x2, seg.y2);
      }
      this.ctx.stroke();
    }

    // Optional: subtle glow on high-energy frames
    if (this.sVolume * sens > 0.4) {
      const glowAlpha = (this.sVolume * sens - 0.4) * 0.15;
      // Re-draw top contours with shadow for glow
      this.ctx.save();
      this.ctx.shadowColor = rgbString(glowRgb[0], glowRgb[1], glowRgb[2], 1);
      this.ctx.shadowBlur = 6 + this.sBass * 10;

      const topThreshold = minElev + 0.75 * elevRange;
      const glowSegments = marchingSquares(grid, cols, rows, topThreshold, cellW, cellH);
      if (glowSegments.length > 0) {
        this.ctx.strokeStyle = rgbString(glowRgb[0], glowRgb[1], glowRgb[2], glowAlpha);
        this.ctx.lineWidth = 1.5 * lineThickness;
        this.ctx.beginPath();
        for (const seg of glowSegments) {
          this.ctx.moveTo(seg.x1, seg.y1);
          this.ctx.lineTo(seg.x2, seg.y2);
        }
        this.ctx.stroke();
      }
      this.ctx.restore();
    }
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Rebuild grid
    this.cellSize = Math.max(3, Math.round(4 * (1920 / Math.max(width, 1))));
    // Clamp cell size to reasonable range
    if (this.cellSize > 8) this.cellSize = 8;
    if (this.cellSize < 3) this.cellSize = 3;

    this.gridCols = Math.ceil(width / this.cellSize) + 1;
    this.gridRows = Math.ceil(height / this.cellSize) + 1;
    this.elevation = new Float64Array(this.gridCols * this.gridRows);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as TopoConfig;
  }

  destroy(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
  }

  getConfigSchema(): ConfigSchema {
    return {
      contourLevels: {
        type: "number",
        label: "Contour Density",
        default: 12,
        min: 4,
        max: 24,
        step: 1,
      },
      detail: {
        type: "number",
        label: "Detail Level",
        default: 4,
        min: 2,
        max: 6,
        step: 1,
      },
      speed: {
        type: "number",
        label: "Speed",
        default: 1.0,
        min: 0.1,
        max: 3.0,
        step: 0.1,
      },
      lineThickness: {
        type: "number",
        label: "Line Thickness",
        default: 1.0,
        min: 0.3,
        max: 3.0,
        step: 0.1,
      },
      colorScheme: {
        type: "select",
        label: "Color Scheme",
        default: "ocean",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
