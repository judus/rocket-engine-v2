# Farwake: current work plan

Agreed order, 22 October 2026. This is the current game work queue. Earlier engine
roadmaps and consolidation logs are historical context, not this game's schedule.

| Order | Ticket                                                   | Scope                                                               | State              |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------- | ------------------ |
| 1     | [#4](https://github.com/judus/rocket-engine-v2/issues/4) | Move demo HTML into demos/, update routes/assets/package and verify | Ready for review   |
| 2     | [#5](https://github.com/judus/rocket-engine-v2/issues/5) | Bounded code cleanup and current documentation                      | Ready for review   |
| 3     | [#6](https://github.com/judus/rocket-engine-v2/issues/6) | Improve the currently dark illumination                             | Next after cleanup |
| 4     | [#7](https://github.com/judus/rocket-engine-v2/issues/7) | Rework mouse, keyboard, HOTAS and gamepad control concepts          | After illumination |
| 5     | [#8](https://github.com/judus/rocket-engine-v2/issues/8) | Weapon systems and actual firing                                    | After controls     |

## Current baseline

The game has a retained cockpit, 3D ship simulation, power/thermal/module health,
shields/hull, cargo, mounts, onboard production, navigation and system displays.
The windshield has crew portraits, biography pages and video-call previews.
Dialogue choices are placeholders. Mount output is energy/heat accounting, not
shots, hits or damage to world targets. Room backgrounds are inspection scenes.

Current working release: main is deployed after accepted PRs; development uses
dev. Every slice runs the complete quality gate and verifies its actual browser
consumer. No unreviewed deployment, unrelated framework rewrite or silent tuning
changes are part of cleanup.

## Cleanup boundaries

HTML entry pages live in demos/, including nested inventory, capability examples
and diagnostic tools. Their implementation/assets keep existing owners under
examples/, games/ and apps/. The root index is a small directory entry; the real
Farwake game stays at games/farwake/. Update consumers to the new URLs together,
without legacy duplicate pages or redirect aliases. Later, demos should become
how-to pages with code examples; that content redesign is not the relocation.

The code pass first records concrete findings: dead code, stale claims and
responsibility leaks between engine, examples and game. Correct those in small
behavior-preserving changes. Preserve accepted physics profiles, cockpit fitting,
asset identities and ship state/lifetimes. Broad engine API redesign is excluded.

## Input direction

Devices need different interaction semantics and calibration, but all adapters
must submit the same ship intent contract. Sustained mouse turning must not need
endless desk movement. Keyboard, HOTAS and gamepad should use suitable controls;
no device gets a parallel ship simulation. Agree throttle, response/dead zones,
flight/cursor ownership and failure/disconnection behavior before implementation.

Tablet performance profiling, touch-layout redesign, deeper crew simulation and
other expansion remain deferred unless explicitly brought into this sequence.

Cleanup status: game-owned rendering and power helpers no longer depend on demo
modules. Demo flight easing and power trial fixtures remain in examples/. The
current game overview replaces incremental claims; detailed notes are archived.
The complete gate passes 837 tests. PR #9 remains unmerged; redeployment is deferred.
