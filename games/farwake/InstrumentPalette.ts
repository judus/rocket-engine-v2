/** Turquoise instrument theme only. Lighting, warnings and monochrome apps have
 * separate meanings. Seeds retain their authored saturation/lightness; a hue
 * offset moves displays, HUD, aiming marks and their spill together. */
const turquoise = {
  primary: '#86ead6',
  muted: '#6a9691',
  border: '#21423e',
  background: '#030b0e',
  gaugeTrack: '#15312e',
  switchOn: '#173d36',
  switchOff: '#122326',
  classicReticle: '#68bda9',
  classicSpill: '#71e5c3',
} as const;

function rotate(hex: string, degrees: number): string {
  if (degrees === 0) return hex;
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  ) as [number, number, number];
  const high = Math.max(r, g, b),
    low = Math.min(r, g, b),
    delta = high - low;
  if (delta === 0) return hex;
  const hue =
    (high === r
      ? (g - b) / delta
      : high === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4) * 60;
  const h = ((((hue + degrees) % 360) + 360) % 360) / 60;
  const x = delta * (1 - Math.abs((h % 2) - 1));
  const rgb =
    h < 1
      ? [delta, x, 0]
      : h < 2
        ? [x, delta, 0]
        : h < 3
          ? [0, delta, x]
          : h < 4
            ? [0, x, delta]
            : h < 5
              ? [x, 0, delta]
              : [delta, 0, x];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round((v + low) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
function linear(hex: string): readonly [number, number, number] {
  return Object.freeze(
    [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number],
  );
}
export function createInstrumentPalette(hueOffset = 0) {
  if (!Number.isFinite(hueOffset) || hueOffset < -180 || hueOffset > 180)
    throw new RangeError(
      'Instrument hue offset must be between -180 and 180 degrees',
    );
  const colors = Object.fromEntries(
    Object.entries(turquoise).map(([key, color]) => [
      key,
      rotate(color, hueOffset),
    ]),
  ) as Record<keyof typeof turquoise, string>;
  return Object.freeze({
    ...colors,
    spill: linear(colors.primary),
    classicSpillLinear: linear(colors.classicSpill),
  });
}
/** One game-wide selection. Change this offset to audition an instrument hue. */
export const instrumentPalette = createInstrumentPalette();
