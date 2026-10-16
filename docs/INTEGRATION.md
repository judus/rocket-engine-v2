# Terrain + Rocket + Production Workshop

Status: the standalone Workshop demonstration is implemented; fixed placement in streamed terrain is also demonstrated; logistics integration remains planned. Current Workshop package/source rechecked 2026-10-12. See [the implemented demo](WORKSHOP-DEMO.md).

## Verified project context

- `/home/maduser/workspace/procedural-terrain-js`: terrain/noise, tile selection/storage, sprite rendering, decorations and camera/input experiment. Prior conversation includes cache invalidation, unbounded retention and shared-noise-state problems. These are historical findings, not a fresh browser validation.
- `/home/maduser/workspace/production-chain-demo`: package `production-workshop` 1.0.0 at the latest inspection. TypeScript core emits native JavaScript ES modules and declarations. README, API, model/logistics docs and relevant simulation/clock source were inspected. No tests were run or code changed in this documentation task.
- `/home/maduser/workspace/rocket-engine`: original canvas engine, examples and stress-test demo.

Workshop has no DOM/canvas/Rocket dependency. It owns inventories, facilities, reservations, active batches, deterministic outcomes, bulk/individual cargo identity and delivery states. It offers advance(seconds), advanceTicks(count), snapshot(), save(), Simulation.restore(data), and onEvent(listener). The default production tick is 50 ms; it need not equal a physics step.

Its current API/source is more authoritative than older prose: some logistics text still describes an earlier version without save/history pruning, while current API/source and later sections expose both. Reverify before implementation.

## Responsibility boundaries

| Subsystem           | Owns                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Terrain/world       | Base terrain, edits, chunks, spatial placement records                                               |
| Production Workshop | Production progress, inventory ownership, reservations, cargo handoffs                               |
| Rocket              | Rendering, views, input, node/behavior lifecycle, optional physics                                   |
| Application adapter | Stable-ID associations, commands, travel/routing policy, shared time policy, checkpoint coordination |

A facility node represents a facility ID; it is not a second mutable inventory. A moving carrier represents a delivery ID; goods already in transit remain owned by Workshop's delivery record. Do not count the same cargo again in a Rocket entity store.

A successful construction command can create the visual representation; failure must not publish a completed building. Selection/UI reads snapshots or narrow views. Production events can invalidate displays or queue host actions; they cannot reenter Workshop commands during notification.

## Clock bridge

Exactly one adapter advances production. If a transport coordinator already advances it, Rocket must not also call Simulation.advance. Workshop's existing Clock is optional; do not run it alongside another advancement path.

Choose one contract: feed retained elapsed simulation seconds through advance(), or coordinate exact Workshop ticks through advanceTicks(). Physics dt and Workshop ticks are independent. Pausing, time scaling, catch-up limits, background tabs and terrain-readiness pauses require an explicit shared policy; never silently drop production time because a visual loop clamps dt.

For logistics coupled to physical arrival: collect queued commands/arrivals at defined boundaries, advance production once, then dispatch new work according to host policy. Arrival after a physics step may queue for the next command phase. Ordering and latency must be documented and tested.

## Persistence bridge

Use Workshop save(), not snapshot(), for checkpoints. It includes production/cargo state but not external vehicle travel timers, Rocket transforms, routes, terrain edits or UI state. Application checkpoint contains world identity/revisions, Workshop checkpoint, stable placement IDs and host logistics/time state.

Capture related state at one safe logical boundary. Separate persistence adapters do not automatically provide an atomic multi-system save; use one checkpoint envelope/commit marker or a transactional strategy. Validate restores before activation and rebuild visual nodes/indexes from authoritative data. Encode large integer addresses explicitly if introduced.

## Streaming bridge

Evicting a rendered building does not delete its facility. Unloading terrain does not implicitly stop production; dormant/background policies are application choices. Avoid one browser timer per workshop. Keeping domain simulation global is an initial option, not a claim of unlimited-world scalability.

## First combined example

1. Display Workshop facility/inventory state in a simple Rocket scene, no terrain or physics.
2. Place facility representations on a finite terrain map using stable IDs.
3. Add selection, construction commands and visual invalidation.
4. Animate a host-controlled delivery; call Workshop pickup/arrival only at actual handoffs.
5. Save/restore the combined world with an active batch and in-transit cargo.
6. Add streamed terrain while preserving production/placement identity across eviction.

This integration can validate the architecture well before advanced physics, BigInt or planetary LOD exists.

The separate [streamed factory slice](STREAMED-FACTORY.md) now implements fixed placement and visual eviction/recreation while keeping Workshop page-owned. Normal mode now adds free construction and an explicit combined IndexedDB checkpoint; stress mode stays separate. Transport remains deferred.
