# Architecture decisions

Status: working directions. Detailed syntax and several execution policies are proposals; see [open questions](OPEN-QUESTIONS.md).

## D01 — Multipurpose canvas runtime

Simple callbacks are the entry point. Structured applications use the same loop and rendering path. The spaceship demo demonstrated flexibility; it does not define required services or object properties.

## D02 — Scene and view are separate

A scene owns application state and optional composition. A view owns canvas presentation, camera, layer selection and view controls; it references a scene. Multiple views never duplicate scene execution.

## D03 — Lifetime, execution and references are distinct

One lifetime owner disposes an object. A defined execution path drives it. Other references and indexes do not transfer ownership.

| Object         | Lifetime responsibility                               | Execution responsibility                                    |
| -------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| Application    | Shared services, scenes, views                        | Sole loop driver                                            |
| Scene          | Root tree, scene resources/facilities                 | Scene hooks, node traversal, registered simulations         |
| Node           | Children, behaviors, node-owned handles               | Delegates hooks once to attached behaviors                  |
| View           | Canvas, camera, input scopes/controllers, view caches | Camera presentation and rendering                           |
| Shared service | Infrastructure and shared caches                      | Explicit operations; phase participation only when declared |
| Physics world  | Backend simulation storage                            | Registered scene simulation phase                           |
| Body handle    | Owned by node or explicit application owner           | Unregisters body on disposal; no private loop               |

Creating a resource does not imply owning its lifetime. A shared physics service creates a scene-owned world. A shared asset service owns cached data; consumers own leases. Disposing a world invalidates remaining body handles safely; handle disposal is idempotent.

## D04 — Composition through nodes and factories

Node2D stores local transforms; world transforms are derived. Factories assemble reusable subtrees and may expose a small public interface. Behaviors extend capability without mandatory ECS or deep inheritance.

Detachment, reparenting, destruction, simulation ownership and damage/faction ownership are distinct operations. Reparenting explicitly chooses whether to preserve local or world placement. Cross-scene resource transfer requires a policy rather than implicit registration changes.

## D05 — Narrow dependencies and communication

Factories/behaviors accept explicit collaborators. Scene-dependent behaviors may declare requirements resolved on scene entry; they receive only those facilities. Nodes do not expose the entire engine.

Direct calls issue requests to known collaborators. Object-local signals report facts. Typed/named scene event channels support multiple unrelated consumers. Composition code owns the wiring and subscription lifetimes.

## D06 — Services are installed explicitly

`app.use(ServiceDefinition)` proposes idempotent installation/retrieval of a shared facility. Definitions declare dependencies. Instances, constructors and factories are not guessed through one overloaded registration function. `own(resource)` records lifetime only; installing execution is a separate action.

## D07 — Explicit timing and one execution path

Frame updates receive seconds. Fixed updates run simulation. Draw receives presentation information, including interpolation alpha; alpha is never called dt. No per-object recurring timer advances engine simulation. Capping catch-up must have an explicit backlog/time-loss contract.

## D08 — Canvas 2D first

World and screen layers organize rendering; not every layer creates a full-sized canvas. Live rendering, view-image caches and world-chunk caches are distinct policies. Arbitrary application drawing declares invalidation; engine-owned setters can report revisions/bounds.

## D09 — Stores and indexes differ

Authoritative records live in stores. Spatial indexes contain IDs/registrations and derived bounds. Queries specify whether they return candidates or exact bounds matches. Rendering/picking and physics may need separate indexes. Spatial subdivisions never become automatic physics-world boundaries.

## D10 — Storage chunks, simulation regions and LOD differ

Chunks partition data/residency. Physics regions keep active solver coordinates local. LOD trees choose visual detail. Each can use spatial structures, but none substitutes for the other responsibilities.

## D11 — Optional large worlds

Ordinary scenes use numeric local coordinates. Large-world placement can use integer chunk addresses and bounded numeric offsets. Never reconstruct enormous floating-point absolute positions for rendering or physics. BigInt support is an experiment with explicit persistence encoding, not a prerequisite for simple drawing.

## D12 — Independent domain simulation

Production Workshop remains authoritative for production/inventory/cargo. Terrain owns world data. Rocket supplies presentation, input and host coordination. Stable IDs connect them through adapters; visual-node destruction or chunk eviction does not implicitly delete domain state.

## D13 — TypeScript source and checked builds

Runtime, demo and tests use TypeScript. Builds emit native JavaScript ES modules plus declarations; browsers load the emitted JavaScript without a bundler. Strict checking and type-aware linting run alongside formatting verification. Synchronous hook types reject Promise returns, while runtime guards remain for JavaScript callers. See [TOOLING.md](TOOLING.md).

## JavaScript posture

Optimize measured costs, not hypothetical C-like workloads. Map/Set are valid starting structures; typed arrays fit dense buffers. Workers and pooling require evidence. GPU resources, listeners, jobs and subscriptions require explicit cleanup regardless of garbage collection. TypeScript types do not replace runtime validation of external data.

## Lessons from the old engine

2026-10-11 isolated probes reproduced camera named-array components skipping updates, mount world coordinates being transformed again, removed behavior callbacks remaining scheduled, destroyed children being re-registered, and scene switching resolving before loading completed. These are contract lessons, not proof of browser behavior or a complete defect inventory. Existing source/timer edits were left untouched.
