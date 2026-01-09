import {
  AudioData,
  ConfigSchema,
  Visualization,
  VisualizationConfig,
  VisualizationMeta,
} from "./types";

/**
 * Base class for visualizations that handles meta property propagation.
 * Eliminates the need for repetitive `readonly id = (this.constructor as any).meta.id` patterns.
 *
 * Usage:
 * ```typescript
 * export class MyVisualization extends BaseVisualization {
 *   static readonly meta: VisualizationMeta = {
 *     id: "myViz",
 *     name: "My Visualization",
 *     renderer: "canvas2d",
 *     transitionType: "crossfade",
 *   };
 *
 *   // Just implement the abstract methods - no need to redeclare meta properties
 * }
 * ```
 */
export abstract class BaseVisualization implements Visualization {
  // Access static meta from the concrete class
  private get _meta(): VisualizationMeta {
    return (this.constructor as typeof BaseVisualization & { meta: VisualizationMeta }).meta;
  }

  get id(): string {
    return this._meta.id;
  }

  get name(): string {
    return this._meta.name;
  }

  get author(): string | undefined {
    return this._meta.author;
  }

  get description(): string | undefined {
    return this._meta.description;
  }

  get renderer(): VisualizationMeta["renderer"] {
    return this._meta.renderer;
  }

  get transitionType(): VisualizationMeta["transitionType"] {
    return this._meta.transitionType;
  }

  // Abstract methods that each visualization must implement
  abstract init(container: HTMLElement, config: VisualizationConfig): void;
  abstract render(audioData: AudioData, deltaTime: number): void;
  abstract resize(width: number, height: number): void;
  abstract updateConfig(config: Partial<VisualizationConfig>): void;
  abstract destroy(): void;
  abstract getConfigSchema(): ConfigSchema;
}
