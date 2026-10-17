import { Component, World } from '../../src/ECS.js';
import type { Entity } from '../../src/ECS.js';

export interface Reserve {
  capacityJ: number;
  energyJ: number;
  generationW: number;
  consumptionW: number;
  spillW: number;
}
export interface Module {
  requested: boolean;
  state: 'off' | 'online' | 'waiting-for-charge';
}
export interface Load {
  demandW: number;
  /** Demo recovery hysteresis, not a thermal reboot or final gameplay tuning. */
  restartEnergyJ: number;
  depleted: boolean;
  suppliedW: number;
}
export const EnergyReserve = new Component<Reserve>('energy reserve');
export const ShipModule = new Component<Module>('module state');
export const ShipOwner = new Component<Entity>('ship owner');
export const Reactor = new Component<{ outputW: number }>('reactor');
export const PowerLoad = new Component<Load>('power load');

/** Application-owned power rules; the engine ECS has no ship-domain knowledge. */
export function shipPowerSystem(world: World, dt: number): void {
  if (!Number.isFinite(dt) || dt < 0)
    throw new RangeError('Invalid power step');
  if (dt === 0) return;
  for (const ship of world.query(EnergyReserve)) {
    const reserve = world.get(ship, EnergyReserve)!;
    let generationW = 0;
    for (const entity of world.query(ShipOwner, ShipModule, Reactor)) {
      if (world.get(entity, ShipOwner) !== ship) continue;
      const module = world.get(entity, ShipModule)!;
      module.state = module.requested ? 'online' : 'off';
      if (module.requested) generationW += world.get(entity, Reactor)!.outputW;
    }
    const availableJ = reserve.energyJ + generationW * dt;
    const active: Array<{ module: Module; load: Load }> = [];
    let demandW = 0;
    for (const entity of world.query(ShipOwner, ShipModule, PowerLoad)) {
      if (world.get(entity, ShipOwner) !== ship) continue;
      const module = world.get(entity, ShipModule)!;
      const load = world.get(entity, PowerLoad)!;
      load.suppliedW = 0;
      if (!module.requested) {
        module.state = 'off';
        continue;
      }
      if (load.depleted && availableJ < load.restartEnergyJ) {
        module.state = 'waiting-for-charge';
        continue;
      }
      load.depleted = false;
      active.push({ module, load });
      demandW += load.demandW;
    }
    // Proportional delivery during the last partial tick; no priority policy yet.
    const fraction = demandW > 0 ? Math.min(1, availableJ / (demandW * dt)) : 1;
    const consumptionW = demandW * fraction;
    for (const { module, load } of active) {
      load.suppliedW = load.demandW * fraction;
      load.depleted = fraction < 1;
      module.state = load.depleted ? 'waiting-for-charge' : 'online';
    }
    const remainingJ = Math.max(0, availableJ - consumptionW * dt);
    reserve.energyJ = Math.min(reserve.capacityJ, remainingJ);
    reserve.generationW = generationW;
    reserve.consumptionW = consumptionW;
    reserve.spillW = Math.max(0, remainingJ - reserve.capacityJ) / dt;
  }
}

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
