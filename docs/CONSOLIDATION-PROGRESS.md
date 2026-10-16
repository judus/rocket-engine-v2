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
- Create separate experimental ergonomics branch; document implemented API and
  evaluation, post Markdown links to Rocket-Engine and ask Steve to review.

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
