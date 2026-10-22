/** Normalized stick travel. The first 8% is neutral; the next 15% of the
 * remaining range smoothly blends into the linear response. */
export const mouseSteeringResponse = {
  deadzone: 0.08,
  activation: 0.15,
} as const;

/** Mouse displacement acts as a virtual stick, not a momentary angular impulse.
 * Outputs feed ShipControl just like the other device adapters. No physics or clock. */
export class MouseSteering {
  #yaw = 0;
  #pitch = 0;
  move(
    dx: number,
    dy: number,
    radius: number,
    sensitivity: number,
    invertPitch: boolean,
  ): void {
    if (
      ![dx, dy, radius, sensitivity].every(Number.isFinite) ||
      radius <= 0 ||
      sensitivity <= 0
    )
      throw new RangeError(
        'Invalid mouse steering displacement or calibration',
      );
    const yaw = this.#yaw + (dx * sensitivity) / radius;
    const pitch =
      this.#pitch - ((dy * sensitivity) / radius) * (invertPitch ? -1 : 1);
    const length = Math.max(1, Math.hypot(yaw, pitch));
    this.#yaw = yaw / length;
    this.#pitch = pitch / length;
  }
  reset(): void {
    this.#yaw = this.#pitch = 0;
  }
  get deflection() {
    return { yaw: this.#yaw, pitch: this.#pitch };
  }
  get intent() {
    const magnitude = Math.hypot(this.#yaw, this.#pitch);
    const { deadzone, activation } = mouseSteeringResponse;
    if (magnitude <= deadzone) return { yaw: 0, pitch: 0 };
    const travel = (magnitude - deadzone) / (1 - deadzone);
    const t = Math.min(1, travel / activation);
    const response = travel * t * t * (3 - 2 * t);
    return {
      yaw: (this.#yaw / magnitude) * response,
      pitch: (this.#pitch / magnitude) * response,
    };
  }
}
