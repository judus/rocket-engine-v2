# Rendering, views, cameras and caches

Status: proposed initial Canvas 2D design; advanced LOD is experimental.

## Views

Scene content is shared; canvas dimensions, camera, layer selection, projection results and view caches are per-view. Render callbacks cannot advance animations or simulation. Two canvases add draw work, not scene update work.

Camera world-to-screen and inverse conversion are the single source for rendering and picking. Controllers provide pan/follow/dead zones; zoom/shake are explicit effects. Camera creation has no automatic input subscriptions. Shake requires overscan or an equivalent visibility margin.

## Layers

A layer defines draw order, world/screen space and cache policy. Ordinary layers can draw directly to the final canvas. Only caching/effects that require a surface allocate one.

| Policy       | Retained resource               | Example                   |
| ------------ | ------------------------------- | ------------------------- |
| Live         | None                            | Moving objects, particles |
| View cache   | Image for a particular view     | Static HUD or diagram     |
| World chunks | Images of bounded world regions | Terrain/background        |

View caches include relevant dimensions, pixel ratio, camera projection for world-space images, content revisions and style. World caches may be shared by views only when style/resolution dependencies match.

## Invalidation

Engine-managed changes report content revisions and old/new visual bounds. Arbitrary captured drawing state requires explicit invalidate() or explicit revision dependencies. A moving camera does not imply changed world artwork; a stationary camera does not imply unchanged content.

Tile edits invalidate dependent chunks, including neighboring borders/decorations. Bounds expansion covers shadows/strokes and other effects. Asset readiness or replacement invalidates dependent content. Resize/pixel-ratio changes invalidate view-sized surfaces.

Camera pan reuses world images but changes final composition. Zoom may reuse images or request another resolution. Screen-space HUD pixels are independent of camera pan/zoom. Completely unchanged views can skip composition even if other scenes/views are active.

Initial policy: fully compose a dirty final canvas from valid cached images and live content. Dirty rectangles on the final transparent canvas are deferred until profiling justifies their overlap/effect complexity.

## Budgets and async jobs

Account for actual surface dimensions/bytes. Caches have budgets and eviction; eviction never deletes authoritative world data. Async jobs carry content/style revisions and owner generation; stale results are discarded. Layer/view disposal cancels work and releases surfaces.

## LOD experiment

A quadtree can organize successively finer representations of world regions. It can also be used as a spatial index, but those are different contracts. Select detail by projected error/scale, stream required representations and retain coarse coverage until replacement is ready. Prevent cracks and popping through a defined transition/edge policy.

The 2D terrain overview is a practical first LOD example. Planetary meshes and alternative render backends are later experiments. Visual LOD does not redefine authoritative terrain or physics geometry.
