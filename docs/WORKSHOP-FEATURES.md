# Construction and staffing demo

Open `factory-terrain.html?transport=1&workshop=1`. This profile uses the existing terrain, camera, spatial index, picking, occupancy and transport presentation. Workshop remains the only authority for inventories, reservations, construction progress, attendance and production.

## Small economy

| Building | Ore cost | Construction time | Operator required |
| -------- | -------- | ----------------- | ----------------- |
| Mine     | 2        | 6 seconds         | No                |
| Smelter  | 4        | 10 seconds        | 1                 |
| Press    | 6        | 12 seconds        | 1                 |

The shared construction depot holds 40 items. Bootstrap pays for three instant starter buildings from 24 ore, leaving 12 ore for new sites. Starter Smelter and Press have zero attendance and cannot produce until an operator is explicitly placed on site. Production still uses private input/output buffers and timed goods routes.

The supply button moves up to four actual, unreserved mine ore to the depot, subject to capacity. This is an explicit instant transfer, not a material-hauling simulation. Construction uses the shared depot; costs are reserved when available and consumed when the facility activates. Cancellation releases unconsumed reservations and retires empty private site buffers through Workshop.

## Ownership and lifecycle

A pending site owns a page-level occupied foundation and a Workshop construction-order identity. It has no production or workforce benefits. Terrain eviction or view closure releases presentation records, not the site, reservation or progress. The single Rocket update supplies elapsed time to Workshop once.

After native completion, the adapter publishes a completion fact. The page replaces the site anchor with the new facility ID while preserving its footprint; the spatial visual record follows that identity change. Saving before these facts have been acknowledged is rejected, preventing a checkpoint with mismatched domain and placement identities. Cancellation releases the foundation and visual membership after successful native cancellation.

## Staffing and pause

Place/remove operator asserts local attendance for the selected Smelter or Press. Workshop gates production on that attendance and freezes progress when required staff are absent. Each staffed building exposes one dedicated operator slot in this demonstration; there is no population allocator, actor, pathfinder or physical worker journey. The marker shows reported attendance. It does not prove a character travelled there.

Per-building pause uses Workshop's enabled state. Drain prevents new work while allowing existing work to finish. Global demo pause stops supplying elapsed time. These are distinct controls; only native per-building state belongs to the factory checkpoint.

## Persistence and verification

The current factory envelope is version 4, containing native Workshop save version 4 and required profile fields. `workshop-w2-v4` is separate from the basic normal/transport slots. Pending orders, progress, reserved materials, private buffers, attendance, paused production, routes and placements restore together. No older slots are read or migrated, and loading failures remain visible rather than silently replacing a world.

Tests cover material contention, cancellation and buffer cleanup, completion publication, occupancy, attendance-gated production, pause, deterministic pending-site restore, explicit depot transfer and view-independent construction. Browser checks cover staffed production, completed construction, save/reload during construction, cancellation releasing reservations and a paused building with saved attendance.

Future worker travel and navigation belong to Rocket's optional movement/navigation services; character decisions belong to the separate character framework. This demo introduces neither system and duplicates none of Workshop's construction rules.
