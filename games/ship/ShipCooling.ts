import type { Behavior } from '../../src/index.js';
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
}
/** First cooling circuit: one engine target, one power port, no private clock. */
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
  });
  constructor(
    profile: CoolingProfile,
    private readonly power: ShipPowerPlant,
    private readonly engine: ShipEngine,
  ) {
    this.profile = validateCoolingProfile(profile);
    this.requires = [power, engine];
  }
  onAttach(): undefined {
    this.#port = this.power.connect(this.profile.restartEnergyJ);
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
    this.#pumping = this.engine.temperatureK > this.profile.sinkTemperatureK;
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
    const removedHeatW =
      this.engine.removeHeat(
        this.#pumping ? this.profile.maxCoolingW * fraction * dt : 0,
        this.profile.sinkTemperatureK,
      ) / dt;
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
