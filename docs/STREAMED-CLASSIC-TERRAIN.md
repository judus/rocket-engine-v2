# Streamed classic terrain

`terrain-streaming.html` now has biome, elevation and classic tile presentations of the same streamed world. Their world-space centers and pan deltas agree. Biome/elevation use five pixels per tile; the classic view uses native 16 × 16 artwork and therefore shows a smaller area. Pointer picking uses each view's scale. All three own demand handles in one 240-chunk stream with four asynchronous job slots.

## Mapping and persistence

Unedited classic tiles derive 0–11 tiers from generated heights through the existing tile-friendly pass. A stored biome override selects a representative tier:

| Biome     | Classic tier |
| --------- | ------------ |
| Water     | 2            |
| Shore     | 3            |
| Grassland | 5            |
| Forest    | 6            |
| Rock      | 10           |
| Snow      | 11           |

This is presentation mapping, not a new persistent height-edit format. Existing version/seed/scale save keys and six-value snapshots are preserved. Selecting the generated biome removes an override and restores the generated classic tier. Elevation always displays the original generated height field. Natural atlas terrain follows height tiers; it is not a one-to-one recoloring of generated biome classifications.

Painted representative tiers override the shaped base directly and can create sharp boundaries. They do not run through the natural-terrain smoothing pass. Arbitrary painted combinations remain limited by the original transition artwork.

## Readiness and invalidation

The classic owner expands its visible demand for sprite overhang (three tiles horizontally and seven below), with the stream's one-chunk margin supplying border dependencies. A classic artwork region waits for its center and all eight neighboring chunks to be ready. Failure, pending or missing neighbors cannot be treated as ordinary empty terrain. Blue-gray placeholders also cover regions waiting for their artwork build budget.

Each eight-tile region reads a one-cell halo for image resolution and decoration eligibility. Natural smoothing still samples its deterministic analytic height field with its own finite halo; saved overrides are applied afterward and require ready stream data. Saved edits already gate source publication through the existing persistence lifecycle.

Artwork and decoration records are prepared during update, at most two newly built regions per update. Render reads those records and canvases. Stable frames do not regenerate placements or images. On a changed edit revision, local halo signatures identify affected regions; both image pixels and object records are removed before replacement. An edit on a region boundary invalidates both sides, including diagonal neighbors where applicable. Unrelated caches keep their artwork. Losing ready dependencies or leaving demand releases canvas pixels and records, so late async results cannot resurrect a discarded presentation.

Ground details are baked into the regional raster. Larger objects remain immutable records, culled by sprite bounds and sorted by feet. No walker or collision system is added to the streamed view. Its diagnostics report region/object counts, builds and last/peak region generation time separately from frame FPS. Region generation remains synchronous, and a two-region budget is a count limit, not a millisecond deadline.

## Ownership and validation

The classic view owns its artwork, decoration records, shaping cache, two image leases, input binding and demand handle. Closing it reduces the owner count and clears classic caches, while biome/elevation continue. Recreating the stream disposes prior owners, jobs, artwork and records while keeping host-owned persistent edits. The standalone classic demo remains available.

Tests cover explicit biome mappings, loaded-halo gating, build budgets, stable-frame reuse, edit invalidation on both sides of a chunk boundary, unchanged unrelated images, eviction and final pixel/record cleanup. Existing async-stream and persistence suites cover bounded jobs, out-of-order publication, cancellation, saved overlays and failure/retry contracts. Browser checks verify native-scale picking, restoration of the test edit, three live views, closing classic and stream recreation.
