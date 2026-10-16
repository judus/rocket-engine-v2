# Rocket Engine v2 — design workspace

Current consolidation: 2026-10-16. Runtime timing/lifecycle and reported UI/journal/CPU-geometry/streaming bugs are fixed; Workshop 2.4.0 and Sprite 0.3.0 are imported locally. Reusable WebGL lifetime, shared input/asset ownership and optional bloom composition are documented in [Consolidated API](docs/CONSOLIDATION-API.md). See [progress](docs/CONSOLIDATION-PROGRESS.md) and [the checklist](docs/CONSOLIDATION-CHECKLIST.md). Local Git tracks work; no remote publishing is configured here.

Rocket v2 is a multipurpose JavaScript canvas engine: start with ordinary update/draw callbacks, then add views, composition, input, assets, maps, or physics when useful. Pure code authoring is the intended workflow; no GUI/editor is planned.

The old spaceship demo was an exploration and stress test, not the engine's defining use case. Procedural terrain and Production Workshop are intended integration consumers, alongside simple animations and interactive diagrams.

## Try the foundation

```sh
npm ci
npm start
# Open http://127.0.0.1:8092/
npm run check
```

The example shows two reusable articulated arms through two cameras, plus a separate time-driven animation. Click or tab into either view: Space toggles motion, WASD/arrows move the selected arm, and dragging a base selects and moves it. Replace an arm to exercise subtree cleanup. Shared-scene overlays include FPS and update/render CPU costs. The arm bases share one loaded PNG; “Test image error” exercises failed startup and “Restart example” recovers. Read the [asset API](docs/ASSETS.md), [services and input API](docs/SERVICES-INPUT.md), [nodes and behaviors API](docs/NODES.md), [implemented runtime API](docs/RUNTIME.md) and [foundation review](docs/FOUNDATION-REVIEW.md). Node 24 and Python 3 were used for local verification; the core browser runtime has no package dependencies; the optional physics service uses Matter.js. Development uses TypeScript, type-aware ESLint and Prettier; see [tooling](docs/TOOLING.md).

`npm run check` runs strict type checking, lint, formatting verification, then builds and runs the current test suite against emitted JavaScript. `npm run format` applies formatting. For development, leave `npm start` serving and run `npm run dev` in another terminal to rebuild on edits; refresh the browser after a rebuild.

The [tile-board demo](http://127.0.0.1:8092/tiles.html) is a second consumer: one larger finite signed tile store, shared bounded terrain caches, a reusable presentation node, two editor cameras and click-to-edit input, plus an independent activity-counter canvas reading the same board. Closing the detail view preserves edits and the world view; resetting exercises full cleanup. Cache overlays show rebuilds, evictions, FPS and estimated RGBA storage. See [the checkpoint and findings](docs/TILE-BOARD.md) and [cache contracts](docs/TILE-CACHE.md).

The [fixed timing demo](http://127.0.0.1:8092/fixed.html) shows optional 60 Hz simulation, independent diagnostics, pause/resume and an explicit overload test. See [fixed timing and input domains](docs/FIXED-TIMING.md).

The [physics sandbox](http://127.0.0.1:8092/physics.html) uses an optional scene-owned Matter.js service with falling boxes, static platforms, a sensor and independent diagnostics. Focus the world canvas: A/D or arrows move the blue box; Space boosts it once per press. The physics module has a separate package entry point; the core index does not load Matter. See [ownership, contact order and cleanup](docs/PHYSICS-PROTOTYPE.md).

The [chunk streaming demo](http://127.0.0.1:8092/streaming.html) generates signed 8 × 8 chunks with bounded retention and an independent diagnostic canvas. Edit a tile, visit far away to evict it, then return. Recreating the stream also preserves the host-owned sparse edit store; committed IndexedDB edits survive page reload. Pending changes and load/save errors appear in diagnostics, with an explicit retry and a transaction-abort demo control. Two independently focused terrain views share one 64-chunk union and four job slots; overlap deduplicates demand and closing a view releases its demand and input scope. Chunk loading is asynchronous: adjust delays, vary completion order, inject a chunk failure and retry; four occupied job slots bound running/buffered work. See [streaming contracts](docs/CHUNK-STREAMING.md) and [browser persistence](docs/BROWSER-PERSISTENCE.md), and [asynchronous chunk jobs](docs/ASYNC-CHUNKS.md) and [multiple demand owners](docs/MULTIPLE-DEMANDS.md).

The separate [procedural terrain demo](http://127.0.0.1:8092/terrain.html) rebuilds seeded terrain generation as a pure TypeScript module. Biome and elevation canvases share one patch assembled from independent chunks; seed, scale, regeneration order and signed-region controls expose its contracts. It does not alter the streaming demo or its saved terrain. See [generator API and limits](docs/PROCEDURAL-TERRAIN.md). The next [streamed procedural terrain demo](http://127.0.0.1:8092/terrain-streaming.html) adds async demand, shared bounded artwork and six-biome edits saved separately by version/seed/scale. See [adapter contracts](docs/STREAMED-PROCEDURAL-TERRAIN.md).

## Read in this order

1. [Roadmap](docs/ROADMAP.md): foundations, practical extensions, then experiments.
2. [Architecture decisions](docs/ARCHITECTURE.md): responsibilities and ownership.
3. [API sketches](docs/API-SKETCHES.md): progressive examples; names are provisional.
4. [Execution and lifecycle](docs/EXECUTION.md): ordering, activation, mutation and cleanup.
5. [Rendering](docs/RENDERING.md): views, cameras, layers and cache invalidation.
6. [World data](docs/WORLD-DATA.md): stores, spatial indexes, signed coordinates, streaming and persistence.
7. [Physics](docs/PHYSICS.md): local simulation and possible streamed-world extension.
8. [Integration](docs/INTEGRATION.md): terrain and Production Workshop boundaries.
9. [Open questions](docs/OPEN-QUESTIONS.md): decisions requiring examples or prototypes.

## Status conventions

- **Direction:** the working principles established in the discussion.
- **Proposal:** a concrete design to validate before implementation; not a frozen public API.
- **Experiment:** optional later work; not a prerequisite for a usable engine.
- **Open:** no settled contract yet.

The runtime, 2D/3D rendering and bounded integrations are implemented. Unimplemented sketches remain proposals; do not implement the entire future world architecture as scaffolding for a rectangle.

## Existing projects

- `/home/maduser/workspace/rocket-engine`: old engine and stress-test demo; preserve as reference.
- `/home/maduser/workspace/procedural-terrain-js`: existing terrain experiment.
- `/home/maduser/workspace/production-chain-demo`: Production Workshop, a separate simulation compiled from TypeScript to JavaScript ES modules.

The documentation records intended connections, not completed integrations. Source references are a 2026-10-11 snapshot. Existing projects were inspected read-only during this documentation task.

The [classic terrain demo](http://127.0.0.1:8092/terrain-tiles.html) restores the original 16 × 16 atlas presentation with full-frame edge/corner overlays and feet-sorted trees plus a walker. WASD walks, arrows pan, and two buttons demonstrate behind/in-front occlusion. An optional tile-friendly pass removes narrow peaks/pits and bounds neighboring height-tier differences; its checkbox compares the same raw world. The second canvas inspects the resolver and shared depth queue. See [classic terrain contracts](docs/CLASSIC-TERRAIN.md).

The classic demo now caches clustered decoration records per region: ground flecks are baked into its ground images, while plants, mushrooms, stones, bushes and trees join the walker in the feet-sorted object pass. Its statometer distinguishes region generation costs and placement counts from steady frame costs.

The streamed procedural demo now includes a third classic 16 × 16 view with cached decorations. All views share a world-space center and the same biome overrides; classic painting uses explicit representative tiers while elevation stays procedural. Neighbor readiness, edit invalidation, a two-region artwork budget and view-owned cleanup are described in [streamed classic terrain](docs/STREAMED-CLASSIC-TERRAIN.md).

The separate [Production Workshop demo](http://127.0.0.1:8092/workshop.html) connects an ore source, smelter and press to one capped stockpile. Rocket supplies elapsed time once; floor and diagnostic canvases read one snapshot. Pause, disable smelter, collect parts, close a view and reset expose time and ownership behavior. The local Workshop 2.0.0 package snapshot is example-only. See [integration contracts](docs/WORKSHOP-DEMO.md).

The next [streamed factory demo](http://127.0.0.1:8092/factory-terrain.html) places those facilities in classic terrain. Travel away, return, close terrain or recreate views: Workshop state and fixed facility IDs survive visual eviction and rebuilding. It uses separate in-memory terrain, with no changes to existing saved worlds. See [ownership and time policy](docs/STREAMED-FACTORY.md).

Camera controls and two independent streamed views: `camera-terrain.html`. See [camera contracts](docs/CAMERAS.md).

Reusable world-space indexing and factory object picking: [contracts](docs/SPATIAL-PICKING.md).

The [construction and staffing demo](http://127.0.0.1:8092/factory-terrain.html?transport=1&workshop=1) adds paid timed sites, cancellation, per-building pause and explicit on-site operators using Workshop 2. It reuses terrain placement, spatial picking and camera controls. See [feature contracts](docs/WORKSHOP-FEATURES.md).

The [finite navigation demo](http://127.0.0.1:8092/navigation.html) shares one walking actor across two views, with swept clearance, terrain costs, obstacle changes, unknown data, cancellation and revision-driven replanning. See [navigation contracts and limits](docs/NAVIGATION.md).

The [workplace journey demo](http://127.0.0.1:8092/navigation-workshop.html) connects actual operator arrival to Workshop attendance on a finite map. One operator walks between Smelter and Press while two views observe one simulation. See [integration boundaries](docs/WORKPLACE-JOURNEYS.md).

The [streamed workplace demo](http://127.0.0.1:8092/navigation-workshop-streaming.html) reuses that adapter with actor-owned terrain demand and bounded asynchronous routes. Arrival starts attendance; departure or blocked/unknown local terrain clears it. Map and Workshop diagnostic views can both close while the simulation continues. Try the Smelter, then the Press, and block an entrance to prove that there is no remote work.

Explicit **Save worker + Workshop** in that demo atomically checkpoints production/cargo, worker pose and assignment, and terrain edits in an isolated IndexedDB slot. Reload validates the checkpoint before startup, rebuilds unfinished routes and gates attendance on terrain readiness. Terminal failures remain stopped. No offline progression or previous-format migrations are applied.

The `navigation-staffing.html` proof adds two workers, exclusive slot reservations and one aggregate attendance coordinator. Competing claims preserve existing assignments; cancellation/disposal releases only the owning worker's slot and terrain demand. The separate staffing checkpoint restores worker identities and reservation associations without trusting saved attendance. See [staffing contracts](docs/STAFFING.md).

Optional DOM UI demos: [basic panels and controls](http://127.0.0.1:8092/ui-panels.html) and [full chat box](http://127.0.0.1:8092/ui-chat.html). Import the `./ui` module and its stylesheet for small view-owned panels, native list/table/grid/form/button/message helpers and shared host-owned chat presentation. See [UI boundaries and API](docs/UI-PANELS.md).

The [actor streaming demo](http://127.0.0.1:8092/navigation-streaming.html) retains terrain for an actor independently of two camera views. Close both canvases during a tour: one keepAlive scene continues simulation. See [actor-demand contracts and routing limits](docs/STREAMED-NAVIGATION.md).

The [streamed corridor demo](http://127.0.0.1:8092/navigation-streaming.html) now accepts farther destinations, grows a bounded search corridor around obstacles, distinguishes resource limits from unreachable, and retires passed route data. See [current route contracts](docs/STREAMED-ROUTES.md).

Character integration: [Mara and the Old Grove](http://127.0.0.1:8092/character-dialogue.html), with [ownership and limits](docs/CHARACTER-DIALOGUE.md).

New integration demos: [sprites](http://127.0.0.1:8092/sprites.html) and
[worker terrain](http://127.0.0.1:8092/terrain-workers.html), with the existing
[main-thread terrain baseline](http://127.0.0.1:8092/terrain-streaming.html).
See [integration usage and boundaries](docs/INTEGRATION-DEMOS.md).

Both terrain comparison pages now share a repeatable six-stop camera route, adjustable
generation passes and per-run frame-spike/readiness results with copyable JSON.

## 3D milestones

Start with [01 · Grid & camera](http://127.0.0.1:8092/3d-grid.html): perspective lines on Canvas 2D, using Rocket timing, input and scene ownership. Source lives in `examples/3d/`. Each later milestone gets a separate demo page; see [the sequence and boundaries](docs/3D-MILESTONES.md).

The reusable foundation is available through the optional `rocket-engine-v2/3d` entry point. [06 · Reusable foundation](http://127.0.0.1:8092/3d-foundation.html) demonstrates shared indexed geometry, independent materials and parent/child transforms. See [the API and ownership guide](docs/3D-API.md). [07 · Visibility & depth](http://127.0.0.1:8092/3d-visibility.html) compares painter ordering with an optional CPU depth buffer on intersecting surfaces. [08 · GLB model loading](http://127.0.0.1:8092/3d-model.html) imports cockpit v3 with a free camera, pilot reset and local-file model replacement.

[02 · Wireframe cube](http://127.0.0.1:8092/3d-cube.html) adds local object transforms and optional rotation to the same grid/camera/performance baseline.

[03 · Solid cube](http://127.0.0.1:8092/3d-solid.html) adds clipped, culled solid-colored faces and face counts, preserving the earlier wireframe page.

[04 · Cockpit frame](http://127.0.0.1:8092/3d-cockpit.html) composes thirteen box parts with a shared parent transform, seated and exterior camera presets, and the same performance readout.

[05 · Cockpit overlay](http://127.0.0.1:8092/3d-overlay.html) draws the cockpit artwork over the 3D reference grid, with a visibility toggle and existing camera/performance controls.

[09 · Independent lighting](http://127.0.0.1:8092/3d-lighting.html) demonstrates scene-owned ambient/directional diffuse lighting separately from model loading, with lit/unlit comparison and independent object/light controls.

[10 · Point lights](http://127.0.0.1:8092/3d-point-light.html) adds a movable scene-owned lamp, inverse-square falloff and floor sampling controls using the same reusable lighting pass.

[11 · WebGL triangle](http://127.0.0.1:8092/webgl-triangle.html) starts the optional WebGL2 backend with one triangle, shared Rocket frame/performance ownership, GPU resource cleanup and context-loss/restoration diagnostics.

- [12 · WebGL meshes and depth](http://127.0.0.1:8092/webgl-meshes.html): existing scene data, GPU occlusion, and a CPU depth-renderer comparison.
- [13 · Per-pixel GPU lighting](http://127.0.0.1:8092/webgl-lighting.html): independent lights, fragment shading, normal transforms and CPU flat-lighting comparison.

- [14 · Base-color textures](http://127.0.0.1:8092/webgl-textures.html): reusable image/material/sampler boundaries, the cockpit surface maps, filtering/mipmaps and GPU color diagnostics. Base color only; full textured GLB/PBR remains a later slice.
- [15 · Metallic & roughness](http://127.0.0.1:8092/webgl-materials.html): view-dependent direct-light GGX highlights, scalar material controls, optional base-color maps and a Lambert comparison.
- [16 · Packed material maps](http://127.0.0.1:8092/webgl-material-maps.html): source cockpit ORM maps, linear data sampling, channel inspection, material multipliers and ambient-only occlusion.
- [17 · Normal mapping](http://127.0.0.1:8092/webgl-normals.html): tangent-space surface detail, source cockpit normal maps, normal inspection and affine/mirror readback checks.
- [18 · Textured cockpit](http://127.0.0.1:8092/webgl-cockpit.html): the original v4 GLB with embedded base-color, packed material and normal maps, pilot/exterior poses and the same reusable GPU backend.
- [19 · Environment reflections](http://127.0.0.1:8092/webgl-environment.html): procedural environment lighting, GGX roughness filtering, diffuse irradiance, split-sum lookup and independent direct-light comparison.
- [20 · Cockpit environment](http://127.0.0.1:8092/webgl-cockpit-environment.html): the shared cockpit model with adjustable studio reflections, independent direct lighting, source previews and existing navigation controls.
- [21 · Directional shadows](http://127.0.0.1:8092/webgl-shadows.html): retained depth pass, independent casting/receiving, resolution/coverage/bias controls, hard vs PCF and visibility inspection.
- [22 · Cockpit shadows](http://127.0.0.1:8092/webgl-cockpit-shadows.html): shadowed directional lighting through the original cockpit, a model-fitted moving shadow volume, independent environment fill and existing navigation.
- [23 · Dynamic textures](http://127.0.0.1:8092/webgl-dynamic-textures.html): revisioned canvas-to-texture updates shared across 3D surfaces, independent update cadence, pause/single-step controls and upload counters.
- [24 · Cockpit instruments](http://127.0.0.1:8092/webgl-cockpit-displays.html): radar on the left display, telemetry on the right, independent dynamic textures and update cadence, with lit cabin materials and directional shadows.
- [25 · Bloom](http://127.0.0.1:8092/webgl-bloom.html): reusable offscreen targets, half-resolution bright extraction and separable blur, linear-color compositing, stage inspection and GPU pixel checks.
- [26 · Cockpit bloom](http://127.0.0.1:8092/webgl-cockpit-bloom.html): the v5 cockpit with five live displays, directional shadows and subtle bloom; stage inspection, resolution scaling and independent diagnostic views.
- [27 · Screen light spill](http://127.0.0.1:8092/webgl-cockpit-spill.html): five model-attached point lights approximate display illumination; independent bloom, light isolation, strength and coupled display power controls.
- [28 · Asteroid field](http://127.0.0.1:8092/webgl-asteroids.html): a finite seeded field of shared faceted rock meshes, free camera, native resolution and CPU/GPU metrics.
- [29 · Cockpit asteroid field](http://127.0.0.1:8092/webgl-cockpit-asteroids.html): the v5 cockpit flies through the seeded world, retaining live displays, cabin shadows, bloom and performance metrics.

## Experimental API branch

`experiment/api-ergonomics` adds a runnable [API experiment](http://127.0.0.1:8092/api-experiment.html),
[implemented API](docs/API-EXPERIMENT.md) and [findings](docs/API-EXPERIMENT-FINDINGS.md).
The consolidated runtime remains on main; this experiment is separate for review.
