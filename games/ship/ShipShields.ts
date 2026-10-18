import type { Behavior } from '../../src/index.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import type { PowerPort } from './ShipPowerPlant.js';
import { numberIn, validateShieldProfile } from './ShipProfiles.js';
import type { ShieldProfile } from './ShipProfiles.js';

export interface ShieldReading {
  readonly requested: boolean;
  readonly active: boolean;
  readonly state: 'off' | 'unpowered' | 'charging' | 'online';
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
  #port: PowerPort | undefined;
  #requested = false;
  #active = false;
  #energyJ = 0;
  #delay = 0;
  #demandW = 0;
  #suppliedW = 0;
  #rechargeJ = 0;
  constructor(
    profile: Readonly<ShieldProfile>,
    private readonly power: ShipPowerPlant,
  ) {
    this.profile = validateShieldProfile(profile);
    this.requires = [power];
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
    this.#requested = value;
    if (!value) this.#active = false;
  }
  declare(dt: number): void {
    const chargeJ = Math.min(
      this.profile.capacityJ - this.#energyJ,
      this.profile.rechargeW *
        this.profile.rechargeEfficiency *
        Math.max(0, dt - this.#delay),
    );
    this.#demandW = this.#requested
      ? this.profile.baselineW + chargeJ / this.profile.rechargeEfficiency / dt
      : 0;
    this.port().request(this.#requested, this.#demandW);
  }
  deliver(dt: number): void {
    const allocation = this.port().delivery();
    this.#suppliedW = allocation.suppliedW;
    this.#active = this.#requested && this.#suppliedW >= this.profile.baselineW;
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
    return Object.freeze({
      requested: this.#requested,
      active: this.#active,
      state: !this.#requested
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
  }
}
