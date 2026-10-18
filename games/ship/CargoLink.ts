import { numberIn, profileId } from './ShipProfiles.js';

export interface CargoLinkReading {
  readonly pocketId: string;
  readonly state: 'connected' | 'interrupted' | 'lost';
  readonly accessible: boolean;
  readonly remainingSeconds: number;
  readonly stabilizationSeconds: number;
}
/** Enduring pocket reference; no inventory copy and no independent clock. */
export class CargoLink {
  readonly pocketId: string;
  #state: CargoLinkReading['state'] = 'connected';
  #remaining = 0;
  #stable = 0;
  constructor(pocketId: string) {
    this.pocketId = profileId(pocketId, 'Cargo pocket id');
  }
  advance(
    dt: number,
    service: boolean,
    graceSeconds: number,
    stabilizationSeconds: number,
  ): void {
    numberIn('Cargo step', dt, 1e-6, 1);
    numberIn('Cargo grace', graceSeconds, 0.01, 3600);
    numberIn('Cargo stabilization', stabilizationSeconds, 0.01, graceSeconds);
    if (this.#state === 'lost') return;
    if (this.#state === 'connected') {
      if (service) return;
      this.#state = 'interrupted';
      this.#remaining = graceSeconds;
    }
    // Recovery must finish strictly before expiry. Brief service never resets the deadline.
    this.#remaining = Math.max(0, this.#remaining - dt);
    this.#stable = service ? this.#stable + dt : 0;
    if (this.#remaining < 1e-9) {
      this.#remaining = 0;
      this.#stable = 0;
      this.#state = 'lost';
    } else if (this.#stable + 1e-9 >= stabilizationSeconds) {
      this.#state = 'connected';
      this.#remaining = 0;
      this.#stable = 0;
    }
  }
  get telemetry(): Readonly<CargoLinkReading> {
    return Object.freeze({
      pocketId: this.pocketId,
      state: this.#state,
      accessible: this.#state === 'connected',
      remainingSeconds: this.#remaining,
      stabilizationSeconds: this.#stable,
    });
  }
}
