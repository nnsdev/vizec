import { VisualizationMeta } from "../shared/types";

interface VisualizationEntry {
  meta: VisualizationMeta;
}

class VisualizationRegistry {
  private visualizations: Map<string, VisualizationEntry> = new Map();

  constructor() {}

  register(meta: VisualizationMeta): void {
    this.visualizations.set(meta.id, { meta });
  }

  registerMany(metas: VisualizationMeta[]): void {
    for (const meta of metas) {
      this.register(meta);
    }
  }

  getMeta(id: string): VisualizationMeta | null {
    const entry = this.visualizations.get(id);
    return entry ? entry.meta : null;
  }

  getAllMeta(): VisualizationMeta[] {
    return Array.from(this.visualizations.values()).map((e) => e.meta);
  }

  getIds(): string[] {
    return Array.from(this.visualizations.keys());
  }
}

export const visualizationRegistry = new VisualizationRegistry();
