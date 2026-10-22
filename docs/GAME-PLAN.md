# Farwake: current work plan

Agreed order, 22 October 2026. This is the current game work queue. Earlier engine
roadmaps and consolidation logs are historical context, not this game's schedule.

| Order | Ticket                                                   | Scope                                                               | State            |
| ----- | -------------------------------------------------------- | ------------------------------------------------------------------- | ---------------- |
| 1     | [#4](https://github.com/judus/rocket-engine-v2/issues/4) | Move demo HTML into demos/, update routes/assets/package and verify | Ready for review |
| 2     | [#5](https://github.com/judus/rocket-engine-v2/issues/5) | Bounded code cleanup and current documentation                      | Ready for review |
| 3     | [#6](https://github.com/judus/rocket-engine-v2/issues/6) | Improve the currently dark illumination                             | In progress      |
| 4     | [#7](https://github.com/judus/rocket-engine-v2/issues/7) | Rework mouse, keyboard, HOTAS and gamepad control concepts          | In progress      |
| 5     | [#8](https://github.com/judus/rocket-engine-v2/issues/8) | Weapon systems and actual firing                                    | In progress      |

## Current baseline

The game has a retained cockpit, 3D ship simulation, power/thermal/module health,
shields/hull, cargo, mounts, onboard production, navigation and system displays.
The windshield has crew portraits, biography pages and video-call previews.
Dialogue choices are placeholders. The gunship now fires funded pulse bolts
and registers swept asteroid hits, energy-based integrity loss and destruction
with brief decorative debris. Room backgrounds are inspection scenes.

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

Illumination first pass: ambient fill 0.015 → 0.025 and one faint cool cabin
point light at the pilot eye (intensity 0.18, minimum distance 1.5). Sun strength,
sky, exposure and materials are unchanged. This is a local visual trial pending
Julien’s assessment; no new PR or deployment until the combined work is ready.

Illumination effects trial: existing engine bloom pipeline (threshold 0.7,
strength 0.18, radius 1), fitted display spill at 0.25×, existing lamp spill,
and a 4096² PCF sun-shadow map fitted to the cockpit plus finite asteroid field.
Single-map detail and unshadowed local spill are current renderer limitations.
Managed GPU resources own resize, disposal and context restoration.

Post-processing trial: optional engine `midtoneLift` in the existing bloom
composition pass. Defaults to identity; Farwake tries 0.2. The bounded
display-referred curve preserves black/white and diagnostic views remain raw.
This does not add HDR/exposure or recover already clipped detail. Neutral bloom
demo includes a control and real-GPU black/midtone/white pixel check.

Warm-grade trial: star tint [1, 0.94, 0.82], brightness curve 0.35, and optional
engine three-way grading at 0.25 strength. Blue shadows, warm orange/yellow
midtones and pale yellow highlights; tint multipliers retain neutral luminance
before LDR clipping. Raw diagnostic views bypass both brightness and tint.
Neutral bloom demo exposes all three tints and grade strength, with GPU pixel
checks for tonal separation and black preservation.

Cabin counter-fill trial: existing single point light moved 0.35 above and 0.4
behind the pilot eye, warm [1, 0.9, 0.76], strength 0.7 (increased from 0.45). Sun, ambient fill and
post grade stay unchanged; the light follows the ship pose.

Instrument theme cleanup: InstrumentPalette.ts owns only the turquoise family
(displays, HUD, reticle and matching spill). Default colours remain byte-identical.
One validated hue offset can audition alternatives; a persistent settings slider
is optional follow-up, not part of the palette extraction. Other colour roles
and the lighting grade are unchanged.

Mouse steering prototype (#7): captured relative mouse displacement accumulates
into a circular virtual stick. Full deflection is 25% of the shorter cockpit
viewport dimension at sensitivity 1. Sensitivity changes travel, not ship torque.
No automatic spring return or temporal smoothing. The current response has a
8% radial deadzone and soft activation over the next 15% of remaining travel. A small
stabilized 3D command marker shows deflection. C/right mouse, capture loss,
blur/hidden page, menu/room/settings and reconfiguration recenter the command.
Keyboard/touch still feed the existing ShipControl; HOTAS/gamepad adapters and
their calibration remain subsequent slices. Ship physics/profiles are untouched.

Weapon reference saved in [WEAPON-REFERENCE.md](WEAPON-REFERENCE.md): seven slots,
three double-muzzled mounts. Exact firing geometry is deferred to #8.

HUD/targeting discussion is captured in [HUD-TARGETING-DESIGN.md](HUD-TARGETING-DESIGN.md).
It records the agreed ring meanings and persistent target-lock behaviour; targeting
mechanics are not yet implemented. Steering stays a separate line and bubble.

Gunfire first slice (#8): the game now loads ships/gunship.json (seven pulse
cannons, three dual-muzzled mounts; ten muzzles total). Science-ship/lab loadouts
remain intact. Hold Space/left mouse to fire; groups 1–6 choose all, port,
starboard, centre dual, outer dual pair, forward pair. Existing mount power,
heat, health and restart rules fund each volley; there is no extra energy bill.
ShipGunfire is an optional game behavior after committed ship motion. Swept
segments use cached static asteroid mesh triangles with AABB broad-phase tests.
Bolts inherit ship velocity and converge at 2 km using provisional hardpoints.
Muzzle flashes and impact bursts use retained shared geometry; all simulation
pauses with the retained flight scene. Asteroid impacts are confirmed hits with
energy totals; asteroid destruction, auto-aim/acquisition, audio, mining and
ship-to-ship damage remain later work.

Gunfire validation: complete quality gate passes 853 tests. Browser gunship
startup, keyboard firing/movement input and impact rendering were smoke-checked
without console errors. Desktop feel and muzzle/effect styling remain for Julien
to assess. No new PR, merge or deployment.

Weapon continuation: asteroid integrity now consumes bolt hit energy; destroyed
rocks immediately leave collision queries and disappear, with twelve temporary
shared-mesh debris pieces. Navigation drops destroyed contacts on the next ship
commit. This is game-owned prototype balance, not engine fracture physics or
mining loot. Complete quality gate: 855 tests, coverage passed. Fresh-origin
browser launch/firing smoke produced no console warnings/errors; destruction
lifecycle and energy accounting are verified by focused simulation tests.
Acquisition and auto-aim are implemented in the next slice below; visual polish is still provisional.
No PR, merge or deployment.

Targeting continuation: automatic centre-priority acquisition, persistent combat
lock, reserved T cycling and visibility/range-gated pulse tracking now share one
fixed-step firing solution with the HUD. The small aiming ring shows that solution;
the segmented target ring follows lock and closes/shrinks when trackable in range.
Crosshair and steering remain independent. Static-target interception accounts for
inherited ship velocity. Candidate occlusion scans run on acquisition/cycling;
retained tracking checks only its locked target. No physics tuning changed.
Full gate: 861 tests, coverage passed. Fresh-origin browser verified automatic
acquisition, T cycling and open/closed ring states with no console warnings/errors.
Focused tests verify off-axis auto-aim hits, lock retention/re-entry, occlusion,
range, destroyed-target release and calibrated tilted-plane projection.
No commit, PR, merge or deployment.

Release authorization, 23 October: Julien requested deploying this complete state
now, coordinating the changed game/demo paths with Netzy. This supersedes the
earlier deployment hold for this combined release. PR #9 carries the cleanup,
lighting, mouse control and weapon/targeting slices; subsequent tuning waits.
