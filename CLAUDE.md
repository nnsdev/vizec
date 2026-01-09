# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Development (build + run)
npm run dev

# Build only (all targets)
npm run build

# Build individual targets
npm run build:main      # Main process (CommonJS)
npm run build:preload   # Preload script (CommonJS)
npm run build:renderer  # Renderer bundle (ESM via esbuild)
npm run copy-assets     # Copy HTML/CSS to dist

# Package for distribution
npm run package:win     # Windows (NSIS installer)
npm run package:mac     # macOS (DMG)
npm run package:linux   # Linux (AppImage)
```

## Architecture Overview

**Electron dual-window app** for real-time audio visualization with transparent overlay support.

### Process Model

```
Main Process (src/main/)
├── Window management (visualizer + control)
├── IPC handlers (src/main/ipc/handlers.ts)
├── Preset management (src/main/presets/)
└── App state broadcasting

Preload (src/preload/preload.ts)
└── contextBridge exposes window.vizecAPI

Renderer Process (src/renderer/)
├── visualizer/ - 1920x1080 transparent canvas, VisualizationEngine
└── control/ - 400x600 settings UI
```

### Data Flow

1. **Audio Capture**: `desktopCapturer` + `setDisplayMediaRequestHandler({ audio: 'loopback' })` → MediaStream → `AudioAnalyzer`
2. **Analysis**: Web Audio API AnalyserNode → frequency bins, waveform, bass/mid/treble levels
3. **State**: Main process holds `AppState`, broadcasts via IPC on changes
4. **Rendering**: `VisualizationEngine` runs requestAnimationFrame loop, passes `AudioData` to active visualization

### Key Files

| File                                   | Purpose                                                |
| -------------------------------------- | ------------------------------------------------------ |
| `src/shared/types.ts`                  | All shared TypeScript interfaces and IPC channel names |
| `src/visualizations/registry.ts`       | Visualization metadata registry (main process)         |
| `src/visualizations/index.ts`          | Factory function + exports (renderer process)          |
| `src/renderer/visualizer/engine.ts`    | Render loop, transitions, rotation logic               |
| `src/renderer/shared/audioAnalyzer.ts` | FFT analysis with noise gating                         |

## Adding a New Visualization

1. Create class in appropriate folder:
   - `src/visualizations/canvas/` - Canvas2D
   - `src/visualizations/webgl/` - Three.js/WebGL
   - `src/visualizations/p5/` - p5.js

2. Implement the `Visualization` interface from `src/shared/types.ts`:

   ```typescript
   interface Visualization {
     id: string;
     name: string;
     renderer: "canvas2d" | "webgl" | "p5" | "threejs";
     transitionType: "crossfade" | "cut" | "zoom";
     init(container: HTMLElement, config: VisualizationConfig): void;
     render(audioData: AudioData, deltaTime: number): void;
     resize(width: number, height: number): void;
     updateConfig(config: Partial<VisualizationConfig>): void;
     destroy(): void;
     getConfigSchema(): ConfigSchema;
   }
   ```

3. Register in `src/visualizations/registry.ts` (metadata only)

4. Add to factory switch in `src/visualizations/index.ts`

5. Export from `src/visualizations/index.ts`

## AudioData Structure

```typescript
interface AudioData {
  frequencyData: Uint8Array; // FFT bins (gated, scaled 0-255)
  timeDomainData: Uint8Array; // Raw waveform
  volume: number; // 0-1 overall level
  bass: number; // 0-1 low frequency energy
  mid: number; // 0-1 mid frequency energy
  treble: number; // 0-1 high frequency energy
}
```

## Build Configuration

- **Main/Preload**: TypeScript → CommonJS (separate tsconfig files)
- **Renderer**: esbuild bundles to ESM with code splitting
- Assets (HTML/CSS) copied via PowerShell script

## Dependencies

- **electron**: Desktop app framework
- **three**: 3D visualizations (webgl/)
- **p5**: Creative coding visualizations (p5/)
