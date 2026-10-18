import { ModuleThermal } from './ModuleThermal.js';
import type { ThermalReading } from './ModuleThermal.js';
import type { Behavior } from '../../src/index.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPort } from './ShipPowerPlant.js';
import { numberIn, validateShieldProfile } from './ShipProfiles.js';
import type { ShieldProfile } from './ShipProfiles.js';

export interface ShieldReading {
  readonly diverting: boolean;
  readonly divertedJ: number;
  readonly diversionReceivedJ: number;
  readonly diversionLostJ: number;
  readonly thermal: Readonly<ThermalReading>;
  readonly requested: boolean;
  readonly active: boolean;
  readonly state:
    | 'off'
    | 'unpowered'
    | 'charging'
    | 'online'
    | 'diverting'
    | 'overheated'
    | 'restarting';
  readonly energyJ: number;
  readonly capacityJ: number;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly rechargeJ: number;
  readonly rechargeDelaySeconds: number;
}
/** Stored field energy survives shutdown. Protection requires funded maintenance. */
export class ShipShields implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<ShieldProfile>;
  #thermal: ModuleThermal;
  #operating = false;
  #powerRequested = false;
  #diversionLossJ = 0;
  #port: PowerPort | undefined;
  #requested = false;
  #active = false;
  #energyJ = 0;
  #delay = 0;
  #demandW = 0;
  #suppliedW = 0;
  #rechargeJ = 0;
  #diverting = false;
  #divertedJ = 0;
  #diversionReceivedJ = 0;
  constructor(
    profile: Readonly<ShieldProfile>,
    private readonly power: ShipPowerPlant,
    initialTemperatureK: number,
  ) {
    this.profile = validateShieldProfile(profile);
    this.requires = [power];
    this.#thermal = new ModuleThermal(
      this.profile.thermal,
      initialTemperatureK,
    );
  }
  onAttach(): undefined {
    this.#port = this.power.connect(
      this.profile.restartEnergyJ,
      'nonessential',
    );
  }
  private port(): PowerPort {
    if (!this.#port) throw new Error('Shields are not attached');
    return this.#port;
  }
  requestEnabled(value: boolean): void {
    this.port();
    if (typeof value !== 'boolean')
      throw new TypeError('Shield request must be boolean');
    if (value) this.cancelDiversion();
    this.#thermal.requestChanged(this.#requested, value);
    this.#requested = value;
    if (!value) this.#active = false;
  }
  /** Explicit sacrifice: switch the field off until manually enabled again. */
  startDiversion(): void {
    this.port();
    if (this.#thermal.telemetry.tripped)
      throw new Error('Shields must cool and reboot before diversion');
    if (this.#diverting) return;
    this.requestEnabled(false);
    this.#diverting = true;
    this.#divertedJ = 0;
    this.#diversionReceivedJ = 0;
  }
  cancelDiversion(): void {
    this.port();
    this.#diverting = false;
  }
  /** Runs after reactor recovery decisions, before load allocation. No pump power required. */
  transfer(dt: number): void {
    this.port();
    if (!this.#diverting || this.#thermal.telemetry.tripped) return;
    const offeredJ = Math.min(this.#energyJ, this.profile.diversionW * dt);
    const receivedJ = this.power.receiveTransferredEnergy(
      offeredJ * this.profile.diversionEfficiency,
    );
    const drawnJ = Math.min(
      this.#energyJ,
      receivedJ / this.profile.diversionEfficiency,
    );
    this.#energyJ -= drawnJ;
    this.#diversionLossJ = drawnJ - receivedJ;
    this.#divertedJ += drawnJ;
    this.#diversionReceivedJ += receivedJ;
    const reserve = this.power.telemetry;
    if (this.#energyJ === 0 || reserve.energyJ === reserve.capacityJ)
      this.#diverting = false;
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
    const thermal = this.#thermal.begin(this.#requested);
    this.#operating = thermal.operating;
    this.#powerRequested = thermal.powerRequested;
    this.#diversionLossJ = 0;
  }
  declare(dt: number): void {
    const chargeJ = this.#operating
      ? Math.min(
          this.profile.capacityJ - this.#energyJ,
          this.profile.rechargeW *
            this.profile.rechargeEfficiency *
            Math.max(0, dt - this.#delay),
        )
      : 0;
    this.#demandW = this.#powerRequested
      ? this.profile.baselineW + chargeJ / this.profile.rechargeEfficiency / dt
      : 0;
    this.port().request(this.#powerRequested, this.#demandW);
  }
  deliver(dt: number): void {
    const allocation = this.port().delivery();
    this.#suppliedW = allocation.suppliedW;
    this.#active = this.#operating && this.#suppliedW >= this.profile.baselineW;
    this.#rechargeJ = this.#active
      ? Math.min(
          this.profile.capacityJ - this.#energyJ,
          Math.max(0, this.#suppliedW - this.profile.baselineW) *
            this.profile.rechargeEfficiency *
            dt,
        )
      : 0;
    this.#energyJ += this.#rechargeJ;
    this.#delay = Math.max(0, this.#delay - dt);
  }
  generateHeat(dt: number): void {
    const maintenanceW = Math.min(this.#suppliedW, this.profile.baselineW);
    const rechargeInputW = Math.max(0, this.#suppliedW - maintenanceW);
    const conversionLossW = Math.max(0, rechargeInputW - this.#rechargeJ / dt);
    this.#thermal.generateHeat(
      maintenanceW * this.profile.thermal.wasteHeatFraction +
        conversionLossW +
        this.#diversionLossJ / dt,
      dt,
    );
  }
  finishThermalStep(dt: number): void {
    this.#thermal.finish(
      dt,
      this.#requested,
      Math.min(1, this.#suppliedW / this.profile.baselineW),
    );
    if (this.#thermal.telemetry.tripped) {
      this.#active = false;
      this.#diverting = false;
    }
  }
  /** Returns absorbed energy; the caller routes the remainder to structural damage. */
  absorb(impactJ: number): number {
    this.port();
    numberIn('Shield impactJ', impactJ, 0);
    if (impactJ === 0 || !this.#active) return 0;
    const absorbedJ = Math.min(this.#energyJ, impactJ);
    this.#energyJ -= absorbedJ;
    this.#delay = this.profile.rechargeDelaySeconds;
    return absorbedJ;
  }
  get telemetry(): Readonly<ShieldReading> {
    const thermalState = this.#thermal.state(this.#requested);
    return Object.freeze({
      diverting: this.#diverting,
      divertedJ: this.#divertedJ,
      diversionReceivedJ: this.#diversionReceivedJ,
      diversionLostJ: this.#divertedJ - this.#diversionReceivedJ,
      thermal: this.#thermal.telemetry,
      requested: this.#requested,
      active: this.#active,
      state:
        thermalState === 'overheated' || thermalState === 'restarting'
          ? thermalState
          : this.#diverting
            ? 'diverting'
            : !this.#requested
              ? 'off'
              : !this.#active
                ? 'unpowered'
                : this.#energyJ < this.profile.capacityJ
                  ? 'charging'
                  : 'online',
      energyJ: this.#energyJ,
      capacityJ: this.profile.capacityJ,
      demandW: this.#demandW,
      suppliedW: this.#suppliedW,
      rechargeJ: this.#rechargeJ,
      rechargeDelaySeconds: this.#delay,
    });
  }
  dispose(): undefined {
    this.#port?.dispose();
    this.#port = undefined;
    this.#active = false;
    this.#diverting = false;
  }
}
