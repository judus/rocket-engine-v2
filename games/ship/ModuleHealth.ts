import { numberIn, validateHealthProfile } from './ShipProfiles.js';
import type { HealthProfile } from './ShipProfiles.js';

export interface HealthReading {
  readonly points: number;
  readonly maxPoints: number;
  readonly fraction: number;
  readonly outputFraction: number;
  readonly failed: boolean;
}
/** Module-owned condition math and ordered commands. No clock, repair policy or entity registration. */
export class ModuleHealth {
  readonly profile: Readonly<HealthProfile>;
  #points: number;
  #pending: number[] = [];
  constructor(profile: Readonly<HealthProfile>, initialPoints: number) {
    this.profile = validateHealthProfile(profile);
    this.#points = numberIn(
      'Initial module health',
      initialPoints,
      0,
      this.profile.maxPoints,
    );
  }
  damage(points: number): void {
    this.#pending.push(-numberIn('Damage points', points, 0));
  }
  repair(points: number): void {
    this.#pending.push(numberIn('Repair points', points, 0));
  }
  commit(): void {
    for (const delta of this.#pending)
      this.#points = Math.max(
        0,
        Math.min(this.profile.maxPoints, this.#points + delta),
      );
    this.#pending = [];
  }
  get telemetry(): Readonly<HealthReading> {
    const fraction = this.#points / this.profile.maxPoints;
    return Object.freeze({
      points: this.#points,
      maxPoints: this.profile.maxPoints,
      fraction,
      outputFraction: fraction ** this.profile.outputExponent,
      failed: this.#points === 0,
    });
  }
}
