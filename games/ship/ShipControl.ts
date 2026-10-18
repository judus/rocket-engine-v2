import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { copyVector, zeroVector } from './ShipBody.js';
import { numberIn } from './ShipPowerPlant.js';

export interface ShipIntent {
  readonly thrust: Readonly<Vec3>;
  readonly yaw: number;
}
/** Commands only. A player, AI or script can supply the same ship-local intent. */
export class ShipControl implements Behavior {
  #thrust = zeroVector();
  #yaw = 0;
  onAttach(): undefined {}
  thrust(value: Readonly<Vec3>): void {
    const next = copyVector(value, 'thrust');
    for (const key of ['x', 'y', 'z'] as const)
      numberIn(`thrust.${key}`, next[key], -1, 1);
    const scale = Math.max(1, Math.hypot(next.x, next.y, next.z));
    this.#thrust = { x: next.x / scale, y: next.y / scale, z: next.z / scale };
  }
  turn(yaw: number): void {
    this.#yaw = numberIn('yaw intent', yaw, -1, 1);
  }
  clear(): void {
    this.#thrust = zeroVector();
    this.#yaw = 0;
  }
  get intent(): Readonly<ShipIntent> {
    return Object.freeze({
      thrust: Object.freeze({ ...this.#thrust }),
      yaw: this.#yaw,
    });
  }
}
