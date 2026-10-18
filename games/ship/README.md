# Assembled ship — architecture proof

Open <http://localhost:8092/apps/flight-foundry/ship.html> after the usual `npm run start`. The game-owned ship source lives here; its HTML telemetry instrument lives under `apps/flight-foundry/`. Existing cockpit rendering, motion bench and curve planners are unchanged.

## The assembly is the example

```ts
const runtime = new Rocket({ fixed: { step: 1 / 60, maxSteps: 12 } });
const stage = runtime.scene(new Stage2D({ fixed: true }), { keepAlive: true });
const setup = await loadShipSetup(
  new URL('/games/ship/ships/science-ship.json', location.href),
);
const ship = stage.entity(() => new Ship(setup.profile, setup.initialState), {
  id: setup.profile.id,
});

ship.control.thrust({ x: 0, y: 0, z: 1 }); // persistent ship-local intent
ship.control.turn(0.5); // yaw intent, not a forced orientation
ship.dampers.requestEnabled(true); // powered assisted flight; false coasts
ship.engine.requestEnabled(false); // normal module command
ship.power.requestEnabled(false); // reactor off; reserve still exists

const reading = ship.telemetry; // one immutable completed-step snapshot
await runtime.start(); // no canvas required
```

`Ship.ts` attaches ordinary typed capabilities with the established `this.attach(new …)` syntax. Handles retain concrete types; no string component lookup, property bag or new ECS framework is exposed. The Node2D attachment host's 2D transforms are unused: authoritative 3D translation and yaw live in `ShipBody`. This is not a new general 3D node facade.

- **ShipControl** owns requested translation/yaw intent. It validates and normalizes translation so diagonal input cannot gain extra thrust. HTML controls, a future input adapter, AI or scripts can issue the same commands. The current page is a command instrument, not a pointer-capture/input-preset demo. Multiple controllers are not arbitrated yet.
- **ShipPowerPlant** owns reserve, reactor request and power ports. It wraps the actual existing `examples/ship/ShipPower.ts` J/W ledger rather than copying another allocator. Typed ports submit demand and receive allocated supply. World/ECS details remain private. Port registration/removal is tied to each consuming capability’s attachment/disposal.
- **ShipEngine** owns requested enable state and the installed engine profile. Each tick it declares baseline + activity demand, then converts actual allocation into thrust and yaw torque. It never subtracts reserve itself. Partial allocation first funds the baseline; remaining supply scales translation and yaw together. Below baseline, no operation is delivered. Energy spent during that incomplete baseline is still accounted for.
- **ShipDampers** owns requested enable state, a separate JSON profile, assistance and capture planning. It registers its own power port. Propulsion assistance scales with actual engine delivery; powered damping can arrest drift even with the engine disabled. It contributes world force and yaw torque, never body/reserve mutations. Translation and yaw damping effort plus drive assistance determine demand; opposing efforts still consume power even when their net force is small.
- **ShipBody** owns mass, yaw inertia, position, velocity, yaw and yaw rate. It integrates the delivered force/torque exactly for a constant-force interval. Existing momentum is never rotated to follow the nose. Rotating the ship changes only the direction of subsequent local thrust. Yaw torque uses a single declared inertia axis, not a full 3D inertia tensor.
- **ShipMovement** is the attached fixed-step controller/coordinator: intent → engine and damper demands → one power allocation → combined delivered force/torque → body integration → committed telemetry. It declares same-entity dependencies and a unique motion-writer claim. Rocket invokes it automatically; the UI does not update components individually or calculate positions.

There is one fixed-step path and one advance per body. Different ships have independent owned power ledgers and bodies, so attachment order between independent ships does not share or steal reserve. A future shared collision/physics service would be stepped by its world owner, not once per ship.

## Observe the actual behavior

1. Click **Full forward**, then **Run**. With adequate supply, a 100,000 kg body and 1 MN thrust accelerate at 10 m/s². After one second, forward velocity is 10 m/s and displacement is 5 m.
2. Click **Neutral / coast**. Thrust/torque commands stop; linear and angular momentum remain. The enabled engine still draws its baseline.
3. Disable the engine. Baseline demand disappears; the ship keeps coasting. Enabling it preserves body state and reserve.
4. Leave full thrust requested. The deliberately small demonstration reserve depletes; the final partial tick delivers reduced thrust. Subsequent zero-delivery ticks produce no stale thrust. The reactor recharges and the requested-on engine becomes eligible again at the ledger's restart threshold.
5. Apply yaw, then opposite yaw to arrest rotation. Forward thrust follows the current heading; coasting velocity does not. Up/down and strafe demonstrate three translational axes.

The default profile uses 200 GJ capacity, 100 GJ initial reserve, a 5 GW reactor, 10 MW engine baseline, 20 GW full translation and 1 GW full yaw. These are explicit prototype power-to-service coefficients, not a validated rocket-efficiency model. The ledger's recharge hysteresis and proportional sharing are existing trial policies, not final supply priorities or a complete reboot state machine. The short depletion/recharge cycle is intentional for inspection; no power-trip damage, thermal grace period or stable-restart guarantee is claimed.

All instruments read `ship.telemetry` after a completed step, including forces applied over that interval and the end pose/reserve. Public component telemetry should be read at the same committed boundary; it is not a substitute for provisional stage inputs. Reset constructs a fresh scene/ship and disposes the old attachments. Ordinary commands and module switches never recreate ship machinery. Removing/disposing a ship stops its fixed work and retires its power ports.

## Scope and checks

Implemented: actual attached body/control/power/engine/dampers/movement, 3D translation, one yaw axis, commands, standby/activity costs, reserve generation/depletion, partial/zero delivery, inherited recharge eligibility and immutable telemetry. Runtime uses the existing headless Stage2D and Rocket clock; pause/single-step work on the same simulation path.

Not implemented: heat/cooling, injury/damage, cargo, collision, pitch/roll or general rigid-body dynamics, keyboard/mouse input handover, runtime equipment replacement, or the cockpit presentation adapter. The earlier capture calculation now lives in `games/ship/CaptureResponse.ts` and drives the powered damper component. It still describes nominal fully supplied response; power delivery determines actual motion and protection.

`npm run check` includes `tests/ship-architecture.test.ts`: actual engine/power/body outcomes, resource conservation, final partial versus zero supply, baseline admission/recharge, manual switches/coasting, yaw/thrust frames, normalized combined demand, independent ship lifetimes, coherent observations and fail-before-side-effect boundaries. Render-rate foundations are existing Rocket tests. Browser checks inspect the telemetry page; this is not a full game or real-device certification.

## Equipment JSON and initial state

The assembled ship now loads its data from `ships/science-ship.json`. That definition references four independently editable equipment files in `profiles/`: `hull-starter.json`, `reactor-starter.json`, `engine-starter.json`, and `dampers-starter.json`. Identifiers are explicit, lowercase, and must match their file reference. The typed, frozen profile is available through `ship.body.profile`, `ship.power.profile`, `ship.engine.profile`, and `ship.dampers.profile`. No starter equipment values remain compiled into the ship class.

Starting charge and velocity live under the ship definition's `initialState`, separately from equipment specifications. Two ships can use the same equipment with different charge/velocity. This is a scene initialization document, not a completed save-game or runtime equipment installation format. Requested switches, reserve and motion evolve in their components and never rewrite JSON definitions.

`loadShipSetup()` fetches the definition, loads all referenced profiles, strictly validates exact fields, JSON numeric types, ranges, ids and loadout constraints, then returns an immutable setup. Invalid/missing JSON fails before entity attachment. There is no fallback profile, silent clamping, schema alias or older-format reader. The telemetry controls remain unavailable until loading succeeds; errors are shown on the page. Its equipment IDs and displayed specifications come from the loaded profiles.

To tune the demonstration, edit the relevant JSON and reload the telemetry page; `Reset ship` repeats the already loaded setup without fetching new data or pretending to install equipment in flight. JSON is served from the source `games/ship/` directory by the existing repository-root server; it is not copied into `dist`. Component code still owns calculations. Changing a coefficient changes the corresponding calculation input; a new mechanism still needs code.

`tests/ship-profiles.test.ts` reads the actual checked-in JSON and tests invalid documents, missing files, wrong ids, incompatible restart/charge values, independent initial state and an edited engine profile producing different motion. The same JSON files feed the existing architecture tests.

## Powered inertia dampers

Dampers start requested off. Enable their switch and request forward motion: the fully powered velocity servo approaches 300 m/s, reaching 95% of a command change in the profile’s three-second response time. Neutral commands bring linear drift and yaw rate toward zero. This is a force response with one ordinary body integration, not a velocity overwrite or hard cap. The helper page accepts a starting forward velocity applied only by Reset; the JSON initial velocity remains separate equipment-independent state.

Engaging above the assisted envelope selects one immutable `CapturePlan` from entry speed/direction. Capture first removes the excess along that trajectory; translation commands take over after capture. Yaw remains assisted. The reference **excess** of 12 km/s, four-second duration, curve power, duration-growth exponent and steepness growth are exposed in the damper JSON. They are illustration values. Higher excess speeds increase both capture duration and braking concentration, not Newtonian speed limits. At full supply, tenfold reference excess takes twice as long but produces substantially higher crew G.

The engine declares requested output before allocation. Dampers plan braking and supplementary engine assistance; assistance depends on the engine’s actual operating fraction. Both submit demand to the existing shared power ledger. The damper baseline is funded first; funded activity scales forces, torque and protection. Unpowered dampers contribute zero force/protection. Motion and requested switches survive power loss. Recovery re-evaluates capture from actual speed instead of continuing a stale trajectory. Partial supply advances the capture clock only by its operating fraction; nominal duration is not a guaranteed arrival time under starvation. Applied translational G comes from actual combined force divided by mass and standard gravity. Crew G applies the delivered suppression fraction; it is never clamped to a comfort/survival target. Seat orientation, rotational crew loads and injury rules are not modeled.

The existing 200 GJ reserve intentionally makes high-speed captures capable of running out of power. JSON values remain tuning inputs, not settled balance or a thermodynamic/reactor-efficiency model. No heat/cooling or injury mechanics have been implied by the new G display. Normal movement and power-loss/capture behavior are tested in `tests/ship-dampers.test.ts`; loading validates the fourth profile with the same strict boundary rules.
