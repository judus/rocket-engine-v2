/** A scene can own a lease; reusable objects receive only its image. */
export interface ImageLease {
  readonly image: ImageBitmap;
  dispose(): undefined;
}
interface Entry {
  readonly controller: AbortController;
  readonly promise: Promise<ImageBitmap>;
  image?: ImageBitmap;
  owners: number;
  closed: boolean;
}

/** App-local image sharing. Stop/start retains assets; disposal is final. */
export class Assets {
  #images = new Map<string, Entry>();
  #disposed = false;

  acquireImage(
    url: string | URL,
    options: { signal?: AbortSignal } = {},
  ): Promise<ImageLease> {
    if (this.#disposed) return Promise.reject(new Error('Assets is disposed'));
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(signal.reason);
    const key = new URL(url, document.baseURI).href;
    let entry = this.#images.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created: Entry = {
        controller,
        owners: 0,
        closed: false,
        promise: loadImage(key, controller.signal)
          .then((image) => {
            if (created.closed) {
              image.close();
              throw controller.signal.reason;
            }
            created.image = image;
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
    return new Promise<ImageLease>((resolve, reject) => {
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
          get image() {
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

  #release(key: string, entry: Entry) {
    entry.owners--;
    if (entry.owners === 0) this.#close(key, entry);
  }
  #close(
    key: string,
    entry: Entry,
    reason: unknown = new Error('Image load cancelled'),
  ) {
    if (entry.closed) return;
    entry.closed = true;
    if (this.#images.get(key) === entry) this.#images.delete(key);
    entry.image?.close();
    entry.controller.abort(reason);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const [key, entry] of this.#images)
      this.#close(key, entry, new Error('Assets is disposed'));
  }
}

async function loadImage(
  url: string,
  signal: AbortSignal,
): Promise<ImageBitmap> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await createImageBitmap(await response.blob());
  } catch (cause) {
    throw new Error(`Could not load image ${url}`, { cause });
  }
}
