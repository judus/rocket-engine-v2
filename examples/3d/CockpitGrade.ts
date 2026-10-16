/** Display-referred art grading, not a physical lighting model. Values: 0..1. */
export interface CockpitGrade {
  readonly darkness: number;
  readonly shadowBlue: number;
  readonly highlightWarm: number;
}
const curve = [
  [0, 0],
  [0.18, 0.07],
  [0.45, 0.21],
  [0.75, 0.43],
  [1, 0.72],
] as const;
function tone(value: number): number {
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i]!;
    if (value <= x1) {
      const [x0, y0] = curve[i - 1]!;
      return y0 + ((y1 - y0) * (value - x0)) / (x1 - x0);
    }
  }
  return 0.72;
}
function smooth(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
/** Returns a fresh buffer; source pixels and alpha (including edge alpha) are unchanged. */
export function gradeCockpit(
  source: Uint8ClampedArray,
  grade: CockpitGrade,
): Uint8ClampedArray<ArrayBuffer> {
  const result = new Uint8ClampedArray(source);
  // Luminance-indexed gains avoid evaluating the curve for every pixel.
  const gains = Array.from({ length: 256 }, (_, i) => {
    const luma = i / 255;
    const exposure =
      luma === 0 ? 1 : 1 + (tone(luma) / luma - 1) * grade.darkness;
    const cool = (1 - smooth(0.12, 0.55, luma)) * grade.shadowBlue;
    const warm = smooth(0.35, 0.9, luma) * grade.highlightWarm;
    return [
      exposure * (1 - 0.12 * cool + 0.12 * warm),
      exposure * (1 - 0.02 * cool + 0.03 * warm),
      exposure * (1 + 0.18 * cool - 0.22 * warm),
    ] as const;
  });
  for (let i = 0; i < source.length; i += 4) {
    if (source[i + 3] === 0) continue;
    const r = source[i]!,
      g = source[i + 1]!,
      b = source[i + 2]!;
    const gain = gains[Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)]!;
    result[i] = r * gain[0];
    result[i + 1] = g * gain[1];
    result[i + 2] = b * gain[2];
  }
  return result;
}
