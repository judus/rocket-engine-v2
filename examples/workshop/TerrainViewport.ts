import { chunkSize, type TileBounds } from '../streaming/ChunkStream.js';
import { classicPixels } from '../terrain/StreamedClassicCache.js';

export const factoryCameraSpeed = 32 * classicPixels;
export const factoryChunkCapacity = 224;
export const factoryCanvasWidth = 1280;
export const factoryCanvasHeight = 720;

/** Exponential velocity easing, integrated analytically across frame lengths. */
export class CameraPan {
  #x = 0;
  #y = 0;
  reset() {
    this.#x = this.#y = 0;
  }
  step(dx: number, dy: number, dt: number) {
    const length = Math.hypot(dx, dy) || 1;
    const tx = (dx / length) * factoryCameraSpeed;
    const ty = (dy / length) * factoryCameraSpeed;
    const rate = 12;
    const decay = Math.exp(-rate * dt);
    const x = tx * dt + ((this.#x - tx) * (1 - decay)) / rate;
    const y = ty * dt + ((this.#y - ty) * (1 - decay)) / rate;
    this.#x = tx + (this.#x - tx) * decay;
    this.#y = ty + (this.#y - ty) * decay;
    return { x, y };
  }
}

/** Warm artwork one chunk ahead; the stream's margin loads its neighbor halo. */
export function factoryArtworkBounds(bounds: TileBounds, zoom = 1): TileBounds {
  const margin = zoom < 1 ? 0 : chunkSize;
  return {
    minX: bounds.minX - margin,
    minY: bounds.minY - margin,
    maxX: bounds.maxX + margin,
    maxY: bounds.maxY + margin,
  };
}
