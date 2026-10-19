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
ship.cooling.requestEnabled(true); // one powered engine cooling circuit
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
- **ShipCooling** owns its switch, power port and shared reactor/engine/damper/shield cooling circuit. Its pump uses the shared allocation; actual supply determines heat removal. Each module owns its temperature and overheat/restart state through a private `ModuleThermal` calculation. No module temperature is stored twice.
- **ShipShields** owns stored shield energy, recharge and powered protection; its own nonessential power port participates in the same allocation.
- **ShipHull** owns structural integrity and queued impacts. Shield overflow becomes hull damage; a breach is a game-rule signal.
- **ShipBody** owns mass, yaw inertia, position, velocity, yaw and yaw rate. It integrates the delivered force/torque exactly for a constant-force interval. Existing momentum is never rotated to follow the nose. Rotating the ship changes only the direction of subsequent local thrust. Yaw torque uses a single declared inertia axis, not a full 3D inertia tensor.
- **ShipMovement** is the attached fixed-step controller/coordinator: intent → engine/damper/cooling/shield demands → one power allocation → delivered forces and shield recharge → queued hit resolution → engine heat/cooling/restart → body integration → committed telemetry. It declares same-entity dependencies and a unique motion-writer claim. Rocket invokes it automatically; the UI does not update components individually or calculate positions.

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

Implemented: actual attached body/control/power/engine/dampers/cooling/shields/hull/movement, 3D translation, one yaw axis, commands, standby/activity costs, reserve generation/depletion, partial/zero delivery, inherited recharge eligibility and immutable telemetry. Runtime uses the existing headless Stage2D and Rocket clock; pause/single-step work on the same simulation path.

Not implemented: crew injury, destruction rules, cargo item transfers, collision, pitch/roll or general rigid-body dynamics, keyboard/mouse input handover, runtime equipment replacement, or the cockpit presentation adapter. The earlier capture calculation now lives in `games/ship/CaptureResponse.ts` and drives the powered damper component. It still describes nominal fully supplied response; power delivery determines actual motion and protection.

`npm run check` includes `tests/ship-architecture.test.ts`: actual engine/power/body outcomes, resource conservation, final partial versus zero supply, baseline admission/recharge, manual switches/coasting, yaw/thrust frames, normalized combined demand, independent ship lifetimes, coherent observations and fail-before-side-effect boundaries. Render-rate foundations are existing Rocket tests. Browser checks inspect the telemetry page; this is not a full game or real-device certification.

## Equipment JSON and initial state

The assembled ship now loads its data from `ships/science-ship.json`. That definition references seven independently editable equipment files in `profiles/`: `hull-starter.json`, `reactor-starter.json`, `engine-starter.json`, `dampers-starter.json`, `cooling-starter.json`, `shields-starter.json`, and `structure-starter.json`. Identifiers are explicit, lowercase, and must match their file reference. The typed, frozen profile is available through `ship.body.profile`, `ship.power.profile`, `ship.engine.profile`, `ship.dampers.profile`, `ship.cooling.profile`, `ship.shields.profile`, and `ship.hull.profile`. No starter equipment values remain compiled into the ship class.

Starting charge, velocity and separate reactor/engine/damper/shield temperatures live under the ship definition's `initialState`, separately from equipment specifications. Two ships can use the same equipment with different charge/velocity. This is a scene initialization document, not a completed save-game or runtime equipment installation format. Requested switches, reserve and motion evolve in their components and never rewrite JSON definitions.

`loadShipSetup()` fetches the definition, loads all referenced profiles, strictly validates exact fields, JSON numeric types, ranges, ids and loadout constraints, then returns an immutable setup. Invalid/missing JSON fails before entity attachment. Default browser fetches revalidate profile files, so reloading after a JSON edit does not reuse stale equipment definitions. There is no fallback profile, silent clamping, schema alias or older-format reader. The telemetry controls remain unavailable until loading succeeds; errors are shown on the page. Its equipment IDs and displayed specifications come from the loaded profiles.

To tune the demonstration, edit the relevant JSON and reload the telemetry page; `Reset ship` repeats the already loaded setup without fetching new data or pretending to install equipment in flight. JSON is served from the source `games/ship/` directory by the existing repository-root server; it is not copied into `dist`. Component code still owns calculations. Changing a coefficient changes the corresponding calculation input; a new mechanism still needs code.

`tests/ship-profiles.test.ts` reads the actual checked-in JSON and tests invalid documents, missing files, wrong ids, incompatible restart/charge values, independent initial state and an edited engine profile producing different motion. The same JSON files feed the existing architecture tests.

## Powered inertia dampers

Dampers start requested off. Enable their switch and request forward motion: the fully powered velocity servo approaches 300 m/s, reaching 95% of a command change in the profile’s three-second response time. Neutral commands bring linear drift and yaw rate toward zero. This is a force response with one ordinary body integration, not a velocity overwrite or hard cap. The helper page accepts a starting forward velocity applied only by Reset; the JSON initial velocity remains separate equipment-independent state.

Engaging above the assisted envelope selects one immutable `CapturePlan` from entry speed/direction. Capture first removes the excess along that trajectory; translation commands take over after capture. Yaw remains assisted. The reference **excess** of 12 km/s, four-second duration, curve power, duration-growth exponent and steepness growth are exposed in the damper JSON. They are illustration values. Higher excess speeds increase both capture duration and braking concentration, not Newtonian speed limits. At full supply, tenfold reference excess takes twice as long but produces substantially higher crew G.

The engine declares requested output before allocation. Dampers plan braking and supplementary engine assistance; assistance depends on the engine’s actual operating fraction. Both submit demand to the existing shared power ledger. The damper baseline is funded first; funded activity scales forces, torque and protection. Unpowered dampers contribute zero force/protection. Motion and requested switches survive power loss. Recovery re-evaluates capture from actual speed instead of continuing a stale trajectory. Partial supply advances the capture clock only by its operating fraction; nominal duration is not a guaranteed arrival time under starvation. Applied translational G comes from actual combined force divided by mass and standard gravity. Crew G applies the delivered suppression fraction; it is never clamped to a comfort/survival target. Seat orientation, rotational crew loads and injury rules are not modeled.

The existing 200 GJ reserve intentionally makes high-speed captures capable of running out of power. JSON values remain tuning inputs, not settled balance or a thermodynamic/reactor-efficiency model. The G display does not imply crew injury mechanics. Engine/damper heat and shared cooling are described below. Normal movement and power-loss/capture behavior are tested in `tests/ship-dampers.test.ts`; loading validates every referenced profile with the same strict boundary rules.

## Module heat and one shared powered cooling circuit

Engine and damper profiles each include heat capacity (J/K), waste-heat fraction of actual supplied electrical energy, trip/restart temperatures (K), manual-start duration and a longer thermal reboot duration. `initialState.engineTemperatureK` and `initialState.damperTemperatureK` are live-state initialization, not an equipment property. The page displays Celsius and provides separate reset temperatures. Cooling starts requested off for inspection; enable it through `ship.cooling.requestEnabled(true)` or its checkbox.

Both modules own a `ModuleThermal` instance. It shares thermal math and trip/reboot rules, without its own clock, power ledger or entity registration. Each fixed interval declares all loads and allocates once. Each module produces force and heat from actual delivery, including standby/startup electrical losses. Generated energy changes temperature by `Q / heatCapacity`. Crossing the upper threshold latches an overheat trip before cooling, so cooling cannot hide a threshold crossing within the interval. The completed interval still reports the force and energy it delivered; subsequent intervals produce no service from that tripped module. A tripped engine supplies no propulsion assistance. Tripped dampers supply no braking, assistance or crew-load suppression; an otherwise active engine still produces ordinary Newtonian thrust. Body integration and momentum remain untouched by shutdown.

The cooling circuit requests baseline power and pump power when either module begins the interval above its configured sink temperature. Remaining supply after baseline scales one rated heat-removal budget. After both modules generate heat, the budget is split in proportion to their stored heat above the sink (`temperature difference × heat capacity`). Per-module removals sum to the one circuit budget; neither target receives the entire rated capacity independently. Heat transfer is limited by actual available heat; it cannot make a module colder than the sink, and it never warms a colder module. The first cold interval may heat without pumping; demand catches up at the next fixed boundary. Cooling is a rate-limited circuit with explicit electrical coefficients, not a radiator-area, coolant-storage or thermodynamic simulation. There is no hidden passive cooling or free energy recovery.

A trip preserves requested-on state. The affected module must cool to the lower restart threshold, then complete its longer reboot delay using funded baseline power. No service is produced during that reboot. Missing power, manual off, or temperature above the restart threshold pauses progress. Toggling does not clear the thermal latch or shorten the reboot. A normal off/on cycle uses the shorter manual-start delay. Fully funded timers complete at a fixed boundary; operation can resume on the next interval. Ordinary energy depletion retains the existing recharge policy and does not create a thermal trip by itself.

Starter values deliberately heat quickly: 20 MJ/K heat capacity, 4% losses from up to 20.01 GW engine input, trip 420 K (~147°C), restart 350 K (~77°C). Cooling removes at most 40 MW while drawing 6 MW at full service. Cooling from trip to restart therefore takes roughly 35 seconds, followed by an eight-second powered reboot, versus a one-second normal manual start. Full thrust can still overheat even with cooling enabled. These are tunable demonstration values. The damper example uses 10 MJ/K, 8% supplied-power losses, a 370 K (~97°C) trip, a 330 K (~57°C) restart threshold and six-second thermal reboot versus a 0.25-second normal start. Both modules compete for the same 40 MW cooler. Reactor recovery is described below. Cooler heat, ship-wide heat transfer and damage are later work.

`tests/ship-thermal.test.ts` verifies heat from actual supply, heat/electrical conservation, partial/zero cooling, sink clamping, latched trips, lower-threshold recovery, powered/manual timing, no toggle bypass, same-interval threshold crossing, and no propulsion through dampers while the engine is tripped.

`tests/ship-damper-thermal.test.ts` verifies thermal loss of assistance/protection, coasting after interruption, reboot and capture replanning from actual velocity, proportional sharing without doubled cooling capacity, partial power, and heat conservation for both targets. Aggressive values remain laboratory settings; this step does not rebalance the intended flight-first game.

## Reactor heat and emergency recovery

`ShipPowerPlant` now owns reactor temperature and recovery, reusing `ModuleThermal` and the original ECS ledger. It chooses actual reactor availability/output before all loads declare, then accounts for generation/startup heat and reactor-only passive heat loss. The cooler shares its existing single removal budget across reactor, engine, dampers and shields; per-module transfers sum to that budget. Passive reactor removal is additional, explicit telemetry. Reactor heat is a configured ratio of generated electrical output (including spill) plus supplied starter power. Fuel, detailed fission/fusion conversion and radiator physics are not simulated.

A normal manual start or thermal reboot draws its declared starter W from the actual reserve through a utility port. It cannot generate until startup completes. Overheating preserves the requested-on switch. With a working reserve, powered cooling and the shorter ordinary reboot remain available. Manual off pauses startup without clearing a thermal trip.

If an unavailable reactor reaches zero reserve, the longer emergency path latches. Passive heat loss requires no reserve, allowing the reactor to reach its lower restart temperature without the powered pump. An independent auxiliary ignition mechanism then advances only the reactor restart timer; it does **not** put energy into the reserve or run ship services. Its separate fuel, heat and wear are not modeled. Existing longer delays survive repeated hot ticks and toggling, and switching the reactor off pauses ignition.

After ignition, the reactor produces reduced output. Utility loads such as cooling can operate, while nonessential ports (propulsion and shields) remain inhibited until the configured reserve fraction is restored. Engine/damper intent and requested states remain owned by their components, ready for normal operation after recovery. A held thrust command therefore cannot drain the emergency output before reserve recovery. `connect(restartEnergyJ, 'nonessential' | 'utility')` explicitly declares a load's class; this is not an unrestricted service-priority scheduler. New utility consumers must be budgeted against emergency output. The default loadout can recover with the cooling pump requested on. Zero-output fixture configurations represent a non-generating source and do not promise recharge.

Starter data: 450 K trip (~177°C), 360 K restart (~87°C), 8-second ordinary thermal reboot using 20 MW starter power, 30-second independent emergency start, 20% output (1 GW) until 10% reserve (20 GJ), and up to 50 MW passive reactor heat loss above 293.15 K. From 455 K with zero reserve, default recovery takes about 69 simulated seconds with cooling requested. Motion is never reset: the ship drifts during recovery. These are laboratory parameters; the penalty is time and vulnerability, not permanent stranding. A healthy online reactor at zero reserve keeps generating normally; emergency startup applies when the reactor is unavailable.

The JSON boundary requires positive passive removal, a passive sink below the restart threshold, an emergency delay longer than ordinary reboot, output/reserve fractions strictly between zero and one, and emergency output heat below passive removal. That last constraint prevents emergency generation itself from endlessly retripping before recharge. Normal full output may still overheat under the deliberately harsh tuning.

The page exposes starting reactor temperature/reserve and **Prepare emergency reboot test**. It prepares a hot reactor, empty reserve, 1,000 m/s drift, cooling enabled, and persistent propulsion requests; press **Run** to advance it. Telemetry shows reactor state, heat, passive/active removal, reserve-powered starter demand/supply, independent startup countdown and the propulsion lock. `initialState.reactorTemperatureK` is separate from equipment definitions. Reset repeats the selected initial conditions; it is not an in-flight repair action.

`tests/ship-reactor-recovery.test.ts` proves hot/empty recovery without credited energy before generation, slower empty than funded restart, escalation when normal startup runs out of reserve, no toggle bypass, reduced-output recharge under held propulsion requests, actual starter-energy/heat accounting, thermal trips, disposal and independent ships. Its full default-JSON scenario runs through all recovery phases at the production fixed step and verifies the electrical ledger throughout.

## Shields and minimal structural damage

```ts
ship.shields.requestEnabled(true);
ship.hull.hit(2e9); // incoming damage energy, queued for the next fixed tick
const { shields, hull } = ship.telemetry;
```

`ShipShields` owns a separate energy store, its requested switch and a nonessential power port on the existing allocator. Maintenance must be fully funded for protection; remaining supplied power recharges the store at the JSON efficiency. Partial recharge funding still permits protection when maintenance is funded. Power consumed below maintenance does not deliver service. Energy survives manual shutdown and outages, but an unpowered field absorbs nothing. Restoring power restores access to retained charge; it never copies that charge into the main reserve. Emergency reactor recovery inhibits shield supply alongside propulsion.

The store starts empty, shields requested off; `ShipHull` starts intact. These are fresh-ship construction rules, not a save-game reader. `shields-starter.json` exposes capacity, maintenance, recharge input/efficiency, hit recharge delay and restart reserve threshold. `structure-starter.json` defines a separate hull damage capacity in J. Damage capacity is a gameplay abstraction, not a material/penetration model. It does not duplicate body mass or motion.

The single fixed pipeline declares shield demand before allocation, recharges from funded input, then resolves all queued hits against that tick's powered field. Absorbed J are removed from the shield store; overflow reduces hull integrity, with excess beyond a breached hull reported separately. Recharge pauses after powered-field hits, including hits that exhaust the shield. The cooldown follows simulation time, including while switched off; paused simulations do not advance it. No damage is applied by the UI while simulation is paused. Input aggregation is bounded and rejected before mutation when invalid. Last-impact telemetry persists until the next hit; full ship telemetry remains an immutable committed snapshot.

The lab exposes shield/hull bars, switch, 2/12 GJ test hits and the last split. A breached hull is reported, but does not silently replace flight rules with a new death/destruction system; a future game controller will decide those consequences. Weapon mounts/groups, impact impulses, directional fields, and combat resistance remain separate steps. Shield conversion losses become module heat as described below. Reset creates a new empty shield and intact hull; ordinary switches preserve both. Disposing a ship removes its shield port and queued impacts.

## Emergency shield-energy diversion

```ts
ship.shields.startDiversion(); // switches protection off; does not advance time
ship.shields.cancelDiversion(); // preserves remaining charge, leaves shields off
ship.shields.requestEnabled(true); // also cancels any diversion before enabling
```

Diversion is an explicit transfer, never automatic. It switches the requested shield state off; completion or cancellation does not turn it back on or start recharging. `diversionW` is the maximum shield-store extraction rate (J/s); `diversionEfficiency` is the fraction arriving in the main reserve. The starter JSON uses 2 GJ/s and 80% efficiency: draining 10 GJ takes five seconds and credits 8 GJ, losing 2 GJ. Conversion loss is reported and becomes shield heat.

Each fixed tick first lets the reactor make its existing emergency/startup decision. The shield component then offers a rate-limited part of its store to `ShipPowerPlant.receiveTransferredEnergy()`, before ordinary load declarations and allocation. The power owner alone credits the reserve and returns the amount accepted; shields debit the corresponding source energy. No second reserve, allocator, clock or generator is introduced. A transferred joule is not reactor generation and does not create reactor generation heat. Accepted energy is available to real loads in that same tick, even with the reactor switched off or overheated. The transfer mechanism itself needs no main-reserve power; detailed converter hardware is outside this slice.

The power telemetry's `receivedEnergyJ` records transfer input for the committed interval. Electrical accounting becomes `reserve change = receivedEnergyJ + (generationW - consumptionW - spillW) * dt`. Shield telemetry separately records cumulative source draw, accepted energy and conversion loss for the current/last command; repeated starts during an active transfer do not reset these totals. Completed/cancelled totals persist until the next start. Transfer ends when shields empty or the reserve fills, preserving any source charge the reserve could not accept. Concurrent reactor generation can subsequently spill through the existing ledger. A full-reserve attempt does not discard shield charge. Transferring does not clear an already latched emergency restart timer or propulsion lock; those still follow their existing recovery rules.

Flight Foundry adds **Divert shield energy**, **Cancel diversion**, and committed transfer telemetry. Buttons issue commands; **Run** or **Single step** advances the transfer. Charge shields first, then divert while the main reserve has headroom. The shield checkbox reflects the requested-off sacrifice immediately, while energy readings continue to describe the last completed tick. Re-enabling shields cancels diversion explicitly. Reset and disposal retire the old transfer with the ship; no energy crosses ship lifetimes.

Tests cover extraction rate/efficiency, same-tick load funding with an unavailable reactor, no emergency reboot bypass, full/near-full reserve, cancelled and repeated commands, reactivation, empty stores, invalid inputs, disposal, and per-tick conservation with reactor generation and different fixed-step sizes.

## Shield heat, cooling and recovery

Shields now own the same `ModuleThermal` calculation as the other hot modules. The shield JSON requires a `thermal` object; initialization requires `initialState.shieldTemperatureK`. Both are strictly validated, including the shared cooler sink being below the shield restart temperature. The lab adds a separate starting shield temperature (applied by Reset), and the shield row now displays temperature, generated heat, circuit removal, thermal-trip status and restart time.

Heat is computed from actual energy flows: maintenance power times `thermal.wasteHeatFraction`, plus supplied recharge power minus energy actually stored, plus shield energy drawn for diversion minus energy actually accepted by the reserve. This avoids counting stored charge as heat, or adding an extra loss fraction to conversion energy already lost. The maintenance fraction applies only to maintenance/startup power for shields. Unmodeled maintenance energy is service expenditure outside this module's thermal mass. Hits drain shield charge but do not additionally heat the module in this slice. `ModuleThermal.generateHeat()` accepts these calculated losses directly; existing modules retain their original supplied-power fraction method.

Each fixed tick begins shield thermal accounting, transfers any permitted emergency energy, declares/allots electrical supply, delivers protection/recharge and resolves hits, then generates heat, distributes the one cooling budget, and finishes thermal state. Crossing the trip threshold latches a trip even if same-step cooling subsequently lowers temperature. Services delivered during that interval are retained in accounting; subsequent protection/recharge are disabled. Requested-on state and unspent charge survive, and manual toggling cannot erase the trip delay. Startup/reboot consumes supplied maintenance power, needs the lower temperature threshold, and progresses in proportion to funded maintenance. Charging and protection resume after boot completion. Pausing never advances timers.

Diversion remains independent of reactor power while thermally healthy. A trip interrupts the converter, preserves remaining charge and cumulative transfer totals, and prevents further diversion attempts until the shield module has cooled and completed its powered reboot. Completion does not silently restart diversion; issue another explicit command. This deliberately prevents switching off the field and immediately bypassing a latched thermal trip through the converter. The UI disables diversion while tripped. Re-enable shields with cooling/power available to recover the module.

`ShipCooling` now includes shields as its fourth target, distributing one rate-limited removal budget by each module's heat above the sink. Per-module removed-W readings sum to the one circuit total; reactor passive heat loss remains additional and separately reported. No second cooler, temperature store or clock is introduced. The starter shield uses 40 MJ/K capacity, 20% maintenance losses, 390 K trip (~117°C), 330 K restart (~57°C), 0.5-second manual start and 6-second powered thermal reboot. Charge/diversion efficiencies continue to determine their own conversion losses. These are laboratory parameters, not final game balance.

`tests/ship-shield-thermal.test.ts` covers actual conversion/maintenance heat, partial/zero supply, trip latching, charge preservation, loss of protection, slower powered reboot with no toggle bypass, interrupted diversion, shared four-module cooling/thermal conservation and initial/installation validation. Existing shield, power, motion, thermal and emergency tests use the updated strict profiles and initialization schema.

## Module health: first engine implementation

`ModuleHealth` is shared condition math, privately owned by the damageable engine. It is not a new behavior, ECS store, clock, inventory, repair service or damage dispatcher. It owns health points and an ordered pending damage/repair queue; the engine commits commands before declaring demand for each fixed tick. Immutable telemetry exposes points/max, health fraction, output fraction and failure. Queue order is meaningful: lethal damage followed by repair differs from repair followed by lethal damage. Each operation clamps to zero/capacity; invalid nonfinite/negative inputs fail before queuing.

```ts
ship.engine.damage(25); // test/game command, applied next fixed step
ship.engine.repair(25); // same boundary; no resource/repair-time policy yet
const condition = ship.telemetry.engine.health;
```

Engine JSON requires `health: { maxPoints, outputExponent }`. The ship's separate initialization requires `engineHealthPoints`, validated against the installed engine maximum. Starter values are 100 HP, full initial health, exponent 1: output capacity is `(points / maxPoints) ** outputExponent`. Damage reduces both thrust and yaw authority. Actual output is that condition factor times the existing power-funded fraction; telemetry separates `powerFraction` from delivered `activityFraction`. Nominal power demand stays unchanged for a damaged working engine: damage does not confer an efficiency discount. Existing supplied-power thermal losses are unchanged; no extra damage-induced heat coefficient is invented here. These remain explicit prototype service/power coefficients.

At zero health the engine reports `failed`, requests no power and produces no thrust/torque; existing body momentum and all other module state survive. Its requested-on switch is retained and toggling cannot repair it. Repairing a failed engine goes through its ordinary powered manual startup when requested on. Repair does not reset temperature or erase a thermal trip/reboot. Partial repairs restore partial authority. An engine repaired while switched off remains off. Initial damaged/failed configurations are supported by the strict initialization contract.

Dampers receive the nominal engine preview and apply the final combined power/condition factor once. This prevents assisted flight from silently restoring full propulsion or applying health degradation twice. Failed engines cannot obtain propulsion through dampers, although powered dampers retain their existing ability to brake drift.

The lab's module matrix gains a Health column; engine, reactor and cooling health are modeled; dampers and shields are still pending. Other rows show a dash rather than fabricated condition values. Dedicated engine damage, failure, partial repair and full repair controls are lab commands: they bypass shields/hull and charge no resources, and require Run/Single step to commit. There is no automatic repair or regeneration. Hull overflow, collisions, weapon hits and overheating do not select or damage modules yet. Failure propagation, permanent destruction/salvage, repair costs and health for shields/dampers/navigation/computer remain separate game rules/slices.

`tests/ship-module-health.test.ts` verifies ordered/clamped commands and boundary failures, immutable snapshots, configured degradation, actual force/torque and power accounting, combined power/condition limits, inertial coasting at failure, no switch bypass, repair/startup/thermal interactions, assisted-flight scaling and independent lifetimes. Loadout tests validate health JSON and initial bounds. All maintained ship fixtures use the required new initial-health field.

## Reactor health: independent generation condition

`ShipPowerPlant` owns a second, independent `ModuleHealth` instance for the reactor, reusing the exact helper proven by the engine. There is no global ship-health pool and no new health scheduler. Reactor profiles now require their own `health` definition, and initialization requires `reactorHealthPoints` bounded by the installed maximum. Starter values are 100 HP and a linear output curve. Damage/repair commands commit at the start of the shared fixed tick, before recovery decisions and load allocation.

```ts
ship.power.damage(25);
ship.power.repair(25);
const reactorHealth = ship.telemetry.power.health;
```

Actual reactor output is nominal output times its own health output fraction, additionally multiplied by the existing reduced-output fraction during emergency recovery. Generation heat follows actual generated output plus actual supplied starter power; thermal efficiency coefficients are unchanged. A damaged reactor reports `damaged` when otherwise operating normally; startup, overheating and emergency recovery states remain visible separately from its condition percentage.

Zero health reports `failed`, disables generation and starter demand, retains the requested switch and stops ignition progress. The reserve and its capacity are preserved: existing energy still funds loads normally until depleted, and shield-energy diversion still reaches the same reserve. Reactor damage is not battery/reserve damage. Powered cooling and reactor passive heat removal retain their existing operation. A failed reactor does not reset ship momentum or damage other modules.

Repairing failure with a reserve initiates the normal powered manual start. Repair does not erase temperature, thermal trips or longer emergency delays. If a failed/unavailable reactor has reached zero reserve, the emergency penalty latches as before, but independent ignition cannot repair broken hardware. The timer resumes only after health is repaired and existing requested/temperature conditions permit it. Recovery generation remains health-limited, so damage can make reserve recovery slower. Failing again during reduced-output recovery reinstates the full emergency restart delay; repair cannot immediately resume that output. Repairing a reactor switched off does not enable its switch.

Flight Foundry now shows reactor health in the module matrix and provides reactor damage, failure, partial repair and full repair commands alongside the engine controls. These are still explicit lab commands applied on the next step, bypassing shields/hull and using no repair resources. Dampers and shields do not yet have module-health effects; their independent condition instances are subsequent slices.

`tests/ship-reactor-health.test.ts` proves reduced/nonlinear generation, actual heat and electrical accounting, reserve-funded propulsion after reactor failure, manual startup and retained thermal trips after repair, failed/empty ignition gating, health-scaled emergency recovery, failure during reduced-output recovery, boundary validation and independent/disposed lifetimes. Existing actual-JSON emergency scenarios remain covered with full default health.

## Cooling health: one degraded shared circuit

`ShipCooling` now owns its own `ModuleHealth` instance. Its JSON profile requires `health: { maxPoints, outputExponent }`, and initialization requires `coolingHealthPoints`, bounded by its installed maximum. The starter pump uses 100 HP and linear degradation. Commands commit before cooling declares electrical demand, using the same ordered helper as engine and reactor.

```ts
ship.cooling.damage(25);
ship.cooling.repair(25);
const pumpHealth = ship.telemetry.cooling.health;
```

Effective removal capacity is nominal `maxCoolingW` times the existing funded pump fraction times the cooling health output fraction. A fully powered 50%-healthy starter circuit therefore removes at most 20 MW from all four modules combined. Allocation between reactor, engine, dampers and shields still shares that one budget according to heat above the sink; it does not multiply the budget per target. Per-module removed-W readings still sum to the circuit total and sink limits still apply. Electrical demand for a damaged working pump stays nominal; damage does not give it an efficiency discount. Telemetry exposes `powerFraction` separately from the combined `activityFraction` and condition.

Zero health reports `failed`, requests no pump power and performs no active heat removal. Its requested-on switch remains remembered, and toggling does not repair hardware. Other modules continue generating their actual heat and may reach their existing thermal shutdown thresholds. Reactor passive cooling is independent and remains available, including during emergency recovery. Cooling failure does not directly subtract another module's health or automatically repair itself.

A repair restores only the repaired capacity on the next simulation step, when the pump is requested on and actual power is supplied. A manually disabled pump remains off. This pump currently has no separate startup timer or its own temperature model; health does not invent one. Repairing cooling can lower other module temperatures but does not erase their latched trips or powered reboot delays. Module repair resources, permanent destruction and automatic fault propagation remain game-specific future work.

Flight Foundry adds cooling health to the existing matrix and cooling damage/failure/partial/full repair lab buttons. Lab commands bypass shields/hull, cost no resources, and commit only through Run/Single step. Engine, reactor and cooling now have independent condition; dampers and shields remain the next two health integrations.

`tests/ship-cooling-health.test.ts` covers the single four-target degraded budget, thermal/electrical conservation, multiplied power/condition limits, nonlinear profiles, zero-demand pump failure, continued passive cooling, repaired/off pump behavior, engine overheating after pump failure with retained thermal reboot, invalid inputs and independent/disposed lifetimes. The strict loadout tests cover cooling-health profiles and initial bounds.

### Damper condition

`ShipDampers` owns independent `ModuleHealth`, configured by its required JSON
`health: { maxPoints, outputExponent }` and `initialState.damperHealthPoints`.
The starter module has 100 HP and linear degradation. Queued `damage(points)`
and `repair(points)` commit before demand declaration on the next fixed step.
Telemetry includes immutable health, electrical `powerFraction`, and effective
`activityFraction = powerFraction * health.outputFraction`.

Condition scales all damper force, yaw torque and crew suppression. With the
starter's 1% nominal transmission, a fully funded 50 HP module transmits 50.5%
of ship load; this is not a crew-load cap. A damaged working module retains
nominal demand and electrical heat losses. Zero HP stops damper demand,
assistance and suppression without changing body momentum or engine operation.
Other modules retain their own health.

Repair preserves the requested switch and existing thermal trip/reboot. Repair
from failure uses manual startup when requested on. Interrupted capture replans
from actual velocity when assistance returns; the capture clock advances by
effective activity, so its displayed plan duration is not a guaranteed wall-clock
arrival time under damage or partial power. Neutral assisted braking continues
after the capture plan ends. No health command sets body velocity directly.

Flight Foundry's module matrix and damper condition buttons expose this behavior.
Lab repairs are free and damage bypasses shields/hull; automatic damage routing,
crew injuries and module repair economies remain outside this slice.

### Shield condition

`ShipShields` owns its own `ModuleHealth`, required JSON `health` profile and
`initialState.shieldHealthPoints`. The starter has 100 HP with linear output.
Queued damage/repair commit in `beginStep`, before diversion, demand and hits.
Health is separate from stored field energy and hull integrity.

A powered field absorbs `min(stored energy, impact * health.outputFraction)`;
the hull receives the remainder through its existing hit ledger. Only absorbed
energy is debited. The committed `protectionFraction` reports this fraction,
including zero when off, failed, unpowered or thermally unavailable. Recharge
conversion efficiency is nominal efficiency times health output. Lost recharge
input becomes heat; demand is trimmed to remaining capacity using that effective
efficiency. Capacity itself does not shrink and damage never deletes charge.
At full charge, a damaged field still draws its normal maintenance power.

Failure stops field maintenance and recharge, retaining charge and the requested
switch. Repair from failure invokes manual startup, preserves thermal trips and
longer reboots, and does not refill charge. A repaired module requested off stays
off. The emergency diversion converter remains independent of field health:
stored energy can still be salvaged at the configured rate/efficiency when the
field generator has failed. Diversion still switches the field off, generates
conversion heat and respects the existing thermal trip lockout.

Flight Foundry includes shield health and absorption telemetry plus lab
condition controls. These direct lab commands are free and bypass hull/shield
routing. Automatic module damage, repair resources and destruction remain future
game rules.

### Interdimensional cargo link

`ShipCargo` attaches through the same typed capability API as other modules. Its
required `cargo-starter.json` profile defines power, health, heat, startup/reboot,
`graceSeconds` and `stabilizationSeconds`. Initial state supplies cargo health,
temperature and a stable pocket reference ID. The ship owns `CargoLink` separately
from its equipment; it contains access state, not item stacks or another inventory.
Workshop remains the inventory authority when goods are integrated later.

The pocket starts connected. Any interval without operational, fully funded,
non-tripped service starts one countdown: connected → interrupted → connected
or permanently lost. Manual shutdown, power shortage, health failure and thermal
shutdown use the same rule. Interrupted access is unavailable. Restoring service
must complete continuous stabilization strictly before expiry; momentary power
and repeated toggles cannot reset the existing deadline. An interruption resets
stabilization progress, not remaining grace. Stable recovery rearms the next
emergency window. Expiry wins an exact tie. Lost access stays lost after module
repair/restart, and the lost link no longer requests maintenance. No inventory is
deleted, recreated or copied by a link transition.

The starter's **18 s grace / 2 s stabilization** are editable trial values, not
settled balance. All timing advances only on the ship's existing fixed step.
A new module observing the same `CargoLink` sees its current deadline/loss state;
equipment destruction/disposal cannot erase it. Runtime swapping and persistence
are not implemented. Explicit Reset ship creates a fresh lab scenario.

Healthy maintenance costs 20 MW; damage scales demand by `2 - health.outputFraction`
(up to twice nominal near failure). Zero health disables the equipment; repair
respects manual startup and thermal trip/reboot. Electrical heat enters the existing
shared circuit, whose telemetry now reports `cargoRemovedHeatW`. No new allocator
or clock is introduced. Flight Foundry exposes the module switch, health controls,
access state, remaining window and stabilization progress.

This slice proves the powered link lifecycle. Item transfers, mass-dependent
costs, inertial coupling, save/restore and world recovery missions remain separate.
The pocket ID is the future inventory reference seam; it does not claim a working
Workshop transfer integration.

### External mounts and fire groups

`ship.mounts = this.attach(new ShipMounts(profile.mounts))` owns the external
loadout and group matrix. The starter JSON defines seven slots accepting weapons
or utilities, two independently identified pulse cannons, one survey scanner,
four empty slots and six groups. Slot/group counts and accepted kinds belong to
the ship profile; seven and six are starter configuration, not runtime limits.
The equipment catalogue declares type and display label only in this slice.

```ts
ship.mounts.install('mount-4', 'mining-laser', 'mining-tool-port');
ship.mounts.assign('group-2', 'mount-4', true);
ship.mounts.selectGroup('group-2');
// The next ship fixed tick commits these commands.
ship.telemetry.mounts.selectedWeapons;
ship.mounts.remove('mount-4');
```

Slots have stable IDs; installations have separate unique instance IDs. Multiple
installations may use one equipment definition. Unknown IDs, occupied/incompatible
slots and reused installation IDs fail before staging that command. A rejected
command preserves earlier valid queued edits. Removing equipment clears its
membership in every group. Reinstalling into that slot never inherits membership.
Only installed weapons can join fire groups; utilities cannot. A weapon can join
several groups and all installed weapons may join one group. Empty groups are
valid. The selected group returns each installed weapon once, in loadout order.

Commands stage validated state; the existing ship coordinator commits it at its
next fixed boundary and includes an immutable snapshot in telemetry. Paused
commands do not alter committed readings. Disposal drops pending edits and rejects
further commands. The grouping logic has no private clock or inventory. Powered device operation
now uses per-installation ports on the existing ship ledger, as described below.
Selection alone does not fire a weapon.

Flight Foundry exposes a slot/equipment editor, selected group and per-slot group
checkboxes. Its free installation commands create lab instance IDs; they do not
transfer goods from Workshop. Run/Single step applies edits. Projectiles, inventory-backed installation/removal and mount positions/orientation
remain separate slices. Powered operation and per-device condition are described below. `ShipInternals` remains a
separate future capability for replaceable onboard installations, without fire
group behavior.

### Powered mounted equipment

Mounted equipment now declares required JSON `health`, `thermal`,
`initialTemperatureK`, `baselineW`, `operatingW`, `outputEfficiency` and
`restartEnergyJ`. Validate these against the ship's reserve and cooling sink
before constructing the loadout. Each installation owns independent health,
thermal state, an exact power port and cumulative output. New lab installations
start at full health, their configured temperature and requested off. Slot hardware
itself is not an additional health pool.

```ts
ship.mounts.requestEnabled('mount-1', true);
ship.mounts.requestFiring(true); // sustained selected-group trigger
ship.mounts.damage('mount-1', 25); // lab command
ship.mounts.repair('mount-1', 25);
ship.mounts.requestFiring(false);
```

Commands commit on the existing fixed tick. Enabled equipment funds baseline and
manual startup even when not firing. Only enabled weapons in the selected group
request operating power while the trigger is on; enabled utilities request it
independently of fire groups. There are no automatic trigger events from group
selection. Changing group while the trigger is held changes the serviced weapons
on the next tick. Empty groups and disabled/failed devices produce no weapon output.

Output uses a **continuous-energy** demonstration contract, not ammunition,
projectiles, shots or hull damage. After fully funding baseline, remaining supplied
power funds operation. Useful output is funded operating input times equipment
output efficiency times health output fraction. Health degradation therefore
reduces output without a free electrical discount. Heat is baseline power times
its configured waste fraction plus operating input minus useful output. A device
reports interval output joules, cumulative output joules, actual power, heat,
health and operating/restart state; these are not a count of shots or damage dealt.

Zero health removes equipment demand/output while remembering the requested state.
Repair invokes manual startup and never erases an existing thermal trip/reboot.
Thermal thresholds latch before shared cooling, so a threshold crossed during the
interval still trips even if the cooler immediately removes that heat. Delivered
output remains credited to that interval; subsequent output stops. The existing
cooling circuit includes the mounted devices in its ONE removal budget and reports
`mountRemovedHeatW`. The mount bank distributes only its allocated cooling energy
proportionally among device temperatures above the sink. No second power allocator,
cooling capacity or simulation clock exists.

Removal requires requested off (or a queued off command) and temperature at/below
the device's restart threshold. It retires the exact port and clears group
assignments. Installation IDs cannot be recycled during the ship lifetime; new
hardware gets a new identity and cannot inherit an old runtime accidentally. This
lab creates fresh devices for free; inventory-backed preservation of existing
items/condition and runtime save/restore remain future contracts.

Flight Foundry provides per-slot enable/disable, damage/repair, a selected-group
trigger and live device telemetry. Editing controls persist across ordinary
telemetry refreshes. Projectiles, aiming, hit routing, ammunition, recoil and real
utility effects remain outside this power/heat/health proof.

### Replaceable internal installations

`ship.internals` is a typed attached capability with configurable internal slots,
independent installation identities and a catalogue loaded from JSON. The starter
has seven slots, with a fabricator, refinery, galley, fridge, science lab,
infirmary and quarters installed. An internal definition owns its power/thermal/
health profile and may bind a Workshop facility and/or local inventory; both are
nullable, allowing a powered room with neither. Occupancy and room scenes are not
implemented. External fire groups remain specific to `ShipMounts`.

Mounts and internals reuse `PoweredModule` (extracted from `MountedEquipment`)
for per-installation power, heat, condition and recovery. Internals never enter
fire groups. Enabled internals request their rated operating power even when
waiting for materials; this first model does not charge exact batch energy.

The ship/lab owns one `production-workshop` 2.4.0 `Simulation`, passed to
`ShipInternals`. Slots bind to stable facility/inventory IDs. Workshop alone owns
stock, reservations, jobs and production outcomes. The fabricator recipe is
**2 alloy → 1 machine part in 3 seconds** under full funded/healthy operation.
The refinery converts **2 ore → 1 alloy in 4 powered seconds** (40-unit buffer);
the galley converts **2 ingredients → 1 meal in 3 seconds** (20-unit buffer).
The fabricator has a 20-unit buffer. The fridge is inventory-only, with 60 units
of food storage and the same power, heat, health and cooling lifecycle. It has
no production job or food spoilage model. Outages retain its stock.

The science lab consumes **1 machine part → 1 science point in 6 powered
seconds**. Science points are Workshop currency in its 30-unit local buffer,
not a technology-unlock system. The part represents consumed research equipment
in this provisional recipe. The infirmary consumes **2 medical supplies →
1 health pack in 4 powered seconds**, with a 30-unit buffer. It produces supplies;
crew treatment and health-pack consumption are not implemented. Both share the
existing power/thermal/health gates, interruption recovery and stock transfers.
Quarters use the same powered installation lifecycle without a facility or
inventory; occupancy and fatigue reduction wait for the crew model. No stockpiled
fatigue-reduction resource is created. These costs and timings are demonstration
values in JSON.

JSON `inventoryAccepts` rules restrict each buffer to its inputs/outputs; the
fridge accepts ingredients and meals. Workshop enforces admission atomically.
`ship.internals.transfer(fromSlot, toSlot, resourceId, quantity)` queues one
Workshop transfer: insufficient unreserved stock, capacity or admission refusals
leave both inventories intact. Transfers and physical buffer access do not
require powered machinery. These buffers are independent of `ShipCargo`'s pocket link.
The lab's supply/collect commands create or remove test stock for free rather
than claim a trading/cargo integration. Initial installation also costs nothing;
this slice uses explicit operator slots without construction/population costs.

```ts
ship.internals.supply('internal-1', 'alloy', 4); // lab stock, next fixed tick
ship.internals.requestEnabled('internal-1', true);
ship.internals.setDraining('internal-1', true); // finish active batch; no new starts
ship.internals.collect('internal-1', 'part', 1);
ship.internals.requestEnabled('internal-1', false);
ship.internals.remove('internal-1'); // refuses active work or remaining goods
ship.internals.transfer('internal-2', 'internal-1', 'alloy', 2);
ship.internals.transfer('internal-3', 'internal-4', 'meal', 1);
// After draining, evacuating and removing an installation, reuse its slot:
ship.internals.install('internal-2', 'fabricator-starter', 'fabricator-second');
```

Inventory/installation commands are queued to the ship boundary. Ordinary refusals
(e.g. full stock, empty slot, busy/occupied installation) leave state intact and
appear in persistent `telemetry.internals.commands` results. Invalid identifiers,
quantities and profiles fail on entry. Unexpected disagreement with a validated
Workshop removal preflight aborts loudly instead of reporting partial success.
Health commands use the same next-step health helper as the other modules.

After power/thermal calculation, the adapter sets Workshop's named `powered`,
`temperature-safe` and `healthy` conditions, and uses a production modifier for
health derating. Any loss of full operating supply pauses starts, progress and
publication; a zero productivity multiplier alone is not used as the outage gate.
Consumed batch inputs remain spent, progress remains intact, and restoration
finishes the same batch. Thermal trips latch before shared cooling. Internals
share the existing ONE cooling budget (`internalRemovedHeatW`).

Workshop advances exactly once per ship interval, regardless of installation count.
Its own fractional fixed-tick accumulator is retained. A Workshop tick is
conservatively blocked if any contributing ship interval lacked service, so a
brief reconnection cannot backdate eligibility over an outage. A mixed advance
may delay resumption by another host interval; no retroactive fractional work,
second clock or per-installation timer is introduced. This lab owns an isolated
ship world; a later multi-ship world must own and advance its shared Simulation
centrally rather than advance one shared instance through several ships.

Safe removal requires requested off and temperature below the restart threshold,
no Workshop active-work/population/capacity blockers and no goods, reservations,
external references or active deliveries in its buffer. Only the installation's
own facility reference/attachment are discharged by removal. Draining still needs
power/cooling to finish work. Removal retires the facility, empty buffer and exact
power port; it never deletes stock to make space. New installations need fresh IDs.
Equipment disposal gates its facility off but preserves Workshop state. Closing an
inspection view does not dispose equipment or stop the simulation.

Flight Foundry's main module table includes internals. Its separate inspector uses
Workshop facility snapshots and inventory summaries, plus ship power/health/heat;
there is no assumed package inspection widget hook. Read models are detached and
frozen. The inspector refreshes at the existing UI cadence, not through nested
observer commands. Save/restore, real cargo transfers, physical occupancy,
crew treatment, research unlocks, fatigue recovery and food spoilage remain later slices.

### Factory operators

Every onboard factory declares one Workshop `workerSlots` entry and a mandatory
`staffed` condition. Initial slots are empty. The host reports an already-present
operator with `ship.internals.assignWorker(slotId, workerId)`; `null` unassigns.
No ingredients are consumed and no work or publication advances without an
operator, even with full power and a specialist bonus. Unassignment preserves
active batch inputs and progress. Power/health failure retains the assignment;
it does not secretly move the person to another station.

`internals-starter.json` owns the small lab roster and per-definition staffing
profile. Any roster member operates at baseline efficiency. Matching engineer
(refinery/fabricator), scientist (science lab), physician (infirmary), or navigator
(galley) gets `specialistMultiplier` (initially 1.25). Workshop's worker efficiency
combines with the existing independent health modifier. The host validates crew
membership and refuses duplicate assignments; Workshop also enforces identity
exclusivity across its worker slots. Unassign before moving to another station.
Removal retires the old factory slot, freeing its worker. Fridge and quarters have
no operator slots. They retain their existing power/health/heat behavior.

This deliberately uses Workshop's documented explicit-slot model, not its
construction-time workforce pool. No residence/population is created in every
local buffer, and no crew is duplicated as an inventory resource. Assignment is
a lab assertion of presence; character travel, attendance and fatigue are future
crew integration. All assignment commands commit at the existing ship boundary.

### Ship navigation · first Flight Foundry slice

`ship.navigation` is a typed attached capability that depends on `ShipBody`.
`ShipMovement` commits its fix **after** the sole body integration and stores it
in the same immutable `ship.telemetry.navigation` frame. It never changes intent,
forces or velocity, and adds no timer. The existing UI cadence draws the lab scope.

The host supplies known landmarks as the optional third `Ship` constructor
argument, or replaces them with `ship.navigation.setContacts(contacts)`.
Each has a stable `id`, `label`, fixed-world `positionM` and `arrivalRadiusM`.
Contact updates are validated/copied atomically; removing the selected contact
clears the destination at the next committed fix. Selection also commits at the
next ship step: `ship.navigation.selectDestination(id)` or `null` to clear.
No source object is retained as mutable navigation state.

Readings contain position, velocity, heading, speed and contact fixes: 3D range,
absolute and ship-relative bearing, elevation, local offsets, closing speed,
arrival status and a nullable range/closing-rate time. Positive closing speed
means approaching; stationary or receding contacts have no time estimate.
The estimate assumes constant closing rate to the arrival-radius boundary; it
is not a trajectory intercept, stopping distance, docking or autopilot solution.
The model follows the existing ship convention: +Z forward, +X right, +Y up,
positive yaw turns +Z toward +X; bearings are degrees clockwise from world +Z.

Flight Foundry supplies four illustrative beacons from
`apps/flight-foundry/navigation-contacts.ts`. Its 10 km heading-up scope projects
horizontal offsets; elevation is reported separately. The full destination list
includes contacts outside scope range. These are known world landmarks, not
sensor detections. The current spatial index is 2D, so this four-contact 3D view
uses direct distance calculations rather than inventing a second spatial system.
No navigation power/thermal/health profile, collision or sensor occlusion is
claimed by this first guidance slice. The cockpit renderer is unchanged.
