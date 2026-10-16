export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Mock at the DOM boundary; production uses native fetch and ImageBitmap. */
export function imageBrowser(
  options: {
    fetch?: typeof fetch;
    decode?: () => Promise<ImageBitmap>;
    document?: boolean;
  } = {},
) {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  let loads = 0,
    decodes = 0,
    closes = 0;
  const closed = deferred<void>();
  const image = {
    width: 120,
    height: 56,
    close() {
      closes++;
      closed.resolve();
    },
  } as ImageBitmap;
  const replacements: Record<string, unknown> = {
    fetch: ((...args: Parameters<typeof fetch>) => {
      loads++;
      return options.fetch
        ? options.fetch(...args)
        : Promise.resolve(new Response(new Blob(['image'])));
    }) satisfies typeof fetch,
    createImageBitmap: () => {
      decodes++;
      return options.decode ? options.decode() : Promise.resolve(image);
    },
  };
  if (options.document !== false)
    replacements.document = { baseURI: 'https://example.test/demo/' };
  for (const [key, value] of Object.entries(replacements)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  return {
    image,
    closed: closed.promise,
    get loads() {
      return loads;
    },
    get decodes() {
      return decodes;
    },
    get closes() {
      return closes;
    },
    restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
