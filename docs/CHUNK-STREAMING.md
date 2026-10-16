# Initial chunk streaming slice

The in-memory foundation described here is extended by [browser persistence](BROWSER-PERSISTENCE.md), [async loading](ASYNC-CHUNKS.md) and [multiple demand owners](MULTIPLE-DEMANDS.md) in the current demo.

`examples/streaming/ChunkStream.ts` is demo-owned world data, independent of Rocket, Canvas and input. No new core API is needed yet. `/streaming.html` supplies one update controller and two different presentations: terrain and a read-only diagnostic canvas.

## Addressing and demand

A chunk holds 8 × 8 tiles in a dense Uint8Array. Chunk coordinates use `Math.floor(tile / 8)`, with local offsets obtained by subtracting the chunk origin. Tile (-1, -1) is chunk (-1, -1), local (7, 7), index 63; tile (-8, -8) is that same chunk's index 0. Signed coordinates are keys in Maps, never negative array properties.

Demand accepts integer half-open tile bounds. The controller converts the camera's world rectangle into these bounds once per update. Visible chunks have priority; a one-chunk margin serves both prefetch and retention. Crossing a boundary retains overlap, adds incoming chunks and immediately releases outgoing chunks beyond the margin. No extra LRU/history retention is used in this slice.

There are at most 40 chunk records in the demo, counting ready and pending together. Oversized demand fails before changing retained state. Configurable capacity is capped at 256 and the margin at two chunks. Tile addresses are deliberately limited to ±1,000,000, including generated margin tiles. This is signed addressing, not yet a huge-coordinate/floating-origin implementation. Camera movement in the demo stays inside that domain.

The original synchronous mode of `advance(2)` generates at most two chunks per update, filling 64 tiles each. The current demo supplies an async loader instead; its job and publication rules are documented separately. This is synchronous work spread across updates, not promises or worker jobs. Generation order is visible-first and row-major within each priority group. Dropped pending chunks are cancelled by removing their records; no completed async result can arrive later in this implementation. Statistics distinguish released ready chunks from cancelled pending chunks.

## Readiness and edits

`read(cell)` returns a frozen snapshot:

- `missing`: no retained chunk; this says nothing about terrain contents.
- `pending`: demanded but not yet generated.
- `ready`: a terrain value, including zero for empty/slate terrain.

Drawing and diagnostics only read. They cannot advance the stream or cause generation. Pending terrain uses a separate dark placeholder and chunk labels. Clicks on pending/missing cells are not accepted as edits.

The deterministic example generator supplies base terrain. A host-owned MemoryEdits store holds sparse overrides, keyed by signed chunk and local index. Cycling a ready tile writes its override synchronously before changing live chunk data. A failed store write throws and leaves the live tile unchanged. Returning a tile to its generated value deletes its override; an empty patch removes its chunk entry.

Eviction discards dense chunk data, not edit authority. Regeneration combines base terrain with current overrides. There are no dirty deferred writes or save queues in this memory-only write-through model. The store's revision counts actual changes, not generation or reads.

## Ownership and bounds

The scene owns the ChunkStream and the scene input scope. View disposal releases its keyboard/pointer binding; scene/application disposal releases retained data and pending records. The host owns MemoryEdits outside the application. Recreate stream disposes both canvases and old scene/input, then creates a new stream against that same store. Diagnostics report old stream counts at zero.

One live controller writes the store. Multiple view demand handles are now supported within that shared stream, as documented separately. Simultaneous independent streams sharing the same edit store and external edits while chunks are loaded still do not have a live consistency contract. Different presentations read the same stream; they do not keep their own editable chunk copies.

The ready tile arrays occupy at most 40 × 64 = 2560 bytes in the demo. The displayed byte count covers these arrays only, excluding JavaScript metadata, canvases and sparse edits. The number of records and queued chunks is bounded; sparse edit storage grows with edited tiles. Bounding all memory while preserving arbitrarily many edits would require external durable storage or an explicit edit limit. A plain MemoryEdits store loses its contents on page reload. The current demo uses a PersistentEdits subclass backed by IndexedDB; committed edits now survive reload. The stream waits for `edits.ready` before generation, so initial database loading cannot publish incorrect base tiles.

## Consumer flow

```ts
const edits = new MemoryEdits(); // host/session lifetime
const stream = scene.own(new ChunkStream(edits));
// In one scene update, before drawing:
stream.demand({ minX: -10, minY: -6, maxX: 10, maxY: 6 });
stream.advance(2);
stream.cycle({ x: -1, y: -1 }); // only if ready; write-through
// Both presentations read stream.read(cell) and stream.stats.
```

## Validation and next boundaries

All 84 emitted-JavaScript tests, strict TypeScript, type-aware lint and formatting checks pass. New checks cover signed boundaries/indexing, pending versus ready zero, visible-first budget, repeated travel with bounded retention, atomic rejection of oversized demand, cancellation of outgoing pending chunks, edit recovery after eviction/recreation, pruning overrides restored to base, write failures, and one update despite two presentations. Cleanup preserves host edits and releases dense data and queued work.

Browser verification edits tile (-1, -1) to 1, travels far away (the tile becomes missing and 24 chunks are evicted), returns to recover value 1, and recreates the application while preserving the edit and releasing the previous stream's chunks/queue.

Browser persistence and explicit load/save failures are now delivered in the follow-on slice. Async chunk-job identity, cancellation and current-edit overlays are now delivered; multiple demand owners are also delivered in their own slice. Workers, shared artwork caching, physics terrain readiness, multiple demand owners and save/restart host checkpoints remain separate decisions. The generated pattern is intentionally simple, not an integration of the procedural-terrain project yet.
