# Rocket delivery history

Archived from the roadmap on 2026-10-13. Entries describe their original delivery
state, package versions and verification counts. Later entries may supersede earlier
"deferred" notes. For current status and remaining work, use [the roadmap](ROADMAP.md).

Status: direction and proposed milestones. No dates or implementation estimates are committed.

## Delivery discipline

For each stage: sketch a consumer API, build the smallest working slice, verify important contracts, try a second distinct use case, then document supported behavior. Examples become executable documentation. Favor meaningful lifecycle and state tests over tests that merely mirror code.

Use ordinary JavaScript objects/classes, Map and Set. Typed arrays suit dense numeric data. Profile hot paths before introducing pooling, elaborate indexes, or workers. Explicit cleanup remains necessary despite garbage collection. TypeScript is the source language, emitting native JavaScript modules and declarations. Strict type checking, type-aware linting and formatting checks apply to runtime, demo and tests; JavaScript consumers remain first-class.

## First milestone: runtime and views

Initial slice delivered 2026-10-11: plain scenes, one frame loop, start/stop/dispose, optional preparation, two cameras on one scene, inverse/CSS-scaled picking, explicit resize/DPR and screen overlays. Twelve focused tests passed at delivery, plus browser checks for pause/resume, zoom/picking and full restart. See [runtime API](RUNTIME.md).

Foundation review added ownership enforcement, synchronous frame-hook enforcement, path isolation, immediate view unregistration and an optional FPS/CPU monitor. The suite now has 21 passing contract tests. See [review findings and remaining boundaries](FOUNDATION-REVIEW.md).

Still deferred within the broader stages: generic layer management, automatic container sizing, transitions/activity hooks, broader fixed-node behavior hooks and general layer caching. Optional fixed scene timing and the concrete tile cache are now delivered. The foundations do not imply that every exit item or planned feature is complete.

### 1. Runtime foundation

Build one animation loop, explicit seconds-based timing, plain-object scenes, canvas sizing, start/stop/dispose and clear error propagation. Simple scenes require no service installation or node hierarchy.

Examples: moving rectangle; procedural animation using elapsed time.

Exit: tiny setup; animation speed independent of display refresh; start/stop cannot create duplicate loops; disposal releases resources; loading/start failures are observable. Fixed-step overload policy is explicit before physics is added.

### 2. Views and rendering

Separate scene state from view presentation. Add multiple canvases, camera transforms and inverse conversion, world/screen layer ordering, resizing and pixel-ratio handling. Canvas 2D is the first supported backend.

Examples: two cameras viewing one animation; screen overlay above world drawing.

Exit: scene updates once regardless of view count; views render independently; coordinate round-trips and picking agree; one canvas cannot leak context state into another; resize is correct.

## Composition and optional facilities

### 3. Nodes and behaviors

Initial composition slice delivered: Node2D transforms/ownership, Scene2D integration, synchronous plain-object behaviors, stable mutation-safe traversal and a reusable articulated-arm demo. 33 contract tests pass. See [implemented node API](NODES.md). Scene membership hooks, subscription scopes and world-preserving reparenting remain deferred.

Add Node2D local/world transforms, child ownership, safe reparenting, behavior hooks, factories returning subtrees/public interfaces, scoped signals and disposal handles.

Examples: articulated machine; nested visual composition with detachable parts.

Exit: no doubled transforms or updates; destruction differs from detachment; mutations during traversal are safe; destroyed behaviors and subscriptions stop running; repeated disposal is harmless.

### 4. Services, assets and input

Initial slice delivered: synchronous application services, scene/view resource ownership, focus-scoped keyboard actions and primary pointer snapshots. The arm demo supports selection, dragging and keyboard movement through both views. The first asset slice is also delivered: scene-owned image leases, shared fetch/decode across both views, retryable failures and cancellation/cleanup. All 112 tests pass after streamed procedural terrain. See [implemented input API and defaults](SERVICES-INPUT.md) and [image assets](ASSETS.md). Async service lifecycle, other asset kinds and dependency declarations remain deferred.

Add explicit shared-service installation, scene facilities, declared behavior dependencies, asset leases, scoped input/actions and optional camera controllers. Resolve required services before activation; no engine-wide service locator on every node.

Examples: interactive diagram with pan/zoom/selection; a minimal Production Workshop presentation adapter (no terrain or physics required).

Exit: missing dependencies fail clearly; scopes clean up; frame and fixed input edges are delivered once; reusable objects accept narrow dependencies; simple animation API remains small.

Integration checkpoint: display facility state and issue host commands without copying inventory authority or advancing production twice. Verify the clock bridge against the current Workshop contract.

## Practical world features

### 5. Spatial data and rendering caches

Second-consumer checkpoint delivered: a finite editable tile board with signed coordinates, a reusable presentation node and two cameras, plus a third canvas with an independent read-only activity dashboard sharing the same data. Closing one view preserves data/input; reset cleans presentation and bindings. No new core API was needed. See [checkpoint findings](TILE-BOARD.md). The next cache slice is delivered: a larger finite board, visible-region drawing, shared terrain canvases, regional edit invalidation and bounded LRU retention. See [cache contracts](TILE-CACHE.md). Object spatial indexing remains deferred.

Separate object storage from spatial indexing. Start with a uniform grid, finite tile data, signed chunk lookup, dense tile arrays, bounds/revisions and explicit cache invalidation.

Examples: editable terrain viewer; objects selectable through two views.

Exit: negative coordinates and boundary queries work; indexes don't retain stale membership after movement; edits invalidate dependent regions; caches have measurable memory bounds; camera movement reuses valid world artwork.

### 6. Local physics

Timing prerequisite delivered: opt-in fixed scene updates, bounded catch-up with excess whole-step dropping, independent frame/fixed input edges and observable timing counters. See [fixed timing](FIXED-TIMING.md). An optional scene-owned Matter.js candidate now demonstrates falling boxes, static platforms, a sensor, independent diagnostics and post-solver contacts. See [prototype findings and limits](PHYSICS-PROTOTYPE.md). The separate physics module adds seconds-based velocity commands and a fixed-input controlled box. Targeted removal preserves unrelated native contact caches, with identity and resting-stack checks. A backend-independent adapter contract and final backend selection remain deferred.

Select a physics backend or deliberately limited custom solver through a prototype. Introduce one local world, explicit units, static/dynamic bodies, controlled movement, sensors and fixed-step integration.

Examples: small platformer; independent physics sandbox.

Exit: physics owns dynamic poses; draw doesn't mutate simulation; collisions are independent of visibility; contact callbacks occur after solver work; body/node cleanup is reliable. Scope of supported collision detection is documented.

### 7. Streaming and persistence

Initial in-memory slice delivered: signed 8 × 8 chunk addresses, camera demand with one-chunk prefetch/retention margin, a 40-record bound including queued chunks, visible-first generation budget and write-through sparse edits surviving eviction and stream recreation. A second draw-only canvas reads loading/retention/edit state. All 84 tests pass. See [contracts and limits](CHUNK-STREAMING.md). Browser persistence is now delivered through a host-owned IndexedDB edit store: validated loading gates terrain readiness, serialized/coalesced saves track uncommitted revisions, failures retain memory edits for explicit retry, and committed edits survive reload. All 91 tests pass. See [persistence contracts](BROWSER-PERSISTENCE.md). The async loading slice is now delivered: configurable delayed base generation, four occupied job slots, bounded pending records, controller-phase publication, stale-result rejection, cooperative cancellation, explicit retry and current-edit overlays. All 98 tests pass. See [async chunk contracts](ASYNC-CHUNKS.md). Multiple demand owners are now delivered: two independently controlled terrain views share one chunk map and four-slot scheduler, with a 64-record union bound, shared-chunk deduplication and per-view ownership cleanup. Closing the last terrain view releases all demand while read-only diagnostics keep reporting. All 103 tests pass. See [demand ownership](MULTIPLE-DEMANDS.md). Workers and application checkpoints remain deferred.

Add demand handles, generation/loading jobs, prefetch and retention margins, revision-aware edits, durable saves, eviction and readiness states. Integrate terrain exploration with production facilities through stable application IDs.

Examples: edit terrain, leave and revisit; save/restart with ongoing production and a delivery.

Exit: edits survive eviction/restart; save failure never silently discards changes; stale jobs are rejected; pending terrain differs from empty terrain; unified application checkpoint policy covers host state as well as each subsystem.

### 8. Optional navigation and movement

Status: finite-world contracts and proof delivered in the optional navigation module. Grid traversal, circular clearance, rectangular obstacle footprints, weighted four-neighbor routes, blocked/retry/replanning and one pose owner are covered by a separate two-view demo. All 184 tests pass. See [contracts and limits](NAVIGATION.md). These are the initial shared contracts for character-framework review; no external framework integration is claimed. This does not make character intelligence or CompanionAI a Rocket dependency.

Rocket owns optional reusable navigation facilities: route queries, reachability, route distance/cost estimates and replanning against game-supplied traversal rules and relevant world changes. Rocket also owns optional movement controllers: route following and steering integrated into its existing update order, actual position and collision feedback. Physics remains authoritative for dynamic body poses; characters and visual nodes must not independently overwrite them.

The game supplies terrain/road rules, actor traversal capabilities, permitted destinations and gameplay consequences. The character framework owns intentions, decisions and action orchestration: choose a destination, request a journey, observe progress, cancel or interrupt it, and decide what to do after arrival or failure. Scripted behaviors, player commands and intelligent characters use the same movement capability. Rocket navigation/movement must work without the character framework or CompanionAI.

First checkpoint: jointly define narrow navigation query/estimate and movement request/status/cancellation contracts. Specify actor identity, coordinate spaces/units, traversal capabilities, readiness, relevant world revisions, lifecycle ownership and blocked/unreachable/arrived/cancelled outcomes. A request returns a journey handle rather than claiming immediate arrival. Keep shared contracts independent of scene nodes, native physics objects, Workshop inventories and CAI transport. Exact API names and package placement remain design decisions.

Then build a finite-world proof: one scripted actor routes around an obstacle, follows the route and reports actual arrival or failure; player control and an external decision provider can use the same surface. Start with the smallest justified navigation/movement mechanisms, not a universal vehicle or character system. The character framework can initially use fake adapters to the reviewed contracts. Those fakes are not a second production pathfinding or locomotion implementation.

Exit: one movement/time owner per actor, no duplicate route or world-state authority, consistent progress/cancellation and cleanup, no doubled movement across two views, and clear distinction between a path estimate and successful physical arrival. Perception and movement queries may consume the planned general spatial index; do not treat demo presentation buckets as a complete navigation world.

Streaming checkpoint is separate: actor/path demand must outlive camera demand when appropriate; unloaded terrain is unknown, not automatically walkable. Define readiness and collision-data lifetime before actors traverse streamed regions. Closing a presentation view must not destroy actors or stop their journeys. Streamed physics, swept demand and origin shifting remain separate future milestones; they are not prerequisites for the finite-world proof.

Boundaries: do not implement a competing pathfinder, locomotion loop or physical world model inside character intelligence. AI proposes actions; the game validates gameplay operations, Workshop owns production/cargo, and CompanionAI Next supplies optional reasoning/dialogue. No automatic migration of their repositories or game rules into Rocket.

### 9. Optional game UI and dialogue/chat presentation

Status: basic optional DOM panel and scripted chat proof delivered. Lists, tables, grids, buttons, forms, message tones and a two-view chat box demonstrate presentation, focus and lifecycle without character/quest domain logic. See [panel and chat contracts](UI-PANELS.md). The separate character framework can later supply the conversation port; no external integration is claimed.

Rocket provides reusable UI mounting/lifecycle and view association, screen-space presentation, and input focus coordination. Start with a DOM overlay/panel beside or above a canvas for accessible text, native scrolling and text entry; do not build a general canvas widget toolkit or GUI editor. Review the minimal mounting API before introducing a core service. Focused text entry must suppress gameplay keyboard actions for the relevant view, including WASD; closing or disposing the panel releases listeners and focus ownership without leaving held input stuck. Multiple views must not duplicate dialogue commands or own the conversation itself.

The character framework owns quest state/progression, dialogue sessions, choices, chat content and decision orchestration. CompanionAI Next can provide optional backend reasoning/dialogue through the character/game adapter; Rocket does not own AI requests, prompts, memory or character inventories. The game validates actions and consequences, selects interaction targets, decides when a conversation opens and whether simulation pauses, and defines persistence policy. UI displays snapshots/events and submits narrow host commands; it never awards quest rewards, changes authoritative inventory or advances character simulation itself.

First checkpoint: agree renderer-independent conversation/message and choice presentation contracts, stable session/message/choice identities, command/result correlation, pending/error/retry/cancellation states and subscription ownership. Streaming text is optional; account for stale results after session changes and view/panel closure. Do not create a second dialogue or quest model inside Rocket, and do not require the character framework to depend on Rocket nodes, DOM elements or canvas objects.

Then prove a small dialogue/chat panel with a scripted provider: speaker/text, selectable responses, optional free-text entry, loading/error feedback and close/reopen. Verify keyboard focus against camera controls, resize, panel disposal and two views observing one shared session. A quest summary/log can consume the character framework's read model afterward; quest authoring and progression remain outside Rocket.

Exit: dialogue works without CompanionAI, gameplay input respects text focus, asynchronous replies cannot update a disposed or replaced session, one user action dispatches once across views, and UI closure has an explicit conversation cancellation/detachment policy. No external character-framework changes or messaging are implied by this roadmap entry.

## Terrain integration checkpoint

Standalone generator foundation delivered: deterministic seeded gradient-noise fields, normalized height/moisture, six simple biome classes and caller-owned typed-array chunk outputs. World samples are independent of canvas size, partition size, query order and other generators. A separate terrain demo compares biome/elevation presentations, generation order and signed-region travel. All 107 tests pass. See [generator contracts](PROCEDURAL-TERRAIN.md). Streamed presentation and versioned edit storage are now delivered in a separate demo: six-biome base palettes and overrides, atomic linked-camera demand batches, four async job slots, bounded shared biome/elevation raster caches, and save namespaces per version/seed/scale. All 112 tests pass. See [adapter contracts](STREAMED-PROCEDURAL-TERRAIN.md); the existing three-state streaming world keeps its original save key and defaults. Production Workshop remains a separate subsequent integration step.

## Optional experimental milestones

- Quadtree spatial indexing: compare with the grid for measured distributions.
- Quadtree terrain LOD: coarse overview tiles refine with zoom; preserve coverage during loading.
- Worker generation: measure responsiveness, transfer costs, priorities and cancellation.
- Large-world addresses: chunk/local addressing, serialization and origin shifting.
- Streamed physics: readiness frontier, swept demand and rebasing in one active region.
- Multiple physics regions: explicit transfer first; automatic merge/split only if justified.
- GPU rendering: justify a second backend with actual workloads.
- Planet approach/landing: an exploration combining LOD and large-world mechanisms, not the core product specification.

## Boundaries

No editor, full ECS, automatic physics-region splitting, planetary renderer, or abstract backend suite is required for the foundations. A rectangle, diagram, terrain explorer and simulation must remain distinct consumers. Do not migrate old repositories or absorb Workshop into Rocket without a separate implementation decision.

### Classic terrain presentation proof

Delivered as a separate `terrain-tiles.html` demo: original 16 × 16 terrain and vegetation images, data-driven atlas coordinates, full-frame edge/corner overlays checked across all 256 neighbor masks, analytic neighbor halos, bounded ground caches, and world-feet depth ordering shared by trees and a movable walker. The diagnostic canvas reads the same state. Existing field and streamed previews remain available; this presentation uses the new generator rather than reproducing the old noise algorithm. All 116 tests pass. See [contracts and limitations](CLASSIC-TERRAIN.md).

### Tile-friendly terrain derivation

Delivered in the classic tile demo: optional morphology and a bounded slope envelope between raw height tiers and atlas resolution. A finite halo makes independently processed regions agree; source fields remain untouched. Data caching, raw/processed comparison and statometer counters are included. All 120 tests pass. This is an atlas-specific derivation step; editable terrain invalidation and persistence integration remain separate.

### Cached decoration generation

Delivered in the classic tile demo: restored terrain/height-band palettes, independent seeded placement and variant streams, smooth clusters, bounded per-region records, cached ground details, sprite-bounds culling and actor/object depth interleaving. Generation counters and per-region timings distinguish generation from steady frame work. Invalidating terrain mode rebuilds records and raster images together; disposal releases both. All 124 tests pass. Async decoration jobs, live edits and persistence remain separate steps.

### Streamed classic terrain presentation

Delivered: a third native 16 × 16 classic view sharing the procedural stream and existing six-biome edits. Explicit override-to-tier mapping, loaded neighboring chunks, edit-sensitive raster/decoration invalidation, bounded artwork builds, scale-correct world centers/picking, and view-owned demand/assets/caches are included. All 127 tests pass. See [contracts](STREAMED-CLASSIC-TERRAIN.md). Production Workshop, streamed actors/collisions and persistent height edits remain separate slices.

### Production Workshop bridge

Delivered as a separate `workshop.html` demo: pinned local Workshop 1.0.0 package, an ore → alloy → parts chain, one stockpile, one elapsed-time owner and two independent canvas presentations. Workshop remains authoritative for stock, reservations, job progress and blocking. View removal, pause, collection, facility disabling, reset and coordinator disposal are included. All 130 tests pass. See [contracts](WORKSHOP-DEMO.md). Terrain placement, transport, persistence and chunk eviction policies remain subsequent integration steps.

### Factory placement in streamed terrain

Delivered as `factory-terrain.html`: page-owned Workshop and fixed facility-to-cell placements, view-owned building records tied to ready artwork, shared feet ordering with vegetation, and a bounded asynchronous terrain stream. Production advances while factory chunks are evicted or the terrain view is closed. Return/recreate restores presentation without rebuilding domain facilities or stock. All 132 tests pass. See [contracts](STREAMED-FACTORY.md). Construction, transport, persistence and dormant simulation policies remain separate slices.

### Streamed factory stress checkpoint

Delivered: opt-in 6,000-facility main-thread terrain mode with 2,000 independent production chains, seeded placements around the origin, nearby presentation queries and sparse per-view snapshots. The existing three-building demo remains available. All 146 tests pass. This tests population scaling and visibility-independent production; construction rules, workers and durable factory checkpoints remain separate steps.

### Interactive facility placement

Delivered in normal `factory-terrain.html`: Mine/Smelter/Press selection, green/red 3 × 2 foundation previews, ready-land and occupancy validation, free Workshop-owned creation and page-owned stable placements. New facilities and occupied foundations survive terrain eviction and presentation recreation. Stress mode remains fixed. All 149 tests pass. Transport, material construction costs, slope constraints, removal and factory persistence remain separate steps.

### Combined normal-factory checkpoint

Delivered: explicit atomic IndexedDB Save and automatic validated restore for normal factory mode, combining Workshop state, placements, terrain identity and host counters. Occupancy is rebuilt; active jobs and pending production time resume without offline progression. Load failure gates startup and preserves saved data; failed writes retain the previous checkpoint and live memory. Stress mode remains separate. All 153 tests pass. Autosave, conflict detection, transport and offline progression remain subsequent decisions.

### Timed transport proof

Delivered in a separate transport mode: private facility input/output buffers, demand-driven bulk cargo, tick-based journeys, fair shared suppliers, draw-only moving markers, continued logistics without terrain views, and version-2 checkpoints restoring in-transit cargo. The existing normal and stress modes remain available. All 157 tests pass. This completes the small save/restart-with-production-and-delivery example; roads, carrier physics, removal, richer routing and offline policies remain future decisions.

### Inspection and dismantling proof

Delivered in normal/transport factory modes: building selection, job/buffer/route inspection, Workshop-owned drain/resume, cargo-preserving route disconnection, guarded explicit removal, material salvage, footprint/visual release, and checkpoints preserving retired production history and draining routes. All 161 tests pass. Full inventory cleanup waits for an upstream guarded inventory-retirement API; the current Workshop package retains empty buffers, explicitly counted in diagnostics. No save-data rewriting or duplicated inventory authority was introduced. Construction costs remain a separate next slice.

### Optional camera controls

Delivered: view-owned controllers through an optional Cameras service, pan with analytically integrated inertia, cursor-anchored wheel/programmatic zoom, rendered forward/inverse coordinate conversion and four-corner viewport bounds. A separate two-view streamed terrain demo proves independent focus/zoom, shared edits, viewport-aware demand and controller/demand cleanup. All 165 tests pass. Rotation remains deferred behind the affine transform; follow targets and camera bounds are separate future additions. See [camera contracts](CAMERAS.md).

### Factory camera reuse

Delivered: the factory terrain demos reuse Cameras for pan/inertia and anchored wheel/stepped zoom (0.75–4×). Rendered viewport bounds drive picking, placement, culling and demand; adaptive prefetch preserves the existing 224-chunk cap. Diagnostics remains independent, and camera teardown does not remove production state. All 166 tests pass.

### Workshop 2 dependency checkpoint

Delivered: pinned Workshop 2.0.0, save format 4, one current factory checkpoint envelope (version 3), fresh mode-specific save slots and required current fields with no legacy loaders or migrations. Transport building removal now retires empty private buffers through Workshop, with monotonic buffer identity across save/reload and repeated removal. All 167 tests pass. Timed construction/cancellation and attendance are available upstream but require a separate Rocket demo slice; current placement remains instant/free. Historical milestone descriptions above describe their original delivered versions.

### Spatial index and object picking

Delivered: optional caller-owned uniform-grid SpatialIndex, signed world bounds, atomic membership updates, local rectangle/point queries and consumer-defined frontmost picking. Factory presentation reuses it for building queries and ready decoration picking; body/roof geometry and sprite bounds resolve with the existing draw comparator. Zoomed selection and removal/eviction/view cleanup are covered. All 172 tests pass. Alpha picking, navigation and movement remain separate future slices. Workshop construction/attendance presentation is next; it consumes these queries without duplicating spatial or selection mechanisms. See [contracts](SPATIAL-PICKING.md).

### Paid construction and on-site staffing

Delivered in `factory-terrain.html?transport=1&workshop=1`: Workshop-owned material reservation, timed construction, cancellation, attendance and per-building pause. Rocket reuses spatial picking, terrain placement and camera controls; pending sites reserve footprints and become facilities through explicit completion facts. Active sites, materials, attendance and production pause survive save/reload in the current version-4 factory envelope, with no legacy loaders or migrations. All 176 tests pass. See [contracts](WORKSHOP-FEATURES.md).

Operator presence is an explicit demo command; population, worker travel, navigation and material hauling remain future slices. Navigation and movement stay in Rocket, decisions in the character framework, and production/inventory authority in Workshop.

### Finite navigation and movement proof

Delivered as `navigation.html`: signed finite grid, game-defined capabilities/terrain cost/readiness, swept circular clearance against explicit obstacle footprints, deterministic bounded four-neighbor search, moving/blocked/arrived/unreachable/cancelled journey snapshots and revision-driven or manual retry. Two views share one scene-owned controller, with view listener cleanup and stable terminal poses. All 184 tests pass. Search limits and unknown data are distinguished from unreachable; physics, crowd avoidance, streamed actor demand and Workshop attendance-on-arrival remain future work. The existing runtime pauses scenes when their last view closes; view-independent simulation ownership needs an explicit later decision. See [contracts](NAVIGATION.md).

### Workplace arrival and attendance proof

Delivered as `navigation-workshop.html`: one finite-world operator walks to game-selected entrances outside blocking footprints. A game adapter grants Workshop attendance only after validated arrival, revokes it on reassignment/release or invalid local readiness, and cancels missing/relocated workplace assignments. One fixed scene owns movement and production across map/diagnostic views; cleanup clears attendance before domain disposal. All 189 tests pass. See [contracts](WORKPLACE-JOURNEYS.md). Streamed actor/path demand and readiness, camera-independent simulation ownership, assignment persistence and multi-actor staffing allocation remain separate prerequisites for integrating this with the streamed factory.

### Actor-owned terrain demand and zero-view simulation

Delivered as `navigation-streaming.html`: explicit optional keepAlive scenes, actor-local demand independent of cameras, short-leg demand, ready-only swept traversal, signed chunk crossings, shared bounded load jobs and cancellation/arrival/disposal cleanup. Both terrain views can close while simulation continues; reopening observes the existing pose. All 195 tests pass. See [contracts and limits](STREAMED-NAVIGATION.md). This is the first streamed-navigation prerequisite, not unrestricted world routing. Bounded route-corridor expansion, streamed workplace integration and actor/assignment persistence remain subsequent slices.

### Bounded streamed route corridors

Delivered in `navigation-streaming.html`: one farther destination, ready-only chunk-aligned search corridors, bounded expansion around obstacles, explicit corridor/search/shared-demand limit outcomes, shrinking remaining-path retention, retarget/cancel cleanup and relevant readiness fingerprints. The route policy delegates to the existing GridNavigator and Movement through a narrow RoutePlanner contract. Full known finite-domain no-route is distinct from budget exhaustion. All 202 tests pass. See [contracts and limits](STREAMED-ROUTES.md). Streamed workplace assignment integration is next; actor/assignment saves, staffing allocation, unrestricted world routing and worker-based search remain separate slices.

### Search-area presentation clarification

Improved the corridor demo without changing navigation rules: actual search-area outlines and outside shading, visible opening/world boundary, labelled actor/target, readable waiting/budget feedback, fitted journey view, synchronized shortcut destinations and an explicit reset for repeatable comparisons. Technical counters and optional cleanup controls are grouped under diagnostics. All 202 checks remain green.

### Streamed workplace journeys

Delivered in `navigation-workshop-streaming.html`: the existing workplace adapter consumes the existing actor-owned streamed movement through a small movement port. Arrival and local terrain readiness gate Workshop attendance; reassignment, cancellation and blocked/unknown entrances revoke it before production. One keepAlive fixed scene owns readiness publication, production and movement across map/diagnostic views, including zero-view continuation and immediate route-demand cancellation. Bounded asynchronous load failures remain retryable. All 209 tests pass. See [workplace contracts](WORKPLACE-JOURNEYS.md). Actor/assignment checkpoints and multi-worker attendance allocation are the next separate decisions; physical hauling, character intentions and unrestricted navigation remain outside this slice.

### Worker and assignment checkpoint

Delivered in the streamed workplace demo: one version-1 atomic IndexedDB checkpoint combines native Workshop state, precise worker pose, assignment phase/entrance and terrain edits. Loading gates startup; failed saves preserve the last checkpoint and live state. Attendance is cleared through Workshop and validated again against ready terrain. Active journeys rebuild routes; arrived facts and unreachable terminal outcomes remain distinct, with retry decisions left to the game. No offline time, chunk/route snapshots, migrations or alternate restore paths. All 214 tests pass. See [checkpoint contracts](WORKPLACE-JOURNEYS.md). Multi-worker identity and exclusive staffing allocation are next; physical hauling and character orchestration remain separate.

### Two-worker exclusive staffing allocation

Delivered in `navigation-staffing.html`: two stable worker identities, one game-side reservation/attendance coordinator, exclusive slot claims, atomic conflict rejection, arrival-only aggregate attendance, and independent movement/demand cleanup. Temporarily blocked workers retain claims; cancellation, disposal, missing/relocated slots and terminal failure free them. One atomic checkpoint stores surviving workers and validated reservation associations; readiness gates restored attendance and disposed workers do not respawn. All 224 tests pass. See [staffing boundaries](STAFFING.md). Character decisions, physical actor collision/crowd avoidance, schedules and cargo vehicles remain separate.

### Basic panels and chat presentation

Delivered as `ui-panels.html` and `ui-chat.html`: optional `./ui` module, modeless view-owned panels with optional close buttons, native content/form helpers, plain-text messages and a full scripted chat box. Two views share one simulation and one host-owned conversation; typing leaves gameplay input quiet, closing detaches presentation, and disposal releases listeners/subscriptions. Session/request identity, pending/error/retry/cancellation and stale-result guards are covered. All 229 tests pass. See [contracts](UI-PANELS.md). Actual character/CompanionAI integration, quests, rich text, modal policy and movable/resizable windows remain separate slices.

### Factory inspection panels

Delivered in the factory terrain demo: the optional Panel now presents existing building/site snapshots and original Workshop command controls, with one selection and no duplicate domain logic. Closing preserves simulation; removal/cancellation hides stale inspection; terrain teardown owns panel cleanup while diagnostics continue, and recreation reuses commands. Browser checks cover production pause/resume, attendance gating, close/reopen/focus, removal and view recreation. All 229 tests and TypeScript/lint/format/build checks pass. Character chat integration remains a separate contract-driven slice.

### Scripted character dialogue and quest integration

Delivered as `character-dialogue.html`: one actual CFW runtime and narrative system, one spatially picked Mara NPC, two shared chat presentations, host-authenticated choices and a game-owned physical visit fact from Rocket movement. The host validates proposals; CFW owns offers/progress/completion. Local queued cancellation, safe injected failure/retry, bounded UI history and independent view cleanup are covered. The browser core is a pinned dependency; no duplicate quest runtime, live CAI or remote cancellation assumption. All 233 tests and TypeScript/lint/format/build checks pass. See [contracts and limitations](CHARACTER-DIALOGUE.md). Live backend receipt/reconciliation, character checkpoints and general action adapters remain separate slices coordinated with CFW.

### Independent sprite and worker package consumers

Delivered `sprites.html`: pinned standalone animation/Canvas2D package, reusable scene-owned players sharing one image lease across two cameras, nested transforms, flips/picking, independent playback and cleanup. Delivered `terrain-workers.html` as a separate comparison to `terrain-streaming.html`: the same generator, rendering and saves, with a bounded native pool replacing only base-biome loading. ChunkStream retains demand/edit/publication authority. CPU/frame/queue/cancellation diagnostics expose costs without claiming a speedup. See [usage and limits](INTEGRATION-DEMOS.md). General sprite services, workers for other tasks, batching and rendering off-thread remain separate decisions after profiling.

### Repeatable terrain generation profiling

Both terrain pages now share a fixed camera route, isolated fresh caches/unedited
terrain, identical adjustable generation passes, and bounded raw frame and viewport
chunk-readiness metrics. Cancellation, backgrounding and failures invalidate runs.
The workload repeats unchanged generation; rendering stays on the main thread.
See [measurement controls and limits](INTEGRATION-DEMOS.md).

### Supported CFW host-port presentation

The existing Mara integration now consumes the reviewed native-browser CFW host
port through a narrow ChatPort adapter. CFW owns retained delivery/effect identity,
durable-before-presentation ordering and versioned authority publication. The game
keeps physical facts and validated actions; stop waiting/detach preserve shared host
work. Optional ChatBox action gates represent uncertainty/publication without fake
requests. This remains a scripted volatile fixture with no live CAI transport or
production checkpoint claim. See [contracts](CHARACTER-DIALOGUE.md).

### Character recovery upgrade

The Mara demo consumes reviewed CFW recovery revision cc9267cf6a4d. Its existing Retry action maps to original-operation replay when the 128-delivery ledger is full, without retaining another delivery or duplicating history/effects. A saturated JSON-restore adapter regression and native two-ChatBox proof verify recovery and disposal; full checks pass with 247 tests. The package also settles throwing adapter capture as failure, freeing runtime capacity. Scripted reasoning and volatile storage remain explicit; physical departure/MCP integration and coherent checkpoints are separate work.

### Consistent closed terrain contact

Fixed lower-bound tile enumeration in GridTraversal so left/top terrain tangencies block consistently with right/bottom contact. A conservative extra candidate row/column uses the existing exact segment-distance filter; clearance rules and planner algorithms are unchanged. Directional/signed-origin, unknown-contact, near-miss, corner and bidirectional swept regressions pass. Full checks pass with 249 tests. This removes the verified contact prerequisite for the bounded offline character-departure integration.
