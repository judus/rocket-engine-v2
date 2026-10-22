# Streamed procedural terrain adapter

`/demos/terrain-streaming.html` is a new page. The standalone generator and original tile/streaming/physics demos remain available. Production Workshop stays outside this step. All code remains example-owned; no new Rocket core API was required.

## Reused contracts

The adapter uses the existing signed 8 × 8 ChunkStream, async source scheduling, cancellation/result identity, persistent edit lifecycle and demand handles. DelayedChunks now accepts a base-generation function; its default hash generator is unchanged. Here it requests TerrainGenerator.chunk(x, y, 8).biomes. The source still runs on the main thread.

MemoryEdits now accepts an immutable base callback and palette size, supporting up to six tile values. Defaults remain the old three-state hash terrain. PersistentEdits passes the same configuration through restoration; resetting an override to its actual procedural base prunes it correctly. Job results are validated against that configured palette before publication. Current memory overrides are applied before a chunk becomes ready.

The biome and elevation canvases are linked presentations of the same area. Both own demand handles, deduplicating their identical regions. WASD/arrows pan both cameras; pointer picking uses its originating camera. Closing elevation removes its canvas, binding and demand handle, while the shared input scope/biome view remain alive.

## Atomic camera movement

Linked camera travel revealed a real issue with sequential handle updates: the first new area could briefly combine with the other camera's old area and exceed capacity. ChunkStream.setDemands([{handle, bounds}, ...]) now validates all handles/bounds and the complete replacement union before changing demand or cancelling jobs. Foreign, duplicate or disposed handles fail atomically. Area swaps avoid temporary eviction, and large linked-camera jumps stay within their final union bound.

## Data and artwork bounds

The adapter has a shared 240-record cap, including ready/pending/failed records, and four occupied job slots total. At most two new jobs start per update. At five pixels per sample, each 640 × 360 view demands up to 17 × 10 visible chunks plus a one-chunk margin: at most 228 retained chunks. Both linked views share that same union rather than doubling it.

TerrainRasterCache builds paired 40 × 40 biome/elevation surfaces only for visible ready chunks. Both canvases reuse those surfaces. Height is deterministic base data and is recomputed once when its raster is first built; it is not saved or recomputed every frame. Memory-edit revisions prompt signature checks; only changed biome rasters repaint. Unchanged height imagery is reused.

Pruning releases cached surfaces when their chunk becomes missing/pending/failed. Raster entries are also capped by stream capacity. The pixel count is bounded at 240 × 2 × 40 × 40 × 4 = 3,072,000 bytes of estimated RGBA storage, excluding browser/JavaScript overhead. Loaded dense tile arrays are at most 240 × 64 bytes. Sparse edits and separate saved worlds still grow with use. This is bounded working data/artwork, not a bound on all saved edits.

The scene owns stream and raster cache; views own demand/bindings; the host owns edits/storage. Recreation releases old owners/chunks/jobs/artwork and input while keeping the store. Shared paired artwork lives until chunk eviction or scene cleanup, even if elevation alone closes.

## Persistence identity

IndexedDbEdits now accepts a key, generator identity and palette size. The old defaults remain database rocket-v2-terrain, object store world, key terrain, identity signed-hash-v1, three values. Procedural records use key `procedural:<full generator identity>` and six values. The full identity includes algorithm version, seed and scale. Load and write validation reject incompatible/malformed values before publication or commit.

Seed/scale are encoded in the procedural page URL, so reload restores the same configuration. Open world validates configuration before navigation and waits for no saving/uncommitted edits. Different identities have separate records; returning to a seed/scale restores its own overrides. No existing record is migrated, reset or overwritten by changing worlds.

Clicking cycles biome overrides only. Elevation remains the generated height field; this step does not persist height sculpting or infer collision/walkability from edited colors. IndexedDB loading gates all chunk jobs, and save errors preserve memory edits for Retry. Wait for zero uncommitted changes before reload; background saves cannot guarantee completion during page close. Single-writer/full-snapshot limits remain those of the existing persistence prototype.

## Validation

All 112 emitted-JavaScript tests, strict TypeScript, type-aware lint and format checks pass. Five new checks cover six-biome async publication with current overrides; isolation among legacy, seed, scale and incompatible-version records; eviction/reload recovery and removing overrides restored to base; shared raster reuse, regional biome invalidation, unchanged elevation and pixel cleanup; and atomic coordinated demand, swap reuse and invalid-batch rejection. Existing three-value consumers and their earlier lifecycle tests remain green.

Browser checks save a rock override at (-2,-2), reload it, leave far enough to evict the original 198 chunks, and return to recover the override within the cap. Seed 43 starts with no overrides; returning to seed 42 recovers its saved edit. Closing elevation preserves the biome view's demand; recreation reports zero old owners/chunks/jobs/artwork. These focused checks do not establish worker throughput or large-dataset persistence scalability.

The classic tile/decoration view is now integrated as a third demand owner. See [streamed classic contracts](STREAMED-CLASSIC-TERRAIN.md) for scale conversion, edit mapping, ready halos, invalidation and per-view cleanup.
