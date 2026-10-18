import type { Behavior } from '../../src/index.js';
import { ShipDampers } from './ShipDampers.js';
import { ShipEngine } from './ShipEngine.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPort } from './ShipPowerPlant.js';
import { validateCoolingProfile } from './ShipProfiles.js';
import type { CoolingProfile } from './ShipProfiles.js';

export interface CoolingReading {
  readonly requested: boolean;
  readonly state: 'off' | 'online' | 'limited' | 'waiting-for-charge';
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly removedHeatW: number;
  readonly reactorRemovedHeatW: number;
  readonly engineRemovedHeatW: number;
  readonly damperRemovedHeatW: number;
}
/** Shared cooling circuit: reactor, engine and dampers, one power port, no private clock. */
export class ShipCooling implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<CoolingProfile>;
  #port: PowerPort | undefined;
  #requested = false;
  #pumping = false;
  #reading: Readonly<CoolingReading> = Object.freeze({
    requested: false,
    state: 'off',
    demandW: 0,
    suppliedW: 0,
    activityFraction: 0,
    removedHeatW: 0,
    reactorRemovedHeatW: 0,
    engineRemovedHeatW: 0,
    damperRemovedHeatW: 0,
  });
  constructor(
    profile: CoolingProfile,
    private readonly power: ShipPowerPlant,
    private readonly engine: ShipEngine,
    private readonly dampers: ShipDampers,
  ) {
    this.profile = validateCoolingProfile(profile);
    this.requires = [power, engine, dampers];
  }
  onAttach(): undefined {
    this.#port = this.power.connect(this.profile.restartEnergyJ, 'utility');
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Cooling is not attached');
    return this.#port;
  }
  requestEnabled(value: boolean): void {
    if (typeof value !== 'boolean')
      throw new TypeError('Cooling request must be boolean');
    this.#requested = value;
  }
  declare(): void {
    this.#pumping =
      this.power.temperatureK > this.profile.sinkTemperatureK ||
      this.engine.temperatureK > this.profile.sinkTemperatureK ||
      this.dampers.temperatureK > this.profile.sinkTemperatureK;
    this.port().request(
      this.#requested,
      this.profile.baselineW + (this.#pumping ? this.profile.fullPowerW : 0),
    );
  }
  deliver(dt: number): Readonly<CoolingReading> {
    const allocation = this.port().delivery();
    const fraction =
      this.#requested && allocation.suppliedW >= this.profile.baselineW
        ? this.#pumping
          ? Math.min(
              1,
              (allocation.suppliedW - this.profile.baselineW) /
                this.profile.fullPowerW,
            )
          : 1
        : 0;
    const engineHeat = this.engine.heatAbove(this.profile.sinkTemperatureK);
    const damperHeat = this.dampers.heatAbove(this.profile.sinkTemperatureK);
    const reactorHeat = this.power.heatAbove(this.profile.sinkTemperatureK);
    const totalHeat = engineHeat + damperHeat + reactorHeat;
    const budgetJ = this.#pumping
      ? Math.min(totalHeat, this.profile.maxCoolingW * fraction * dt)
      : 0;
    // Share one removal budget in proportion to each module's heat above the sink.
    const engineBudget = totalHeat > 0 ? budgetJ * (engineHeat / totalHeat) : 0;
    const remainingBudget = budgetJ - engineBudget;
    const remainingHeat = damperHeat + reactorHeat;
    const damperBudget =
      remainingHeat > 0 ? remainingBudget * (damperHeat / remainingHeat) : 0;
    const engineRemovedHeatW =
      this.engine.removeHeat(engineBudget, this.profile.sinkTemperatureK) / dt;
    const damperRemovedHeatW =
      this.dampers.removeHeat(damperBudget, this.profile.sinkTemperatureK) / dt;
    const reactorRemovedHeatW =
      this.power.removeHeat(
        remainingBudget - damperBudget,
        this.profile.sinkTemperatureK,
      ) / dt;
    const removedHeatW =
      reactorRemovedHeatW + engineRemovedHeatW + damperRemovedHeatW;
    this.#reading = Object.freeze({
      requested: this.#requested,
      state: !this.#requested
        ? 'off'
        : fraction === 0
          ? 'waiting-for-charge'
          : fraction < 1
            ? 'limited'
            : 'online',
      demandW: this.#requested
        ? this.profile.baselineW + (this.#pumping ? this.profile.fullPowerW : 0)
        : 0,
      suppliedW: allocation.suppliedW,
      activityFraction: fraction,
      removedHeatW,
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
