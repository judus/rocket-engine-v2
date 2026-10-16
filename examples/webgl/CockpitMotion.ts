/** Cosmetic cockpit displacement in scene units; advanced by the demo's existing update. */
export class CockpitMotion {
  x = 0;
  y = 0;
  #vx = 0;
  #vy = 0;
  kick(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.#vx = Math.max(-8, Math.min(8, this.#vx + x));
    this.#vy = Math.max(-8, Math.min(8, this.#vy + y));
  }
  reset(): void {
    this.x = this.y = this.#vx = this.#vy = 0;
  }
  update(dt: number, right: number, up: number, forward: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const targets = [-right * 0.25, up * 0.25 - forward * 0.12];
    const step = (value: number, velocity: number, target: number) => {
      target = Math.max(
        -0.25,
        Math.min(0.25, Number.isFinite(target) ? target : 0),
      );
      // Exact critically damped spring for a constant target over this update.
      const omega = 12,
        offset = value - target;
      const c = velocity + omega * offset,
        decay = Math.exp(-omega * dt);
      return [
        Math.max(-0.25, Math.min(0.25, target + (offset + c * dt) * decay)),
        (velocity - omega * c * dt) * decay,
      ] as const;
    };
    [this.x, this.#vx] = step(this.x, this.#vx, targets[0]!);
    [this.y, this.#vy] = step(this.y, this.#vy, targets[1]!);
  }
}

/** Demo flight easing. World-space velocity and exact integration share the scene update. */
export class CockpitFlight {
  x = 0;
  y = 0;
  z = 0;
  get speed(): number {
    return Math.hypot(this.x, this.y, this.z);
  }
  reset(): void {
    this.x = this.y = this.z = 0;
  }
  update(dt: number, x: number, y: number, z: number) {
    if (!Number.isFinite(dt) || dt <= 0)
      return { x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0 };
    const tau = Math.hypot(x, y, z) < 1e-6 ? 0.45 : 0.35;
    const decay = Math.exp(-dt / tau);
    const step = (velocity: number, target: number) => {
      const next = target + (velocity - target) * decay;
      return {
        velocity: next,
        distance: target * dt + (velocity - target) * tau * (1 - decay),
        acceleration: (next - velocity) / dt,
      };
    };
    const a = step(this.x, x),
      b = step(this.y, y),
      c = step(this.z, z);
    this.x = a.velocity;
    this.y = b.velocity;
    this.z = c.velocity;
    return {
      x: a.distance,
      y: b.distance,
      z: c.distance,
      ax: a.acceleration,
      ay: b.acceleration,
      az: c.acceleration,
    };
  }
}
