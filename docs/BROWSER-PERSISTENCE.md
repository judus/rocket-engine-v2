# Browser persistence for tile edits

The streaming demo now uses host-owned PersistentEdits plus IndexedDbEdits. These are example facilities, not new engine APIs. The existing signed chunk layout, generation budget and retention bound remain unchanged. A plain MemoryEdits still works for memory-only consumers.

## Load and readiness

The host starts one asynchronous load of the complete sparse edit snapshot. Until it succeeds, `edits.ready` is false and ChunkStream.advance() generates nothing. Demanded chunks remain pending. Editing is rejected before saved data loads; loading failure never falls back to an apparently empty world.

The adapter validates generator version, tile coordinates, terrain values and duplicate tile addresses before publishing the snapshot. Incompatible or malformed data produces a visible load error, retains the database record and requires an explicit retry. There is no destructive reset/migration fallback. Retry after a successful load never rereads the database over newer in-memory changes.

Database schema version is 1; the deterministic generator identity is `signed-hash-v1`. Generator identity must change if base terrain interpretation changes. The first saved override is selected on reload so its recovered value is visible in diagnostics; Return to selection can locate it if it is far from the initial camera.

## Memory edits and durable saves

Accepted tile edits change memory synchronously. The store captures an immutable sparse snapshot and writes it in the background. There is only one write in flight: edits during a write are coalesced into the next latest snapshot. Each commit acknowledges only its captured memory revision; it cannot mark newer changes saved. Returning a tile to its generated value removes its override and persists that deletion, including an empty snapshot when all overrides are removed.

IndexedDB writes resolve on transaction completion, not request success. An aborted transaction preserves the previous durable snapshot. Failure records an error and leaves all current memory edits intact, including through chunk eviction and stream recreation. It stops automatic retries; further edits accumulate in memory until Retry storage explicitly saves the latest snapshot. The diagnostic counter is **uncommitted changes/revisions**, not a count of dirty tiles. Zero uncommitted changes plus no active write means the current memory snapshot has been committed.

The demo's Fail next save button calls `abort()` on the next real readwrite transaction after scheduling its write. It is an explicit fault injection for testing recovery; it does not clear saved data. Retry storage is enabled for failures or unsaved idle work. Full error messages appear below the controls, with abbreviated errors and loading/saving counters in the diagnostic canvas.

## Ownership and cleanup

The host owns the persistent store and database connection across Rocket application/stream recreation. Recreating the stream cleans terrain/input/views while retaining ongoing saves and in-memory changes. Final host disposal aborts active transactions and closes the database. A late database open is closed rather than installed; late load/commit results do not mutate a disposed store or falsely acknowledge pending changes. A versionchange event closes the connection so a later operation can reopen it. Blocked/unavailable/open/transaction failures surface through the same load/save state.

On a non-cached pagehide, the demo disposes host storage. Cached page navigation keeps the store alive. Reload only after diagnostics say committed: asynchronous work cannot be guaranteed to finish during navigation, and uncommitted memory edits do not survive a page close. Explicit disposal is synchronous cleanup, not an asynchronous flush. Hosts needing a deliberate shutdown can await flush(), check errors/unsaved state, and then dispose.

## Small-slice limits

The database is `rocket-v2-terrain`, object store `world`, record key `terrain`. It belongs to the browser origin: localhost ports, browser profiles and private sessions are separate storage contexts. This is browser-local persistence, not cloud storage or an export/backup feature.

One small versioned world record contains all sparse edits; every durable save replaces that complete snapshot atomically. The edit store still grows with edits, and initial loading reads all overrides. Large datasets should move toward per-chunk durable patches and bounded loading. The prototype assumes one active editing tab/session; it does not coordinate or merge concurrent writers. Two independent editing tabs can overwrite each other's snapshots. Reopening another adapter is supported for reads/reload; simultaneous writing is not an advertised contract.

Asynchronous chunk loading is now covered by [its own contracts](ASYNC-CHUNKS.md); it still waits for this store to become ready. Multiple demand handles within one shared stream are now covered by [demand ownership](MULTIPLE-DEMANDS.md). No worker chunk generation, terrain physics readiness, conflict merging, generator migration or production-world checkpoint integration is added here.

## Validation

All 91 emitted-JavaScript tests, strict TypeScript, type-aware lint and formatting checks pass. Seven persistence tests cover loading gates and retry, serialized/coalesced revisions, deletion snapshots, save failures retaining edits through eviction, explicit retry of the latest state, disposal with late results, malformed/version-incompatible snapshots, unavailable storage and late opening. IndexedDB adapter tests use fake-indexeddb (test-only dependency) to exercise real request/transaction semantics, commit, abort and reopening; browser checks verify the actual browser database.

Browser verification commits tile (-1, -1) = 1, reloads and recovers 1, aborts a save after changing it to 2, travels away/returns while preserving unsaved 2, retries successfully, then reloads and recovers committed 2 with zero uncommitted changes. Both canvases continue to read one simulation state; diagnostics never trigger loads, saves or generation.
