# Vizec - Techno Audio Visualizer

## Project Overview

An Electron app with two windows:
1. **Visualizer Window** - 1920x1080, transparent background, normal z-order
2. **Control Window** - 400x600 UI for audio source selection, visualization picker, presets, and settings

## Design Direction

**Techno-focused aesthetic:**
- Dark theme with high contrast
- Color palette: Deep blacks, electric cyan, magenta, purple, with occasional white/strobe effects
- Sharp geometric shapes, clean lines
- Reactive to bass/kick drums (important for techno)
- Smooth transitions between visualizations

---

## Tasks

### Phase 1: Project Setup
- [ ] Initialize Electron project with TypeScript and build configuration
- [ ] Set up project structure (main, renderer, visualizations, preload)

### Phase 2: Core Infrastructure
- [ ] Create main process with window management (visualizer + control windows)
- [ ] Implement transparent 1080p visualizer window
- [ ] Implement control window with UI (400x600)
- [ ] Set up IPC communication between windows
- [ ] Create preload script with context bridge

### Phase 3: Audio System
- [ ] Implement audio source enumeration via desktopCapturer
- [ ] Implement audio capture with loopback
- [ ] Create Web Audio API analyzer for frequency/waveform data

### Phase 4: Visualization System
- [ ] Design visualization plugin interface and registry
- [ ] Create visualization engine (lifecycle management, transitions)
- [ ] Implement auto-rotation system with configurable interval

### Phase 5: Preset System
- [ ] Create preset manager (save/load/delete)
- [ ] Create built-in presets (Dark Techno, Rave, Minimal, Acid)
- [ ] Wire up preset UI in control window

### Phase 6: Visualizations
- [ ] Create Canvas2D visualization: Frequency Bars (techno style)
- [ ] Create WebGL/Three.js visualization: Particle Storm
- [ ] Create p5.js visualization: Circular Waveform

### Phase 7: Integration & Polish
- [ ] Wire up control window to switch visualizations and adjust settings
- [ ] Implement per-visualization dynamic settings UI
- [ ] Test and verify audio capture and visualization rendering

---

## Technical Architecture

### File Structure
```
vizec/
├── package.json
├── tsconfig.json
├── presets/                       # Built-in presets (bundled)
│   ├── dark-techno.json
│   ├── rave.json
│   ├── minimal.json
│   └── acid.json
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── windows/
│   │   │   ├── visualizer.ts
│   │   │   └── control.ts
│   │   ├── ipc/
│   │   │   └── handlers.ts
│   │   └── presets/
│   │       └── presetManager.ts
│   ├── preload/
│   │   └── preload.ts
│   ├── renderer/
│   │   ├── visualizer/
│   │   │   ├── index.html
│   │   │   ├── index.ts
│   │   │   ├── styles.css
│   │   │   └── engine.ts
│   │   ├── control/
│   │   │   ├── index.html
│   │   │   ├── index.ts
│   │   │   └── styles.css
│   │   └── shared/
│   │       ├── audioAnalyzer.ts
│   │       └── types.ts
│   └── visualizations/
│       ├── types.ts
│       ├── registry.ts
│       ├── canvas/
│       │   └── frequencyBars.ts
│       ├── webgl/
│       │   └── particleStorm.ts
│       └── p5/
│           └── circularWave.ts
```

### Tech Stack
| Component | Choice |
|-----------|--------|
| Framework | Electron 28+ |
| Language | TypeScript 5.3+ |
| Build | electron-builder |
| 3D | Three.js |
| Creative | p5.js |
| Audio | Web Audio API (AnalyserNode) |

### Key Technical Decisions
| Aspect | Approach |
|--------|----------|
| Audio Capture | `desktopCapturer` + `setDisplayMediaRequestHandler` with `audio: 'loopback'` |
| Audio Analysis | Web Audio API `AnalyserNode` for FFT frequency data and time-domain waveform |
| Window Communication | Electron IPC via `contextBridge` (secure) |
| Transparent Window | `BrowserWindow({ frame: false, transparent: true })` |
| Visualization System | Plugin interface supporting Canvas2D, WebGL/Three.js, and p5.js |

---

## Preset System

### What's saved in a preset:
- Selected visualization + its specific settings
- Audio settings (sensitivity, smoothing)
- Display settings (background mode)
- Auto-rotation settings (enabled, interval, order)

### Preset file format:
```json
{
  "name": "Dark Techno",
  "builtin": true,
  "visualization": "frequencyBars",
  "visualizationConfig": {
    "colorScheme": "darkTechno",
    "barCount": 64,
    "glow": true
  },
  "audioConfig": {
    "sensitivity": 0.7,
    "smoothing": 0.85
  },
  "displayConfig": {
    "background": "transparent"
  },
  "rotation": {
    "enabled": false,
    "interval": 30,
    "order": "sequential"
  }
}
```

### Built-in Presets:
| Preset | Vibe |
|--------|------|
| **Dark Techno** | Muted colors, slower response, atmospheric, deep bass focus |
| **Rave** | Bright neon, fast response, high contrast, strobe-friendly |
| **Minimal** | Monochrome, clean lines, subtle movements |
| **Acid** | Green/yellow palette, 303 vibes, warped geometry |

---

## Auto-Rotation System

- Toggle in control panel to enable/disable
- Configurable interval (5s - 120s, default 30s)
- Transition style chosen per visualization (crossfade, cut, zoom)
- Manual prev/next buttons still work when auto-rotate is on (resets timer)
- Option to randomize order or go sequential

---

## Visualization Plugin Interface

Each visualization implements:
- `init(container, config)` - Set up the visualization
- `render(audioData, deltaTime)` - Render frame with audio data
- `resize(width, height)` - Handle window resize
- `updateConfig(config)` - Update settings from control panel
- `destroy()` - Cleanup
- `getConfigSchema()` - Define configurable parameters for UI

### Audio data provided:
- `frequencyData` - FFT frequency bins (Uint8Array)
- `timeDomainData` - Waveform data (Uint8Array)
- `volume`, `bass`, `mid`, `treble` - Normalized energy levels

---

## Control Window Layout (400x600)

```
┌─────────────────────────────────┐
│  VIZEC                      [−] │
├─────────────────────────────────┤
│  PRESET                         │
│  ┌─────────────────────────┐    │
│  │ ▼ Dark Techno           │    │
│  └─────────────────────────┘    │
│  [Save As] [Delete]             │
├─────────────────────────────────┤
│  AUDIO SOURCE                   │
│  ┌─────────────────────────┐    │
│  │ ▼ Select audio source   │    │
│  └─────────────────────────┘    │
│  [■ Stop] [▶ Start]             │
├─────────────────────────────────┤
│  VISUALIZATION                  │
│  ┌─────────────────────────┐    │
│  │ ▼ Frequency Bars        │    │
│  └─────────────────────────┘    │
│  [◀ Prev]  [Next ▶]             │
│                                 │
│  [ ] Auto-rotate                │
│  Interval: [====●====] 30s      │
│  Order: (●) Sequential ( ) Random│
├─────────────────────────────────┤
│  AUDIO                          │
│  Sensitivity: [========●=]      │
│  Smoothing:   [====●=====]      │
│  ┌─────────────────────────┐    │
│  │  ▁▂▃▅▆▇█▇▆▅▃▂▁          │    │
│  └─────────────────────────┘    │
├─────────────────────────────────┤
│  VISUALIZATION SETTINGS         │
│  (dynamic per visualization)    │
│  Color: [▼ Cyan/Magenta]        │
│  Glow:  [✓]                     │
│  Bars:  [====●=====] 64         │
├─────────────────────────────────┤
│  DISPLAY                        │
│  Background: (●) Transparent    │
│              ( ) Solid black    │
└─────────────────────────────────┘
```

---

## Starter Visualizations

| Name | Renderer | Description |
|------|----------|-------------|
| **Frequency Bars** | Canvas2D | Classic vertical bars, gradient cyan→magenta, bass-reactive pulse |
| **Particle Storm** | Three.js | 3D particles that explode outward on beats, swirl on sustained notes |
| **Circular Waveform** | p5.js | Circular oscilloscope with geometric patterns, rotates with bass |
