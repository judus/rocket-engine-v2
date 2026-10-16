# Consolidated engine facilities

Implemented on main during the 2026-10-16 consolidation. These facilities compose
existing Rocket scenes/presentations and introduce no new scheduler or game model.
The CPU and lower-level WebGL renderers remain independently usable.

## WebGL surface lifetime

Import `WebGLSurface` from `rocket-engine-v2/webgl`.

```ts
const surface = new WebGLSurface({
  target,
  scene,
  label: 'Model viewer',
  onError,
});
const gpu = surface.manage((gl) => {
  const renderer = new WebGLMeshRenderer3D(gl, { lighting: true });
  return {
    value: renderer,
    dispose() {
      renderer.dispose();
    },
  };
});
app.presentation({
  scene,
  render() {
    if (!gpu.current) return;
    surface.resize(1); // native DPR, 16:9; optional scale and aspect
    gpu.current.render(
      root,
      camera,
      surface.canvas.width,
      surface.canvas.height,
    );
  },
  dispose() {
    surface.dispose();
  },
});
```

The surface owns its canvas/context/listeners and synchronous owned resources.
`manage(factory)` creates a context-generation lease: `current` is null while lost
or after retirement; restoration rebuilds from the factory. Keep CPU model/state
outside the factory. Factory failures must release their own partial allocations;
`onError` reports restoration failures. Lifetime disposal removes listeners first,
retires all resources once, removes the canvas and releases the context. No canvas
fallback or second loop is silently introduced.

`resize(scale = 1, aspect = 16/9)` follows container width and current DPR, bounded
by current GPU viewport/texture/renderbuffer limits. `width`/`height` are logical
CSS dimensions; canvas dimensions are raster pixels; `limited` reports GPU clamping.
`clientToWorld` supplies logical viewport coordinates, not 3D ray picking.

## Shared input targets

`InputScope.bind(target)` now accepts the structural `InputTarget`: canvas, scene,
disposed state, clientToWorld conversion and own(resource). Existing Canvas View
and WebGLSurface satisfy it. Returned ViewInput retains the concrete target type.
The same engine input service owns focus, frame/fixed edges, pointer capture,
blur/pause/visibility clearing and teardown. It does not invent 3D picking.

The cockpit and asteroid demos now use example-owned navigation policy over these
scopes. Keys and pointer deltas come from input snapshots in scene updates, rather
than a separate example keyboard listener registry.

## Shared CPU assets

`AssetPool<T>` exports from the root. Construct with a `(key, signal) => Promise<T>`
loader and optional last-owner release callback. `acquire(key, {signal})` returns
an AssetLease with `value` and idempotent dispose. Concurrent acquisitions share one
load; cancelling one does not cancel other owners. Failed entries evict for retry;
last release or pool disposal aborts outstanding acquisition. Released leases reject
reads. Retained successful values remain private to the pool until the final release.

Existing `Assets.acquireImage` uses this pool and retains its image lease API.
Optional `WebGLAssets` provides `acquireModel(url, options)` and
`acquireTexture(url, {signal, colorSpace})`. URLs resolve against document.baseURI;
linear and sRGB textures have separate identities. Leases retain immutable CPU
models/pixels; renderer caches still own each context’s GPU uploads. The cockpit
host owns a model lease and releases it during teardown.

## Optional bloom composition

`WebGLBloomPipeline(gl)` owns an offscreen target plus bloom pass. Its
`render(width, height, draw, bloomOptions)` resizes retained targets, invokes
`draw(target)` once, runs bloom and returns the draw result. `target` and `bloom`
remain accessible for existing diagnostics. Dispose/recreate with the context.
Scene lights, shadows and diagnostic selection remain caller policy. Partial
constructor failure retires its allocated target. Existing direct target/pass APIs
remain available; basic WebGL scenes need none of this machinery.

## Real consumers and limits

The cockpit milestones’ shared host and standalone asteroid scene use the surface
and scoped input. Existing image consumers use the extracted pool, and the cockpit
uses model leases/bloom composition. Demo instrumentation, cockpit controls/readouts,
procedural generation and layout stay outside core. This is an extraction of actual
repeated ownership; no ECS, DI graph, scene manager or generic render graph is added.

Packaging, formal acceptance and cross-browser compatibility projects were explicitly
excluded by Julien from this pass. Normal strict/static/unit and native-browser
checks still accompany the implementation. Earlier milestone sections remain useful
historical explanations, not a claim that all examples have identical presentation
plumbing or that the earliest backend supports later features.
