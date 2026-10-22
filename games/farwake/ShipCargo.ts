import type { Behavior } from '../../src/index.js';
import { CargoLink } from './CargoLink.js';
import type { CargoLinkReading } from './CargoLink.js';
import { ModuleHealth } from './ModuleHealth.js';
import type { HealthReading } from './ModuleHealth.js';
import { ModuleThermal } from './ModuleThermal.js';
import type { ThermalReading } from './ModuleThermal.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPort } from './ShipPowerPlant.js';
import { validateCargoProfile } from './ShipProfiles.js';
import type { CargoProfile } from './ShipProfiles.js';

export interface CargoReading {
  readonly requested: boolean;
  readonly state:
    | 'off'
    | 'online'
    | 'damaged'
    | 'failed'
    | 'unpowered'
    | 'overheated'
    | 'restarting'
    | 'lost';
  readonly health: Readonly<HealthReading>;
  readonly thermal: Readonly<ThermalReading>;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly link: Readonly<CargoLinkReading>;
}
/** Powered access to a host-owned pocket reference, not an inventory ledger. */
export class ShipCargo implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<CargoProfile>;
  #health: ModuleHealth;
  #thermal: ModuleThermal;
  #port: PowerPort | undefined;
  #requested = false;
  #operating = false;
  #powerRequested = false;
  #suppliedW = 0;
  #demandW = 0;
  constructor(
    profile: CargoProfile,
    private readonly power: ShipPowerPlant,
    readonly link: CargoLink,
    temperatureK: number,
    healthPoints: number,
  ) {
    this.profile = validateCargoProfile(profile);
    this.requires = [power];
    this.#health = new ModuleHealth(this.profile.health, healthPoints);
    this.#thermal = new ModuleThermal(this.profile.thermal, temperatureK);
  }
  onAttach(): undefined {
    this.#port = this.power.connect(
      this.profile.restartEnergyJ,
      'nonessential',
    );
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Cargo is not attached');
    return this.#port;
  }
  requestEnabled(value: boolean): void {
    this.port();
    if (typeof value !== 'boolean')
      throw new TypeError('Cargo request must be boolean');
    this.#thermal.requestChanged(this.#requested, value);
    this.#requested = value;
  }
  damage(points: number): void {
    this.port();
    this.#health.damage(points);
  }
  repair(points: number): void {
    this.port();
    this.#health.repair(points);
  }
  declare(): void {
    const wasFailed = this.#health.telemetry.failed;
    this.#health.commit();
    const failed = this.#health.telemetry.failed;
    if (wasFailed && !failed)
      this.#thermal.requestChanged(false, this.#requested);
    const thermal = this.#thermal.begin(
      this.#requested && !failed && this.link.telemetry.state !== 'lost',
    );
    this.#operating = thermal.operating;
    this.#powerRequested = thermal.powerRequested;
    // Damaged anchors need more power to maintain the same link.
    this.#demandW = this.#powerRequested
      ? this.profile.baselineW * (2 - this.#health.telemetry.outputFraction)
      : 0;
    this.port().request(this.#powerRequested, this.#demandW);
  }
  deliver(): void {
    this.#suppliedW = this.port().delivery().suppliedW;
  }
  generateHeat(dt: number): void {
    this.#thermal.generate(this.#suppliedW, dt);
  }
  get temperatureK(): number {
    return this.#thermal.temperatureK;
  }
  heatAbove(sinkK: number): number {
    return this.#thermal.heatAbove(sinkK);
  }
  removeHeat(energyJ: number, sinkK: number): number {
    return this.#thermal.removeHeat(energyJ, sinkK);
  }
  finishStep(dt: number): void {
    this.#thermal.finish(
      dt,
      this.#requested,
      this.#demandW > 0 ? Math.min(1, this.#suppliedW / this.#demandW) : 0,
    );
    const service =
      this.#operating &&
      !this.#thermal.telemetry.tripped &&
      this.#suppliedW >= this.#demandW;
    this.link.advance(
      dt,
      service,
      this.profile.graceSeconds,
      this.profile.stabilizationSeconds,
    );
  }
  get telemetry(): Readonly<CargoReading> {
    const health = this.#health.telemetry;
    const link = this.link.telemetry;
    return Object.freeze({
      requested: this.#requested,
      health,
      thermal: this.#thermal.telemetry,
      state:
        link.state === 'lost'
          ? 'lost'
          : health.failed
            ? 'failed'
            : (this.#thermal.state(this.#requested) ??
              (!this.#operating || this.#suppliedW < this.#demandW
                ? 'unpowered'
                : health.fraction < 1
                  ? 'damaged'
                  : 'online')),
      demandW: this.#demandW,
      suppliedW: this.#suppliedW,
      link,
    });
  }
  dispose(): undefined {
    this.#port?.dispose();
    this.#port = undefined;
  }
}
