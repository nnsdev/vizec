import { Visualization, VisualizationMeta } from "../../shared/types";

// Use esbuild-plugin-import-glob syntax (wildcard import)
// This returns an array of modules
// @ts-ignore
import visualizationModules from "../../visualizations/**/*.ts";

export class VisualizationManager {
  private visualizations: Map<string, { new (): Visualization; meta: VisualizationMeta }> =
    new Map();

  constructor() {
    this.discoverVisualizations();
  }

  private discoverVisualizations() {
    console.log("Discovering visualizations...", visualizationModules);

    try {
      // visualizationModules is an array of module objects thanks to the plugin
      const modules = visualizationModules as any[];

      if (!Array.isArray(modules)) {
        console.error("visualizationModules is not an array:", modules);
        return;
      }

      for (const mod of modules) {
        // Look for exported classes that implement Visualization
        for (const exportName in mod) {
          const exportedItem = mod[exportName];
          // Check if it's a class with static meta property
          if (typeof exportedItem === "function" && exportedItem.meta) {
            const meta = exportedItem.meta as VisualizationMeta;
            // Validate meta
            if (meta && meta.id && meta.name) {
              // Store the constructor and metadata
              this.visualizations.set(meta.id, {
                new: exportedItem,
                meta: meta,
              });
              console.log(`Registered visualization: ${meta.name} (${meta.id})`);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error in discoverVisualizations:", e);
    }
  }

  public registerWithMainProcess() {
    const metas = Array.from(this.visualizations.values()).map((v) => v.meta);
    console.log("Sending visualizations to main process:", metas);
    if (window.vizecAPI) {
      window.vizecAPI.registerVisualizations(metas);
    } else {
      console.error("vizecAPI not available");
    }
  }

  public createVisualization(id: string): Visualization | null {
    const entry = this.visualizations.get(id);
    if (!entry) {
      console.warn(`Visualization not found: ${id}`);
      return null;
    }

    try {
      // Instantiate the class
      // @ts-ignore
      return new entry.new();
    } catch (error) {
      console.error(`Failed to instantiate visualization ${id}:`, error);
      return null;
    }
  }

  public getIds(): string[] {
    return Array.from(this.visualizations.keys());
  }

  public getMetas(): VisualizationMeta[] {
    return Array.from(this.visualizations.values()).map((v) => v.meta);
  }
}

export const visualizationManager = new VisualizationManager();
