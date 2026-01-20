import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface HolographicDisplayConfig extends VisualizationConfig {
  panelCount: number;
  glitchIntensity: number;
  scanlineSpeed: number;
  dataStreamDensity: number;
  colorScheme: string;
}

interface HoloPanel {
  x: number;
  y: number;
  z: number; // For parallax effect (0-1)
  width: number;
  height: number;
  rotation: number;
  rotationSpeed: number;
  dataLines: string[];
  dataOffset: number;
  glitchOffset: number;
  glitchTimer: number;
  scanlineY: number;
  borderPulse: number;
}

// Hex characters for data stream effect
const HEX_CHARS = "0123456789ABCDEF";
const DATA_CHARS = "01";

function generateDataLine(length: number): string {
  let line = "";
  for (let i = 0; i < length; i++) {
    line +=
      Math.random() > 0.7
        ? HEX_CHARS[Math.floor(Math.random() * 16)]
        : DATA_CHARS[Math.floor(Math.random() * 2)];
  }
  return line;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class HolographicDisplayVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "holographicDisplay",
    name: "Holographic Display",
    author: "Vizec",
    description: "Futuristic floating holographic panels with data streams and glitch effects",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: HolographicDisplayConfig = {
    sensitivity: 1.0,
    panelCount: 5,
    glitchIntensity: 0.7,
    scanlineSpeed: 1.0,
    dataStreamDensity: 0.8,
    colorScheme: "cyanMagenta",
  };

  private width = 0;
  private height = 0;
  private time = 0;
  private panels: HoloPanel[] = [];
  private bassSmooth = 0;
  private midSmooth = 0;
  private trebleSmooth = 0;

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

  private initPanels(): void {
    this.panels = [];
    const { panelCount } = this.config;

    for (let i = 0; i < panelCount; i++) {
      const z = 0.2 + Math.random() * 0.8; // Parallax depth
      const baseSize = 100 + Math.random() * 150;

      // Generate data lines for this panel
      const lineCount = 5 + Math.floor(Math.random() * 8);
      const dataLines: string[] = [];
      for (let j = 0; j < lineCount; j++) {
        dataLines.push(generateDataLine(8 + Math.floor(Math.random() * 12)));
      }

      this.panels.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        z,
        width: baseSize * (0.8 + z * 0.4),
        height: baseSize * 0.6 * (0.8 + z * 0.4),
        rotation: (Math.random() - 0.5) * 0.3,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        dataLines,
        dataOffset: Math.random() * 100,
        glitchOffset: 0,
        glitchTimer: Math.random() * 5,
        scanlineY: 0,
        borderPulse: Math.random() * Math.PI * 2,
      });
    }

    // Sort by z for proper layering
    this.panels.sort((a, b) => a.z - b.z);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    this.time += deltaTime * 0.001;
    const { sensitivity, glitchIntensity, scanlineSpeed, dataStreamDensity, colorScheme } =
      this.config;
    const { bass, mid, treble, volume } = audioData;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // Smooth audio values
    const smoothing = 0.15;
    this.bassSmooth += (bass - this.bassSmooth) * smoothing;
    this.midSmooth += (mid - this.midSmooth) * smoothing;
    this.trebleSmooth += (treble - this.trebleSmooth) * smoothing;

    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update and render each panel
    for (const panel of this.panels) {
      this.updatePanel(panel, deltaTime, sensitivity);
      this.renderPanel(
        panel,
        colors,
        glitchIntensity,
        scanlineSpeed,
        dataStreamDensity,
        sensitivity,
      );
    }

    // Add global scanlines effect
    this.renderGlobalScanlines(colors, volume * sensitivity);
  }

  private updatePanel(panel: HoloPanel, deltaTime: number, sensitivity: number): void {
    const dt = deltaTime * 0.001;

    // Slow floating movement
    panel.x += Math.sin(this.time * 0.3 + panel.z * 5) * 0.5 * panel.z;
    panel.y += Math.cos(this.time * 0.2 + panel.z * 3) * 0.3 * panel.z;

    // Keep panels in view with wrapping
    if (panel.x < -panel.width) panel.x = this.width + panel.width * 0.5;
    if (panel.x > this.width + panel.width) panel.x = -panel.width * 0.5;
    if (panel.y < -panel.height) panel.y = this.height + panel.height * 0.5;
    if (panel.y > this.height + panel.height) panel.y = -panel.height * 0.5;

    // Subtle rotation
    panel.rotation += panel.rotationSpeed * dt;

    // Data stream scrolling - faster with mid frequencies
    panel.dataOffset += (1 + this.midSmooth * 3 * sensitivity) * dt * 20;

    // Update scanline position
    panel.scanlineY += dt * 100 * (1 + this.trebleSmooth * sensitivity);
    if (panel.scanlineY > panel.height) {
      panel.scanlineY = 0;
    }

    // Glitch timer - triggers more on bass hits
    panel.glitchTimer -= dt;
    if (panel.glitchTimer <= 0 || this.bassSmooth > 0.7) {
      if (Math.random() < 0.3 + this.bassSmooth * 0.5) {
        panel.glitchOffset = (Math.random() - 0.5) * 20 * this.bassSmooth;
      }
      panel.glitchTimer = 0.5 + Math.random() * 2;
    } else {
      // Decay glitch offset
      panel.glitchOffset *= 0.9;
    }

    // Border pulse
    panel.borderPulse += dt * 3;

    // Occasionally regenerate data lines
    if (Math.random() < 0.02 * this.midSmooth) {
      const lineIndex = Math.floor(Math.random() * panel.dataLines.length);
      panel.dataLines[lineIndex] = generateDataLine(8 + Math.floor(Math.random() * 12));
    }
  }

  private renderPanel(
    panel: HoloPanel,
    colors: { start: string; end: string; glow: string },
    glitchIntensity: number,
    scanlineSpeed: number,
    dataStreamDensity: number,
    sensitivity: number,
  ): void {
    if (!this.ctx) return;

    const ctx = this.ctx;
    const alpha = 0.3 + panel.z * 0.25; // Closer panels are more visible
    const glitchX = panel.glitchOffset * glitchIntensity;

    ctx.save();
    ctx.translate(panel.x + glitchX, panel.y);
    ctx.rotate(panel.rotation);

    // Panel background with gradient
    const bgGradient = ctx.createLinearGradient(0, 0, panel.width, panel.height);
    bgGradient.addColorStop(0, hexToRgba(colors.start, 0.1 * alpha));
    bgGradient.addColorStop(1, hexToRgba(colors.end, 0.05 * alpha));

    ctx.fillStyle = bgGradient;
    ctx.fillRect(-panel.width / 2, -panel.height / 2, panel.width, panel.height);

    // Glowing border
    const borderAlpha =
      0.4 + Math.sin(panel.borderPulse) * 0.2 + this.bassSmooth * 0.3 * sensitivity;
    ctx.strokeStyle = hexToRgba(colors.start, borderAlpha * alpha);
    ctx.lineWidth = 2;
    ctx.strokeRect(-panel.width / 2, -panel.height / 2, panel.width, panel.height);

    // Corner accents
    this.drawCornerAccents(panel, colors, alpha);

    // Data streams
    this.renderDataStreams(panel, colors, alpha, dataStreamDensity);

    // Scanline effect
    this.renderScanline(panel, colors, alpha, scanlineSpeed);

    // Horizontal glitch lines on bass
    if (this.bassSmooth > 0.5 && glitchIntensity > 0) {
      this.renderGlitchLines(panel, colors, alpha, glitchIntensity);
    }

    ctx.restore();
  }

  private drawCornerAccents(
    panel: HoloPanel,
    colors: { start: string; end: string; glow: string },
    alpha: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const cornerSize = 15;

    ctx.strokeStyle = hexToRgba(colors.glow, 0.6 * alpha);
    ctx.lineWidth = 2;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(-panel.width / 2, -panel.height / 2 + cornerSize);
    ctx.lineTo(-panel.width / 2, -panel.height / 2);
    ctx.lineTo(-panel.width / 2 + cornerSize, -panel.height / 2);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(panel.width / 2 - cornerSize, -panel.height / 2);
    ctx.lineTo(panel.width / 2, -panel.height / 2);
    ctx.lineTo(panel.width / 2, -panel.height / 2 + cornerSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(-panel.width / 2, panel.height / 2 - cornerSize);
    ctx.lineTo(-panel.width / 2, panel.height / 2);
    ctx.lineTo(-panel.width / 2 + cornerSize, panel.height / 2);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(panel.width / 2 - cornerSize, panel.height / 2);
    ctx.lineTo(panel.width / 2, panel.height / 2);
    ctx.lineTo(panel.width / 2, panel.height / 2 - cornerSize);
    ctx.stroke();
  }

  private renderDataStreams(
    panel: HoloPanel,
    colors: { start: string; end: string; glow: string },
    alpha: number,
    density: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    ctx.font = `${10 + panel.z * 4}px monospace`;
    ctx.textAlign = "left";

    const lineHeight = 14 + panel.z * 6;
    const startY = -panel.height / 2 + 20;
    const startX = -panel.width / 2 + 10;

    // Clip to panel bounds
    ctx.save();
    ctx.beginPath();
    ctx.rect(-panel.width / 2 + 5, -panel.height / 2 + 5, panel.width - 10, panel.height - 10);
    ctx.clip();

    for (let i = 0; i < panel.dataLines.length; i++) {
      const line = panel.dataLines[i];
      const y = startY + ((i * lineHeight + panel.dataOffset) % (panel.height - 20));

      // Fade in/out based on position
      const fadeY = Math.sin(((y + panel.height / 2) / panel.height) * Math.PI);
      const lineAlpha = fadeY * alpha * 0.55 * density;

      if (lineAlpha > 0.05) {
        // Alternate colors for variety
        const color = i % 3 === 0 ? colors.start : i % 3 === 1 ? colors.end : colors.glow;
        ctx.fillStyle = hexToRgba(color, lineAlpha);

        // Character-by-character with occasional highlight
        for (let j = 0; j < line.length; j++) {
          const charX = startX + j * (6 + panel.z * 3);
          const char = line[j];

          // Random bright highlight
          if (Math.random() < 0.02 * this.trebleSmooth) {
            ctx.fillStyle = hexToRgba(colors.glow, lineAlpha * 2);
          }

          ctx.fillText(char, charX, y);
          ctx.fillStyle = hexToRgba(color, lineAlpha);
        }
      }
    }

    ctx.restore();
  }

  private renderScanline(
    panel: HoloPanel,
    colors: { start: string; end: string; glow: string },
    alpha: number,
    speed: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const scanY = -panel.height / 2 + panel.scanlineY;
    const scanHeight = 3 + this.trebleSmooth * 5 * speed;

    // Scanline gradient
    const scanGradient = ctx.createLinearGradient(0, scanY - scanHeight, 0, scanY + scanHeight);
    scanGradient.addColorStop(0, hexToRgba(colors.glow, 0));
    scanGradient.addColorStop(0.5, hexToRgba(colors.glow, 0.4 * alpha));
    scanGradient.addColorStop(1, hexToRgba(colors.glow, 0));

    ctx.fillStyle = scanGradient;
    ctx.fillRect(-panel.width / 2, scanY - scanHeight, panel.width, scanHeight * 2);
  }

  private renderGlitchLines(
    panel: HoloPanel,
    colors: { start: string; end: string; glow: string },
    alpha: number,
    intensity: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    const glitchCount = Math.floor(2 + this.bassSmooth * 5 * intensity);

    for (let i = 0; i < glitchCount; i++) {
      const y = (Math.random() - 0.5) * panel.height;
      const height = 1 + Math.random() * 3;
      const offset = (Math.random() - 0.5) * 30 * intensity;

      ctx.fillStyle = hexToRgba(colors.start, 0.3 * alpha * intensity);
      ctx.fillRect(-panel.width / 2 + offset, y, panel.width * 0.3, height);

      ctx.fillStyle = hexToRgba(colors.end, 0.3 * alpha * intensity);
      ctx.fillRect(-panel.width / 2 + offset + panel.width * 0.35, y, panel.width * 0.3, height);
    }
  }

  private renderGlobalScanlines(
    colors: { start: string; end: string; glow: string },
    volumeBoost: number,
  ): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Subtle CRT-style scanlines
    ctx.globalCompositeOperation = "overlay";
    const scanlineSpacing = 4;
    const scanlineAlpha = 0.03 + volumeBoost * 0.02;

    ctx.fillStyle = `rgba(0, 0, 0, ${scanlineAlpha})`;
    for (let y = 0; y < this.height; y += scanlineSpacing) {
      ctx.fillRect(0, y, this.width, 1);
    }

    ctx.globalCompositeOperation = "source-over";
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.initPanels();
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldPanelCount = this.config.panelCount;
    this.config = { ...this.config, ...config } as HolographicDisplayConfig;

    if (this.config.panelCount !== oldPanelCount && this.width > 0) {
      this.initPanels();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.panels = [];
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
        default: "cyanMagenta",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      },
      panelCount: {
        type: "number",
        label: "Panel Count",
        default: 5,
        min: 2,
        max: 10,
        step: 1,
      },
      glitchIntensity: {
        type: "number",
        label: "Glitch Intensity",
        default: 0.7,
        min: 0,
        max: 1.5,
        step: 0.1,
      },
      scanlineSpeed: {
        type: "number",
        label: "Scanline Speed",
        default: 1.0,
        min: 0.2,
        max: 3.0,
        step: 0.1,
      },
      dataStreamDensity: {
        type: "number",
        label: "Data Stream Density",
        default: 0.8,
        min: 0.2,
        max: 1.5,
        step: 0.1,
      },
    };
  }
}
