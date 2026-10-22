/** Counts completed presentation frames, never simulation steps. No clock/loop ownership. */
export class FrameRate {
  #previous: number | undefined;
  #elapsed = 0;
  #frames = 0;
  reset(): void {
    this.#previous = undefined;
    this.#elapsed = this.#frames = 0;
  }
  /** Timestamp in milliseconds; publish at most twice per second. */
  frame(now: number): number | null {
    if (
      !Number.isFinite(now) ||
      (this.#previous !== undefined && now < this.#previous)
    )
      throw new Error('Frame timestamp must be finite and monotonic');
    if (this.#previous === undefined) {
      this.#previous = now;
      return null;
    }
    this.#elapsed += now - this.#previous;
    this.#previous = now;
    this.#frames++;
    if (this.#elapsed < 500) return null;
    const fps = (this.#frames * 1000) / this.#elapsed;
    this.#elapsed = this.#frames = 0;
    return fps;
  }
}
