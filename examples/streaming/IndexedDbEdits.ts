import { addressOf } from './ChunkStream.js';
import type { TileEdit } from './ChunkStream.js';
import type { EditStorage } from './PersistentEdits.js';

export const generatorVersion = 'signed-hash-v1';
interface WorldSnapshot {
  generator: string;
  edits: readonly TileEdit[];
}
/** Validate the complete record before publishing any restored edits. */
export function decodeSnapshot(
  value: unknown,
  identity = generatorVersion,
  valueCount = 3,
): readonly TileEdit[] {
  if (value === undefined) return [];
  if (
    !value ||
    typeof value !== 'object' ||
    !('generator' in value) ||
    value.generator !== identity
  )
    throw new Error('Saved terrain generator version is incompatible');
  if (!('edits' in value) || !Array.isArray(value.edits))
    throw new Error('Invalid saved terrain edits');
  const result: TileEdit[] = [],
    seen = new Set<string>();
  for (const row of value.edits as unknown[]) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('x' in row) ||
      !('y' in row) ||
      !('value' in row) ||
      typeof row.x !== 'number' ||
      typeof row.y !== 'number' ||
      typeof row.value !== 'number' ||
      !Number.isInteger(row.value) ||
      row.value < 0 ||
      row.value >= valueCount ||
      row.value > 5
    )
      throw new Error('Invalid saved tile');
    const cell: TileEdit = {
      x: row.x,
      y: row.y,
      value: row.value as TileEdit['value'],
    };
    addressOf(cell);
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) throw new Error('Duplicate saved tile');
    seen.add(key);
    result.push(cell);
  }
  return result;
}

/** One origin-local demo world. Resolve writes on transaction commit, not request success. */
export class IndexedDbEdits implements EditStorage {
  #db: IDBDatabase | null = null;
  #opening: Promise<IDBDatabase> | null = null;
  #transactions = new Set<IDBTransaction>();
  #disposed = false;
  #failSave = false;
  constructor(
    private factory: IDBFactory | undefined = globalThis.indexedDB,
    private world = {
      key: 'terrain',
      identity: generatorVersion,
      valueCount: 3,
    },
  ) {
    if (
      !world.key ||
      !world.identity ||
      !Number.isInteger(world.valueCount) ||
      world.valueCount < 1 ||
      world.valueCount > 6
    )
      throw new RangeError('Invalid saved world identity/palette');
    this.world = Object.freeze({ ...world });
  }
  failNextSave(): undefined {
    this.#failSave = true;
  }
  async #open(): Promise<IDBDatabase> {
    if (this.#disposed) throw new Error('IndexedDB storage is disposed');
    if (this.#db) return this.#db;
    if (this.#opening) return this.#opening;
    this.#opening = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.factory) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }
      const request = this.factory.open('rocket-v2-terrain', 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('world'))
          request.result.createObjectStore('world');
      };
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error(
            'IndexedDB open blocked by another tab; close it and retry',
          ),
        );
      };
      request.onerror = () =>
        reject(request.error ?? new Error('IndexedDB open failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (this.#disposed || abandoned) {
          db.close();
          reject(new Error('IndexedDB opening cancelled'));
          return;
        }
        if (!db.objectStoreNames.contains('world')) {
          db.close();
          reject(new Error('IndexedDB world store is missing'));
          return;
        }
        this.#db = db;
        db.onversionchange = () => {
          db.close();
          if (this.#db === db) this.#db = null;
        };
        resolve(db);
      };
    });
    try {
      return await this.#opening;
    } finally {
      this.#opening = null;
    }
  }
  async #transaction(
    mode: IDBTransactionMode,
    snapshot?: WorldSnapshot,
  ): Promise<unknown> {
    const db = await this.#open();
    if (this.#disposed) throw new Error('IndexedDB storage is disposed');
    return new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('world', mode);
      this.#transactions.add(tx);
      let result: unknown;
      tx.oncomplete = () => {
        this.#transactions.delete(tx);
        resolve(result);
      };
      tx.onabort = () => {
        this.#transactions.delete(tx);
        reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      };
      const store = tx.objectStore('world');
      const request =
        mode === 'readonly'
          ? store.get(this.world.key)
          : store.put(snapshot, this.world.key);
      request.onsuccess = () => {
        result = request.result as unknown;
      };
      if (mode === 'readwrite' && this.#failSave) {
        this.#failSave = false;
        tx.abort();
      }
    });
  }
  async read(): Promise<readonly TileEdit[]> {
    return decodeSnapshot(
      await this.#transaction('readonly'),
      this.world.identity,
      this.world.valueCount,
    );
  }
  async write(edits: readonly TileEdit[]): Promise<void> {
    await this.#transaction('readwrite', {
      generator: this.world.identity,
      edits: decodeSnapshot(
        { generator: this.world.identity, edits },
        this.world.identity,
        this.world.valueCount,
      ),
    });
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const tx of this.#transactions) {
      try {
        tx.abort();
      } catch (error) {
        // A transaction may have committed before its completion event arrives.
        if (!(
          error instanceof DOMException && error.name === 'InvalidStateError'
        ))
          errors.push(error);
      }
    }
    this.#transactions.clear();
    this.#db?.close();
    this.#db = null;
    if (errors.length)
      throw new AggregateError(errors, 'IndexedDB cleanup failed');
  }
}
