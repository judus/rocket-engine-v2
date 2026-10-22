import { World } from '../../src/ECS.js';
import {
  EnergyReserve,
  ShipOwner,
  ShipModule,
  Reactor,
  PowerLoad,
} from '../../games/farwake/PowerLedger.js';

/** Deliberately short demonstration cycle. All values are SI, not final ship balance. */
export function createPowerTrial() {
  const world = new World();
  const ship = world.create(),
    reactor = world.create(),
    load = world.create();
  world.set(ship, EnergyReserve, {
    capacityJ: 100e6,
    energyJ: 60e6,
    generationW: 0,
    consumptionW: 0,
    spillW: 0,
  });
  for (const entity of [reactor, load]) {
    world.set(entity, ShipOwner, ship);
    world.set(entity, ShipModule, { requested: true, state: 'off' });
  }
  world.set(reactor, Reactor, { outputW: 2e6 });
  world.set(load, PowerLoad, {
    demandW: 5e6,
    restartEnergyJ: 10e6,
    depleted: false,
    suppliedW: 0,
  });
  return { world, ship, reactor, load };
}
export type PowerTrial = ReturnType<typeof createPowerTrial>;
