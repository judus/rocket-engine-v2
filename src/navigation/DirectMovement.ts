import type { Point } from '../types.js';
import {
  checked,
  validateActor,
  validatePoint,
  type ActorTraversal,
  type TraversalWorld,
} from './contracts.js';

export type DirectMoveStatus = 'idle' | 'moved' | 'blocked' | 'unknown';
/** One direct-control pose owner; host supplies time, intent and speed. No clock or input listeners. */
export class DirectMovement {
  #position: Readonly<Point>;
  #actor: ActorTraversal;
  #disposed = false;
  constructor(
    readonly world: TraversalWorld,
    position: Readonly<Point>,
    actor: ActorTraversal,
  ) {
    validatePoint(position);
    validateActor(actor);
    this.#position = Object.freeze({ ...position });
    this.#actor = Object.freeze({
      ...actor,
      capabilities: Object.freeze([...actor.capabilities]),
    });
  }
  get position() {
    return this.#position;
  }
  update(
    dt: number,
    direction: Readonly<Point>,
    speed: number,
  ): DirectMoveStatus {
    if (this.#disposed) throw new Error('Direct movement disposed');
    validatePoint(direction);
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(speed) || speed <= 0)
      throw new Error('Invalid direct movement step');
    const magnitude = Math.hypot(direction.x, direction.y);
    if (!Number.isFinite(magnitude))
      throw new Error('Invalid direct movement direction');
    if (magnitude === 0 || dt === 0) return 'idle';
    const distance = speed * dt;
    if (!Number.isFinite(distance))
      throw new Error('Direct movement distance overflow');
    const next = {
      x: this.#position.x + (direction.x / magnitude) * distance,
      y: this.#position.y + (direction.y / magnitude) * distance,
    };
    validatePoint(next);
    const result = checked(
      this.world.segment(this.#position, next, this.#actor),
    );
    if (result.status !== 'passable') return result.status;
    this.#position = Object.freeze(next);
    return 'moved';
  }
  dispose(): undefined {
    this.#disposed = true;
    return;
  }
}
