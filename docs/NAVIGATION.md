# Finite navigation and movement

Open `navigation.html`. Optional exports live in `rocket-engine-v2/navigation`; no navigation service, character framework, Workshop or physics installation is required for ordinary scenes.

## Boundaries and coordinates

The game supplies authoritative terrain rules, obstacle footprints, actor capabilities and world revisions. `TraversalWorld` exposes `point` and `segment` queries with passable (positive finite cost), blocked or unknown results. Unknown data is never implicitly walkable. Capability strings are opaque game rules.

`GridTraversal` is a convenience adapter: finite signed-origin tile coordinates, game-supplied cell traversal callbacks, and caller-owned rectangular obstacles with stable IDs. Actor radius is positive; clearance is a nonnegative additional margin. The adapter checks the complete swept circle against terrain cells and obstacle rectangles, including rounded corner clearance. Touching blocked geometry or the outer world boundary counts as blocked. Terrain candidate enumeration includes the lower neighboring row and column conservatively, so left/top tangencies receive the same exact distance test as right/bottom tangencies. Clear extra candidates are filtered before terrain callbacks; no clearance epsilon is added. Obstacles are world data, not rendered sprites, and do not disappear with a canvas. The optional obstacle callback receives a swept query bounding rectangle, allowing the game to use Rocket's SpatialIndex to gather candidates. The adapter does not own or mutate those records.

This is geometric movement validation, not a rigid-body solver: no impulses, pushing, sliding, collision events or automatic physical response. Navigation never writes native physics bodies. A future physics movement adapter must treat solver poses as authoritative.

Positions/radius/clearance/distance use world units, speed uses world units per second, and updates receive seconds. Tile indices are local to the supplied finite domain; `minX/minY` are its world-space origin. Large-world rebasing remains deferred.

## Routes

`GridNavigator(world, domain, maxVisited)` performs deterministic four-neighbor Dijkstra search over cell centers, validating the start/goal connectors and every edge. Positive terrain costs influence route selection; route `distance` is geometric length and `cost` is the sum of segment length times traversal cost. The grid adapter averages costs of cells touched by a swept segment; this is a traversal preference, not an exact terrain line integral.

The finite search domain has at most 4096 cells. The optional expansion budget is 1–4096, default 4096. Results are `found`, `unreachable` (invalid-start/invalid-goal/no-route), `not-ready` or `limited`. Unknown frontier data prevents declaring no-route when that frontier might matter. A complete known route can still be returned despite unrelated unknown cells. Budget exhaustion is not proof of unreachable terrain.

This initial synchronous implementation uses a linear scan to select each lowest-cost frontier cell (worst-case quadratic in cell count). It is a bounded small-world proof, not a promised frame-time budget, arbitrary-world pathfinder or worker implementation. Cell-center routes can miss physically feasible off-center passages; no-route means no route in this discretization. There are no diagonal grid edges; the swept-checked start and goal connectors can be diagonal within their cells.

## Journey and pose ownership

```ts
const movement = new Movement(navigator, start, {
  radius: 9,
  clearance: 2,
  capabilities: ['walk'],
});
scene.own(movement);
const journey = movement.move({
  destination,
  speed: 90,
  arrivalTolerance: 0.1,
  replan: 'on-change',
});
// In the scene's fixedUpdate, once per simulation step:
movement.update(dt);
// In presentation or orchestration:
const state = journey.snapshot();
```

Movement owns the actor pose for this non-physics controller. The constructor copies its actor profile and initial position; requests and returned snapshots/routes are immutable copies. One controller has one current journey. IDs are controller-local: a game should pair them with its stable actor identity. A new valid request cancels the prior moving/blocked journey. Draw and snapshot reads never advance movement. Terminal snapshots retain their final pose when later journeys move the actor.

Following a route validates each actual swept step before committing its position. A rejected step leaves the pose at the last validated position, reports blocked with obstacle/unknown reason, and does not spend leftover time on movement after failure. Valid large steps may traverse several waypoints; there is no endpoint-only tunneling. Arrival is reported after validated movement enters the explicit tolerance; small floating-point differences across time partitions are allowed.

The game supplies a revision that changes whenever traversal rules, readiness or obstacle geometry relevant to this world changes. `on-change` replans at most once for the current revision per update; unchanged blocked journeys do not search repeatedly. `manual` waits for `journey.retry()`. A retry can interrupt an active route. `not-ready` and `limited` become nonterminal blocked statuses with unknown/search-limit reasons. A complete failed search becomes terminal unreachable. Arrival, cancellation and unreachable are stable terminal states; retry does not restart them. Issue a new movement request instead. Poll snapshots to observe transitions; there are no internal event subscriptions or dialogue/action orchestration rules.

Disposal cancels the active journey, is idempotent and prevents new updates/requests. Cancelling/retrying an old handle cannot replace a newer journey. The world and its records remain caller-owned. Moving actors do not automatically become obstacles; crowd avoidance is deferred.

## Two-view proof and runtime policy

Both canvases use the same Scene2D and one fixed update owner. The second adds clearance and update-count overlays; either canvas can request a destination through its own rendered inverse. Closing/reopening the diagnostic view releases/rebinds its click listener and keeps the existing pose/journey. Reopening stops the runtime for view registration and restarts it without replaying paused time. Scene teardown releases the controller and page listeners.

Rocket's existing runtime updates only scenes with an active view. Removing the final view pauses this scene; a headless movement/simulation policy is not introduced here. A game needing journeys to outlive all presentation must explicitly choose its simulation owner before that integration. Streamed actor/path demand, unknown-region loading, workplace arrival/attendance and vehicle cargo travel remain separate slices.

Tests cover swept clearance, narrow passages, capability rules, weighted/signed routes, unknown/limited outcomes, time partition agreement, revision-driven replanning, manual blocked/retry, terminal snapshots/cancellation, disposal and single-owner updates across two views. No character or Workshop authority is duplicated.

Movement consumes the narrow RoutePlanner interface rather than a concrete GridNavigator. Limited route results can supply search-limit, corridor-limit or demand-limit reasons; journey snapshots expose nextWaypoint for remaining-path demand. The optional streamed adapter delegates searches to the same grid implementation. See [bounded corridors](STREAMED-ROUTES.md).
