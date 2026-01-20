import { AudioData, ConfigSchema, VisualizationConfig, VisualizationMeta } from "../types";
import { BaseVisualization } from "../base";
import { COLOR_SCHEMES_STRING, COLOR_SCHEME_OPTIONS, getColorScheme } from "../shared/colorSchemes";

interface CircuitBoardConfig extends VisualizationConfig {
  sensitivity: number;
  colorScheme: string;
  nodeCount: number;
  traceComplexity: number;
  glowSpread: number;
}

export class CircuitBoardVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "circuitBoard",
    name: "Circuit Board",
    author: "Vizec",
    description: "PCB-like traces and nodes that light up with audio",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private config: CircuitBoardConfig = {
    sensitivity: 1.0,
    colorScheme: "neon",
    nodeCount: 25,
    traceComplexity: 3,
    glowSpread: 1.0,
  };

  private nodes: CircuitNode[] = [];
  private traces: CircuitTrace[] = [];

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

    this.initCircuit();
  }

  private initCircuit(): void {
    this.nodes = [];
    this.traces = [];

    const { nodeCount, traceComplexity } = this.config;

    // Create nodes in a grid-like pattern
    const cols = Math.ceil(Math.sqrt(nodeCount));
    const rows = Math.ceil(nodeCount / cols);
    const xSpacing = this.width / (cols + 1);
    const ySpacing = this.height / (rows + 1);

    for (let i = 0; i < nodeCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);

      this.nodes.push({
        x: xSpacing * (col + 1) + (Math.random() - 0.5) * xSpacing * 0.5,
        y: ySpacing * (row + 1) + (Math.random() - 0.5) * ySpacing * 0.5,
        size: 8 + Math.random() * 8,
        active: false,
        intensity: 0,
        connections: [],
      });
    }

    // Create traces between nearby nodes
    for (let i = 0; i < this.nodes.length; i++) {
      const nodeA = this.nodes[i];
      const connectionsNeeded = 2 + Math.floor(Math.random() * traceComplexity);

      // Find nearby nodes to connect to
      const nearbyNodes = this.nodes
        .map((node, j) => ({ node, j, dist: Math.hypot(node.x - nodeA.x, node.y - nodeA.y) }))
        .filter((item) => item.j !== i && item.dist < Math.max(this.width, this.height) * 0.3)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, connectionsNeeded);

      for (const nearby of nearbyNodes) {
        nodeA.connections.push(nearby.j);

        // Check if trace already exists
        const traceExists = this.traces.some(
          (t) => (t.from === i && t.to === nearby.j) || (t.from === nearby.j && t.to === i),
        );

        if (!traceExists) {
          this.traces.push({
            from: i,
            to: nearby.j,
            intensity: 0,
            segments: this.generateTraceSegments(nodeA, this.nodes[nearby.j]),
          });
        }
      }
    }
  }

  private generateTraceSegments(
    nodeA: CircuitNode,
    nodeB: CircuitNode,
  ): { x: number; y: number }[] {
    const segments: { x: number; y: number }[] = [];
    const { traceComplexity } = this.config;

    segments.push({ x: nodeA.x, y: nodeA.y });

    // Add intermediate points for PCB trace look
    const midX = (nodeA.x + nodeB.x) / 2;
    const midY = (nodeA.y + nodeB.y) / 2;

    if (traceComplexity > 1) {
      // Add right-angle bends
      segments.push({ x: nodeA.x, y: midY });
      segments.push({ x: nodeB.x, y: midY });
    } else {
      segments.push({ x: midX, y: midY });
    }

    segments.push({ x: nodeB.x, y: nodeB.y });

    return segments;
  }

  render(audioData: AudioData, _deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, frequencyData } = audioData;
    const { sensitivity, colorScheme, glowSpread } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_STRING, colorScheme);

    // Clear canvas for transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Calculate audio boosts
    const bassBoost = Math.pow(bass, 0.7) * sensitivity * 2;
    const midBoost = Math.pow(mid, 0.7) * sensitivity * 1.5;
    const trebleBoost = Math.pow(treble, 0.7) * sensitivity;

    // Update node intensities based on frequency data
    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const freqIndex = Math.floor((i / this.nodes.length) * frequencyData.length);
      const freqValue = frequencyData[freqIndex] / 255;

      // Determine which audio band affects this node
      const nodeBand = i % 3;
      let bandBoost: number;
      if (nodeBand === 0) {
        bandBoost = bassBoost;
      } else if (nodeBand === 1) {
        bandBoost = midBoost;
      } else {
        bandBoost = trebleBoost;
      }

      // Calculate target intensity
      const targetIntensity = Math.min(1, freqValue * sensitivity + bandBoost * 0.3);

      // Smooth intensity transition
      node.intensity += (targetIntensity - node.intensity) * 0.2;

      // Node is active if it has enough intensity
      node.active = node.intensity > 0.2;

      // Trigger sparkles on high treble
      if (node.active && trebleBoost > 1 && Math.random() < trebleBoost * 0.05) {
        node.sparks = (node.sparks || 0) + 1;
      }
    }

    // Draw traces
    for (const trace of this.traces) {
      const nodeA = this.nodes[trace.from];
      const nodeB = this.nodes[trace.to];

      // Calculate trace intensity based on connected nodes
      const traceIntensity = (nodeA.intensity + nodeB.intensity) / 2;

      if (traceIntensity < 0.1) continue;

      // Draw trace segments
      this.ctx.save();
      this.ctx.globalAlpha = traceIntensity * 0.8;

      // Outer glow
      this.ctx.shadowBlur = 10 + glowSpread * 15;
      this.ctx.shadowColor = colors.glow;
      this.ctx.strokeStyle = colors.primary;
      this.ctx.lineWidth = 2;

      // Draw each segment
      for (let i = 0; i < trace.segments.length - 1; i++) {
        const segStart = trace.segments[i];
        const segEnd = trace.segments[i + 1];

        this.ctx.beginPath();
        this.ctx.moveTo(segStart.x, segStart.y);
        this.ctx.lineTo(segEnd.x, segEnd.y);
        this.ctx.stroke();
      }

      // Inner bright line
      this.ctx.globalAlpha = traceIntensity;
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = colors.secondary;

      for (let i = 0; i < trace.segments.length - 1; i++) {
        const segStart = trace.segments[i];
        const segEnd = trace.segments[i + 1];

        this.ctx.beginPath();
        this.ctx.moveTo(segStart.x, segStart.y);
        this.ctx.lineTo(segEnd.x, segEnd.y);
        this.ctx.stroke();
      }

      this.ctx.restore();
    }

    // Draw nodes
    for (const node of this.nodes) {
      if (node.intensity < 0.1) continue;

      // Draw node glow
      this.ctx.save();

      const glowRadius = node.size * (1 + glowSpread) * (1 + node.intensity * 0.5);
      const nodeGlow = this.ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowRadius);

      const nodeBand = this.nodes.indexOf(node) % 3;
      let nodeColor: string;
      if (nodeBand === 0) {
        nodeColor = colors.secondary;
      } else if (nodeBand === 1) {
        nodeColor = colors.primary;
      } else {
        nodeColor = colors.glow;
      }

      nodeGlow.addColorStop(0, nodeColor + "CC");
      nodeGlow.addColorStop(0.5, nodeColor + "44");
      nodeGlow.addColorStop(1, "transparent");

      this.ctx.globalAlpha = node.intensity * 0.8;
      this.ctx.fillStyle = nodeGlow;
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // Draw node body
      this.ctx.globalAlpha = node.intensity;
      this.ctx.shadowBlur = 15 + bassBoost * 10;
      this.ctx.shadowColor = nodeColor;
      this.ctx.fillStyle = nodeColor;

      // Different shapes for different bands
      if (nodeBand === 0) {
        // Bass: Square
        const halfSize = node.size / 2;
        this.ctx.fillRect(node.x - halfSize, node.y - halfSize, node.size, node.size);
      } else if (nodeBand === 1) {
        // Mid: Circle
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      } else {
        // Treble: Diamond
        this.ctx.beginPath();
        this.ctx.moveTo(node.x, node.y - node.size / 2);
        this.ctx.lineTo(node.x + node.size / 2, node.y);
        this.ctx.lineTo(node.x, node.y + node.size / 2);
        this.ctx.lineTo(node.x - node.size / 2, node.y);
        this.ctx.closePath();
        this.ctx.fill();
      }

      // Draw sparkles for treble-active nodes
      if (node.sparks && node.sparks > 0) {
        this.ctx.globalAlpha = node.intensity;
        this.ctx.fillStyle = colors.glow;
        for (let s = 0; s < node.sparks; s++) {
          const sparkleX = node.x + (Math.random() - 0.5) * node.size * 2;
          const sparkleY = node.y + (Math.random() - 0.5) * node.size * 2;
          this.ctx.beginPath();
          this.ctx.arc(sparkleX, sparkleY, 2, 0, Math.PI * 2);
          this.ctx.fill();
        }
        node.sparks = 0;
      }

      this.ctx.restore();
    }

    // Draw ambient background glow based on bass
    if (bass > 0.2) {
      this.ctx.save();
      this.ctx.globalAlpha = bass * 0.05 * glowSpread;
      this.ctx.fillStyle = colors.primary;
      this.ctx.fillRect(0, 0, this.width, this.height);
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

    // Reinitialize circuit on resize
    if (this.nodes.length > 0) {
      this.initCircuit();
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as CircuitBoardConfig;

    // Reinitialize if complexity changed
    if (config.traceComplexity !== undefined && this.nodes.length > 0) {
      this.initCircuit();
    }
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
    this.traces = [];
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
        default: "neon",
        label: "Color Scheme",
      },
      nodeCount: {
        type: "number",
        min: 10,
        max: 50,
        step: 5,
        default: 25,
        label: "Node Count",
      },
      traceComplexity: {
        type: "number",
        min: 1,
        max: 5,
        step: 1,
        default: 3,
        label: "Trace Complexity",
      },
      glowSpread: {
        type: "number",
        min: 0.1,
        max: 2,
        step: 0.1,
        default: 1.0,
        label: "Glow Spread",
      },
    };
  }
}

interface CircuitNode {
  x: number;
  y: number;
  size: number;
  active: boolean;
  intensity: number;
  connections: number[];
  sparks?: number;
}

interface CircuitTrace {
  from: number;
  to: number;
  intensity: number;
  segments: { x: number; y: number }[];
}
