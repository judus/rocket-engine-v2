import { position2DWriter } from '../../src/index.js';
import type { Node2D, Behavior } from '../../src/index.js';

import { solvePlatformer } from './solvePlatformer.js';
import type { Platform, PlatformerWorldOptions } from './solvePlatformer.js';
interface Motion {
  node: Node2D | null;
  velocityX: number;
  velocityY: number;
  grounded: boolean;
  steps: number;
  retired: boolean;
}
const motions = new WeakMap<PlatformerBody, Motion>();
function motion(body: PlatformerBody): Motion {
  return motions.get(body)!;
}
function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0)
    throw new RangeError(`${name} must be positive and finite`);
  return value;
}

/** Per-entity shape, motion and contacts. Position is the centre of its feet, Y down. */
export class PlatformerBody implements Behavior {
  readonly writes = [position2DWriter];
  readonly width: number;
  readonly height: number;
  readonly solver: PlatformerSolver;
  constructor({
    width,
    height,
    solver,
  }: {
    width: number;
    height: number;
    solver: PlatformerSolver;
  }) {
    this.width = positive(width, 'Body width');
    this.height = positive(height, 'Body height');
    this.solver = solver;
    motions.set(this, {
      node: null,
      velocityX: 0,
      velocityY: 0,
      grounded: false,
      steps: 0,
      retired: false,
    });
  }
  get velocityX() {
    return motion(this).velocityX;
  }
  get velocityY() {
    return motion(this).velocityY;
  }
  get grounded() {
    return motion(this).grounded;
  }
  get steps() {
    return motion(this).steps;
  }
  onAttach(node: Node2D): undefined {
    this.solver.register(this, node);
  }
  assertOwner(node: Node2D): void {
    this.assertLive();
    if (motion(this).node !== node) throw new Error('Body owner mismatch');
  }
  assertLive(): void {
    const state = motion(this);
    if (state.retired || !state.node || state.node.disposed)
      throw new Error('Body is detached or retired');
    this.solver.assertLive();
  }
  setHorizontalVelocity(value: number): void {
    this.assertLive();
    if (!Number.isFinite(value))
      throw new RangeError('Velocity must be finite');
    motion(this).velocityX = value;
  }
  jump(speed: number): void {
    this.assertLive();
    positive(speed, 'Jump speed');
    if (!this.grounded) return;
    motion(this).velocityY = -speed;
    motion(this).grounded = false;
  }
  dispose(): undefined {
    this.solver.unregister(this);
    const state = motion(this);
    state.retired = true;
    state.node = null;
    state.velocityX = state.velocityY = 0;
  }
}

/** One world solver, driven by Rocket's fixed clock. Static AABBs, no body/body collisions. */
export class PlatformerSolver implements Behavior {
  readonly fixedOrder = 0;
  readonly platforms: readonly Platform[];
  readonly gravity: number;
  readonly bounds: Readonly<PlatformerWorldOptions['bounds']>;
  #bodies = new Set<PlatformerBody>();
  #disposed = false;
  #owner: Node2D | null = null;
  constructor({ platforms, gravity, bounds }: PlatformerWorldOptions) {
    if (!Number.isFinite(gravity) || gravity < 0)
      throw new RangeError('Gravity must be finite and nonnegative');
    if (
      !Number.isFinite(bounds.left) ||
      !Number.isFinite(bounds.right) ||
      bounds.right <= bounds.left
    )
      throw new RangeError('World bounds must be finite and ordered');
    this.gravity = gravity;
    this.bounds = Object.freeze({ ...bounds });
    this.platforms = Object.freeze(
      platforms.map((platform) => {
        if (
          ![
            platform.x,
            platform.y,
            platform.x + platform.width,
            platform.y + platform.height,
          ].every(Number.isFinite)
        )
          throw new RangeError('Platform coordinates must be finite');
        positive(platform.width, 'Platform width');
        positive(platform.height, 'Platform height');
        return Object.freeze({ ...platform });
      }),
    );
  }
  onAttach(node: Node2D): undefined {
    if (this.#disposed || this.#owner)
      throw new Error('Solver already attached or disposed');
    this.#owner = node;
  }
  get disposed() {
    return this.#disposed || this.#owner?.disposed === true;
  }
  get bodyCount() {
    return this.#bodies.size;
  }
  assertLive(): void {
    if (this.#disposed || !this.#owner || this.#owner.disposed)
      throw new Error('Platformer solver is detached or disposed');
  }
  register(body: PlatformerBody, node: Node2D): void {
    this.assertLive();
    const state = motion(body);
    if (body.solver !== this || state.node || state.retired)
      throw new Error(
        'Body has a different solver, is already attached or retired',
      );
    if (node.disposed || ![node.x, node.y].every(Number.isFinite))
      throw new RangeError('Spawn must be live and finite');
    const half = body.width / 2;
    if (node.x - half < this.bounds.left || node.x + half > this.bounds.right)
      throw new RangeError('Body spawn must fit world bounds');
    for (const p of this.platforms)
      if (
        node.x + half > p.x &&
        node.x - half < p.x + p.width &&
        node.y > p.y &&
        node.y - body.height < p.y + p.height
      )
        throw new Error('Body spawn overlaps a platform');
    state.node = node;
    state.grounded = this.platforms.some(
      (p) =>
        node.y === p.y && node.x + half > p.x && node.x - half < p.x + p.width,
    );
    this.#bodies.add(body);
  }
  unregister(body: PlatformerBody): void {
    this.#bodies.delete(body);
  }
  fixedUpdate(dt: number): undefined {
    this.assertLive();
    positive(dt, 'Fixed dt');
    for (const body of this.#bodies) {
      const state = motion(body);
      const node = state.node!;
      // Detached entities retain their capabilities but must not simulate in their old world.
      let ancestor: Node2D | null = node;
      while (ancestor && ancestor !== this.#owner) ancestor = ancestor.parent;
      if (!ancestor || node.disposed) continue;
      if (node.parent !== this.#owner)
        throw new Error(
          'Platformer bodies must be direct children of their solver layer',
        );
      solvePlatformer(node, state, body, this, dt);
      state.steps++;
    }
  }
  dispose(): undefined {
    this.#disposed = true;
    this.#bodies.clear();
  }
}
