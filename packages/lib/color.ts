/**
 * Color manipulation helpers.
 *
 * The codebase historically used string-concatenation for alpha channels
 * (e.g. `colors.primary + "20"`), which relies on 8-digit hex (#RRGGBBAA)
 * being interpreted correctly and breaks for rgb()/rgba()/named colors.
 * `withAlpha` produces a portable rgba() string from any hex input.
 */

function clampOpacity(opacity: number): number {
  if (Number.isNaN(opacity)) return 0;
  if (opacity < 0) return 0;
  if (opacity > 1) return 1;
  return opacity;
}

function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
  const value = hex.replace("#", "").trim();
  if (value.length === 3) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a: 1 };
  }
  if (value.length === 6 || value.length === 8) {
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    const a = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }
  return null;
}

/**
 * Returns the color with the given alpha (0–1) applied.
 *
 * Accepts `#RGB`, `#RRGGBB`, `#RRGGBBAA` hex strings. Non-hex inputs are
 * returned unchanged so callers can still pass arbitrary CSS color strings.
 */
export function withAlpha(color: string, opacity: number): string {
  const clamped = clampOpacity(opacity);
  const parsed = parseHex(color);
  if (!parsed) return color;
  const combined = parsed.a * clamped;
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${combined})`;
}
