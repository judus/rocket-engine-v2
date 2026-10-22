/** Cosmetic cockpit displacement in scene units; advanced by the owning scene update. */
export class CockpitMotion {
  x = 0;
  y = 0;
  z = 0;
  #vx = 0;
  #vy = 0;
  #vz = 0;
  kick(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#vx = Math.max(-8, Math.min(8, this.#vx + x));
    this.#vy = Math.max(-8, Math.min(8, this.#vy + y));
  }
  reset(): void {
    this.x = this.y = this.z = this.#vx = this.#vy = this.#vz = 0;
  }
  update(dt: number, right: number, up: number, forward: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const targets = [-right * 0.15, up * 0.15, forward * 0.15];
    const step = (
      value: number,
      velocity: number,
      target: number,
      limit: number,
    ) => {
      target = Math.max(
        -limit,
        Math.min(limit, Number.isFinite(target) ? target : 0),
      );
      // Exact critically damped spring for a constant target over this update.
      const omega = 12,
        offset = value - target;
      const c = velocity + omega * offset,
        decay = Math.exp(-omega * dt);
      return [
        Math.max(-limit, Math.min(limit, target + (offset + c * dt) * decay)),
        (velocity - omega * c * dt) * decay,
      ] as const;
    };
    [this.x, this.#vx] = step(this.x, this.#vx, targets[0]!, 0.15);
    [this.y, this.#vy] = step(this.y, this.#vy, targets[1]!, 0.15);
    [this.z, this.#vz] = step(this.z, this.#vz, targets[2]!, 0.15);
  }
}
