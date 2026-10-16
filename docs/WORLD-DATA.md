# World data, spatial queries, streaming and persistence

Status: basic stores/chunks are practical extensions; very large coordinates are experimental.

## Stores versus indexes

An object store owns authoritative ID-to-record lookup. A spatial index tracks derived bounds/membership; registrations own their previous cells so moving then removing cannot leave stale entries. Index registrations reference IDs/objects without owning their lifetimes.

Queries distinguish broad-phase candidates from exact bounds matches and document edge inclusion. Multi-cell objects are deduplicated. Physics indexes use simulation transforms; presentation/picking may require interpolated bounds or a conservative union.

Start with a uniform grid. Compare a quadtree for uneven density/variable object sizes only with measured workloads. Storage chunks, spatial subdivisions, LOD patches and physics regions need not have the same size or ownership.

## Signed coordinates

Old GridMatrix stored negative coordinates as array properties; get worked but array forEach skipped them (reproduced 2026-10-11). GridMap/TileGridMap already use nested Map storage.

Use sparse maps of chunks, with dense arrays/typed arrays inside each chunk. A canonical string coordinate key or nested maps handles negatives. New coordinate arrays used as Map keys compare by identity, not value.

For chunk width S and integer tile position x:

    chunkX = floor(x / S)
    localX = x - chunkX * S

Require 0 <= localX < S. For S=32: -33 -> (-2,31), -32 -> (-1,0), -1 -> (-1,31), 0 -> (0,0), 32 -> (1,0). JavaScript remainder alone is not positive modulo. Boundary range queries need a consistent half-open/inclusive convention.

## Large-world addressing

Optional position: integer chunk address plus bounded numeric offset. BigInt may address distant chunks; integer Number is sufficient while safe and validated. BigInt division truncates toward zero, so floor division must be defined for negatives.

Subtract chunk addresses first; convert only a verified nearby difference to Number. Do not materialize giant numeric absolute positions. Movement normalizes local offsets across chunks. Persistence encodes BigInt addresses explicitly (for example canonical decimal strings); ordinary JSON cannot serialize BigInt directly.

Local node transforms stay numeric. Large-world placement sits at an explicit world boundary; exact parent/cross-region behavior is an open API decision.

## Streaming ownership

World owns source, persistence coordination, streamer and resident authoritative chunks. Sources load authored data or generate base data. Streamer deduplicates requests, limits jobs, tracks demand/priorities and manages residency. Views/simulation regions hold demand handles; they do not directly save/generate chunks.

Loading: read saved state -> load/generate base -> apply saved edits -> publish ready data. Build render/collision resources separately. Pending differs from known empty and failed.

Views request visible, prefetch and retention regions. Crossing a boundary updates demand, reuses overlap and eventually evicts trailing chunks. Demand also changes with zoom/resize and other consumers. Distant overview views request coarse representations rather than all full-detail data.

## Persistence

Procedural saves identify seed, generator version, configuration and schema. Generator results must not depend on load order or lossy conversion of huge addresses. Save overlays for sparse edits or snapshots for authored/heavily modified chunks; format choice is an adapter concern.

Edits mutate authoritative resident data, advance revision, record persistence work and invalidate dependent rendering/colliders. Editing unloaded data first acquires readiness/demand.

Save acknowledges a particular revision. If revision 18 saves while 19 is edited, 19 remains dirty. Serialize per-chunk writes or enforce revision checks so stale writes cannot overwrite newer saves. Commit complete revisions atomically.

Evict only when unneeded and durably preserved. Clean reproducible chunks can leave immediately. Dirty chunks save first; failure retains state and reports pressure/failure. Evicting pixels never evicts edits. A durable journal may eventually permit earlier data eviction.

Jobs carry world identity/content revision/request generation. Cancel irrelevant work; stale completions cannot resurrect disposed data or overwrite edits.

## Save-aware close

Flush confirms captured revisions are durable. Close stops new edits, flushes and then releases resources. Failure must not look like successful close. Application disposal and durable save are distinct contracts. Unified terrain/production/host checkpoint boundaries are owned by the application coordinator; no cross-store atomicity is assumed.

## Dormant objects

Stable world IDs outlive visual nodes and residency. Moving objects are not lifetime-owned by terrain chunks. Chunk membership is an index. Partitioned record migration requires an atomic transaction/journal. Dormant progression (freeze, analytical advance, background simulation) is application policy.
