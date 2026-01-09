import { Visualization, AudioData, VisualizationConfig, ConfigSchema } from '../types';

// Color schemes
const COLOR_SCHEMES: Record<string, { start: string; end: string; glow: string }> = {
  cyanMagenta: { start: '#00ffff', end: '#ff00ff', glow: '#00ffff' },
  darkTechno: { start: '#1a1a2e', end: '#4a00e0', glow: '#8000ff' },
  neon: { start: '#39ff14', end: '#ff073a', glow: '#ffff00' },
  fire: { start: '#ff4500', end: '#ffd700', glow: '#ff6600' },
  ice: { start: '#00bfff', end: '#e0ffff', glow: '#87ceeb' },
  acid: { start: '#00ff00', end: '#ffff00', glow: '#00ff00' },
  monochrome: { start: '#ffffff', end: '#808080', glow: '#ffffff' },
  purpleHaze: { start: '#8b00ff', end: '#ff1493', glow: '#9400d3' },
  sunset: { start: '#ff6b6b', end: '#feca57', glow: '#ff9f43' },
  ocean: { start: '#0077be', end: '#00d4aa', glow: '#00b4d8' },
  toxic: { start: '#00ff41', end: '#0aff0a', glow: '#39ff14' },
  bloodMoon: { start: '#8b0000', end: '#ff4500', glow: '#dc143c' },
  synthwave: { start: '#ff00ff', end: '#00ffff', glow: '#ff00aa' },
  golden: { start: '#ffd700', end: '#ff8c00', glow: '#ffb347' },
};

interface Node {
  x: number;
  y: number;
  activation: number;
  targetActivation: number;
  frequencyBin: number;
  connections: number[];
  pulsePhase: number;
}

interface NeuralNetworkConfig extends VisualizationConfig {
  nodeCount: number;
  connectionDistance: number;
  pulseSpeed: number;
}

export class NeuralNetworkVisualization implements Visualization {
  id = 'neuralNetwork';
  name = 'Neural Network';
  author = 'Vizec';
  description = 'Grid of connected nodes that pulse based on frequency data';
  renderer: 'canvas2d' = 'canvas2d';
  transitionType: 'crossfade' = 'crossfade';

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: NeuralNetworkConfig = {
    sensitivity: 1.0,
    colorScheme: 'cyanMagenta',
    nodeCount: 64,
    connectionDistance: 150,
    pulseSpeed: 0.1,
  };
  private width = 0;
  private height = 0;
  private nodes: Node[] = [];
  private needsRebuild = true;

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

  private buildNetwork(): void {
    const { nodeCount, connectionDistance } = this.config;
    this.nodes = [];

    // Create grid-like layout with some randomness
    const cols = Math.ceil(Math.sqrt(nodeCount * (this.width / this.height)));
    const rows = Math.ceil(nodeCount / cols);
    const cellWidth = this.width / (cols + 1);
    const cellHeight = this.height / (rows + 1);

    for (let i = 0; i < nodeCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      // Base position with some random offset
      const x = cellWidth * (col + 1) + (Math.random() - 0.5) * cellWidth * 0.5;
      const y = cellHeight * (row + 1) + (Math.random() - 0.5) * cellHeight * 0.5;

      this.nodes.push({
        x,
        y,
        activation: 0,
        targetActivation: 0,
        frequencyBin: i % 64, // Map to frequency bins cyclically
        connections: [],
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    // Build connections based on distance
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        const dx = this.nodes[i].x - this.nodes[j].x;
        const dy = this.nodes[i].y - this.nodes[j].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= connectionDistance) {
          this.nodes[i].connections.push(j);
          this.nodes[j].connections.push(i);
        }
      }
    }

    this.needsRebuild = false;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(255, 255, 255, ${alpha})`;
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    if (this.needsRebuild) {
      this.buildNetwork();
    }

    const { frequencyData } = audioData;
    const { sensitivity, colorScheme, pulseSpeed } = this.config;
    const colors = COLOR_SCHEMES[colorScheme] || COLOR_SCHEMES.cyanMagenta;

    // Clear canvas with transparency
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Update node activations based on frequency data
    const step = Math.floor(frequencyData.length / 64);
    for (const node of this.nodes) {
      // Get frequency value for this node
      const binStart = node.frequencyBin * step;
      let sum = 0;
      for (let i = 0; i < step; i++) {
        sum += frequencyData[binStart + i];
      }
      node.targetActivation = (sum / step / 255) * sensitivity;

      // Smooth transition to target
      const smoothing = 0.85;
      node.activation = node.activation * smoothing + node.targetActivation * (1 - smoothing);

      // Update pulse phase
      node.pulsePhase += pulseSpeed * node.activation * (deltaTime / 16);
    }

    // Propagate activations through connections (pulse effect)
    for (const node of this.nodes) {
      if (node.activation > 0.5) {
        for (const connIndex of node.connections) {
          const connNode = this.nodes[connIndex];
          connNode.targetActivation = Math.max(
            connNode.targetActivation,
            node.activation * 0.3 // Propagate some activation
          );
        }
      }
    }

    // Draw connections first (behind nodes)
    this.ctx.globalAlpha = 0.6;
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];

      for (const connIndex of node.connections) {
        if (connIndex > i) continue; // Only draw each connection once

        const connNode = this.nodes[connIndex];

        // Connection lights up when both nodes are active
        const connectionActivation = Math.min(node.activation, connNode.activation);

        if (connectionActivation > 0.1) {
          const alpha = connectionActivation * 0.5;
          this.ctx.strokeStyle = this.hexToRgba(colors.glow, alpha);
          this.ctx.lineWidth = 1 + connectionActivation * 2;
          this.ctx.shadowBlur = connectionActivation * 15;
          this.ctx.shadowColor = colors.glow;

          this.ctx.beginPath();
          this.ctx.moveTo(node.x, node.y);
          this.ctx.lineTo(connNode.x, connNode.y);
          this.ctx.stroke();
        }
      }
    }

    this.ctx.shadowBlur = 0;

    // Draw nodes
    for (const node of this.nodes) {
      const pulseEffect = 1 + Math.sin(node.pulsePhase) * 0.3 * node.activation;
      const baseRadius = 4;
      const radius = baseRadius + node.activation * 8 * pulseEffect;

      // Glow effect
      if (node.activation > 0.2) {
        const gradient = this.ctx.createRadialGradient(
          node.x, node.y, 0,
          node.x, node.y, radius * 3
        );
        gradient.addColorStop(0, this.hexToRgba(colors.glow, node.activation * 0.5));
        gradient.addColorStop(1, this.hexToRgba(colors.glow, 0));

        this.ctx.fillStyle = gradient;
        this.ctx.globalAlpha = 0.7;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius * 3, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Main node
      const nodeGradient = this.ctx.createRadialGradient(
        node.x, node.y, 0,
        node.x, node.y, radius
      );
      nodeGradient.addColorStop(0, colors.start);
      nodeGradient.addColorStop(1, colors.end);

      this.ctx.fillStyle = nodeGradient;
      this.ctx.globalAlpha = 0.5 + node.activation * 0.5;
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Bright center on high activation
      if (node.activation > 0.5) {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.globalAlpha = (node.activation - 0.5) * 0.7;
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, radius * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    this.ctx.globalAlpha = 1.0;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.needsRebuild = true;
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    const oldNodeCount = this.config.nodeCount;
    const oldDistance = this.config.connectionDistance;

    this.config = { ...this.config, ...config } as NeuralNetworkConfig;

    // Rebuild network if node count or connection distance changed
    if (this.config.nodeCount !== oldNodeCount || this.config.connectionDistance !== oldDistance) {
      this.needsRebuild = true;
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
  }

  getConfigSchema(): ConfigSchema {
    return {
      nodeCount: {
        type: 'number',
        label: 'Node Count',
        default: 64,
        min: 16,
        max: 128,
        step: 8,
      },
      connectionDistance: {
        type: 'number',
        label: 'Connection Distance',
        default: 150,
        min: 50,
        max: 300,
        step: 25,
      },
      pulseSpeed: {
        type: 'number',
        label: 'Pulse Speed',
        default: 0.1,
        min: 0.01,
        max: 0.5,
        step: 0.01,
      },
      colorScheme: {
        type: 'select',
        label: 'Color Scheme',
        default: 'cyanMagenta',
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
