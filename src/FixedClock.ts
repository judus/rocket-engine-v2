import type { FixedFrame, FixedStats } from './types.js';

/** Small accumulator: discard excess whole steps, retain only the remainder. */
export class FixedClock {
  #remainder = 0;
  #ticks = 0;
  #steps = 0;
  #dropped = 0;
  readonly step: number;
  readonly maxSteps: number;
  constructor({ step = 1 / 60, maxSteps = 5 } = {}) {
    if (
      !Number.isFinite(step) ||
      step <= 0 ||
      step < 0.000001 ||
      !Number.isSafeInteger(maxSteps) ||
      maxSteps < 1 ||
      maxSteps > 1000
    )
      throw new RangeError(
        'Fixed step must be at least 1 microsecond; maxSteps must be 1…1000',
      );
    this.step = step;
    this.maxSteps = maxSteps;
  }
  begin(dt: number): number {
    this.#steps = 0;
    this.#remainder += dt;
    const available = Math.floor(
      (this.#remainder + this.step * 1e-9) / this.step,
    );
    const steps = Math.min(available, this.maxSteps);
    this.#dropped += (available - steps) * this.step;
    this.#remainder = Math.max(0, this.#remainder - available * this.step);
    return steps;
  }
  next(): FixedFrame {
    this.#ticks++;
    this.#steps++;
    return Object.freeze({
      dt: this.step,
      time: this.#ticks * this.step,
      tick: this.#ticks,
    });
  }
  reset(): void {
    this.#remainder = 0;
    this.#steps = 0;
  }
  get stats(): FixedStats {
    return Object.freeze({
      step: this.step,
      steps: this.#steps,
      totalSteps: this.#ticks,
      time: this.#ticks * this.step,
      alpha: this.#remainder / this.step,
      droppedTime: this.#dropped,
    });
  }
}
