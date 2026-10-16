import { chunkSize } from '../streaming/ChunkStream.js';
import type { ChunkStream, TileBounds } from '../streaming/ChunkStream.js';
import type { TerrainGenerator } from './TerrainGenerator.js';
export const terrainPixels = 5;
const colors = [
  '#315f91',
  '#d9c18a',
  '#83b85f',
  '#326d51',
  '#92969b',
  '#e9f0f4',
] as const;
type Entry = {
  x: number;
  y: number;
  biome: HTMLCanvasElement;
  height: HTMLCanvasElement;
  signature: string;
  revision: number;
};
function surface() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = chunkSize * terrainPixels;
  if (!canvas.getContext('2d')) throw new Error('Canvas 2D unavailable');
  return canvas;
}
/** Two shared raster presentations per visible ready chunk; no demand or generation jobs. */
export class TerrainRasterCache {
  #entries = new Map<string, Entry>();
  #builds = 0;
  #disposed = false;
  constructor(
    private stream: ChunkStream,
    private generator: TerrainGenerator,
  ) {}
  get stats() {
    return {
      regions: this.#entries.size,
      builds: this.#builds,
      pixelBytes: this.#entries.size * 2 * (chunkSize * terrainPixels) ** 2 * 4,
    };
  }
  prune(): undefined {
    for (const [key, entry] of this.#entries)
      if (
        this.stream.read({ x: entry.x * chunkSize, y: entry.y * chunkSize })
          .state !== 'ready'
      ) {
        entry.biome.width = entry.height.width = 0;
        this.#entries.delete(key);
      }
  }
  #get(x: number, y: number) {
    const key = `${x},${y}`,
      revision = this.stream.edits.stats.revision;
    let entry = this.#entries.get(key);
    if (entry?.revision === revision) return entry;
    const values: number[] = [];
    for (let cy = 0; cy < chunkSize; cy++)
      for (let cx = 0; cx < chunkSize; cx++) {
        const tile = this.stream.read({
          x: x * chunkSize + cx,
          y: y * chunkSize + cy,
        });
        if (tile.state !== 'ready')
          throw new Error('Artwork requires a ready chunk');
        values.push(tile.value);
      }
    const signature = values.join('');
    if (!entry) {
      if (this.#entries.size >= this.stream.capacity) {
        const oldest = this.#entries.entries().next().value;
        if (oldest) {
          oldest[1].biome.width = oldest[1].height.width = 0;
          this.#entries.delete(oldest[0]);
        }
      }
      entry = {
        x,
        y,
        biome: surface(),
        height: surface(),
        revision: -1,
        signature: '',
      };
      const data = this.generator.chunk(x, y, chunkSize),
        ctx = entry.height.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      for (let index = 0; index < values.length; index++) {
        const shade = Math.round((data.heights[index] ?? 0) * 255);
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
        ctx.fillRect(
          (index % chunkSize) * terrainPixels,
          Math.floor(index / chunkSize) * terrainPixels,
          terrainPixels,
          terrainPixels,
        );
      }
      this.#entries.set(key, entry);
    }
    if (entry.signature !== signature) {
      const ctx = entry.biome.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D unavailable');
      for (const [index, value] of values.entries()) {
        ctx.fillStyle = colors[value] ?? colors[0];
        ctx.fillRect(
          (index % chunkSize) * terrainPixels,
          Math.floor(index / chunkSize) * terrainPixels,
          terrainPixels,
          terrainPixels,
        );
      }
      entry.signature = signature;
      this.#builds++;
    }
    entry.revision = revision;
    return entry;
  }
  draw(
    ctx: CanvasRenderingContext2D,
    bounds: TileBounds,
    mode: 'biome' | 'height',
  ): undefined {
    if (this.#disposed) throw new Error('Terrain artwork is disposed');
    const size = chunkSize * terrainPixels;
    ctx.imageSmoothingEnabled = false;
    for (
      let y = Math.floor(bounds.minY / chunkSize);
      y <= Math.floor((bounds.maxY - 1) / chunkSize);
      y++
    )
      for (
        let x = Math.floor(bounds.minX / chunkSize);
        x <= Math.floor((bounds.maxX - 1) / chunkSize);
        x++
      ) {
        const tile = this.stream.read({ x: x * chunkSize, y: y * chunkSize });
        if (tile.state === 'ready')
          ctx.drawImage(this.#get(x, y)[mode], x * size, y * size);
        else {
          ctx.fillStyle = tile.state === 'failed' ? '#6c2f45' : '#192534';
          ctx.fillRect(x * size, y * size, size, size);
        }
      }
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const entry of this.#entries.values())
      entry.biome.width = entry.height.width = 0;
    this.#entries.clear();
  }
}
