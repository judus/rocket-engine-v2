import type { TileBoard } from './TileBoard.js';

interface Region {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  revision: number;
  checkedAt: number;
}
const colors = ['#253b50', '#80dbbd', '#f1b973'] as const;

/** Concrete terrain artwork cache, shared by cameras, owned by the editor scene. */
export class TileRegionCache {
  #regions = new Map<string, Region>();
  #disposed = false;
  #builds = 0;
  #hits = 0;
  #evictions = 0;
  readonly regionTiles: number;
  readonly maxRegions: number;
  constructor(
    readonly board: TileBoard,
    { regionTiles = 8, maxRegions = 24 } = {},
  ) {
    if (
      !Number.isSafeInteger(regionTiles) ||
      regionTiles <= 0 ||
      regionTiles > 32 ||
      !Number.isSafeInteger(maxRegions) ||
      maxRegions <= 0 ||
      maxRegions > 256
    )
      throw new RangeError('Invalid cache region size or capacity');
    this.regionTiles = regionTiles;
    this.maxRegions = maxRegions;
  }
  get stats() {
    const size = this.regionTiles * this.board.tileSize;
    return {
      regions: this.#regions.size,
      maxRegions: this.maxRegions,
      builds: this.#builds,
      hits: this.#hits,
      evictions: this.#evictions,
      pixelBytes: this.#regions.size * size * size * 4,
    };
  }
  draw(ctx: CanvasRenderingContext2D): undefined {
    if (this.#disposed) throw new Error('Tile cache is disposed');
    // The current matrix includes node ancestors, camera and DPR. Invert the
    // canvas corners to obtain a conservative local viewport, including rotation.
    const { a, b, c, d, e, f } = ctx.getTransform();
    const determinant = a * d - b * c;
    if (!Number.isFinite(determinant) || determinant === 0) return;
    const corners = [
      [0, 0],
      [ctx.canvas.width, 0],
      [0, ctx.canvas.height],
      [ctx.canvas.width, ctx.canvas.height],
    ] as const;
    const points = corners.map(([x, y]) => ({
      x: (d * (x - e) - c * (y - f)) / determinant,
      y: (-b * (x - e) + a * (y - f)) / determinant,
    }));
    const pixels = this.regionTiles * this.board.tileSize;
    const minX = Math.max(
      Math.min(...points.map((p) => p.x)),
      this.board.minX * this.board.tileSize,
    );
    const minY = Math.max(
      Math.min(...points.map((p) => p.y)),
      this.board.minY * this.board.tileSize,
    );
    const maxX = Math.min(
      Math.max(...points.map((p) => p.x)),
      (this.board.minX + this.board.width) * this.board.tileSize,
    );
    const maxY = Math.min(
      Math.max(...points.map((p) => p.y)),
      (this.board.minY + this.board.height) * this.board.tileSize,
    );
    if (maxX <= minX || maxY <= minY) return;
    for (let y = Math.floor(minY / pixels); y < Math.ceil(maxY / pixels); y++)
      for (let x = Math.floor(minX / pixels); x < Math.ceil(maxX / pixels); x++)
        ctx.drawImage(this.#get(x, y).canvas, x * pixels, y * pixels);
  }
  #get(x: number, y: number): Region {
    const key = `${x},${y}`;
    let region = this.#regions.get(key);
    if (!region) {
      // Evict before allocation so even transient pixel storage obeys the budget.
      if (this.#regions.size === this.maxRegions) {
        const oldest = this.#regions.entries().next().value;
        if (oldest) {
          this.#regions.delete(oldest[0]);
          this.#release(oldest[1]);
          this.#evictions++;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = this.regionTiles * this.board.tileSize;
      const context = canvas.getContext('2d');
      if (!context) {
        canvas.width = canvas.height = 0;
        throw new Error('Canvas 2D unavailable for tile cache');
      }
      region = { canvas, ctx: context, revision: -1, checkedAt: -1 };
      this.#regions.set(key, region);
    }
    // Map insertion order is the small cache's least-recently-used list.
    this.#regions.delete(key);
    this.#regions.set(key, region);
    if (region.checkedAt !== this.board.revision) {
      const revision = this.board.revisionIn(
        x * this.regionTiles,
        y * this.regionTiles,
        this.regionTiles,
        this.regionTiles,
      );
      if (region.revision !== revision) {
        const size = this.board.tileSize;
        const ctx = region.ctx;
        ctx.fillStyle = '#101b2b';
        ctx.fillRect(0, 0, region.canvas.width, region.canvas.height);
        for (let dy = 0; dy < this.regionTiles; dy++)
          for (let dx = 0; dx < this.regionTiles; dx++) {
            const terrain = this.board.get({
              x: x * this.regionTiles + dx,
              y: y * this.regionTiles + dy,
            });
            if (terrain === null) continue;
            ctx.fillStyle = colors[terrain];
            ctx.fillRect(dx * size + 1, dy * size + 1, size - 2, size - 2);
          }
        region.revision = revision;
        this.#builds++;
      } else this.#hits++;
      region.checkedAt = this.board.revision;
    } else this.#hits++;
    return region;
  }
  #release(region: Region) {
    region.canvas.width = region.canvas.height = 0;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const region of this.#regions.values()) this.#release(region);
    this.#regions.clear();
  }
}
