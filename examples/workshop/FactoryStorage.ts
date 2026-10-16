import type { FactoryCheckpoint } from './FactoryCheckpoint.js';
/** One atomic factory checkpoint slot; separate from terrain edit databases. */
export class FactoryStorage<T = FactoryCheckpoint> {
  #db: IDBDatabase | null = null;
  #opening: Promise<IDBDatabase> | null = null;
  #transactions = new Set<IDBTransaction>();
  #disposed = false;
  #failWrite = false;
  constructor(
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
    private readonly key = 'normal-w2-v4',
  ) {}
  failNextWrite() {
    this.#failWrite = true;
  }
  async #open(): Promise<IDBDatabase> {
    if (this.#disposed) throw new Error('Factory storage disposed');
    if (this.#db) return this.#db;
    if (this.#opening) return this.#opening;
    this.#opening = new Promise((resolve, reject) => {
      if (!this.factory) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const request = this.factory.open('rocket-v2-factory', 1);
      let abandoned = false;
      request.onupgradeneeded = () => {
        request.result.createObjectStore('checkpoints');
      };
      request.onblocked = () => {
        abandoned = true;
        reject(
          new Error(
            'Factory storage blocked by another tab; close it and retry',
          ),
        );
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Factory storage open failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (this.#disposed || abandoned) {
          db.close();
          reject(new Error('Factory storage opening cancelled'));
          return;
        }
        if (!db.objectStoreNames.contains('checkpoints')) {
          db.close();
          reject(new Error('Missing checkpoint store'));
          return;
        }
        db.onversionchange = () => {
          db.close();
          if (this.#db === db) this.#db = null;
        };
        this.#db = db;
        resolve(db);
      };
    });
    try {
      return await this.#opening;
    } finally {
      this.#opening = null;
    }
  }
  async #transaction(snapshot?: T): Promise<unknown> {
    const db = await this.#open();
    if (this.#disposed) throw new Error('Factory storage disposed');
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        'checkpoints',
        snapshot ? 'readwrite' : 'readonly',
      );
      this.#transactions.add(tx);
      let result: unknown;
      tx.oncomplete = () => {
        this.#transactions.delete(tx);
        resolve(result);
      };
      tx.onabort = () => {
        this.#transactions.delete(tx);
        reject(tx.error ?? new Error('Checkpoint transaction aborted'));
      };
      try {
        const store = tx.objectStore('checkpoints');
        const request = snapshot
          ? store.put(snapshot, this.key)
          : store.get(this.key);
        request.onsuccess = () => {
          result = request.result as unknown;
        };
        if (snapshot && this.#failWrite) {
          this.#failWrite = false;
          tx.abort();
        }
      } catch (error) {
        tx.abort();
        reject(error);
      }
    });
  }
  read(): Promise<unknown> {
    return this.#transaction();
  }
  async write(snapshot: T): Promise<void> {
    await this.#transaction(structuredClone(snapshot));
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const tx of this.#transactions) {
      try {
        tx.abort();
      } catch (error) {
        if (!(
          error instanceof DOMException && error.name === 'InvalidStateError'
        ))
          throw error;
      }
    }
    this.#transactions.clear();
    this.#db?.close();
    this.#db = null;
  }
}
