import { ShipMounts } from './ShipMounts.js';
import { ShipCargo } from './ShipCargo.js';
import { ModuleHealth } from './ModuleHealth.js';
import type { HealthReading } from './ModuleHealth.js';
import { ShipShields } from './ShipShields.js';
import type { Behavior } from '../../src/index.js';
import { ShipDampers } from './ShipDampers.js';
import { ShipEngine } from './ShipEngine.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPort } from './ShipPowerPlant.js';
import { validateCoolingProfile } from './ShipProfiles.js';
import type { CoolingProfile } from './ShipProfiles.js';

export interface CoolingReading {
  readonly cargoRemovedHeatW: number;
  readonly mountRemovedHeatW: number;
  readonly requested: boolean;
  readonly state:
    'off' | 'online' | 'limited' | 'waiting-for-charge' | 'damaged' | 'failed';
  readonly health: Readonly<HealthReading>;
  readonly powerFraction: number;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly shieldRemovedHeatW: number;
  readonly removedHeatW: number;
  readonly reactorRemovedHeatW: number;
  readonly engineRemovedHeatW: number;
  readonly damperRemovedHeatW: number;
}
/** Shared cooling circuit: reactor, engine, dampers and shields, one power port, no private clock. */
export class ShipCooling implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<CoolingProfile>;
  #port: PowerPort | undefined;
  #requested = false;
  #pumping = false;
  #health: ModuleHealth;
  #reading: Readonly<CoolingReading>;
  constructor(
    profile: CoolingProfile,
    private readonly power: ShipPowerPlant,
    private readonly engine: ShipEngine,
    private readonly dampers: ShipDampers,
    private readonly shields: ShipShields,
    private readonly cargo: ShipCargo,
    private readonly mounts: ShipMounts,
    initialHealthPoints: number,
  ) {
    this.profile = validateCoolingProfile(profile);
    this.requires = [power, engine, dampers, shields, cargo, mounts];
    this.#health = new ModuleHealth(this.profile.health, initialHealthPoints);
    this.#reading = Object.freeze({
      requested: false,
      state: this.#health.telemetry.failed ? 'failed' : 'off',
      health: this.#health.telemetry,
      powerFraction: 0,
      demandW: 0,
      suppliedW: 0,
      activityFraction: 0,
      cargoRemovedHeatW: 0,
      mountRemovedHeatW: 0,
      shieldRemovedHeatW: 0,
      removedHeatW: 0,
      reactorRemovedHeatW: 0,
      engineRemovedHeatW: 0,
      damperRemovedHeatW: 0,
    });
  }
  onAttach(): undefined {
    this.#port = this.power.connect(this.profile.restartEnergyJ, 'utility');
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Cooling is not attached');
    return this.#port;
  }
  damage(points: number): void {
    this.port();
    this.#health.damage(points);
  }
  repair(points: number): void {
    this.port();
    this.#health.repair(points);
  }
  requestEnabled(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new TypeError('Cooling request must be boolean');
    this.#requested = value;
  }
  declare(): void {
    this.#health.commit();
    this.#pumping =
      this.mounts.temperatureK > this.profile.sinkTemperatureK ||
      this.cargo.temperatureK > this.profile.sinkTemperatureK ||
      this.shields.temperatureK > this.profile.sinkTemperatureK ||
      this.power.temperatureK > this.profile.sinkTemperatureK ||
      this.engine.temperatureK > this.profile.sinkTemperatureK ||
      this.dampers.temperatureK > this.profile.sinkTemperatureK;
    this.port().request(
      this.#requested && !this.#health.telemetry.failed,
      this.profile.baselineW + (this.#pumping ? this.profile.fullPowerW : 0),
    );
  }
  deliver(dt: number): Readonly<CoolingReading> {
    const allocation = this.port().delivery();
    const health = this.#health.telemetry;
    const powerFraction =
      this.#requested &&
      !health.failed &&
      allocation.suppliedW >= this.profile.baselineW
        ? this.#pumping
          ? Math.min(
              1,
              (allocation.suppliedW - this.profile.baselineW) /
                this.profile.fullPowerW,
            )
          : 1
        : 0;
    const fraction = powerFraction * health.outputFraction;
    const targets = [
      this.engine,
      this.dampers,
      this.power,
      this.shields,
      this.cargo,
      this.mounts,
    ];
    const totalHeat = targets.reduce(
      (sum, target) => sum + target.heatAbove(this.profile.sinkTemperatureK),
      0,
    );
    let remainingBudget = this.#pumping
      ? Math.min(totalHeat, this.profile.maxCoolingW * fraction * dt)
      : 0;
    let remainingHeat = totalHeat;
    const remove = (target: (typeof targets)[number]): number => {
      const heat = target.heatAbove(this.profile.sinkTemperatureK);
      const budget =
        remainingHeat > 0
          ? Math.min(remainingBudget, remainingBudget * (heat / remainingHeat))
          : 0;
      remainingBudget = Math.max(0, remainingBudget - budget);
      remainingHeat = Math.max(0, remainingHeat - heat);
      return target.removeHeat(budget, this.profile.sinkTemperatureK) / dt;
    };
    const engineRemovedHeatW = remove(this.engine);
    const damperRemovedHeatW = remove(this.dampers);
    const reactorRemovedHeatW = remove(this.power);
    const shieldRemovedHeatW = remove(this.shields);
    const cargoRemovedHeatW = remove(this.cargo);
    const mountRemovedHeatW = remove(this.mounts);
    const removedHeatW =
      engineRemovedHeatW +
      damperRemovedHeatW +
      reactorRemovedHeatW +
      shieldRemovedHeatW +
      cargoRemovedHeatW +
      mountRemovedHeatW;
    this.#reading = Object.freeze({
      requested: this.#requested,
      health,
      powerFraction,
      state: health.failed
        ? 'failed'
        : !this.#requested
          ? 'off'
          : powerFraction === 0
            ? 'waiting-for-charge'
            : powerFraction < 1
              ? 'limited'
              : health.fraction < 1
                ? 'damaged'
                : 'online',
      demandW:
        this.#requested && !health.failed
          ? this.profile.baselineW +
            (this.#pumping ? this.profile.fullPowerW : 0)
          : 0,
      suppliedW: allocation.suppliedW,
      activityFraction: fraction,
      removedHeatW,
      cargoRemovedHeatW,
      mountRemovedHeatW,
      shieldRemovedHeatW,
      reactorRemovedHeatW,
      engineRemovedHeatW,
      damperRemovedHeatW,
    });
    return this.#reading;
  }
  get telemetry(): Readonly<CoolingReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#port?.dispose();
    this.#port = undefined;
  }
}
