import type { Behavior } from '../../src/index.js';
import { World } from '../../src/ECS.js';
import {
  EnergyReserve,
  ShipModule,
  ShipOwner,
  Reactor,
  PowerLoad,
  shipPowerSystem,
} from '../../examples/ship/ShipPower.js';

export interface PowerPlantProfile {
  capacityJ: number;
  initialEnergyJ: number;
  reactorOutputW: number;
}
export interface PowerReading {
  readonly requested: boolean;
  readonly energyJ: number;
  readonly capacityJ: number;
  readonly generationW: number;
  readonly consumptionW: number;
  readonly spillW: number;
}
export interface PowerPort {
  request(enabled: boolean, demandW: number): void;
  delivery(): {
    readonly suppliedW: number;
    readonly state: 'off' | 'online' | 'waiting-for-charge';
  };
  dispose(): void;
}
export function numberIn(
  name: string,
  value: number,
  min: number,
  max = 1e30,
): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(
      `${name} must be finite and between ${min} and ${max}`,
    );
  return value;
}
/** Typed attached adapter over the existing application-owned J/W ledger. */
export class ShipPowerPlant implements Behavior {
  #world = new World();
  #ship = this.#world.create();
  #reactor = this.#world.create();
  #disposed = false;
  #requested = true;
  constructor(profile: PowerPlantProfile) {
    const capacityJ = numberIn('capacityJ', profile.capacityJ, 1);
    this.#world.set(this.#ship, EnergyReserve, {
      capacityJ,
      energyJ: numberIn('initialEnergyJ', profile.initialEnergyJ, 0, capacityJ),
      generationW: 0,
      consumptionW: 0,
      spillW: 0,
    });
    this.#world.set(this.#reactor, ShipOwner, this.#ship);
    this.#world.set(this.#reactor, ShipModule, {
      requested: true,
      state: 'off',
    });
    this.#world.set(this.#reactor, Reactor, {
      outputW: numberIn('reactorOutputW', profile.reactorOutputW, 0),
    });
  }
  onAttach(): undefined {}
  private live(): void {
    if (this.#disposed) throw new Error('Power plant disposed');
  }
  requestEnabled(value: boolean): void {
    this.live();
    if (typeof value !== 'boolean')
      throw new TypeError('Reactor request must be boolean');
    this.#requested = value;
    this.#world.get(this.#reactor, ShipModule)!.requested = value;
  }
  connect(restartEnergyJ: number): PowerPort {
    this.live();
    numberIn('restartEnergyJ', restartEnergyJ, 0, this.telemetry.capacityJ);
    const entity = this.#world.create();
    this.#world.set(entity, ShipOwner, this.#ship);
    this.#world.set(entity, ShipModule, { requested: false, state: 'off' });
    this.#world.set(entity, PowerLoad, {
      demandW: 0,
      restartEnergyJ,
      depleted: false,
      suppliedW: 0,
    });
    let disposed = false;
    const active = () => {
      this.live();
      if (disposed) throw new Error('Power port disposed');
    };
    return Object.freeze({
      request: (enabled: boolean, demandW: number) => {
        active();
        if (typeof enabled !== 'boolean')
          throw new TypeError('Load request must be boolean');
        numberIn('demandW', demandW, 0);
        this.#world.get(entity, ShipModule)!.requested = enabled;
        this.#world.get(entity, PowerLoad)!.demandW = demandW;
      },
      delivery: () => {
        active();
        return Object.freeze({
          suppliedW: this.#world.get(entity, PowerLoad)!.suppliedW,
          state: this.#world.get(entity, ShipModule)!.state,
        });
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (!this.#disposed) this.#world.destroy(entity);
      },
    });
  }
  allocate(dt: number): void {
    this.live();
    shipPowerSystem(this.#world, dt);
  }
  get telemetry(): Readonly<PowerReading> {
    this.live();
    const p = this.#world.get(this.#ship, EnergyReserve)!;
    return Object.freeze({
      requested: this.#requested,
      energyJ: p.energyJ,
      capacityJ: p.capacityJ,
      generationW: p.generationW,
      consumptionW: p.consumptionW,
      spillW: p.spillW,
    });
  }
  dispose(): undefined {
    this.#disposed = true;
    this.#world.clear();
  }
}
