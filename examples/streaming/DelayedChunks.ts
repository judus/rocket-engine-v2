import { generateChunk } from './ChunkStream.js';
import type { ChunkLoader } from './ChunkStream.js';

/** Demo source: cooperative timer cancellation, deterministic varying delays, fault injection. */
export class DelayedChunks {
  constructor(
    private generate: (
      chunk: Parameters<ChunkLoader>[0],
      signal: AbortSignal,
    ) => Uint8Array | Promise<Uint8Array> = generateChunk,
  ) {}
  delayMs = 250;
  varied = true;
  #sequence = 0;
  #failNext = false;
  get failureArmed() {
    return this.#failNext;
  }
  failNext(): undefined {
    this.#failNext = true;
  }
  readonly load: ChunkLoader = (chunk, signal) => {
    const id = ++this.#sequence,
      fail = this.#failNext;
    this.#failNext = false;
    const delay = this.delayMs * (this.varied ? (id % 3 === 1 ? 3 : 0.25) : 1);
    return new Promise<Uint8Array>((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Chunk load cancelled'));
        return;
      }
      const abort = () => {
        clearTimeout(timer);
        reject(new Error('Chunk load cancelled'));
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', abort);
        if (fail) {
          reject(new Error(`Simulated chunk load failure #${id}`));
          return;
        }
        try {
          resolve(this.generate(chunk, signal));
        } catch (error) {
          reject(error);
        }
      }, delay);
      signal.addEventListener('abort', abort, { once: true });
    });
  };
}
