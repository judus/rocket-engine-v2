# Actor-owned streaming: first checkpoint

Open `navigation-streaming.html`. The current demo includes [bounded route-corridor planning](STREAMED-ROUTES.md); this page records the actor-demand foundation and its first delivered routing limits. A single actor crosses signed chunk boundaries while two cameras explore unrelated areas. Both views can close; the actor and terrain publication continue in the same Rocket runtime. This is the actor-demand prerequisite, not unrestricted streamed pathfinding or factory staffing integration.

## Runtime ownership

`app.scene(definition, { keepAlive: true })` explicitly keeps a registered scene active without any views. Its preparation, frame/fixed hooks and service visibility use the existing runtime; a scene with several views still updates once. The default remains view-dependent. App stop, document visibility, fixed-step overload policy and disposal retain their existing contracts: keepAlive is not a background worker, offline progression or immunity to browser suspension.

This demo uses one keepAlive Scene2D to publish stream results and move its actor once per fixed step. There is no timer that advances simulation separately. DOM status reads its state even when no canvas exists. Reopening stops the app for composition, registers fresh view-owned demand, then restarts without replaying paused time. App teardown disposes the actor before the stream.

## Demand and readiness

The example-level `StreamedWalker` consumes the existing ChunkStream and optional navigation module. It owns one local demand handle and, while a journey is active, a separate leg demand handle. Cameras own their own handles. The shared stream deduplicates their union, with capacity 64, retention margin zero and four occupied async job slots. The actor is registered first in this demo so its demand has priority over camera work.

Local demand is an eight-tile halo around the actor (normally nine 8 × 8 chunks), independent of camera visibility. Moving updates that region and retires obsolete chunks unless another owner needs them. Leg demand covers start/goal plus a one-tile margin. Cancellation/arrival/unreachable release leg demand; cancellation does not discard the idle actor's safety region. Actor disposal releases both handles. Camera closure cannot release actor demand. A rejected demand union remains atomic through ChunkStream's existing capacity validation.

Navigation consumes ready live tile values, including host edit overlays applied by ChunkStream before publication. Pending, missing and failed data all remain unknown to movement. Failed jobs require explicit stream retry. The demo's source has varied cooperative delays; non-cooperative cancellation still occupies a bounded slot until settlement, and obsolete replies cannot resurrect demand. Those are the existing stream contracts, not a second loader.

The initial slice used coarse stream counters for revisions; the current corridor adapter fingerprints readiness in actor/route chunks and includes edit revisions. The existing Movement replans on that revision; unchanged unknown terrain does not trigger per-frame searches. Swept actor clearance checks still validate each actual movement segment. Querying terrain never implicitly starts a job; the demand owners determine loading.

## Deliberately limited routes

The actor's navigable proof domain is a signed-origin 96 × 16 grid, with 32-world-unit tiles (1536 search cells). The first slice limited a leg to one chunk, 256 world units, per axis and used a scripted four-leg tour. That restriction/tour is now replaced by one destination request and bounded corridor expansion; see the current route contracts. Actor speed is 100 world units/second.

Search uses the existing finite GridNavigator, with the rest of unloaded terrain treated as unknown. The local and leg regions are bounded rectangles, not an expanding route corridor. An obstacle requiring a detour outside retained data may leave a journey blocked; this implementation does not expand demand automatically or claim global unreachability. Invalid longer/out-of-domain requests are refused before replacing the active journey. Camera views can observe terrain outside the actor's finite navigation domain.

Next checkpoint: bounded search-corridor demand, explicit expansion/search limits and relevant readiness revisions. Then integrate workplace arrival in streamed factory terrain, and only afterward settle actor/assignment save contracts. There is no actor persistence, crowd avoidance, vehicle cargo movement or automatic character decision integration in this slice.

## Proof controls

- Walk east/west: one signed chunk leg.
- Plan journey: one destination with an explicit route budget; see the current corridor demo.
- Cancel: stop that journey and release its leg demand, retaining local actor demand.
- Move cameras away / Return: change presentation demand independently of the actor.
- Close/reopen all terrain views: prove zero-view simulation ownership and fresh view demand cleanup.
- Diagnostic load failure/retry and actor disposal: expose readiness and handle cleanup.

Tests cover zero-view preparation/updates, default inactive-scene behavior, signed traversal, retention/job bounds, camera demand removal, cancellation, rejected requests, unknown readiness, stale completion rejection, edit overlays before traversal and reopening without pose reset. Full checks pass with 195 tests.
