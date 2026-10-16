# Roadmap

Historical integration snapshot: 2026-10-14. Current execution is tracked in
[Consolidation progress](CONSOLIDATION-PROGRESS.md) and [the current API](CONSOLIDATION-API.md).
The 2026-10-16 priority is bugs, Workshop/Sprite imports, engine consolidation, then
an isolated API ergonomics experiment. Packaging/acceptance/compatibility projects
are excluded from this pass. This document distinguishes delivered Rocket capabilities,
accepted upstream packages and work still awaiting integration. The latest completed
Rocket gate has 318 passing tests plus TypeScript, lint, formatting and build checks.
No delivery dates or implementation estimates are committed.

## Latest effects milestones — 16 October 2026

Delivered the first 2D particle pool/emitter/Canvas adapter and independent
point-projectile sweep system, with separate runnable demos. The game owns target
eligibility and hit consequences; effects remain presentation. See
[Particles and projectiles](EFFECTS-AND-PROJECTILES.md). GPU/3D adapters, moving-target
relative sweeps and finite-radius projectiles are future slices, not delivered here.

## Planned WebGL transparency — 16 October 2026

Julien requested transparency support for translucent cockpit lamps and future
materials. Plan a bounded renderer slice with explicit opaque/masked/blended
material modes, correct blending and depth-write behavior, transparent ordering,
GLB alpha bindings, and overlap/lifecycle/browser verification. Implementation is
pending; current GPU mesh materials remain opaque. See the
[3D deferred ideas](3D-MILESTONES.md#deferred-ideas).

## Delivery discipline

For each slice: define a narrow consumer contract, build the smallest working
implementation, verify lifecycle and state behavior, exercise it in a real browser,
and document limits. Demos are executable integration proofs; a package test or fake
adapter does not establish a working Rocket integration. Upgrades require a reviewed
artifact, Rocket-side checks and renewed browser behavior/cleanup verification.

Keep one owner for time, physical poses and each domain system. Rocket owns runtime,
rendering, navigation/movement, spatial queries and presentation. The game validates
and applies actions. CFW owns character decisions, dialogue and quests; Workshop owns
production, inventories and reservations. Independent packages retain their own
implementation and do not acquire Rocket dependencies.

Use ordinary objects/classes, Map and Set; typed arrays suit dense numeric data.
Profile before adding pooling, indexes or workers. Explicit cleanup remains necessary.
Strict TypeScript, type-aware linting and formatting cover runtime, examples and tests;
native JavaScript consumers remain first-class.

## Delivered in Rocket

| Area                    | Supported slice                                                                                                                                                                                                           | Contracts and proofs                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime and views       | One frame loop, plain scenes, start/stop/dispose, preparation, ownership scopes, fixed-step timing and explicit keepAlive scenes; multiple cameras/canvases share one scene update.                                       | [Runtime](RUNTIME.md), [fixed timing](FIXED-TIMING.md)                                                                                                               |
| Composition             | Node2D hierarchy/transforms, safe ownership and mutation-safe synchronous behavior traversal.                                                                                                                             | [Nodes](NODES.md)                                                                                                                                                    |
| Assets and input        | Shared image leases with cancellation/retry, scene/view cleanup, focus-scoped keyboard and pointer input.                                                                                                                 | [Assets](ASSETS.md), [services/input](SERVICES-INPUT.md)                                                                                                             |
| Cameras                 | Independent pan/inertia and anchored zoom; rendered coordinate conversion and four-corner viewport bounds; reused by terrain/factory demos.                                                                               | [Cameras](CAMERAS.md)                                                                                                                                                |
| Terrain and streaming   | Seeded procedural fields, classic terrain artwork/decorations, bounded caches/jobs, multiple demand owners, update-phase result publication, stale-result rejection, sparse edits and IndexedDB persistence.              | [Procedural terrain](PROCEDURAL-TERRAIN.md), [async chunks](ASYNC-CHUNKS.md), [multiple demands](MULTIPLE-DEMANDS.md), [browser persistence](BROWSER-PERSISTENCE.md) |
| Spatial queries         | Caller-owned uniform-grid indexing, atomic membership updates, local queries and frontmost geometry picking.                                                                                                              | [Spatial picking](SPATIAL-PICKING.md)                                                                                                                                |
| Physics candidate       | Optional scene-owned Matter.js integration, fixed-step poses/commands, sensors and post-solver contacts. Backend-independent contract/final backend choice remain open.                                                   | [Physics prototype](PHYSICS-PROTOTYPE.md)                                                                                                                            |
| Navigation/movement     | Finite weighted routes, swept circular clearance, explicit journey states/cancellation/retry, relevant-revision replanning and bounded streamed corridors. Terrain contact is consistent in all four directions.          | [Navigation](NAVIGATION.md), [streamed routes](STREAMED-ROUTES.md)                                                                                                   |
| Production/staffing     | Workshop 2.0.0 bridge, streamed placement/inspection, timed transport, dismantling, paid construction, arrival-gated attendance, two-worker exclusive staffing and atomic application checkpoints.                        | [Workshop features](WORKSHOP-FEATURES.md), [workplace journeys](WORKPLACE-JOURNEYS.md), [staffing](STAFFING.md)                                                      |
| UI/characters           | Optional DOM Panel/ChatBox, focus/lifetime coordination, shared conversations and one scripted Mara CFW integration with real physical quest completion. Reviewed recovery build handles retry at the 128-delivery limit. | [Panels/chat](UI-PANELS.md), [Mara integration](CHARACTER-DIALOGUE.md)                                                                                               |
| Worker/sprite consumers | Separate native worker-terrain comparison and sprite playback demo; shared repeatable terrain workload/camera route and bounded frame/readiness measurements. Hierarchical navigation is shared across demos.             | [Integration demos](INTEGRATION-DEMOS.md)                                                                                                                            |

These are bounded supported slices, not blanket completion of every broader stage.
For example, streamed navigation is not unrestricted world routing, timed cargo is
not physical hauling, and the Matter prototype is not a general physics abstraction.

## Active coordination and pending upgrades

| System           | Current Rocket consumer                       | Reviewed upstream progress                                                                                                                                                                                                                       | Remaining Rocket work                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rocket-Workers   | 0.4.0                                         | 0.4.0 accepted after independent strict, packed and native browser verification, including retained 0.2.0/0.3.0 baselines. Declared-cost admission and fixed lifetime timing summaries are available upstream; package work is now support-only. | Bounded terrain consumer upgraded and verified. Additional worker tasks need their own measured workload and task-specific admission contract.                                                                                   |
| Sprite-Animation | 0.2.1                                         | 0.2.1 preparation-time image validator accepted; packed native assertions and lifecycle proof pass. Existing completion/local-bounds APIs are sufficient.                                                                                        | Optional binding and main sprite consumer delivered and verified. Legacy character pages retain their exact baseline; any migration is a separate slice.                                                                         |
| CFW              | 0.1.0 private browser artifact `c55c62467cad` | Recovery and trusted mutation identity reviewed; departure admission/outcome contract proof accepted as fake-game evidence.                                                                                                                      | Local scripted decision-to-NPC journey is now implemented and tested through HostDriver, with original-operation replay, terminal outcomes and removal guards. Durable checkpoints and a remote CAI bridge remain separate work. |

Package acceptance does not automatically upgrade a demo or authorize later
features. Peer implementation stays in its repository; Rocket owns its adapters and
consumer files. No paid providers, deployment or unrelated scheduler changes belong
to these slices.

## Proposed next implementation sequence

### 1. Complete accepted package integrations — delivered bounded slice

Bring reviewed worker/sprite improvements into their existing proofs and reusable
optional bindings. Keep APIs small and ownership explicit rather than introducing
engine-wide services without a second justified consumer.

Acceptance: API/usage docs, exact package identity, meaningful lifecycle/error tests,
strict checks and runnable browser proofs. Worker cancellation must retain physical
occupancy/reservations until completion/termination. Sprite preparation failure must
release acquired leases; draws must not advance playback or invoke completion hooks.
World bounds/picking use existing Node2D and SpatialIndex.

### 2. One decision-driven physical NPC journey — delivered

Use Mara's existing local scripted HostDriver owner to propose one authored
permitted destination. The game validates actor incarnation/destination and maps the
original session/operation/effect identity to one real Rocket Journey. Replays do not
start another journey; blocked is waiting, and admission never claims arrival.

Acceptance: one update/pose owner, original-operation retry, exactly one terminal
source, truthful arrival/unreachable/cancelled outcomes, removal/scene-disposal guards
and shared-view cleanup. Dialogue stop-waiting and panel closure do not cancel game
movement. Keep this offline/in-memory proof explicit. The terrain-contact prerequisite
is fixed. The local departure adapter is delivered in the Mara demo, with bounded
operation/outcome records and a lost-reply replay proof; this does not establish a
remote CAI bridge or durable checkpoint.

### 3. Character decisions using existing staffing capabilities

After the one-journey proof, evaluate a small character-to-workplace assignment
integration using the existing exclusive staffing coordinator and arrival-gated
Workshop attendance. Avoid another reservation, navigation or inventory system.

Acceptance: game-approved assignments, existing slot exclusivity, attendance only on
validated arrival, truthful failure/removal feedback and clear persistence ownership.
This is a proposed subsequent slice, not current implementation approval.

CFW authored-situation API and browser package accepted on 2026-10-14. Rocket now
pins private artifact `c55c62467cad`; the isolated candidate passes 185 CFW tests
and the existing Rocket suite passes 277 tests. The queued publication/start input
snapshot correction is included.
The [authored guide demo](../character-situations.html) connects one sprite, spatial
picking, actual proximity, a neutral JSON flow and existing Panel/ChatBox with
pending/error/stop-waiting/retry and cleanup. No AI or game action grants are required.
The browser packaging gap was resolved by CFW; [consumer evidence and limitations](CFW-SITUATIONS-REVIEW.md)
include the retained Mara proof. Durable world mutations remain a separate gate.

The [grove evidence & pickup demo](../character-grove.html) is delivered after explicit
approval: actual movement feeds authored fact/event visit conditions, CFW reveals one
preexisting survey marker, and a new pickup event after the stage boundary closes the
flow. Prior visits/pickups, unknown history and lost reveal replies are verified with
stable cursors/effect identity. All 277 tests and browser checks pass. See
[ownership, evidence limits and verification](CHARACTER-GROVE.md); no inventory/reward
system or durable world recovery is introduced.

The bounded persistent-authoring prototype has also passed an isolated consumer
review: a SQLite-recovered immutable visit definition was imported through the
existing GroveHost and completed by actual Rocket outside-to-inside movement,
including native browser Shift+D. Prior visits were excluded; no marker, reward,
provider or new scene was involved. The package is pinned, but Rocket has no
authoring UI/service or durable world journal. See
[consumer review and prototype limits](CFW-AUTHORING-CONSUMER-REVIEW.md).

## Newly requested planned demos and investigations

The following four items were requested on 2026-10-13. The archived sprite gallery, WASD control and work takeover
are now delivered after explicit approval; the remaining items are planned work,
including the separate spaceship investigation.
The numbered order below expresses dependencies among the character demos; it does
not displace the accepted package integration and NPC journey work above.

### 1. Archived character sprite demo

Delivered as `character-sprites.html`: six original sheets, two independent players
per sheet, directional idle/walk selection, feet pivots and two shared-scene views.
See [character sprites](CHARACTER-SPRITES.md). WASD and work takeover are delivered below.

Add a separate demo using the character sprites from the archived game-engine-2,
through the reviewed Sprite-Animation package and Rocket presentation binding.
Asset inspection found six 256×576 sheets (Female1, Female2, Male1–Male4), with
32×48 frame metadata for idle/walk front, back and side clips. Preserve the original
assets and frame definitions; verify their provenance/usage terms and directional
mapping before adding them to the demo. Do not infer a separate run animation from
unmapped sheet rows.

Acceptance: visibly show the original characters, correct feet pivots, directional
idle/walk playback, side mirroring where appropriate, selection/highlighting and
multiple independent players sharing loaded images. Include the demo in navigation;
verify preparation failure, view closure and complete scene/image/player cleanup.
This is an additional proof, not a replacement for the existing sprite demo.

### 2. WASD walk/run control

Delivered as `character-control.html`: focus-scoped WASD, Shift at 1.7× movement
speed with 1.5× walk playback, normalized diagonals, swept obstacle/unknown checks
and shared-view fixed updates. See [character control](CHARACTER-CONTROL.md).

Extend the character proof with focus-scoped WASD movement and an explicit run
modifier (proposed: Shift). Normalize diagonal input; use simulation time and the
existing traversal checks so obstacles and unknown terrain cannot be bypassed.
Choose a small direct-movement contract only after inspecting the existing pose
owner; Movement currently owns an immutable pose through journeys and has no direct
velocity-command API. Avoid two controllers writing the same actor pose.

Acceptance: walk/run speeds are distinct and independent of render rate; animation
and facing follow actual movement; blocked input cannot tunnel through obstacles.
Blur, hidden pages, pause, removal and view disposal clear held input. Typing in
ChatBox does not move the character. Running may use faster walk playback if the
original assets have no verified run clip; label that choice in the demo.

### 3. Selectable autonomous characters and player takeover

Delivered first slice: [work → takeover → resume](../character-work.html), using
existing finite navigation, two operators, Staffing and Workshop 2.0.0. Selection
and takeover are separate; only one worker can be controlled. No CFW API is needed.

Taking control cancels the journey, clears attendance immediately and releases the
slot. The worker retains its fixed assignment; release creates a fresh autonomous
mover and route from the current pose. Switching control first resumes the previous
worker. Each worker has exactly one live movement owner and one fixed-step animation
update. Removed workers are retired, not respawned by checkpoints.

A gate proves route failure/recovery. Checkpoints preserve Workshop state, positions,
remaining workers and gate state; restore clears manual control and replans work,
reconciling attendance instead of trusting saved counts. Old journey handles cannot
resume retired movers. Scene disposal retires players, movers, input and image leases.

The press continues using available alloy while the smelter is controlled; it can
then wait for inputs. Workshop owns timed deliveries and inventory throughout.
Physical hauling/cargo custody, arbitrary tasks and CFW intentions remain future
bounded slices. See [policy, usage and verification](CHARACTER-WORK.md).

### 4. Clean spaceship demo investigation and implementation plan

Schedule the complete [spaceship investigation brief](SPACESHIP-INVESTIGATION-BRIEF.md)
as a separate larger task. Rebuild independently: no legacy Rocket code, formulas,
architecture or numerical tuning as a template. Shared projects remain read-only;
only disposable isolated experiments are authorized when that task begins.

Inspect current reusable APIs, example-only code, proposals, package versions and
ownership. Cover deterministic streamed asteroid regions and persistent destruction;
role-specific entity state; mass/inertia/thrust/assisted/manual flight; power/thermal
rules; mounted weapon groups, muzzle pose, inherited velocity, costs and exactly-once
hits; fast-projectile sweep requirements; bounded particles/muzzle animations;
follow/zoom/parallax/picking/cockpit feedback; clocks/pause/scaling; coherent saves,
region transfers and lifecycle cleanup. Workshop is evidence of domain/presentation
separation, not the ship simulation. Its facilities currently render through indexed
plain visual records/draw callbacks, not assumed Node2D facility instances.

Required dependency: an isolated Matter.js suitability proof with two different ship
profiles, thrust/coast/turn/braking/damper changes, assisted/manual handling, reduced
power and projectile velocity inheritance. Compare equal simulated durations at more
than one supported timestep; explain units, modifier composition, limitations and
what Matter supports beyond Rocket's adapter. Investigate the smallest credible
alternative only if a material limitation makes Matter unsuitable.

Deliverables: a source-backed matrix covering every requirement with ownership,
gaps and observable acceptance scenarios; reproducible physics proof/report and
verdict; responsibility model; separate justified engine-extension roadmap;
dependency-ordered demo plan with the smallest working slice; tutorials/examples
outline; and explicit assumptions/open decisions requiring human agreement.
Finalize the matrix and roadmap after the proof. The investigation does not approve
production implementation, backend selection, shared-source edits or extra gameplay.

## Quest authoring MCP proof (2026-10-14)

Julien approved the bounded responsibility recap442. Rocket now supplies an optional
`/mcp` service with no CFW import, neutral provider registration and explicit
transport shutdown, a game-owned watchtower world-summary provider, and a separate
published-quest consumer. Game-only TCP with CFW imports blocked, combined TCP with
the exact CFW193 provider, publication/digest/replay and both routes pass. All293
Rocket tests and strict static/build gates pass. The accepted185 browser pin and
corrected32aabc76 watchtower baseline remain unchanged.

See [MCP usage and evidence](MCP.md) and `quest-consumer.html`. CAI's actual queued context/prompt/publication gate466 and Rocket's exact-artifact
browser verification now pass with mocked OpenAI HTTP. Agree briefs, model and correction
budget before the finite generation batch; deterministic baseline publication does
not establish AI-generated quest quality. Policies, dynamic-world recovery and
broader authoring abstractions remain deferred. This authoring fixture does not
claim a live bridge into the browser's current world.

## Remaining product and engine work

These items need their own bounded contract and implementation decision; they are not
all prerequisites for the next integration.

- **Runtime/composition:** activity/transitions and scene-membership hooks, scoped
  signals/subscriptions, world-preserving reparenting, generic layer management,
  automatic container sizing and justified general layer caching.
- **Services/assets:** asynchronous service lifecycle, declared dependencies and
  additional asset types beyond images.
- **Cameras:** follow targets, camera bounds and rotation with consistent inverse
  picking/demand behavior.
- **Physics:** backend-independent adapter contract/final backend decision and
  navigation/movement integration that respects physics-owned dynamic poses.
- **Terrain/rendering:** async decoration generation, persistent height edits,
  measured batching/cache improvements and worker use for other demonstrated tasks.
- **Movement/simulation:** actor collision/crowd avoidance, schedules, physical
  material hauling/vehicles and more general routing only when bounded corridors
  prove insufficient. Timed transport and two-worker staffing already exist.
- **Persistence:** factory autosave/conflict policy and coherent character/game/effect
  checkpoints. Saved routes/chunks, migrations and offline progression are not
  implied; offline progression requires an explicit policy decision.
- **UI:** CFW read-model quest summaries/logs, modal policy, rich text and
  movable/resizable panels where a concrete consumer needs them.
- **Remote character integration:** live backend receipts/reconciliation and an
  actual reviewed CAI/MCP-to-browser-world bridge. Agree a single world owner,
  request/revision identities, connection loss and cancellation/removal first.
  Current Mara reasoning/storage remain scripted and volatile.

## Experimental directions

Only pursue these after a measured workload or explicit product need:

- Quadtree spatial comparison and terrain LOD with loading coverage guarantees.
- Large-world chunk/local addressing, serialization and origin shifting.
- Streamed physics with readiness frontiers/swept demand; multiple physics regions
  with explicit transfers before considering merge/split.
- Worker-based route searches and additional off-thread tasks.
- GPU rendering as a second backend justified by actual workloads.
- Planet approach/landing as an exploration combining LOD and large-world mechanisms.

No editor, full ECS, planetary renderer, automatic physics-region splitting or
abstract backend suite is required for the foundations. Plain animation, diagrams,
terrain exploration and simulation remain distinct consumers.

## Delivery history

[Historical milestones](ROADMAP-HISTORY.md) preserve the original delivery notes,
package versions and test counts. Historical “deferred” statements may have been
superseded by later deliveries; the current sections above are the status reference.

## Playable authored watchtower quest (2026-10-14)

The explicitly approved [watchtower demo](../character-encounter.html) auto-starts
from a session JSON and runs seven authored situations without AI. World objects
and ordinary interactions belong to Rocket's game host; CFW evaluates every
condition/route and invokes reusable consequences. Clearing the encounter reveals
the guide and opens a real navigation gate, fact/event timing selects the item
path, and a new exit entry lights the beacon. See [API, usage and limits](CHARACTER-ENCOUNTER.md).
The existing CFW pin is sufficient; AI authoring remains a separate track.

The watchtower now also implements Julien's requested dialogue branching: an
authored blue/red choice reveals the selected seal and requires a matching
delivery at Beacon Ridge A/B. A prior matching delivery now counts, fixing the
accepted early-delivery ordering trap without changing the CFW schema. Existing Panel/ChatBox handles host-owned choice
commands; ordinary game custody/range/destination rules validate delivery.
The wrong beacon and mere arrival cannot complete the mission.

## Sprite binding and worker consumer upgrade (2026-10-14)

Julien approved both slices. The optional `/sprites` entry provides Sprite2D, preparation rollback, one playback owner, completion handling, transformed bounds and caller-owned spatial membership. The main sprite proof uses exact0.2.1 while legacy character/quest pages retain exact0.2.0 browser assets. Terrain workers now consume exact0.4.0 with generated cell-pass reservations and distinct queue/physical/compute timing populations. See [sprite binding](SPRITE-BINDING.md) and [worker upgrade](WORKER-UPGRADE.md). Strict checks and298 tests pass; browser lifecycle/workload evidence is recorded with those docs. No3D implementation or renewed spaceship investigation belongs to these slices.

## Journal and current status (2026-10-14)

Julien approved the journal/status system. Optional `/journal`, `/journal/sqlite` and `/journal/mcp` entries keep domain semantics, CFW and Workshop out of neutral storage. A game-owned watchtower reporter proves confirmed outcomes and two deterministic episodes through existing handlers, with durable matching checkpoint/restart and scoped MCP reads. The original quest/demo/pins remain unchanged. See [API, proof and limits](JOURNAL.md) and [volatile browser proof](../journal.html). Crash-atomic cross-domain saves and generated narrative quality are not claimed.

CFW206 registered quest builder is integrated in the optional combined development fixture only (historically25 tools; now32 with focused plain-text context). Real TCP reconstruction, exact publication/command replay after SQLite reopen, both ordinary gameplay branches and cleanup pass. CAI received the live local endpoint and actual startup binding descriptor in message524. The playable c55c pin and baseline remain unchanged. Journal reporter now validates attached content against the executed CFW definition by run owner/identity before deriving its digest; the same-ID mismatch regression passes. Evidence: `docs/evidence/builder206-2026-10-14/`.

Watchtower game-owned context tools are available in the optional combined fixture: ordered plain-text briefing with exact game capability vocabulary; knowledge-filtered record listing/details; existing navigator accessibility and Euclidean/route distances; same-fixture journal/status readers.The initial context integration recorded32 tools and15 plain-text responses; the builder's63-step publication/reopen/both-branch proof remains green. No browser/backend bridge, inferred knowledge model or paid model run. See GAME-CONTEXT-TOOLS.md.

The briefing now lists authoring **tools with native descriptions**, preceded by `show_authoring_example`. That read-only tool serves the installed CFW example's complete63-call chain with explanations and resulting Mermaid, with no resulting quest JSON. Input validators and source structure checks guard contract drift; paged and diagram-only reads are available. Current combined discovery is32 tools: 24 builder tools and eight plain-text context/example tools. The legacy bulk summary provider, standalone launcher/proof and duplicate description were removed.
