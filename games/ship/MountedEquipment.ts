import { ModuleHealth } from './ModuleHealth.js';
import type { HealthReading } from './ModuleHealth.js';
import { ModuleThermal } from './ModuleThermal.js';
import type { ThermalReading } from './ModuleThermal.js';
import type { MountEquipment } from './ShipMounts.js';
import type { PowerPort, ShipPowerPlant } from './ShipPowerPlant.js';

export interface MountedEquipmentReading {
  readonly requested: boolean;
  readonly state:
    | 'off'
    | 'failed'
    | 'overheated'
    | 'restarting'
    | 'unpowered'
    | 'idle'
    | 'limited'
    | 'operating';
  readonly health: Readonly<HealthReading>;
  readonly thermal: Readonly<ThermalReading>;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly activityFraction: number;
  readonly outputW: number;
  readonly outputJ: number;
  readonly totalOutputJ: number;
}
/** One installed device. Continuous output is measured; no projectile/hit is invented. */
export class MountedEquipment {
  readonly #health: ModuleHealth;
  readonly #thermal: ModuleThermal;
  readonly #port: PowerPort;
  #requested = false;
  #operating = false;
  #active = false;
  #demandW = 0;
  #suppliedW = 0;
  #fraction = 0;
  #outputJ = 0;
  #outputW = 0;
  #totalOutputJ = 0;
  #disposed = false;
  constructor(
    readonly profile: Readonly<MountEquipment>,
    power: ShipPowerPlant,
  ) {
    this.#health = new ModuleHealth(profile.health, profile.health.maxPoints);
    this.#thermal = new ModuleThermal(
      profile.thermal,
      profile.initialTemperatureK,
    );
    this.#port = power.connect(profile.restartEnergyJ, 'nonessential');
  }
  private live(): void {
    if (this.#disposed) throw new Error('Equipment disposed');
  }
  requestEnabled(value: boolean): void {
    this.live();
    if (typeof value !== 'boolean')
      throw new TypeError('Equipment request must be boolean');
    this.#thermal.requestChanged(this.#requested, value);
    this.#requested = value;
  }
  damage(points: number): void {
    this.live();
    this.#health.damage(points);
  }
  repair(points: number): void {
    this.live();
    this.#health.repair(points);
  }
  declare(active: boolean): void {
    this.live();
    const wasFailed = this.#health.telemetry.failed;
    this.#health.commit();
    const failed = this.#health.telemetry.failed;
    if (wasFailed && !failed)
      this.#thermal.requestChanged(false, this.#requested);
    const thermal = this.#thermal.begin(this.#requested && !failed);
    this.#operating = thermal.operating;
    this.#active = active && thermal.operating;
    this.#demandW = thermal.powerRequested
      ? this.profile.baselineW + (this.#active ? this.profile.operatingW : 0)
      : 0;
    this.#port.request(thermal.powerRequested, this.#demandW);
  }
  deliver(dt: number): void {
    this.#suppliedW = this.#port.delivery().suppliedW;
    const inputW =
      this.#active && this.#suppliedW >= this.profile.baselineW
        ? Math.max(0, this.#suppliedW - this.profile.baselineW)
        : 0;
    this.#fraction =
      Math.min(1, inputW / this.profile.operatingW) *
      this.#health.telemetry.outputFraction;
    this.#outputW =
      this.profile.operatingW * this.profile.outputEfficiency * this.#fraction;
    this.#outputJ = this.#outputW * dt;
    this.#totalOutputJ += this.#outputJ;
    this.#thermal.generateHeat(
      Math.min(this.#suppliedW, this.profile.baselineW) *
        this.profile.thermal.wasteHeatFraction +
        Math.max(0, this.#suppliedW - this.profile.baselineW) -
        this.#outputW,
      dt,
    );
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
      Math.min(1, this.#suppliedW / this.profile.baselineW),
    );
  }
  get telemetry(): Readonly<MountedEquipmentReading> {
    const health = this.#health.telemetry;
    return Object.freeze({
      requested: this.#requested,
      health,
      thermal: this.#thermal.telemetry,
      state: health.failed
        ? 'failed'
        : (this.#thermal.state(this.#requested) ??
          (!this.#operating || this.#suppliedW < this.profile.baselineW
            ? 'unpowered'
            : !this.#active
              ? 'idle'
              : this.#fraction < 1
                ? 'limited'
                : 'operating')),
      demandW: this.#demandW,
      suppliedW: this.#suppliedW,
      activityFraction: this.#fraction,
      outputW: this.#outputW,
      outputJ: this.#outputJ,
      totalOutputJ: this.#totalOutputJ,
    });
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#port.dispose();
    this.#disposed = true;
  }
}
