# Bounded terrain artwork cache

Implemented as a concrete example facility in `examples/TileRegionCache.ts`, not a generalized engine layer API. Both editor views share a single scene-owned cache. The third canvas reads tile counts directly and retains independent artwork.

## Data, invalidation and ownership

The live board has 128 × 80 cells, signed coordinates and 32-unit tiles. Tile data remains in the host model. Each cell records its latest edit revision. `revisionIn()` returns the latest revision in an integer cell rectangle. The model maintains terrain counts on edits; the counter does not scan all cells during rendering.

Cache regions are aligned to world zero and span 8 × 8 cells. Signed region lookup uses floor division and string Map keys. Every retained entry stores a local revision plus the global board revision when it was last checked. Unchanged frames skip revision scans and painting. After an edit, accessed regions check their local revision; only regions with changed data repaint. Multiple edits in one region before drawing coalesce into one rebuild. Unseen edits allocate no cache entry; a newly requested region paints the current data.

The selection outline and world axes are drawn live over cached terrain. Selection and camera movement do not invalidate terrain. Painting a cache changes presentation resources, never simulation state.

The editor Scene2D owns the cache with `scene.own(cache)`. Its subtree cleans up first, then owned resources release cached canvases by setting their dimensions to zero and clearing entries. Closing one view releases that view's bindings and canvas, retaining the shared cache. Eviction discards only artwork; model edits survive. Reset disposes the old app/cache before constructing a new board.

## Visibility, sharing and budget

Drawing inverts the current Canvas transform, including node ancestors, camera zoom and DPR, to map canvas corners into local terrain coordinates. The resulting bounds are clipped to the finite board. Only intersecting regions are drawn; upper viewport boundaries are exclusive. Rotation uses a conservative bounding rectangle, so some offscreen regions can be included. Singular transforms draw nothing.

A Map provides least-recently-used retention. The demo allows 24 regions. Each is 256 × 256 pixels at one raster pixel per world unit. Thus estimated RGBA storage is at most 6 MiB (24 × 256 × 256 × 4); eviction releases an entry before allocating its replacement. Display DPR/zoom changes reuse artwork rather than allocating higher-resolution copies. This is appropriate for the demo's tile rectangles, not a general policy for crisp text or detailed zoomable artwork.

The estimate excludes browser backing-store overhead, GPU copies, visible canvases and model storage. Counters report retained regions, region builds/rebuilds, evictions and current pixel estimates; overlays also show application FPS. Rebuilds include initial fills and revisits after eviction. A retained region shared by both cameras paints once. Visible canvases still clear and composite every frame.

If combined camera demand exceeds capacity, sequential view rendering may repeatedly evict and rebuild regions. Memory remains bounded, but this slice has no demand pinning or scheduling policy to avoid that thrashing. The current two overlapping editors fit comfortably; do not interpret this as a large-world performance guarantee.

## Verification and next boundaries

All 61 emitted-JavaScript tests and strict TypeScript/lint/format checks pass. Cache tests cover sharing, unchanged frames and DPR reuse, signed/origin boundaries, regional invalidation, unseen edits, viewport culling, rotation/singular transforms, LRU eviction, pixel release, revisits, final disposal and scene cleanup after behavior errors.

Browser verification checks stationary rebuild counts, edits through both cameras rebuilding once, panning into new regions and bounded eviction, and reset restoring fresh counters and ownership. This demonstrates avoided tile painting; it is not a benchmark against uncached rendering, a cross-browser certification or a GPU memory measurement.

No streaming, persistence, object spatial index, workers or core rendering backend abstraction is added. Before promoting this example into the engine, try a second cached-artwork consumer and settle resolution, mutation and demand-overload contracts.
