export interface AssetLease<T> {
  readonly value: T;
  dispose(): undefined;
}
/** Shared acquisition, cancellation, failure eviction and last-owner release. */
interface Entry<T> {
  readonly controller: AbortController;
  readonly promise: Promise<T>;
  value?: T;
  owners: number;
  closed: boolean;
}

/** App-local image sharing. Stop/start retains assets; disposal is final. */
export class AssetPool<T> {
  constructor(
    readonly load: (key: string, signal: AbortSignal) => Promise<T>,
    readonly releaseValue: (value: T) => void = () => {},
  ) {}
  #images = new Map<string, Entry<T>>();
  #disposed = false;

  acquire(
    key: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<AssetLease<T>> {
    if (this.#disposed) return Promise.reject(new Error('Assets is disposed'));
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(signal.reason);
    let entry = this.#images.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: Entry<T> = {
        controller,
        owners: 0,
        closed: false,
        promise: this.load(key, controller.signal)
          .then((image) => {
            if (created.closed) {
              this.releaseValue(image);
              throw controller.signal.reason;
            }
            created.value = image;
            return image;
          })
          .catch((error: unknown) => {
            this.#close(key, created, error);
            throw error;
          }),
      };
      entry = created;
      this.#images.set(key, entry);
    }
    const shared = entry;
    shared.owners++;
    return new Promise<AssetLease<T>>((resolve, reject) => {
      let settled = false;
      const clear = () => {
        signal?.removeEventListener('abort', cancel);
        shared.controller.signal.removeEventListener('abort', cancelShared);
      };
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        clear();
        this.#release(key, shared);
        reject(reason);
      };
      const cancel = () => fail(signal?.reason);
      const cancelShared = () => fail(shared.controller.signal.reason);
      signal?.addEventListener('abort', cancel, { once: true });
      shared.controller.signal.addEventListener('abort', cancelShared, {
        once: true,
      });
      void shared.promise.then((image) => {
        if (settled) return;
        settled = true;
        clear();
        let released = false;
        resolve({
          get value() {
            if (released || shared.closed)
              throw new Error('Image lease is released');
            return image;
          },
          dispose: (): undefined => {
            if (released) return;
            released = true;
            this.#release(key, shared);
          },
        });
      }, fail);
    });
  }

  #release(key: string, entry: Entry<T>) {
    entry.owners--;
    if (entry.owners === 0) this.#close(key, entry);
  }
  #close(
    key: string,
    entry: Entry<T>,
    reason: unknown = new Error('Image load cancelled'),
  ) {
    if (entry.closed) return;
    entry.closed = true;
    if (this.#images.get(key) === entry) this.#images.delete(key);
    if (entry.value !== undefined) this.releaseValue(entry.value);
    entry.controller.abort(reason);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const [key, entry] of this.#images)
      this.#close(key, entry, new Error('Assets is disposed'));
  }
}
