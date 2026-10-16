# Multiple demand owners

Two terrain canvases now explore different regions of one shared ChunkStream. Each has a view-owned demand handle and input scope. The scene owns the stream; the host owns persistent edits. A third independent observer reports stream/persistence state, including after both terrain views close.

## Small API

```ts
const ownerA = viewA.own(stream.createDemand());
const ownerB = viewB.own(stream.createDemand());
// One controller update:
ownerA.set(boundsA);
ownerB.set(boundsB);
stream.advance(2);
// Closing viewA disposes its handle, leaving B's demand intact.
```

A handle starts without bounds. set() replaces its integer half-open tile rectangle; the stream stores an immutable copy. dispose() removes that owner's demand and is idempotent. Setting a disposed handle or using a handle after final stream disposal fails clearly. The previous demand(bounds) method remains a convenience implicit owner for single-controller consumers; the current demo uses only explicit handles.

## Union, priority and capacity

Each owner contributes visible chunks plus the stream's retention/prefetch margin. The stream unions coordinate keys across all owners before changing retained state. Shared chunks have one record, one load attempt and one editable tile array. Visible demand from any owner outranks every owner's prefetch; registration order and row-major order provide stable ordering within those groups. This is not a fair-share scheduler for arbitrarily many owners.

The combined union must fit capacity. An oversized owner update fails before changing any demand, cancelling jobs or evicting records; existing state remains valid. Capacity does not silently clip a viewport. The demo uses 64 records because two 640 × 360 canvases can each require up to 30 records including their one-chunk margin. Job capacity stays at four **total**, and at most two new jobs start per scene update, independent of canvas count.

Owner changes currently reconcile immediately and sequentially. Individual set() calls are not a batched transaction across cameras: simultaneous swaps can cause temporary eviction/reload. The procedural terrain adapter now supplies the concrete linked-camera case through setDemands([{handle, bounds}, ...]). It validates distinct live handles from this stream and the complete proposed union before changing any state. Atomic swaps keep shared chunks alive, and linked camera travel avoids transient over-capacity. The original independent-view demo can keep using set().

## Cleanup

Closing a view disposes its input binding/scope and demand handle. Chunks needed by another owner's visible area or margin remain alive; their jobs are not cancelled and existing ready data is reused. Only chunks outside the remaining union are evicted, with their jobs aborted. Shared edit authority remains in the host store.

Closing the last owner leaves zero retained/queued/visible records. Cooperative source jobs cancel and settle promptly. Settled cancelled buffers are released immediately, and aborted jobs are removed when their promises settle, without requiring another scene update. This matters when Rocket suspends the controller scene after its last view closes. A noncooperative promise still occupies its slot until settlement; cleanup does not pretend that underlying work has stopped.

Final stream disposal invalidates all handles and clears the owner registry, then applies the existing job cancellation/stale-result rules. Recreate stream disposes the previous application and creates two fresh handles, preserving the persistent edit store. Diagnostics expose old owner/chunk/pending/job counts at zero.

## Presentation and input

Both terrain canvases render the same scene. The presentation chooses its camera rectangle from the canvas context; drawing cannot request chunks or advance jobs. Each canvas's separate input scope reads the same WASD/arrows but receives keys only while focused. Panning A leaves B stationary, and clicks use the originating camera's world coordinates. Selection/edit state is shared and appears through either view when that tile is visible.

A starts near the origin; B starts far away. Overlap views moves B to A, exposing shared retained data; Separate views moves B back to the remote region. A's travel/return buttons affect A only. Close view A/B release those canvases independently. Recreate stream restores both.

The observer's update performs read-only reporting to DOM/accessibility labels, and its draw renders diagnostics. It does not demand/load/generate terrain or save edits. It remains active when terrain views close, so cleanup counts stay observable even as aborted jobs finish settling.

## Validation and remaining boundaries

All 103 emitted-JavaScript tests, strict TypeScript, type-aware lint and format checks pass. Five new tests cover deduplicated overlapping margins, immutable bounds, shared edit retention, atomic over-capacity rejection, final handle invalidation, visibility priority across owners, shared-versus-exclusive job cancellation, late-result cleanup, independent focused input and ownership release on view closure. Existing async, persistence, signed-address, physics and two-view ordering tests remain green.

Browser checks show two distant owners retaining 44 chunks, overlap reducing the union to 24, closing A retaining those 24 for B, and closing B releasing all demand. Closing distant views during delayed loads cancels exclusive jobs while the remaining owner continues, then leaves zero owners/chunks/queues/job slots. Persisted edits remain committed throughout.

This remains example-owned world infrastructure. Headless simulation demand can use the same disposable handle, but no autonomous controller, multiple independent-stream scheduler, multi-tab persistence coordination, fair scheduling, worker generation or terrain-physics readiness frontier is added.
