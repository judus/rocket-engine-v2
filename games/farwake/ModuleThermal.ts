import { numberIn, validateThermalProfile } from './ShipProfiles.js';
import type { ThermalProfile } from './ShipProfiles.js';

export interface ThermalReading {
  readonly temperatureK: number;
  readonly generatedHeatW: number;
  readonly removedHeatW: number;
  readonly tripped: boolean;
  readonly restartRemainingSeconds: number;
}
/** Module-owned thermal state/calculation. Its owner supplies the shared step and power delivery. */
export class ModuleThermal {
  readonly profile: Readonly<ThermalProfile>;
  #temperatureK: number;
  #tripped = false;
  #remaining = 0;
  #starting = false;
  #powerRequested = false;
  #tripThisStep = false;
  #generatedW = 0;
  #removedJ = 0;
  #removedW = 0;
  constructor(profile: ThermalProfile, initialTemperatureK: number) {
    this.profile = validateThermalProfile(profile);
    this.#temperatureK = numberIn(
      'initial module temperature',
      initialTemperatureK,
      0,
      1e6,
    );
    if (this.#temperatureK >= this.profile.tripTemperatureK) {
      this.#tripped = true;
      this.#remaining = this.profile.rebootSeconds;
    }
  }
  get temperatureK(): number {
    return this.#temperatureK;
  }
  requestChanged(previous: boolean, next: boolean): void {
    if (next && !previous && !this.#tripped)
      this.#remaining = this.profile.manualStartSeconds;
  }
  begin(requested: boolean): { operating: boolean; powerRequested: boolean } {
    this.#tripThisStep = false;
    this.#generatedW = 0;
    this.#removedJ = 0;
    this.#removedW = 0;
    this.#starting = this.#remaining > 0;
    this.#powerRequested =
      requested &&
      (!this.#tripped ||
        this.#temperatureK <= this.profile.restartTemperatureK);
    return {
      operating: requested && !this.#tripped && !this.#starting,
      powerRequested: this.#powerRequested,
    };
  }
  generate(suppliedW: number, dt: number): void {
    this.generateHeat(suppliedW * this.profile.wasteHeatFraction, dt);
  }
  /** Already-calculated thermal losses; avoids counting stored energy as heat. */
  generateHeat(heatW: number, dt: number): void {
    this.#generatedW = heatW;
    this.#temperatureK +=
      (this.#generatedW * dt) / this.profile.heatCapacityJPerK;
    if (this.#temperatureK >= this.profile.tripTemperatureK) {
      this.#tripThisStep = true;
      this.#tripped = true;
      this.#remaining = Math.max(this.#remaining, this.profile.rebootSeconds);
    }
  }
  heatAbove(sinkTemperatureK: number): number {
    numberIn('Cooling sink temperature', sinkTemperatureK, 0, 1e6);
    return (
      Math.max(0, this.#temperatureK - sinkTemperatureK) *
      this.profile.heatCapacityJPerK
    );
  }
  removeHeat(maxEnergyJ: number, sinkTemperatureK: number): number {
    numberIn('Cooling energy', maxEnergyJ, 0);
    const removed = Math.min(maxEnergyJ, this.heatAbove(sinkTemperatureK));
    this.#temperatureK -= removed / this.profile.heatCapacityJPerK;
    this.#removedJ += removed;
    return removed;
  }
  delayRestartAtLeast(seconds: number): void {
    this.#remaining = Math.max(this.#remaining, seconds);
  }
  finish(dt: number, requested: boolean, restartFraction: number): void {
    const coolEnough =
      !this.#tripped || this.#temperatureK <= this.profile.restartTemperatureK;
    if (
      requested &&
      this.#starting &&
      !this.#tripThisStep &&
      this.#powerRequested &&
      coolEnough
    ) {
      this.#remaining = Math.max(0, this.#remaining - dt * restartFraction);
      if (this.#remaining < 1e-9) {
        this.#remaining = 0;
        this.#tripped = false;
      }
    }
    this.#removedW = this.#removedJ / dt;
  }
  state(requested: boolean): 'off' | 'overheated' | 'restarting' | undefined {
    if (!requested) return 'off';
    if (this.#tripped && this.#temperatureK > this.profile.restartTemperatureK)
      return 'overheated';
    if (this.#remaining > 0) return 'restarting';
    return undefined;
  }
  get telemetry(): Readonly<ThermalReading> {
    return Object.freeze({
      temperatureK: this.#temperatureK,
      generatedHeatW: this.#generatedW,
      removedHeatW: this.#removedW,
      tripped: this.#tripped,
      restartRemainingSeconds: this.#remaining,
    });
  }
}
