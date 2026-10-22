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
