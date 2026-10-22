# First ship-power ECS slice

The Hi3D cockpit now runs a reactor, ship energy reserve and one switchable
**ENGINE (TEST)** load. The test load does not drive propulsion yet. Heat,
cooling, thermal shutdown/reboot, dampers and weapon groups are later slices.

## Engine storage and application rules

`src/ECS.ts` exports `World`, `Component<T>` and `Entity` from the main engine
entry point. Components are typed identities, entities hold data, and queries
join component membership. Entity identity belongs to one world; destroyed or
foreign entities cannot receive components. Queries return membership snapshots;
component values remain mutable data references. Remove/destroy/clear release
stored references. There is no second scheduler, hierarchy or rendering model.

```ts
const world = new World();
const position = new Component<{ x: number }>('position');
const velocity = new Component<number>('velocity');
const entity = world.create();
world.set(entity, position, { x: 0 });
world.set(entity, velocity, 2);
for (const entity of world.query(position, velocity)) {
  world.get(entity, position)!.x += world.get(entity, velocity)! * dt;
}
```

Ship rules belong to `games/farwake/PowerLedger.ts`, outside engine storage.
The ship entity owns `EnergyReserve`; modules carry `ShipOwner` and `ShipModule`,
plus `Reactor` or `PowerLoad`. `shipPowerSystem(world, dt)` runs from the existing
Rocket scene's fixedUpdate at 60 Hz. Render/update frequency, paused instrument
textures, cursor/UI mode and pointer capture do not schedule the power system.
The normal engine visibility/stop policy still applies; hidden time is not
simulated retrospectively. Preview recreation preserves the trial, and page
reload resets it. Page teardown clears the world.

## Demonstration tuning

| Quantity                        |  Value |
| ------------------------------- | -----: |
| Reserve capacity                | 100 MJ |
| Initial energy                  |  60 MJ |
| Reactor output                  |   2 MW |
| Test-load demand                |   5 MW |
| Restart reserve after depletion |  10 MJ |

These short-cycle values make behavior visible in seconds. They are not the
final ship's huge energy budget, efficiency model or reactor balancing.

`energy change = (generation W - supplied load W) × seconds`, bounded to
0…capacity. Excess generation is reported as spill rather than stored energy.
A final partially powered tick consumes only available energy; its delivered
watts are a tick average. If several loads are present, they share that partial
supply proportionally; there is no module-priority policy yet. Ship ownership
keeps separate buses independent.

At depletion the load retains its requested ON state and waits until the bus
has the 10 MJ restart margin, then resumes automatically. This hysteresis is a
demo policy to avoid per-tick restart chatter, not the future reboot model.
Turning OFF/ON does not clear the depletion latch. Healthy manual switching has
no reboot delay. Disabling the reactor stops generation; disabling the load
allows charging; full reserve discards surplus. No speed-dependent consumption
or movement forces are introduced in this slice.

## Trying it

Run `npm start` and open `webgl-cockpit-hi3d.html`. Press I or Use systems display.
The reactor is row 1; ENGINE (TEST) is row 4. Click their request buttons or press
1/4 while in systems mode. Both ON drains at 3 MJ/s (about 20 simulated seconds
from initial state). Load OFF charges at 2 MJ/s. Reactor OFF/load ON drains at
5 MJ/s. Both OFF holds energy. The panel shows live reserve, generation, supplied
load and actual module state separately from requested ON/OFF. A DOM summary
below the canvas exposes the same values. Other module rows remain placeholders.

Behavioral tests cover ECS ownership/query membership, joule/watt accounting,
capacity spill, manual requests, blackout/recharge, non-bypassable depletion,
step-size agreement and independent buses. Run `npm run check` for type, lint,
format, tests and coverage gates. These checks do not establish final game balance.
