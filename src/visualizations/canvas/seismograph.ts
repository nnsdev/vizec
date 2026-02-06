import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface SeismographConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  scrollSpeed: number;
  channelCount: number;
  lineWidth: number;
  glow: boolean;
  gridOpacity: number;
  paperTexture: boolean;
}

/** Ring buffer for one frequency channel's history */
class ChannelBuffer {
  private buffer: Float32Array;
  private head = 0;
  readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
  }

  /** Read sample at logical index 0 = oldest, capacity-1 = newest */
  get(index: number): number {
    return this.buffer[(this.head + index) % this.capacity];
  }

  resize(newCapacity: number): void {
    const newBuffer = new Float32Array(newCapacity);
    const copyLen = Math.min(this.capacity, newCapacity);
    for (let i = 0; i < copyLen; i++) {
      newBuffer[i] = this.get(this.capacity - copyLen + i);
    }
    this.buffer = newBuffer;
    this.head = copyLen % newCapacity;
  }
}

/** Maps a channel index to a frequency band value from AudioData */
function getChannelValue(audioData: AudioData, channelIndex: number, channelCount: number): number {
  if (channelCount <= 3) {
    // 3 or fewer: bass, mid, treble
    const bands = [audioData.bass, audioData.mid, audioData.treble];
    return bands[channelIndex % 3];
  }
  if (channelCount === 4) {
    const bands = [audioData.bass, audioData.mid, audioData.mid, audioData.treble];
    return bands[channelIndex];
  }
  // 5 channels: bass, low-mid, mid, high-mid, treble
  // Extract low-mid and high-mid from frequencyData
  const freqData = audioData.frequencyData;
  const binCount = freqData.length;
  switch (channelIndex) {
    case 0:
      return audioData.bass;
    case 1: {
      // low-mid: ~250-500 Hz range
      const start = Math.floor(binCount * 0.05);
      const end = Math.floor(binCount * 0.1);
      let sum = 0;
      for (let i = start; i < end; i++) sum += freqData[i];
      return sum / ((end - start) * 255);
    }
    case 2:
      return audioData.mid;
    case 3: {
      // high-mid: ~2k-4k Hz range
      const start = Math.floor(binCount * 0.2);
      const end = Math.floor(binCount * 0.4);
      let sum = 0;
      for (let i = start; i < end; i++) sum += freqData[i];
      return sum / ((end - start) * 255);
    }
    case 4:
      return audioData.treble;
    default:
      return 0;
  }
}

const CHANNEL_LABELS = ["BASS", "LO-MID", "MID", "HI-MID", "TREBLE"];
const CHANNEL_LABELS_3 = ["BASS", "MID", "TREBLE"];
const CHANNEL_LABELS_4 = ["BASS", "LO-MID", "HI-MID", "TREBLE"];

function getChannelLabel(index: number, count: number): string {
  if (count <= 3) return CHANNEL_LABELS_3[index] ?? "";
  if (count === 4) return CHANNEL_LABELS_4[index] ?? "";
  return CHANNEL_LABELS[index] ?? "";
}

export class SeismographVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "seismograph",
    name: "Seismograph",
    author: "Vizec",
    description: "Multi-channel strip chart recorder with scrolling needle pen traces",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: SeismographConfig = {
    sensitivity: 1.0,
    colorScheme: "cyanMagenta",
    scrollSpeed: 1.0,
    channelCount: 5,
    lineWidth: 2,
    glow: true,
    gridOpacity: 0.15,
    paperTexture: true,
  };

  private channels: ChannelBuffer[] = [];
  private bufferCapacity = 0;
  private accumulator = 0;
  // Pixels per push — controls how fast new samples are written
  private pixelsPerSample = 2;

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

  private ensureChannels(): void {
    const needed = this.config.channelCount;
    const cap = this.bufferCapacity;
    while (this.channels.length < needed) {
      this.channels.push(new ChannelBuffer(cap));
    }
    while (this.channels.length > needed) {
      this.channels.pop();
    }
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const ctx = this.ctx;
    const { sensitivity, colorScheme, scrollSpeed, channelCount, lineWidth, glow, gridOpacity, paperTexture } =
      this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);
    const w = this.width;
    const h = this.height;

    // Determine how many samples to push this frame
    // Base scroll rate: ~120 px/s at scrollSpeed=1
    const pxPerSec = 120 * scrollSpeed;
    this.accumulator += pxPerSec * deltaTime * 0.001;
    const samplesToPush = Math.floor(this.accumulator / this.pixelsPerSample);
    this.accumulator -= samplesToPush * this.pixelsPerSample;

    // Push new samples into each channel's ring buffer
    for (let s = 0; s < samplesToPush; s++) {
      for (let ch = 0; ch < channelCount; ch++) {
        const raw = getChannelValue(audioData, ch, channelCount);
        this.channels[ch].push(raw * sensitivity);
      }
    }

    // ---- Drawing ----
    ctx.clearRect(0, 0, w, h);

    const margin = 60;
    const plotLeft = margin;
    const plotRight = w - 20;
    const plotWidth = plotRight - plotLeft;
    const trackHeight = (h - 40) / channelCount;
    const samplesVisible = Math.ceil(plotWidth / this.pixelsPerSample);

    // Faint paper texture grid
    if (paperTexture) {
      this.drawGrid(ctx, plotLeft, plotRight, trackHeight, channelCount, gridOpacity);
    }

    // Interpolate between start and end colors per channel
    const channelColors = this.buildChannelColors(colors.start, colors.end, channelCount);

    // Draw each channel trace
    for (let ch = 0; ch < channelCount; ch++) {
      const buffer = this.channels[ch];
      if (!buffer) continue;

      const trackTop = 20 + ch * trackHeight;
      const centerY = trackTop + trackHeight / 2;
      // Deflection amplitude — bass channels get more, treble less
      const deflectionScale = this.getDeflectionScale(ch, channelCount);
      const maxDeflection = (trackHeight * 0.4) * deflectionScale;
      const color = channelColors[ch];

      // Glow
      if (glow) {
        ctx.shadowBlur = 8 + audioData.volume * 6;
        ctx.shadowColor = color;
      }

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.85;

      const readOffset = buffer.capacity - samplesVisible;
      for (let i = 0; i < samplesVisible; i++) {
        const val = buffer.get(readOffset + i);
        const x = plotLeft + i * this.pixelsPerSample;
        const y = centerY + val * maxDeflection;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;

      // Channel label
      ctx.globalAlpha = 0.5;
      ctx.font = "10px monospace";
      ctx.fillStyle = color;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(getChannelLabel(ch, channelCount), plotLeft - 8, centerY);

      // Faint center baseline
      ctx.globalAlpha = 0.12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotLeft, centerY);
      ctx.lineTo(plotRight, centerY);
      ctx.stroke();
    }

    // Needle head — small triangle at the right edge for each channel
    for (let ch = 0; ch < channelCount; ch++) {
      const buffer = this.channels[ch];
      if (!buffer) continue;
      const trackTop = 20 + ch * trackHeight;
      const centerY = trackTop + trackHeight / 2;
      const deflectionScale = this.getDeflectionScale(ch, channelCount);
      const maxDeflection = (trackHeight * 0.4) * deflectionScale;
      const lastVal = buffer.get(buffer.capacity - 1);
      const tipY = centerY + lastVal * maxDeflection;
      const color = channelColors[ch];

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(plotRight, tipY);
      ctx.lineTo(plotRight + 6, tipY - 4);
      ctx.lineTo(plotRight + 6, tipY + 4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1.0;
  }

  /** Draw faint grid lines resembling chart recorder paper */
  private drawGrid(
    ctx: CanvasRenderingContext2D,
    plotLeft: number,
    plotRight: number,
    trackHeight: number,
    channelCount: number,
    opacity: number,
  ): void {
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 0.5;

    // Vertical lines every ~40px
    const spacing = 40;
    for (let x = plotLeft; x <= plotRight; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 20);
      ctx.lineTo(x, 20 + trackHeight * channelCount);
      ctx.stroke();
    }

    // Horizontal lines — subdivisions within each track
    const subDivisions = 4;
    for (let ch = 0; ch < channelCount; ch++) {
      const trackTop = 20 + ch * trackHeight;
      for (let s = 0; s <= subDivisions; s++) {
        const y = trackTop + (trackHeight / subDivisions) * s;
        ctx.beginPath();
        ctx.moveTo(plotLeft, y);
        ctx.lineTo(plotRight, y);
        ctx.stroke();
      }
    }
  }

  /** Bass channels get larger deflections, treble gets fine jitter */
  private getDeflectionScale(channelIndex: number, channelCount: number): number {
    // Linear taper from 1.6 (bass) to 0.5 (treble)
    if (channelCount <= 1) return 1.0;
    const t = channelIndex / (channelCount - 1);
    return 1.6 - t * 1.1;
  }

  /** Build array of hex color strings interpolated between start and end */
  private buildChannelColors(startHex: string, endHex: string, count: number): string[] {
    const sr = parseInt(startHex.slice(1, 3), 16);
    const sg = parseInt(startHex.slice(3, 5), 16);
    const sb = parseInt(startHex.slice(5, 7), 16);
    const er = parseInt(endHex.slice(1, 3), 16);
    const eg = parseInt(endHex.slice(3, 5), 16);
    const eb = parseInt(endHex.slice(5, 7), 16);

    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0 : i / (count - 1);
      const r = Math.round(sr + (er - sr) * t);
      const g = Math.round(sg + (eg - sg) * t);
      const b = Math.round(sb + (eb - sb) * t);
      out.push(`#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`);
    }
    return out;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    // Recalculate buffer capacity based on width
    const plotWidth = width - 80; // margin left + right
    const newCap = Math.max(256, Math.ceil(plotWidth / this.pixelsPerSample) + 64);
    if (newCap !== this.bufferCapacity) {
      if (this.bufferCapacity === 0) {
        this.bufferCapacity = newCap;
        this.channels = [];
        for (let i = 0; i < this.config.channelCount; i++) {
          this.channels.push(new ChannelBuffer(newCap));
        }
      } else {
        this.bufferCapacity = newCap;
        for (const ch of this.channels) ch.resize(newCap);
      }
    }
    this.ensureChannels();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as SeismographConfig;
    this.ensureChannels();
  }

  destroy(): void {
    if (this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.channels = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      sensitivity: {
        type: "number",
        min: 0.1,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Sensitivity",
      },
      colorScheme: {
        type: "select",
        options: [...COLOR_SCHEME_OPTIONS],
        default: "cyanMagenta",
        label: "Color Scheme",
      },
      scrollSpeed: {
        type: "number",
        min: 0.2,
        max: 3,
        step: 0.1,
        default: 1.0,
        label: "Scroll Speed",
      },
      channelCount: {
        type: "number",
        min: 3,
        max: 5,
        step: 1,
        default: 5,
        label: "Channels",
      },
      lineWidth: {
        type: "number",
        min: 1,
        max: 5,
        step: 0.5,
        default: 2,
        label: "Line Width",
      },
      glow: {
        type: "boolean",
        default: true,
        label: "Glow Effect",
      },
      gridOpacity: {
        type: "number",
        min: 0,
        max: 0.4,
        step: 0.05,
        default: 0.15,
        label: "Grid Opacity",
      },
      paperTexture: {
        type: "boolean",
        default: true,
        label: "Paper Grid",
      },
    };
  }
}
