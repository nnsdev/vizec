# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Development (build + run)
bun run dev

# Build only (all targets)
bun run build

# Build individual targets
bun run build:main      # Main process (CommonJS)
bun run build:preload   # Preload script (CommonJS)
bun run build:renderer  # Renderer bundle (ESM via esbuild)
bun run copy-assets     # Copy HTML/CSS to dist

# Package for distribution
bun run package:win     # Windows (NSIS installer)
bun run package:mac     # macOS (DMG)
bun run package:linux   # Linux (AppImage)

# Linting
bun run lint            # Run oxlint
bun run lint:fix        # Auto-fix lint issues
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

| File                                               | Purpose                                                |
| -------------------------------------------------- | ------------------------------------------------------ |
| `src/shared/types.ts`                              | All shared TypeScript interfaces and IPC channel names |
| `src/main/registry.ts`                             | Visualization metadata registry (main process)         |
| `src/renderer/visualizer/visualization-manager.ts` | Auto-discovery + factory (renderer process)            |
| `src/renderer/visualizer/engine.ts`                | Render loop, transitions, rotation logic               |
| `src/renderer/shared/audioAnalyzer.ts`             | FFT analysis with noise gating                         |
| `src/visualizations/base.ts`                       | BaseVisualization class for extending                  |

## Adding a New Visualization

1. Create class in appropriate folder:

   - `src/visualizations/canvas/` - Canvas2D
   - `src/visualizations/webgl/` - Three.js/WebGL
   - `src/visualizations/p5/` - p5.js

2. Extend `BaseVisualization` from `src/visualizations/base.ts` with a `static meta` property:

   ```typescript
   import { BaseVisualization } from '../base';
   import {
     VisualizationMeta,
     VisualizationConfig,
     AudioData,
     ConfigSchema,
   } from '../types';

   export class MyVisualization extends BaseVisualization {
     static readonly meta: VisualizationMeta = {
       id: 'myViz',
       name: 'My Visualization',
       renderer: 'canvas2d', // or "webgl", "p5", "threejs"
       transitionType: 'crossfade', // or "cut", "zoom"
     };

     init(container: HTMLElement, config: VisualizationConfig): void {
       /* ... */
     }
     render(audioData: AudioData, deltaTime: number): void {
       /* ... */
     }
     resize(width: number, height: number): void {
       /* ... */
     }
     updateConfig(config: Partial<VisualizationConfig>): void {
       /* ... */
     }
     destroy(): void {
       /* ... */
     }
     getConfigSchema(): ConfigSchema {
       return {};
     }
   }
   ```

3. **That's it** - auto-discovery via `esbuild-plugin-import-glob` finds all `.ts` files in `src/visualizations/**/` and registers any exported class with a valid `static meta` property

4. **Make sure linting passes, if you have linting errors make sure to fix them before you consider yourself done** When running linting, make sure to use bunx over npx

### Visualization Guidelines

**Transparency is critical** - visualizations render on a transparent overlay window:

- Never fill the background with solid color - use `clearRect()` for Canvas2D or transparent clear color for WebGL
- All visuals should "float" on transparency so the user's desktop/game shows through
- Test with actual content behind the overlay, not just a black screen

**Rendering best practices:**

- Use `clearRect(0, 0, width, height)` at the start of each Canvas2D render frame
- For WebGL/Three.js, set `alpha: true` in renderer options and clear with `(0, 0, 0, 0)`
- Avoid large opaque shapes - prefer lines, particles, gradients with alpha falloff
- Consider additive blending for glow effects that layer nicely over any background

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
