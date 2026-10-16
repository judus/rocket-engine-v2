# Consolidation progress

Julien’s order: bugs → Workshop/Sprite imports → Rocket consolidation (excluding
packaging, acceptance and compatibility projects) → experimental API ergonomics.
Normal tests and practical browser verification remain part of implementation.

## Bugs

- `fb958a2`: CORE-001, reentrant application disposal shares one completion and
  releases each owned resource once. Full check: 433 tests.
- `8d53c9f`: independent presentation cap; per-RAF services/input/update/fixed work;
  accumulated draw dt; `app.renderPerformance`; guard after final beforeUpdate
  service. Fixed demo now exposes low render caps and separate cadences.
- `2fa3f4a`: CORE-002 stale ChatBox choice refresh; CORE-003 stage only incoming
  journal records with identity index; CORE-004 shared Newell polygon normal;
  CORE-005 commit demand before synchronous cancellation callbacks.

Full check after the above: 441 tests, strict typecheck, lint, formatting and build.
Logs: `/tmp/rocket-bugs-check.log`, `/tmp/rocket-timing-tests.log`.
Native fixed demo: callback cadence ~142 FPS while draws report 1 FPS; fixed ticks
continue at 60 Hz, pause/resume works. Controlled tests cover healthy 60–240 Hz feeds,
1–30 and fractional render caps, phase cancellation, draw dt, stalls and cap changes.
No legacy timer edits.

## Imported features

Local archives copied into `vendor/`, installed offline, and published by the existing
browser-copy script. No submodules or peer-source edits.

- Workshop 2.4.0, upstream `5b013d2`, archive SHA256
  `ea1fa8e6c058c70352de96a6a11d1233a0341d893248a7981db496b791882363`.
  Object-attached inventories, capacity/admission, atomic operations, context,
  equipment and read-only MCP export are available from the installed package.
  Factory adapter explicitly expects current save format 7; its Rocket checkpoint
  version is unchanged. Copied upstream inventory/context/operations demos retain
  their original domain logic and artwork/styles, with local import/link changes.
- Sprite 0.3.0, upstream `d25c539`, archive SHA256
  `c7a86853270bc50d61c72c4d797b1f49ac5fc8e653724e5bd8a3373ea99d59a4`.
  Copied layer fixture/art/proof/control code; replaced its standalone RAF owner
  with the existing Rocket scene/presentation loop. Legacy 0.2.0 alias preserved.

Demos: `/examples/inventory/context.html`, sibling inventory/operations pages, and
`/sprite-layers.html`. Browser checked equipment swap/wrong-slot refusal/checkpoint
restoration and paused shirt/weapon changes retaining exact phase. Added Rocket
consumer tests for exact item/modifier ownership and one-master layered playback.
Actual sprite-pack validation is left aside: no pack was selected for this task.

## Remaining work

- Import WORKERS-001 fix when upstream reports it ready (requested in Rocket-Workers
  #668); proceed independently while it is prepared.

## Reusable extraction

Implemented WebGLSurface generation/lifetime ownership; InputTarget binding shared
by Canvas and WebGL; generic AssetPool extracted from Assets; WebGLAssets model and
texture leases; optional WebGLBloomPipeline. Migrated cockpit host and asteroid
scene; image consumers reuse the pool through the existing API. Kept rendering,
scene, domain and presentation policy separate. See CONSOLIDATION-API.md.

Full extraction check: 445 tests plus strict typecheck/lint/format/build. Native cockpit
asteroids: movement, context loss/restore, one canvas after recreation, cleaned
presentation count 1 and GL error 0. Imported Sprite proof: 230 assertions across
10 cycles with 30 released Canvas sources. These are focused browser observations,
not a cross-device acceptance claim.

## Quality tooling

Local V8 coverage now runs once in `npm run check`, with retained machine/text reports,
explicit module inventory, per-module floors and missing/regression checks. 446 tests
pass. See COVERAGE.md for measurement limits and baseline policy.

## API ergonomics experiment

Separate branch `experiment/api-ergonomics`, based on main `f47309e`. Implements
createApp, real-node IDs/tags, world/screen layers, feet sorting, decorative parallax,
camera follow and a retained/fresh SceneNavigator. New runnable api-experiment.html.
See API-EXPERIMENT.md and API-EXPERIMENT-FINDINGS.md for complete API, comparison
with old Rocket and the limitations left aside. Full check: 454 tests. Browser
verified movement, focus, zoom, pause/resume, tree removal, retained/fresh navigation,
failed/cancelled loading and final cleanup (both canvases removed; 3 created route
instances / 3 disposed). Screenshot: `/tmp/rocket-api-experiment.png`.

Unresolved external work: WORKERS-001 report/fix requested #668; Sprite Q2 tooling
authorized #671 and awaits report. No repeated nudges or peer implementation takeover.
The active ten-minute batched watch includes Production-Workshop and Sprite-Animation.
Packaging, formal acceptance and compatibility projects, game expansion, HDR/area
lights and quest follow-ups remain deliberately deferred. The route-service activation
contract is explicitly left aside for review; current child routes do not imply
automatic nested Input/service activation.

## Second API pass

Steve’s review #681 found the architecture sound and recommended explicit activation
plus an interactive composition proof. Julien authorized that implementation.
See SCENE-ACTIVATION.md: root/child activation graph, immediate service notification,
scene-owned input, camera identity, named facade navigation and shared canvas leases.
Scene composition demo uses one app/view with two interactive retained/fresh rooms.
Full gate: 460 tests; existing coverage floors unchanged. No merge to main.
WORKERS-001 was imported on both branches (WORKERS-001-IMPORT.md); Sprite Q2 was
already accepted #675/676. Earlier pending notes above are historical snapshots.

### API-002 camera transition correction

Steve completed the second-pass review in Rocket-Engine messages 683–684 and
confirmed the activation design. His one confirmed defect was view-owned Cameras
carrying inertia and pending wheel input into a newly selected route camera.
Camera identity reconciliation now resets controller motion, preserving retained
camera poses. Regression coverage includes actual createApp named navigation,
direct camera replacement, queued wheel cancellation, and new-camera wheel input.
The change remains on the experimental branch; main is unchanged.
