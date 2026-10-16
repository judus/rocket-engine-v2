# Bounded streamed route corridors

`navigation-streaming.html` now accepts one farther destination, replacing the scripted four-leg tour. The finite proof domain is still 96 × 16 tiles, origin (−1024, −256), tile size 32 world units. This is bounded routing through streamed data, not an unrestricted infinite-world pathfinder.

## One search and movement implementation

Movement now accepts the narrow `RoutePlanner` interface (`world`, synchronous `route`). GridNavigator satisfies it directly. The example-level StreamedRoutePlanner adds only demand/budget policy and delegates every search to GridNavigator. It does not own a second actor pose, loader, time source, pathfinder, physics solver or character decision system.

Journey snapshots expose `nextWaypoint`, allowing consumers to retain just the remaining route without guessing progress from the rendered position. The remaining-path bounding rectangle is padded, aligned to chunks and only shrunk during movement. Retargeting or a world-change replan replaces the previous corridor through the existing atomic demand union. Actor-local demand remains independent. Shared camera demand can retain chunks released by the route.

## Planning stages

1. Build a one-tile-padded rectangle between the actual current pose and destination, aligned to chunk boundaries and clipped to the proof domain.
2. Request that rectangle through one route-owned handle. Wait until every requested chunk is ready. Missing/pending/failed data is unknown; failed loads require stream retry.
3. Search the ready rectangle with the existing weighted four-neighbor grid algorithm and swept actor clearance.
4. If no route exists in this partial domain, widen it by one chunk on each side, clipped to the finite world, and request the extra data. Retry on a subsequent update, even when cameras already made the expanded region ready.
5. Follow a found route and shrink demand to its remaining path. Changes to relevant readiness or authoritative edits can start a fresh planning attempt from the actual pose.

Readiness fingerprints cover actor-local and route-owned chunks; unrelated camera loads do not trigger replanning. Edit revisions are currently conservative across the shared edit store. Own demand shrinkage is acknowledged without treating retired off-route data as an obstacle change. Expansion does not loop through several searches in one update: one planning invocation delegates at most one search. A new explicit user request can also invoke planning.

## Budgets and outcomes

The default maximum is 24 requested route chunks, four expansions per planning attempt, and 4096 visited cells per delegated search. The full proof domain contains 24 chunks/1536 grid cells. Budgets are explicit, copied and validated. These are resource/work-count bounds, not a millisecond frame-time guarantee or a total lifetime CPU budget. The existing synchronous grid search uses a linear frontier scan. A changed world can require additional planning attempts.

The stream separately caps the union of all actor/route/camera retention at 64 records, with zero extra retention margin in this demo, and four occupied asynchronous jobs. A route never evicts another owner's demand to make room.

| Result                                      | Meaning                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- |
| blocked / unknown                           | Requested data is not ready; no permission to cross it                                        |
| blocked / corridor-limit                    | A partial-domain search failed, but another expansion would exceed its expansion/chunk budget |
| blocked / search-limit                      | The visited-cell budget ended the search before reachability was established                  |
| blocked / demand-limit                      | Initial corridor size or the shared demand union exceeds its capacity budget                  |
| unreachable / invalid-start or invalid-goal | The ready endpoint is invalid under the actor's traversal rules                               |
| unreachable / no-route                      | The entire finite proof domain is ready and a complete grid search found no route             |
| arrived                                     | Actual validated movement reached the destination tolerance                                   |

A budget-exhausted attempt is held rather than repeatedly searching each frame. Choose a budget and issue a new Plan request to retry it. Requested corridor data remains available for inspecting corridor/search exhaustion until cancellation or retargeting; an initial/shared-capacity rejection releases its rejected route handle. Arrival, unreachable, cancellation and actor disposal release route demand. Local actor safety demand remains until actor disposal.

Known valid paths may be geometrically incomplete because the existing discretization uses grid cell centers. No-route refers to that finite navigation model, never to unseen infinite terrain. The adapter requires a chunk-aligned proof domain with the stream's tile size.

## Demo and verification

The default goal (816, 48) lies beyond a two-tile-thick wall. A four-chunk budget cannot get around it and reports corridor-limit. A 24-chunk budget expands upward, loads the upper opening and follows one continuous journey. Cameras can explore elsewhere or both close; the keepAlive scene remains the sole simulation owner. The existing loading-failure/retry and actor-disposal controls remain under Diagnostics.

Tests cover expansion and wall detours, corridor/search/shared-demand budgets, complete finite-domain unreachable, invalid request preservation, shrinking/retargeting/cancellation, edit-driven replanning and delayed/stale job cleanup. Browser proof also exercises the insufficient-budget result and arrival with zero views. All 202 tests pass with strict TypeScript, lint and format checks.

Next is integrating these ownership rules with streamed workplace assignments. Actor/assignment persistence and multi-actor staffing allocation remain separate work; no Workshop or character-framework rules were copied into navigation.

## Demo presentation

The journey view now fits the default actor/target and labels the upper wall opening and the finite world boundary. A blue outline/tint identifies the actual allowed search rectangle; terrain outside it is shaded even if camera demand has loaded it. Loading uses a dashed outline. The visible map renders only each view's relevant tiles, with labels projected through the view's actual screen transform.

Plain-language feedback explains loading, incomplete searches, movement and arrival; counters and lifecycle/fault controls are under expandable diagnostics. East/west shortcuts update the numeric destination fields through the same request path as Plan. Reset disposes the current actor, creates one fresh actor at the start and preserves the terrain/edit store and selected budget, so the two budgets can be compared from the same pose without retaining old actor demand owners. The current actor is disposed once at scene teardown; resets do not accumulate scene-owned actor records.
