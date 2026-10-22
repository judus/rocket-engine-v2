# Farwake

A cockpit game prototype built with Rocket Engine. Local entry: `/games/farwake/`.
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

## Presentation and controls

The cockpit contains navigation, system and overhead instruments, alert lamps,
windshield HUD and display mode. The crew page has portraits, placeholder stats,
paginated unlocked biography sections and looping video-call previews. Current
call choices are placeholders. Aboard opens background inspection scenes.

Menu, Settings and compartment scenes pause the retained flight simulation;
windshield display mode does not. Escape backs out of the active panel, then
opens the menu. C/right mouse switches mouse steering and cursor use while
keyboard flight remains available. I toggles windshield display mode separately.
Settings persist browser preferences, not a ship save. Mobile controls and video
settings are implemented, but the broader device-specific input redesign and
in-depth tablet profiling remain planned work.

## Current limits

Mounts calculate funded output, heat and health; they do not yet spawn projectiles,
hit world targets or apply combat damage. Shield/hull damage exists as a model
contract and lab commands. World collision, a combat loop, crew injury/fatigue,
real call dialogue outcomes, cargo item transfers, core-module replacement and
full game save/load are not implemented. Room scenes have backgrounds, not a
complete room interaction system. HOTAS/gamepad flight integration is upcoming.

`npm run check` runs the complete quality gate. Focused tests cover the actual
ship, power/thermal/health state, equipment, scene/input lifecycle and rendering
contracts. Browser smoke checks are bounded observations, not universal gameplay
or real-device acceptance.
