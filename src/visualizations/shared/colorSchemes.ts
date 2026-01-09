// Shared color schemes for all visualizations
// Single source of truth to avoid duplication across 40+ visualization files

export type ColorSchemeId =
  | "cyanMagenta"
  | "darkTechno"
  | "neon"
  | "fire"
  | "ice"
  | "acid"
  | "monochrome"
  | "purpleHaze"
  | "sunset"
  | "ocean"
  | "toxic"
  | "bloodMoon"
  | "synthwave"
  | "golden";

// Base color definitions (hex strings for canvas/p5)
interface ColorSchemeBase {
  primary: string;
  secondary: string;
  glow: string;
}

const COLOR_SCHEME_DATA: Record<ColorSchemeId, ColorSchemeBase> = {
  cyanMagenta: { primary: "#00ffff", secondary: "#ff00ff", glow: "#00ffff" },
  darkTechno: { primary: "#4a00e0", secondary: "#8e2de2", glow: "#8000ff" },
  neon: { primary: "#39ff14", secondary: "#ff073a", glow: "#ffff00" },
  fire: { primary: "#ff4500", secondary: "#ffd700", glow: "#ff6600" },
  ice: { primary: "#00bfff", secondary: "#e0ffff", glow: "#87ceeb" },
  acid: { primary: "#adff2f", secondary: "#00ff00", glow: "#00ff00" },
  monochrome: { primary: "#ffffff", secondary: "#888888", glow: "#ffffff" },
  purpleHaze: { primary: "#8b00ff", secondary: "#ff1493", glow: "#9400d3" },
  sunset: { primary: "#ff6b6b", secondary: "#feca57", glow: "#ff9f43" },
  ocean: { primary: "#0077be", secondary: "#00d4aa", glow: "#00b4d8" },
  toxic: { primary: "#00ff41", secondary: "#0aff0a", glow: "#39ff14" },
  bloodMoon: { primary: "#8b0000", secondary: "#ff4500", glow: "#dc143c" },
  synthwave: { primary: "#ff00ff", secondary: "#00ffff", glow: "#ff00aa" },
  golden: { primary: "#ffd700", secondary: "#ff8c00", glow: "#ffb347" },
};

// String format for Canvas2D and p5.js visualizations
// Keys: primary, secondary, glow
export const COLOR_SCHEMES_STRING: Record<ColorSchemeId, ColorSchemeBase> = COLOR_SCHEME_DATA;

// Alias with start/end keys for visualizations that use gradient terminology
export interface GradientColorScheme {
  start: string;
  end: string;
  glow: string;
}

export const COLOR_SCHEMES_GRADIENT: Record<ColorSchemeId, GradientColorScheme> = Object.fromEntries(
  Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
    key,
    { start: primary, end: secondary, glow },
  ])
) as Record<ColorSchemeId, GradientColorScheme>;

// Alias with accent key for p5.js visualizations
export interface AccentColorScheme {
  primary: string;
  secondary: string;
  accent: string;
}

export const COLOR_SCHEMES_ACCENT: Record<ColorSchemeId, AccentColorScheme> = Object.fromEntries(
  Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
    key,
    { primary, secondary, accent: glow },
  ])
) as Record<ColorSchemeId, AccentColorScheme>;

// Hex number format for Three.js/WebGL visualizations
export interface HexColorScheme {
  primary: number;
  secondary: number;
  glow: number;
}

function hexStringToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}

export const COLOR_SCHEMES_HEX: Record<ColorSchemeId, HexColorScheme> = Object.fromEntries(
  Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
    key,
    {
      primary: hexStringToNumber(primary),
      secondary: hexStringToNumber(secondary),
      glow: hexStringToNumber(glow),
    },
  ])
) as Record<ColorSchemeId, HexColorScheme>;

// Hex number format with accent key (for cubeField, additiveField, fresnelGlow, etc.)
export interface HexAccentColorScheme {
  primary: number;
  accent: number;
  glow: number;
}

export const COLOR_SCHEMES_HEX_ACCENT: Record<ColorSchemeId, HexAccentColorScheme> =
  Object.fromEntries(
    Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
      key,
      {
        primary: hexStringToNumber(primary),
        accent: hexStringToNumber(secondary),
        glow: hexStringToNumber(glow),
      },
    ])
  ) as Record<ColorSchemeId, HexAccentColorScheme>;

// String format with primary, accent, glow (for magentaKeyPulse, etc.)
export interface StringAccentColorScheme {
  primary: string;
  accent: string;
  glow: string;
}

export const COLOR_SCHEMES_STRING_ACCENT: Record<ColorSchemeId, StringAccentColorScheme> =
  Object.fromEntries(
    Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
      key,
      { primary, accent: secondary, glow },
    ])
  ) as Record<ColorSchemeId, StringAccentColorScheme>;

// Hex number format with background key (for audioMesh, etc.)
export interface HexBackgroundColorScheme {
  primary: number;
  secondary: number;
  background: number;
}

export const COLOR_SCHEMES_HEX_BACKGROUND: Record<ColorSchemeId, HexBackgroundColorScheme> =
  Object.fromEntries(
    Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
      key,
      {
        primary: hexStringToNumber(primary),
        secondary: hexStringToNumber(secondary),
        background: hexStringToNumber(glow),
      },
    ])
  ) as Record<ColorSchemeId, HexBackgroundColorScheme>;

// Color scheme options for config schemas (shared across all visualizations)
export const COLOR_SCHEME_OPTIONS = [
  { value: "cyanMagenta", label: "Cyan/Magenta" },
  { value: "darkTechno", label: "Dark Techno" },
  { value: "neon", label: "Neon" },
  { value: "fire", label: "Fire" },
  { value: "ice", label: "Ice" },
  { value: "acid", label: "Acid" },
  { value: "monochrome", label: "Monochrome" },
  { value: "purpleHaze", label: "Purple Haze" },
  { value: "sunset", label: "Sunset" },
  { value: "ocean", label: "Ocean" },
  { value: "toxic", label: "Toxic" },
  { value: "bloodMoon", label: "Blood Moon" },
  { value: "synthwave", label: "Synthwave" },
  { value: "golden", label: "Golden" },
] as const;

// Array of colors for kaleidoscope, fireworks, etc.
export interface ArrayColorScheme {
  colors: string[];
}

export const COLOR_SCHEMES_ARRAY: Record<ColorSchemeId, ArrayColorScheme> = Object.fromEntries(
  Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
    key,
    { colors: [primary, secondary, glow, lightenColor(primary), lightenColor(secondary)] },
  ])
) as Record<ColorSchemeId, ArrayColorScheme>;

// Glitch format for glitchSpectrum
export interface GlitchColorScheme {
  primary: string;
  secondary: string;
  glitch: string;
}

export const COLOR_SCHEMES_GLITCH: Record<ColorSchemeId, GlitchColorScheme> = Object.fromEntries(
  Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
    key,
    { primary, secondary, glitch: glow },
  ])
) as Record<ColorSchemeId, GlitchColorScheme>;

// Grid format for neonGrid (synthwave grid)
export interface GridColorScheme {
  grid: string;
  horizon: string;
  sun: string;
  glow: string;
}

export const COLOR_SCHEMES_GRID: Record<ColorSchemeId, GridColorScheme> = Object.fromEntries(
  Object.entries(COLOR_SCHEME_DATA).map(([key, { primary, secondary, glow }]) => [
    key,
    { grid: primary, horizon: secondary, sun: glow, glow: primary },
  ])
) as Record<ColorSchemeId, GridColorScheme>;

// Helper to lighten a hex color
function lightenColor(hex: string, amount: number = 0.3): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 255) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 255) + Math.round(255 * amount));
  const b = Math.min(255, (num & 255) + Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Helper to get color scheme with fallback
export function getColorScheme<T>(
  schemes: Record<string, T>,
  id: string,
  fallback: ColorSchemeId = "cyanMagenta"
): T {
  return schemes[id] ?? schemes[fallback];
}
