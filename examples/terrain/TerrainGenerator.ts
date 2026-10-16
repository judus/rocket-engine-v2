export const terrainVersion = 'gradient-terrain-v1';
export const biomeNames = [
  'water',
  'shore',
  'grassland',
  'forest',
  'rock',
  'snow',
] as const;
export type Biome = 0 | 1 | 2 | 3 | 4 | 5;
export interface TerrainSample {
  readonly height: number;
  readonly moisture: number;
  readonly biome: Biome;
}
export interface TerrainChunk {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly heights: Float32Array;
  readonly moisture: Float32Array;
  readonly biomes: Uint8Array;
}
const limit = 1_000_000;
function position(x: number, y: number) {
  if (![x, y].every((n) => Number.isFinite(n) && Math.abs(n) <= limit))
    throw new RangeError(
      'Terrain coordinates must be finite and within ±1000000',
    );
}
function hash(seed: number, x: number, y: number): number {
  let value = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
function gradient(seed: number, x: number, y: number, dx: number, dy: number) {
  switch (hash(seed, x, y) & 7) {
    case 0:
      return dx;
    case 1:
      return -dx;
    case 2:
      return dy;
    case 3:
      return -dy;
    case 4:
      return (dx + dy) * Math.SQRT1_2;
    case 5:
      return (dx - dy) * Math.SQRT1_2;
    case 6:
      return (-dx + dy) * Math.SQRT1_2;
    default:
      return (-dx - dy) * Math.SQRT1_2;
  }
}
function noise(seed: number, x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    dx = x - ix,
    dy = y - iy;
  return mix(
    mix(
      gradient(seed, ix, iy, dx, dy),
      gradient(seed, ix + 1, iy, dx - 1, dy),
      fade(dx),
    ),
    mix(
      gradient(seed, ix, iy + 1, dx, dy - 1),
      gradient(seed, ix + 1, iy + 1, dx - 1, dy - 1),
      fade(dx),
    ),
    fade(dy),
  );
}
function field(seed: number, x: number, y: number) {
  let value = 0,
    weight = 1,
    total = 0;
  for (let octave = 0; octave < 4; octave++) {
    value += noise(seed ^ Math.imul(octave, 0x9e3779b9), x, y) * weight;
    total += weight;
    weight *= 0.5;
    x *= 2;
    y *= 2;
  }
  return Math.max(0, Math.min(1, 0.5 + (value / total) * 1.2));
}

/** Pure world-coordinate fields. No engine, camera, mutable noise state or random calls. */
export class TerrainGenerator {
  #config: Readonly<{ seed: number; scale: number }>;
  get config() {
    return this.#config;
  }
  get identity() {
    return `${terrainVersion};seed=${this.#config.seed};scale=${this.#config.scale}`;
  }
  constructor({ seed, scale = 96 }: { seed: number; scale?: number }) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
      throw new RangeError('Seed must be an unsigned 32-bit integer');
    if (!Number.isFinite(scale) || scale < 1 || scale > 8192)
      throw new RangeError(
        'Terrain scale must be between 1 and 8192 world units',
      );
    this.#config = Object.freeze({ seed, scale });
  }
  sample(x: number, y: number): TerrainSample {
    position(x, y);
    const { seed, scale } = this.config;
    const height = field(seed, x / scale + 23.456, y / scale - 71.234);
    const moisture = field(
      seed ^ 0x68bc21eb,
      x / (scale * 0.75) + 103.13,
      y / (scale * 0.75) - 73.53,
    );
    const biome: Biome =
      height < 0.4
        ? 0
        : height < 0.435
          ? 1
          : height > 0.8
            ? 5
            : height > 0.68
              ? 4
              : moisture > 0.53
                ? 3
                : 2;
    return Object.freeze({ height, moisture, biome });
  }
  chunk(x: number, y: number, size = 32): TerrainChunk {
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(size) ||
      size < 1 ||
      size > 64
    )
      throw new RangeError(
        'Chunk coordinates must be integers; size must be 1–64',
      );
    position(x * size, y * size);
    position(x * size + size - 1, y * size + size - 1);
    const heights = new Float32Array(size * size),
      moisture = new Float32Array(size * size),
      biomes = new Uint8Array(size * size);
    for (let cy = 0; cy < size; cy++)
      for (let cx = 0; cx < size; cx++) {
        const sample = this.sample(x * size + cx, y * size + cy),
          index = cy * size + cx;
        heights[index] = sample.height;
        moisture[index] = sample.moisture;
        biomes[index] = sample.biome;
      }
    return Object.freeze({ x, y, size, heights, moisture, biomes });
  }
}
