# Images: the first asset slice

Implemented: an optional app service that fetches and decodes images into native `ImageBitmap` objects. No package dependencies, global cache, scene service locator or per-view copies.

```ts
const app = new Rocket();
const assets = app.use(Assets);
const scene = app.scene(
  new Scene2D({
    async prepare({ signal }) {
      const lease = await assets.acquireImage('./arm-base.png', { signal });
      // A cancellation can occur just before this continuation runs.
      if (signal.aborted) {
        lease.dispose();
        signal.throwIfAborted();
      }
      const image = this.own(lease).image;
      this.root.add(createArm({ x: 270, y: 250, image }).node);
    },
  }),
);
app.view({ target: '#world', scene });
app.view({ target: '#detail', scene });
await app.start();
```

`Scene2D.prepare` forwards the runtime's existing async preparation contract. Startup waits before updates or rendering, successful preparation runs once, failed preparation can be retried, and stop/dispose abort pending preparation. Make preparation transactional: release a lease on cancellation and before abandoning it; roll back any partial tree or resource changes before throwing. The runtime does not undo arbitrary user changes.

## Sharing and ownership

`acquireImage(url, { signal? })` returns a Promise of a distinct `ImageLease`. URLs resolve against `document.baseURI`; equivalent absolute URLs share one fetch/decode while there are owners. Each pending acquisition reserves ownership. The lease has a readonly `image` and idempotent synchronous `dispose()` and fits `scene.own()`.

A lease belongs to its consumer, rather than to a camera. Give the underlying image to an object factory. Objects draw it without knowing about asset storage. The scene keeps it valid through tree and custom cleanup; resource cleanup then releases it. Replacing an arm, pausing the app or disposing one view keeps the scene's lease alive. Scene lifetime continues even after its last view disappears, until scene/app disposal.

The final owner removes the cache entry and calls `ImageBitmap.close()`. A later acquisition loads again. `Assets.dispose()` is final: it cancels pending loads and closes all images, invalidating outstanding leases. App disposal cleans scenes before services. Reading a released lease's `image` throws; a previously extracted bitmap must not be drawn after its owner releases it. Do not call `close()` on a borrowed image yourself.

## Errors and cancellation

Network, HTTP and decoding errors reject with the URL and original `cause`, remove the failed cache entry and allow a fresh attempt. A missing image rejects startup visibly in the demo; “Restart example” restores the normal URL. “Test image error” exercises that path.

One caller's abort releases only that caller. Other consumers keep a shared request alive. With no remaining owners, loading is aborted. Decoding cannot be cancelled, so a bitmap produced after eviction or disposal is closed as soon as it arrives. Old completions cannot remove a newer entry for the same URL. A caller's signal covers acquisition only; after resolution, the owner releases the lease explicitly.

This slice has no loading progress, prefetch budget, LRU retention, atlases, fonts, audio or renderer-specific textures. It uses browser `fetch` and `createImageBitmap`; remote sources require normal CORS access. Invalid URLs fail during URL resolution. Rendering remains synchronous.

The original local PNG in `examples/assets/arm-base.png` is a small code-drawn gear and warning plate shared by both arms and both views. Focused tests cover sharing, failures/retry, cancellation, late completion and scene/app ownership through two views.
