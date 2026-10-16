# Open questions and implementation gates

The documents preserve discussion, not a frozen specification. Resolve questions at the stage where a concrete example can answer them.

## Initial runtime choices

- TypeScript sources emitting native JavaScript modules and declarations, with strict checks; see [TOOLING.md](TOOLING.md).
- Small scene/view/start/stop/dispose API with optional async scene preparation.
- Frame hooks receive full visible elapsed seconds; hidden tabs and stopped periods pause time.
- Errors halt the frame loop and surface through onError; preparation/cleanup failures reject promises.
- Explicit logical resize, device-ratio backing size, top-left camera x/y and positive zoom.
- Scene/view synchronous resource scopes and application services/input are implemented; fixed simulation and broader scene membership hooks remain future work.

## Remaining runtime decisions

- Exact entry-point convenience API and prepare/start retry behavior.
- Frame time versus simulation time naming; fixed rate, catch-up/backlog/time-loss policy.
- Error propagation/stop policy; hidden-tab behavior; restart semantics.
- Resource disposal protocol (function, object, JS disposal symbols) and async cleanup.

## Before nodes/services

- Stable traversal rules, lifecycle during scene transfer, queued-mutation boundaries.
- Async service installation/readiness and dependency conflict handling.
- Scene facility registration versus ownership; disposable replacement rules.
- Signal delivery/reentrancy and subscriber-error policy.
- Input edge queue routing, focus, pointer capture and action consumption.
- Coordinate conventions, transform origin, scaling and visual bounds.

## Before maps/physics

- Query boundary semantics and candidate/exact naming.
- Cache-resolution/style keys and byte accounting.
- Initial chunk size and generator dependency/invalidation contract.
- Physics backend, unit convention, supported body types and high-speed collision envelope.
- Readiness-frontier policy and how production pauses relate to physics pauses.

## Before combined persistence

- Stable world/facility/carrier IDs and transactional host commands.
- One advancement authority; relationship of production and physics tick boundaries.
- Unified checkpoint capture/commit/restore, version migrations and failed-close handling.
- Domain dormancy/offline policies and scaling measurements.

## Experimental gates

- Quadtree: measured distribution demonstrates a benefit over the grid.
- LOD: overview workload requires coarser representations.
- Workers: main-thread generation is measured as disruptive.
- Large coordinates: choose validated numeric address limits or BigInt with canonical encoding.
- Rebase: backend proves all dependent state can shift safely.
- Multi-region simulation: a real use case justifies transfer/merge complexity.
- GPU backend: measured rendering workload justifies another supported backend.

## Initial progress

The first runtime/view slice is implemented; see [RUNTIME.md](RUNTIME.md). Broader stage features and later integration remain pending. Existing engines, terrain and Workshop remain independent. RUNTIME.md, NODES.md and SERVICES-INPUT.md document available exports; other illustrative snippets remain proposals.

## Reference material

- Original review conversation: `/home/maduser/workspace/rocket-engine/codex-session-01a11308-3a88-7000-bd54-0b5f6d395612.md`.
- Godot composition inspiration: https://docs.godotengine.org/en/stable/getting_started/introduction/key_concepts_overview.html
- Godot body-type distinctions: https://docs.godotengine.org/en/stable/tutorials/physics/physics_introduction.html
- JavaScript array properties/indices: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array#array_indices
- BigInt arithmetic constraints: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt
- Hierarchical LOD selection and loaded coverage: https://cesium.com/learn/cesium-native/ref-doc/selection-algorithm-details.html

External references explain inspirations and language behavior; they do not prescribe Rocket's final implementation.
