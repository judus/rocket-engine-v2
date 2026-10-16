/** Cosmetic cockpit displacement in CSS pixels; advanced by the demo's existing update. */
export class CockpitMotion {
  x = 0;
  y = 0;
  #vx = 0;
  #vy = 0;
  kick(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#vx = Math.max(-60, Math.min(60, this.#vx + x));
    this.#vy = Math.max(-60, Math.min(60, this.#vy + y));
  }
  reset(): void {
    this.x = this.y = this.#vx = this.#vy = 0;
  }
  update(dt: number, right: number, up: number, forward: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const targets = [-right * 1.8, up * 1.8 - forward * 0.6];
    const step = (value: number, velocity: number, target: number) => {
      target = Math.max(-2, Math.min(2, Number.isFinite(target) ? target : 0));
      // Exact critically damped spring for a constant target over this update.
      const omega = 12,
        offset = value - target;
      const c = velocity + omega * offset,
        decay = Math.exp(-omega * dt);
      return [
        Math.max(-3, Math.min(3, target + (offset + c * dt) * decay)),
        (velocity - omega * c * dt) * decay,
      ] as const;
    };
    [this.x, this.#vx] = step(this.x, this.#vx, targets[0]!);
    [this.y, this.#vy] = step(this.y, this.#vy, targets[1]!);
  }
}
