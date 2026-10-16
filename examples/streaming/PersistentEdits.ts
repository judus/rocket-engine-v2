import { MemoryEdits, terrainAt } from './ChunkStream.js';
import type { TileEdit, TileValue } from './ChunkStream.js';
import type { Cell } from '../TileBoard.js';

export interface EditStorage {
  read(): Promise<readonly TileEdit[]>;
  write(snapshot: readonly TileEdit[]): Promise<void>;
  dispose(): undefined;
}
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Host-owned memory authority with serialized, revision-aware durable snapshots. */
export class PersistentEdits extends MemoryEdits {
  #phase: 'loading' | 'load-error' | 'ready' | 'disposed' = 'loading';
  #loadError: string | null = null;
  #saveError: string | null = null;
  #savedRevision = 0;
  #load: Promise<void> | null = null;
  #save: Promise<void> | null = null;
  constructor(
    private storage: EditStorage,
    base: (cell: Cell) => TileValue = terrainAt,
    valueCount = 3,
  ) {
    super(base, valueCount);
  }
  override get ready(): boolean {
    return this.#phase === 'ready';
  }
  override get stats() {
    return Object.freeze({
      ...super.stats,
      phase: this.#phase,
      saving: this.#save !== null,
      unsaved: super.stats.revision - this.#savedRevision,
      loadError: this.#loadError,
      saveError: this.#saveError,
    });
  }
  /** Errors are recorded in stats; retry does not overwrite memory after a successful load. */
  load(): Promise<void> {
    if (this.#phase === 'disposed')
      return Promise.reject(new Error('Edit store is disposed'));
    if (this.ready) return Promise.resolve();
    if (this.#load) return this.#load;
    this.#phase = 'loading';
    this.#loadError = null;
    this.#load = (async () => {
      try {
        const snapshot = await this.storage.read();
        if (this.#phase === 'disposed') return;
        this.replace(snapshot);
        this.#phase = 'ready';
        this.#savedRevision = 0;
      } catch (error) {
        if (this.#phase === 'disposed') return;
        this.#loadError = message(error);
        this.#phase = 'load-error';
      }
    })().finally(() => {
      this.#load = null;
    });
    return this.#load;
  }
  override set(cell: Cell, value: TileValue): undefined {
    if (!this.ready) throw new Error('Saved edits must load before editing');
    const revision = super.stats.revision;
    super.set(cell, value);
    if (super.stats.revision !== revision && !this.#saveError)
      void this.flush();
  }
  flush(): Promise<void> {
    if (!this.ready)
      return Promise.reject(new Error('Edit store is not ready'));
    if (this.#save) return this.#save;
    if (this.#saveError || super.stats.revision === this.#savedRevision)
      return Promise.resolve();
    this.#save = (async () => {
      try {
        while (this.ready && super.stats.revision !== this.#savedRevision) {
          const revision = super.stats.revision;
          await this.storage.write(this.snapshot());
          if (this.ready) this.#savedRevision = revision;
        }
      } catch (error) {
        if (this.ready) this.#saveError = message(error);
      }
    })().finally(() => {
      this.#save = null;
      if (
        this.ready &&
        !this.#saveError &&
        super.stats.revision !== this.#savedRevision
      )
        void this.flush();
    });
    return this.#save;
  }
  retry(): Promise<void> {
    if (!this.ready) return this.load();
    this.#saveError = null;
    return this.flush();
  }
  /** Abort/close storage without falsely acknowledging outstanding edits. Not an async flush. */
  dispose(): undefined {
    if (this.#phase === 'disposed') return;
    this.#phase = 'disposed';
    this.storage.dispose();
  }
}
