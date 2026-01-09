import { VisualizationMeta } from "../shared/types";

class VisualizationRegistry {
  private visualizations: Map<string, VisualizationMeta> = new Map();

  register(meta: VisualizationMeta): void {
    this.visualizations.set(meta.id, meta);
  }

  registerMany(metas: VisualizationMeta[]): void {
    for (const meta of metas) {
      this.register(meta);
    }
  }

  getMeta(id: string): VisualizationMeta | null {
    return this.visualizations.get(id) ?? null;
  }

  getAllMeta(): VisualizationMeta[] {
    return Array.from(this.visualizations.values());
  }

  getIds(): string[] {
    return Array.from(this.visualizations.keys());
  }
}

export const visualizationRegistry = new VisualizationRegistry();
