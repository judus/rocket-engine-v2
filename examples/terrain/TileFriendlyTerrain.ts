const maximumTier = 11;
// Four radius-one morphology stages, then eleven slope propagation stages.
const halo = maximumTier + 4;
export class TileFriendlyTerrain {
  #regions = new Map<string, Uint8Array>();
  #disposed = false;
  #builds = 0;
  #changed = 0;
  constructor(
    private readonly source: (x: number, y: number) => number,
    private readonly size = 16,
    private readonly capacity = 64,
  ) {
    if (
      !Number.isInteger(size) ||
      size < 1 ||
      size > 32 ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 128
    )
      throw new RangeError('Invalid tile-friendly cache bounds');
  }
  get stats() {
    return Object.freeze({
      retained: this.#regions.size,
      capacity: this.capacity,
      builds: this.#builds,
      changedCells: this.#changed,
      tileBytes: this.#regions.size * this.size * this.size,
    });
  }
  read(x: number, y: number): number {
    if (this.#disposed) throw new Error('Tile-friendly terrain is disposed');
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      Math.abs(x) > 999900 ||
      Math.abs(y) > 999900
    )
      throw new RangeError(
        'Tile-friendly coordinates must be integers within ±999900',
      );
    const cx = Math.floor(x / this.size),
      cy = Math.floor(y / this.size),
      key = `${cx},${cy}`;
    let data = this.#regions.get(key);
    if (!data) {
      data = this.#build(cx * this.size, cy * this.size);
      if (this.#regions.size >= this.capacity) {
        const first = this.#regions.keys().next().value;
        if (first !== undefined) this.#regions.delete(first);
      }
    }
    this.#regions.delete(key);
    this.#regions.set(key, data);
    return data[(y - cy * this.size) * this.size + x - cx * this.size] ?? 0;
  }
  dispose(): undefined {
    this.#disposed = true;
    this.#regions.clear();
  }
  #build(originX: number, originY: number): Uint8Array {
    const width = this.size + halo * 2;
    let data: Uint8Array = new Uint8Array(width * width);
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const value = this.source(originX + x - halo, originY + y - halo);
        if (!Number.isInteger(value) || value < 0 || value > maximumTier)
          throw new RangeError('Terrain source must return integer tiers 0–11');
        data[y * width + x] = value;
      }
    const raw = data;
    function neighborhood(
      input: Uint8Array,
      operation: 'min' | 'max' | 'slope',
    ): Uint8Array {
      const output = new Uint8Array(input.length);
      for (let y = 0; y < width; y++)
        for (let x = 0; x < width; x++) {
          let value = input[y * width + x] ?? 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx,
                ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= width || ny >= width) continue;
              const neighbor = input[ny * width + nx] ?? 0;
              value =
                operation === 'max'
                  ? Math.max(value, neighbor)
                  : Math.min(value, neighbor + (operation === 'slope' ? 1 : 0));
            }
          output[y * width + x] = value;
        }
      return output;
    }
    // Opening removes narrow peaks; closing fills narrow holes/channels.
    for (const operation of ['min', 'max', 'max', 'min'] as const)
      data = neighborhood(data, operation);
    // Equivalent to min_q(cleaned(q) + ChebyshevDistance(p,q)).
    // Tiers are bounded 0–11, so values beyond radius eleven cannot lower the result.
    // The global result differs by at most one tier between all eight neighbors.
    for (let step = 0; step < maximumTier; step++)
      data = neighborhood(data, 'slope');
    const result = new Uint8Array(this.size * this.size);
    let changed = 0;
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        const index = (y + halo) * width + x + halo,
          value = data[index] ?? 0;
        result[y * this.size + x] = value;
        if (value !== raw[index]) changed++;
      }
    this.#builds++;
    this.#changed += changed;
    return result;
  }
}
