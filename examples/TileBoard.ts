export interface Cell {
  readonly x: number;
  readonly y: number;
}
export type Terrain = 0 | 1 | 2;

/** Demo-owned finite data, independent of rendering, input and the engine. */
export class TileBoard {
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
  readonly height: number;
  readonly tileSize = 32;
  #tiles: Uint8Array;
  #versions: Float64Array;
  #mint = 0;
  #sand = 0;

  constructor({ width = 16, height = 10 } = {}) {
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      width * height > 65536
    )
      throw new RangeError(
        'Board dimensions must be positive integers with at most 65536 cells',
      );
    this.width = width;
    this.height = height;
    this.minX = -Math.floor(width / 2);
    this.minY = -Math.floor(height / 2);
    this.#tiles = new Uint8Array(width * height);
    this.#versions = new Float64Array(width * height);
  }
  #revision = 0;

  get revision(): number {
    return this.#revision;
  }
  get counts() {
    const mint = this.#mint,
      sand = this.#sand;
    const total = this.#tiles.length;
    return {
      mint,
      sand,
      active: mint + sand,
      empty: total - mint - sand,
      total,
    };
  }
  contains({ x, y }: Cell): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= this.minX &&
      x < this.minX + this.width &&
      y >= this.minY &&
      y < this.minY + this.height
    );
  }
  cellAt(point: { x: number; y: number }): Cell | null {
    const cell = {
      x: Math.floor(point.x / this.tileSize),
      y: Math.floor(point.y / this.tileSize),
    };
    return this.contains(cell) ? cell : null;
  }
  get(cell: Cell): Terrain | null {
    if (!this.contains(cell)) return null;
    // Checked bounds and three-state writes keep the dense array typed.
    return this.#tiles[this.#index(cell)] as Terrain;
  }
  cycle(cell: Cell): boolean {
    const current = this.get(cell);
    if (current === null) return false;
    const next = (current + 1) % 3;
    if (current === 1) this.#mint--;
    if (current === 2) this.#sand--;
    if (next === 1) this.#mint++;
    if (next === 2) this.#sand++;
    const index = this.#index(cell);
    this.#tiles[index] = next;
    this.#versions[index] = ++this.#revision;
    return true;
  }
  /** Latest edit in a half-open cell rectangle; presentation chooses its region size. */
  revisionIn(
    minX: number,
    minY: number,
    width: number,
    height: number,
  ): number {
    let revision = 0;
    for (
      let y = Math.max(minY, this.minY);
      y < Math.min(minY + height, this.minY + this.height);
      y++
    )
      for (
        let x = Math.max(minX, this.minX);
        x < Math.min(minX + width, this.minX + this.width);
        x++
      )
        revision = Math.max(
          revision,
          this.#versions[this.#index({ x, y })] ?? 0,
        );
    return revision;
  }
  #index({ x, y }: Cell): number {
    return (y - this.minY) * this.width + x - this.minX;
  }
}
