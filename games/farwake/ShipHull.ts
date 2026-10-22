import type { Behavior } from '../../src/index.js';
import { ShipShields } from './ShipShields.js';
import { numberIn, validateHullProfile } from './ShipProfiles.js';
import type { HullProfile } from './ShipProfiles.js';

export interface HullReading {
  readonly remainingJ: number;
  readonly capacityJ: number;
  readonly breached: boolean;
  readonly incomingJ: number;
  readonly shieldAbsorbedJ: number;
  readonly hullDamageJ: number;
  readonly excessJ: number;
}
/** Minimal structural damage receiver; game rules decide the consequence of breach. */
export class ShipHull implements Behavior {
  readonly requires: readonly Behavior[];
  readonly profile: Readonly<HullProfile>;
  #pendingJ = 0;
  #remainingJ: number;
  #reading: Readonly<HullReading>;
  #disposed = false;
  constructor(
    profile: Readonly<HullProfile>,
    private readonly shields: ShipShields,
  ) {
    this.profile = validateHullProfile(profile);
    this.requires = [shields];
    this.#remainingJ = this.profile.damageCapacityJ;
    this.#reading = Object.freeze({
      remainingJ: this.#remainingJ,
      capacityJ: this.#remainingJ,
      breached: false,
      incomingJ: 0,
      shieldAbsorbedJ: 0,
      hullDamageJ: 0,
      excessJ: 0,
    });
  }
  /** Queue damage for the next committed simulation tick, including while paused. */
  hit(energyJ: number): void {
    if (this.#disposed) throw new Error('Hull disposed');
    numberIn('Impact energyJ', energyJ, 0);
    this.#pendingJ = numberIn(
      'Pending impact energyJ',
      this.#pendingJ + energyJ,
      0,
    );
  }
  resolve(): void {
    if (this.#disposed) throw new Error('Hull disposed');
    if (this.#pendingJ === 0) return;
    const incomingJ = this.#pendingJ;
    const shieldAbsorbedJ = this.shields.absorb(incomingJ);
    const hullDamageJ = Math.min(this.#remainingJ, incomingJ - shieldAbsorbedJ);
    this.#remainingJ -= hullDamageJ;
    this.#pendingJ = 0;
    this.#reading = Object.freeze({
      remainingJ: this.#remainingJ,
      capacityJ: this.profile.damageCapacityJ,
      breached: this.#remainingJ === 0,
      incomingJ,
      shieldAbsorbedJ,
      hullDamageJ,
      excessJ: incomingJ - shieldAbsorbedJ - hullDamageJ,
    });
  }
  get telemetry(): Readonly<HullReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#disposed = true;
    this.#pendingJ = 0;
  }
}
