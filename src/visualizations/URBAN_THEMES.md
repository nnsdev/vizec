# Urban/City Theme Inspiration Catalog

> "If you run out of ideas, take some urban / city themes" - viz.md

This document serves as a fallback inspiration source when creative block occurs.

---

## Existing Urban Visualizations

### 1. Skyline EQ (`canvas/skylineEq.ts`)

**Theme:** City buildings where windows light up as a spectrum analyzer

**Key Patterns:**
- Multi-layer city depth for parallax effect (lines 85-137)
- Frequency-to-building mapping: left-to-right = low-to-high
- Window lighting based on frequency amplitude
- Optimized glow with single shadow blur per building

**Audio Mapping:**
```typescript
const val = frequencyData[b.freqIndex] || 0;
const normalized = (val / 255) * sensitivity;
const litFloors = Math.floor(Math.pow(normalized, 1.2) * b.floors);
```

---

### 2. Traffic Trails (`canvas/trafficTrails.ts`)

**Theme:** Long-exposure city traffic lights at high speed

**Key Patterns:**
- Bass triggers tail lights (red/warm), treble triggers headlights (cool)
- Perspective scaling based on z-depth
- Gradient trails that fade toward tail
- Volume-based "turbo boost" speed multiplier

**Audio Mapping:**
- `bass` → Red/warm tail lights spawn rate
- `treble` → Cool/blue headlights spawn rate
- `volume` → Overall speed boost

---

### 3. Neon Grid (`canvas/neonGrid.ts`)

**Theme:** 80s retro synthwave grid with audio-reactive mountains

**Key Patterns:**
- Horizon line with perspective grid
- Audio-reactive mountain silhouettes
- Sun with horizontal stripe effect
- Grid speed tied to bass

**Audio Mapping:**
- `bass` → Grid scroll speed
- `frequencyData` → Mountain heights
- `volume` → Overall glow intensity

---

### 4. Neon Alley (`webgl/neonAlley.ts`)

**Theme:** Floating neon signs zooming past in a dark void

**Key Patterns:**
- Three.js with additive blending for glow
- Canvas-based texture generation for neon signs
- Fog for depth fading (`scene.fog = new THREE.FogExp2(0x000000, 0.03)`)
- Flicker effect driven by treble/time

**Audio Mapping:**
```typescript
const flicker = Math.sin(this.time * s.flickerSpeed) > 0.8 ? 0.2 : 1.0;
const stability = normalized > 0.5 ? 1.0 : flicker; // Loud = stable
let opacity = 0.3 + normalized * 0.7;
opacity *= stability;
```

---

### 5. Isometric Metropolis (`webgl/isometricMetropolis.ts`)

**Theme:** SimCity-style grid where buildings grow with music

**Key Patterns:**
- Orthographic camera for true isometric view
- Center = bass, edges = higher frequencies
- Wireframe edges for "blueprint/tron" aesthetic
- Beat pulse camera zoom effect

**Audio Mapping:**
- `bass` → Center buildings height
- Higher `frequencyData[i]` → Edge buildings
- `volume` → Camera zoom pulse

---

## Audio Mapping Guidelines

| Audio Property | Urban Visual Effect | Example |
|----------------|---------------------|---------|
| `bass` | Building growth, vehicle spawn, pulse effects | `skylineEq.ts:163-164` |
| `treble` | Fine details, headlights, flicker stability | `trafficTrails.ts:107-108` |
| `mid` | Traffic flow, window density | `trafficTrails.ts:107` |
| `volume` | Overall glow, speed boost | `trafficTrails.ts:130-131` |
| `frequencyData[i]` | Individual building heights, lane activity | `skylineEq.ts:162-164` |

### Frequency Band Reference

```typescript
// Available in AudioData interface (src/shared/types.ts)
interface AudioData {
  frequencyData: Uint8Array;   // 256 bins, 0-255 values
  timeDomainData: Uint8Array;  // Waveform data
  volume: number;              // 0-1 overall loudness
  bass: number;                // 0-1 low frequencies (~60-250 Hz)
  mid: number;                 // 0-1 mid frequencies (~250-2000 Hz)
  treble: number;              // 0-1 high frequencies (~2000-20000 Hz)
  speech?: SpeechData;         // Optional speech recognition
}
```

---

## Recommended Color Schemes for Urban Themes

| Scheme | Hex Values | Use Case |
|--------|------------|----------|
| `synthwave` | `#ff00ff` / `#00ffff` | Cyberpunk, retro-future |
| `neon` | `#39ff14` / `#ff073a` | Neon signs, toxic glow |
| `sunset` | `#ff6b6b` / `#feca57` | Evening skylines |
| `darkTechno` | `#4a00e0` / `#8e2de2` | Industrial zones |
| `golden` | `#ffd700` / `#ff8c00` | Street lamps, warm lights |
| `bloodMoon` | `#8b0000` / `#ff4500` | Dramatic night scenes |

### Color Scheme Access

```typescript
// Canvas2D / p5.js:
import { COLOR_SCHEMES_GRADIENT, getColorScheme } from "../shared/colorSchemes";
const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, "synthwave");
// colors.start, colors.end, colors.glow

// Three.js:
import { COLOR_SCHEMES_HEX_ACCENT, getColorScheme } from "../shared/colorSchemes";
const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, "neon");
// colors.primary (number), colors.accent (number), colors.glow (number)
```

---

## Future Urban Theme Ideas

### Infrastructure
- [ ] Subway/metro train cars passing
- [ ] Bridge cables with frequency-mapped tension
- [ ] Power line/electric grid pulses
- [ ] Water tower silhouettes
- [ ] Construction cranes with swinging arms

### Street Level
- [ ] Crosswalk pedestrian flow
- [ ] Street lamp glow patterns
- [ ] Graffiti/tag reveal effects
- [ ] Fire escape ladders/shadows
- [ ] Parking meter blinking

### Aerial
- [ ] Helicopter spotlights sweeping
- [ ] Drone swarm patterns
- [ ] Bird migration over rooftops
- [ ] Police/ambulance lights from above

### Interior/Architectural
- [ ] Elevator shaft visualization
- [ ] Revolving door motion
- [ ] Window blinds opening/closing
- [ ] Escalator step patterns

### Time-Based
- [ ] Day/night cycle over city
- [ ] Rush hour traffic density
- [ ] City lights turning on at dusk
- [ ] Rain on windows with city reflection

---

## Quick Start Templates

### Canvas2D Template

```typescript
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_GRADIENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface MyUrbanConfig extends VisualizationConfig {
  // Add custom config options here
}

export class MyUrbanVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "myUrban",
    name: "My Urban Viz",
    author: "Vizec",
    description: "Description here",
    renderer: "canvas2d",
    transitionType: "crossfade",
  };

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private config: MyUrbanConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
  };
  private width = 0;
  private height = 0;

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

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.ctx || !this.canvas) return;

    const { bass, mid, treble, frequencyData, volume } = audioData;
    const { sensitivity, colorScheme } = this.config;
    const colors = getColorScheme(COLOR_SCHEMES_GRADIENT, colorScheme);

    // IMPORTANT: Clear with transparency (required by viz.md)
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw urban elements here...
    // Example: Draw a building that grows with bass
    const buildingHeight = this.height * 0.3 * (1 + bass * sensitivity);
    this.ctx.fillStyle = colors.start;
    this.ctx.fillRect(
      this.width / 2 - 50,
      this.height - buildingHeight,
      100,
      buildingHeight
    );
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.canvas) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as MyUrbanConfig;
  }

  destroy(): void {
    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
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
        default: "synthwave",
        options: [...COLOR_SCHEME_OPTIONS],
      },
    };
  }
}
```

---

### Three.js Template

```typescript
import * as THREE from "three";
import {
  AudioData,
  ConfigSchema,
  VisualizationConfig,
  VisualizationMeta,
} from "../types";
import { BaseVisualization } from "../base";
import {
  COLOR_SCHEMES_HEX_ACCENT,
  COLOR_SCHEME_OPTIONS,
  getColorScheme,
} from "../shared/colorSchemes";

interface MyUrban3DConfig extends VisualizationConfig {
  // Add custom config options here
}

export class MyUrban3DVisualization extends BaseVisualization {
  static readonly meta: VisualizationMeta = {
    id: "myUrban3D",
    name: "My Urban 3D",
    author: "Vizec",
    description: "3D urban visualization",
    renderer: "threejs",
    transitionType: "crossfade",
  };

  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private config: MyUrban3DConfig = {
    sensitivity: 1.0,
    colorScheme: "synthwave",
  };

  init(container: HTMLElement, config: VisualizationConfig): void {
    this.updateConfig(config);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene setup
    this.scene = new THREE.Scene();
    // Optional: Add fog for depth
    this.scene.fog = new THREE.FogExp2(0x000000, 0.02);

    // Camera setup
    this.camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 100);
    this.camera.position.set(0, 5, 20);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup - IMPORTANT: alpha: true for transparency
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0); // Transparent!
    container.appendChild(this.renderer.domElement);

    // Create 3D urban elements here...
    this.createScene();
  }

  private createScene(): void {
    if (!this.scene) return;

    const colors = getColorScheme(COLOR_SCHEMES_HEX_ACCENT, this.config.colorScheme);

    // Example: Create a simple building
    const geometry = new THREE.BoxGeometry(2, 5, 2);
    const material = new THREE.MeshBasicMaterial({
      color: colors.primary,
      transparent: true,
      opacity: 0.8,
    });
    const building = new THREE.Mesh(geometry, material);
    building.position.y = 2.5;
    this.scene.add(building);
  }

  render(audioData: AudioData, deltaTime: number): void {
    if (!this.scene || !this.camera || !this.renderer) return;

    const { bass, mid, treble, frequencyData, volume } = audioData;
    const { sensitivity } = this.config;

    // Update 3D elements based on audio...
    // Example: Scale buildings with bass
    this.scene.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.scale.y = 1 + bass * sensitivity;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    this.renderer?.setSize(width, height);
  }

  updateConfig(config: Partial<VisualizationConfig>): void {
    this.config = { ...this.config, ...config } as MyUrban3DConfig;
  }

  destroy(): void {
    // IMPORTANT: Clean up Three.js resources
    this.scene?.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        }
      }
    });
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
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
        default: "synthwave",
        options: COLOR_SCHEME_OPTIONS.map((o) => ({
          label: o.label,
          value: o.value,
        })),
      },
    };
  }
}
```

---

## Key Requirements Reminder

From `viz.md`:
1. **Background MUST be transparent** - Use `clearRect()` for Canvas2D, `setClearColor(0x000000, 0)` for Three.js
2. **Semi-transparent overlays** - Any elements covering the screen should have transparency
3. **Urban themes as fallback** - When creativity runs low, reference this catalog

---

## Neon Sign Text Bank

The `shared/words.ts` file contains 100+ words for neon signs, including:
- Cyberpunk terms: `CYBER`, `HACK`, `GLITCH`, `SYNC`, `WIRE`, `NODE`
- Nightlife: `BAR`, `CLUB`, `LOUNGE`, `ARCADE`, `CASINO`, `KARAOKE`
- Japanese: `東京`, `渋谷`, `新宿`, `ラーメン`, `バー`, `ネオン`
- Atmosphere: `NEON`, `DREAM`, `GHOST`, `VAPOR`, `HAZE`, `GLOW`

Use these words when creating neon sign visualizations for authentic urban feel.
