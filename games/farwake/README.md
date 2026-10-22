# Farwake

A cockpit game prototype built with Rocket Engine. Local entry: `/games/farwake/`.
The current game uses `ships/gunship.json`; the original science ship remains
available to the lab and tests.
The diagnostic ship page is `/demos/tools/flight-foundry/ship.html`.
[Current work plan](../../docs/GAME-PLAN.md) ·
[Detailed implementation history](../../docs/history/FARWAKE-IMPLEMENTATION-NOTES.md)

## Runtime and ownership

`main.ts` assembles one Rocket runtime, retained scene navigation and a fixed-step
ship scene. `Ship.ts` attaches typed capabilities; `ShipMovement.ts` coordinates
one committed simulation step. `ShipBody.ts` owns 3D pose and motion. Cockpit sway
is presentation only, independent of the pilot camera and physical ship state.

- `ShipControl`: translation and pitch/yaw/roll intent from a controller.
- `ShipEngine`, `ShipDampers`, `ShipPowerPlant`, `PowerLedger`: thrust/torque,
  assistance, power demand, allocation and the single shared energy reserve.
- `ShipCooling`, `ModuleThermal`, `ModuleHealth`: thermal state, cooling and
  independent module health; power and health affect actual delivered output.
- `ShipShields`, `ShipHull`: stored shield energy, protection and queued damage.
- `ShipCargo`: cargo-link health, power/heat and interruption/recovery state.
- `ShipMounts`: seven replaceable slots, fire groups and powered equipment output.
- `ShipInternals`: replaceable onboard installations using Production Workshop,
  local inventories and worker/specialist assignments.
- `ShipNavigation`, `ShipComputer`: navigation contacts and committed system state.

Profiles and initial state are JSON under `profiles/`, `ships/` and `characters/`.
They are the authority for current values. Cleanup does not retune them.

Game-specific cockpit geometry, fitted displays/lamps, reticle, cosmetic spring
and asteroid scenery live in `visuals/`. They use the engine's public rendering
primitives; demos consume these helpers, not the other way around. Source artwork
remains shared under `examples/` where it was imported. Asset URLs resolve from
the owning module, independent of HTML page location. No engine API was added for
Farwake's content. `examples/ship/PowerTrial.ts` and
`examples/webgl/CockpitFlight.ts` are demo-only fixtures/models, not game physics.

## Powered inertia dampers

The game uses physical force/torque integration. Engine and damper translation
and rotation have separate service demand and delivery; the existing allocation
funds baseline and rotation before translation. Requested switches, actual
availability, health, thermal trips and recovery remain distinct states.
Telemetry is read after a completed fixed step. No input or display directly
writes the body's pose, power reserve or module temperatures.

Turquoise instrument colours are owned by `InstrumentPalette.ts`: primary and
muted text, borders, dark surfaces, aiming marks and matching linear light spill.
Its hue offset shifts that family together. Warning/critical colours, monochrome
crew pages, menu colours, scene lights and post grading are separate. There is
no player-facing hue setting yet.

## Presentation and controls

The cockpit contains navigation, system and overhead instruments, alert lamps,
windshield HUD and display mode. The game uses restrained bloom, fitted screen
and lamp point-light spill, and one PCF sun-shadow map shared by cockpit and
asteroid field. A gentle display-referred midtone curve lifts the final image
while preserving black; a restrained three-way grade gives blue shadows, warm
yellow/orange midtones and pale yellow highlights. The single field-sized map limits fine cockpit shadow detail;
local point-light spill has no shadowing. GPU targets follow surface resize and
context restoration. The crew page has portraits, placeholder stats,
paginated unlocked biography sections and looping video-call previews. Current
call choices are placeholders. Aboard opens background inspection scenes.

Menu, Settings and compartment scenes pause the retained flight simulation;
windshield display mode does not. Escape backs out of the active panel, then
opens the menu. C/right mouse switches mouse steering and cursor use while
keyboard flight remains available. I toggles windshield display mode separately.
Captured mouse steering is a persistent virtual stick: displacement commands a
turn until brought back to centre. A small stabilized HUD marker shows the
command; ship acceleration/braking still govern actual motion. Sensitivity sets
mouse travel. A 8% radial deadzone and a short soft activation ramp shape the
command; the provisional cue shows raw stick displacement even inside neutral. Release/capture loss, blur and scene changes recenter it. Keyboard
and touch continue to submit the same ShipControl intent. HOTAS/gamepad adapters
remain upcoming.
Settings persist browser preferences, not a ship save. Mobile controls and video
settings are implemented, but the broader device-specific input redesign and
in-depth tablet profiling remain planned work.

## Current limits

The optional game `ShipGunfire` behavior turns funded pulse-cannon output into
bolts, muzzle flashes and swept-triangle asteroid impacts. The gunship has seven
guns and ten muzzles; Space/left mouse fires the selected group. Groups 1–6 select
all, port, starboard, centre dual, outer dual pair and forward pair. Muzzle
positions and 2 km convergence are provisional game calibration. Asteroids lose integrity from actual bolt energy, disappear on destruction and
leave a two-second decorative debris burst. Destroyed rocks stop intercepting
shots immediately and leave navigation contacts on the next committed ship tick.
Prototype integrity is max(25 MJ, radius² × 25 kJ/m²), using the largest bounds
half-extent as radius; this is game balance, not material fracture physics.
Debris has no collision or loot. State persists during the current flight only. Pulse cannons now acquire unobstructed asteroid centres inside the outer ring;
T cycles candidates. Lock persists outside the ring, while auto-aim drops and the
segmented indicator opens. In-cone, in-range tracking closes it; the small aiming
ring follows the actual smoothed firing solution. Crosshair/dot remain fixed.
Static-target interception compensates ship velocity. Gun audio,
mining laser firing and ship-to-ship damage are not implemented. Shield/hull damage exists as a model
contract and lab commands. World collision, a combat loop, crew injury/fatigue,
real call dialogue outcomes, cargo item transfers, core-module replacement and
full game save/load are not implemented. Room scenes have backgrounds, not a
complete room interaction system. HOTAS/gamepad flight integration is upcoming.

`npm run check` runs the complete quality gate. Focused tests cover the actual
ship, power/thermal/health state, equipment, scene/input lifecycle and rendering
contracts. Browser smoke checks are bounded observations, not universal gameplay
or real-device acceptance.
