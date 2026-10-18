import { ModuleThermal } from './ModuleThermal.js';
import type { ThermalReading } from './ModuleThermal.js';
import { numberIn, validatePowerProfile } from './ShipProfiles.js';
import type { PowerPlantProfile } from './ShipProfiles.js';
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

export interface PowerReading {
  readonly requested: boolean;
  readonly state:
    | 'off'
    | 'online'
    | 'overheated'
    | 'restarting'
    | 'emergency-start'
    | 'recovering';
  readonly thermal: Readonly<ThermalReading>;
  readonly emergency: boolean;
  readonly nonessentialAllowed: boolean;
  readonly restoreEnergyJ: number;
  readonly startupDemandW: number;
  readonly startupSuppliedW: number;
  readonly passiveRemovedHeatW: number;
  readonly energyJ: number;
  readonly capacityJ: number;
  readonly receivedEnergyJ: number;
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
/** Typed attached adapter over the existing application-owned J/W ledger. */
export class ShipPowerPlant implements Behavior {
  #world = new World();
  #ship = this.#world.create();
  #reactor = this.#world.create();
  #disposed = false;
  #requested = true;
  #thermal: ModuleThermal;
  #starterPort: PowerPort | undefined;
  #emergency = false;
  #operating = false;
  #startupDemandW = 0;
  #startupSuppliedW = 0;
  #passiveRemovedHeatW = 0;
  #receivedEnergyJ = 0;
  readonly profile: Readonly<PowerPlantProfile>;
  constructor(
    profile: Readonly<PowerPlantProfile>,
    initialEnergyJ: number,
    initialTemperatureK: number,
  ) {
    this.profile = validatePowerProfile(profile);
    this.#thermal = new ModuleThermal(
      this.profile.thermal,
      initialTemperatureK,
    );
    if (initialEnergyJ === 0 && this.#thermal.state(true) !== undefined)
      this.enterEmergency();
    const capacityJ = this.profile.capacityJ;
    this.#world.set(this.#ship, EnergyReserve, {
      capacityJ,
      energyJ: numberIn('initialEnergyJ', initialEnergyJ, 0, capacityJ),
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
      outputW: this.profile.reactorOutputW,
    });
  }
  onAttach(): undefined {
    this.#starterPort = this.connect(0, 'utility');
  }
  private enterEmergency(): void {
    this.#emergency = true;
    this.#thermal.delayRestartAtLeast(
      this.profile.recovery.emergencyStartSeconds,
    );
  }
  get temperatureK(): number {
    return this.#thermal.temperatureK;
  }
  heatAbove(sinkTemperatureK: number): number {
    return this.#thermal.heatAbove(sinkTemperatureK);
  }
  removeHeat(maxEnergyJ: number, sinkTemperatureK: number): number {
    return this.#thermal.removeHeat(maxEnergyJ, sinkTemperatureK);
  }
  beginStep(): void {
    this.live();
    this.#receivedEnergyJ = 0;
    const reserve = this.#world.get(this.#ship, EnergyReserve)!;
    if (
      !this.#emergency &&
      reserve.energyJ === 0 &&
      this.#thermal.state(this.#requested) !== undefined
    )
      this.enterEmergency();
    const thermal = this.#thermal.begin(this.#requested);
    this.#operating = thermal.operating;
    this.#world.get(this.#reactor, ShipModule)!.requested = thermal.operating;
    this.#world.get(this.#reactor, Reactor)!.outputW =
      this.profile.reactorOutputW *
      (this.#emergency ? this.profile.recovery.emergencyOutputFraction : 1);
    this.#startupDemandW =
      thermal.powerRequested && !thermal.operating && !this.#emergency
        ? this.profile.recovery.startupPowerW
        : 0;
    if (!this.#starterPort) throw new Error('Reactor is not attached');
    this.#starterPort.request(this.#startupDemandW > 0, this.#startupDemandW);
    this.#startupSuppliedW = 0;
    this.#passiveRemovedHeatW = 0;
  }
  generateHeat(dt: number): void {
    const generationW = this.#world.get(this.#ship, EnergyReserve)!.generationW;
    this.#startupSuppliedW = this.#starterPort!.delivery().suppliedW;
    this.#thermal.generate(generationW + this.#startupSuppliedW, dt);
    this.#passiveRemovedHeatW =
      this.#thermal.removeHeat(
        this.profile.recovery.passiveCoolingW * dt,
        this.profile.recovery.sinkTemperatureK,
      ) / dt;
  }
  finishThermalStep(dt: number): void {
    this.#thermal.finish(
      dt,
      this.#requested,
      this.#emergency
        ? 1
        : Math.min(
            1,
            this.#startupSuppliedW / this.profile.recovery.startupPowerW,
          ),
    );
    const reserve = this.#world.get(this.#ship, EnergyReserve)!;
    if (
      this.#emergency &&
      this.#operating &&
      this.#thermal.state(this.#requested) === undefined &&
      reserve.energyJ >=
        this.profile.capacityJ * this.profile.recovery.restoreReserveFraction
    )
      this.#emergency = false;
  }
  private live(): void {
    if (this.#disposed) throw new Error('Power plant disposed');
  }
  requestEnabled(value: boolean): void {
    this.live();
    if (typeof value !== 'boolean')
      throw new TypeError('Reactor request must be boolean');
    if (!this.#emergency) this.#thermal.requestChanged(this.#requested, value);
    this.#requested = value;
  }
  connect(restartEnergyJ: number, kind: 'nonessential' | 'utility'): PowerPort {
    this.live();
    if (kind !== 'nonessential' && kind !== 'utility')
      throw new TypeError('Power port kind must be nonessential or utility');
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
        this.#world.get(entity, ShipModule)!.requested =
          enabled && (kind === 'utility' || !this.#emergency);
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
  /** Credits only reserve headroom; the source must debit the returned amount. */
  receiveTransferredEnergy(energyJ: number): number {
    this.live();
    numberIn('Transferred energyJ', energyJ, 0);
    const reserve = this.#world.get(this.#ship, EnergyReserve)!;
    const receivedJ = Math.min(energyJ, reserve.capacityJ - reserve.energyJ);
    reserve.energyJ += receivedJ;
    this.#receivedEnergyJ += receivedJ;
    return receivedJ;
  }
  allocate(dt: number): void {
    this.live();
    shipPowerSystem(this.#world, dt);
  }
  get telemetry(): Readonly<PowerReading> {
    this.live();
    const p = this.#world.get(this.#ship, EnergyReserve)!;
    const thermalState = this.#thermal.state(this.#requested);
    const state =
      thermalState === 'off' || thermalState === 'overheated'
        ? thermalState
        : thermalState === 'restarting'
          ? this.#emergency
            ? 'emergency-start'
            : 'restarting'
          : this.#emergency
            ? 'recovering'
            : 'online';
    return Object.freeze({
      requested: this.#requested,
      state,
      thermal: this.#thermal.telemetry,
      emergency: this.#emergency,
      nonessentialAllowed: !this.#emergency,
      restoreEnergyJ:
        this.profile.capacityJ * this.profile.recovery.restoreReserveFraction,
      startupDemandW: this.#startupDemandW,
      startupSuppliedW: this.#startupSuppliedW,
      passiveRemovedHeatW: this.#passiveRemovedHeatW,
      energyJ: p.energyJ,
      capacityJ: p.capacityJ,
      receivedEnergyJ: this.#receivedEnergyJ,
      generationW: p.generationW,
      consumptionW: p.consumptionW,
      spillW: p.spillW,
    });
  }
  dispose(): undefined {
    this.#starterPort?.dispose();
    this.#starterPort = undefined;
    this.#disposed = true;
    this.#world.clear();
  }
}
