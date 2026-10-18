import { sweepPointAabb } from '../../src/projectiles/index.js';
import { position2DWriter } from '../../src/index.js';
import type { Behavior, Node2D } from '../../src/index.js';

export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
function rectangle(value: Rectangle): Readonly<Rectangle> {
  if (
    ![
      value.x,
      value.y,
      value.width,
      value.height,
      value.x + value.width,
      value.y + value.height,
    ].every(Number.isFinite) ||
    value.width <= 0 ||
    value.height <= 0
  )
    throw new RangeError(
      'Rectangle must have finite coordinates and positive dimensions',
    );
  return Object.freeze({ ...value });
}
/** Shared static world calculation. Bodies call it on Rocket's fixed clock; it owns no clock or registry. */
export class TopDownWorld {
  readonly bounds: Readonly<Rectangle>;
  readonly obstacles: readonly Readonly<Rectangle>[];
  constructor({
    bounds,
    obstacles,
  }: {
    bounds: Rectangle;
    obstacles: readonly Rectangle[];
  }) {
    this.bounds = rectangle(bounds);
    this.obstacles = Object.freeze(obstacles.map(rectangle));
  }
  canReach(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): boolean {
    return !this.obstacles.some(
      (p) =>
        sweepPointAabb(from, to, {
          minX: p.x,
          minY: p.y,
          maxX: p.x + p.width,
          maxY: p.y + p.height,
        }) !== null,
    );
  }
  validateSpawn(node: Node2D, width: number, height: number): void {
    const b = this.bounds;
    if (
      node.disposed ||
      ![node.x, node.y, width, height].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    )
      throw new RangeError(
        'Body requires a live finite spawn and positive size',
      );
    if (
      node.x - width / 2 < b.x ||
      node.x + width / 2 > b.x + b.width ||
      node.y - height / 2 < b.y ||
      node.y + height / 2 > b.y + b.height
    )
      throw new RangeError('Body spawn must fit world bounds');
    if (
      this.obstacles.some(
        (p) =>
          node.x + width / 2 > p.x &&
          node.x - width / 2 < p.x + p.width &&
          node.y + height / 2 > p.y &&
          node.y - height / 2 < p.y + p.height,
      )
    )
      throw new Error('Body spawn overlaps an obstacle');
  }
  /** Axis-separated swept AABB movement, with deterministic X-then-Y sliding. */
  solve(
    node: Node2D,
    width: number,
    height: number,
    vx: number,
    vy: number,
    dt: number,
  ): void {
    const b = this.bounds,
      hw = width / 2,
      hh = height / 2;
    const oldX = node.x,
      oldY = node.y;
    let x = Math.max(b.x + hw, Math.min(b.x + b.width - hw, oldX + vx * dt));
    for (const p of this.obstacles) {
      if (oldY + hh <= p.y || oldY - hh >= p.y + p.height) continue;
      if (vx > 0 && oldX + hw <= p.x && x + hw > p.x) x = Math.min(x, p.x - hw);
      if (vx < 0 && oldX - hw >= p.x + p.width && x - hw < p.x + p.width)
        x = Math.max(x, p.x + p.width + hw);
    }
    let y = Math.max(b.y + hh, Math.min(b.y + b.height - hh, oldY + vy * dt));
    for (const p of this.obstacles) {
      if (x + hw <= p.x || x - hw >= p.x + p.width) continue;
      if (vy > 0 && oldY + hh <= p.y && y + hh > p.y) y = Math.min(y, p.y - hh);
      if (vy < 0 && oldY - hh >= p.y + p.height && y - hh < p.y + p.height)
        y = Math.max(y, p.y + p.height + hh);
    }
    node.x = x;
    node.y = y;
  }
}

/** Centre-origin body, independent of player input, AI and inventory. */
export class TopDownBody implements Behavior {
  readonly writes = [position2DWriter];
  readonly fixedOrder = 0;
  readonly width: number;
  readonly height: number;
  readonly world: TopDownWorld;
  #owner: Node2D | null = null;
  #retired = false;
  #vx = 0;
  #vy = 0;
  #steps = 0;
  constructor({
    width,
    height,
    world,
  }: {
    width: number;
    height: number;
    world: TopDownWorld;
  }) {
    if (![width, height].every((n) => Number.isFinite(n) && n > 0))
      throw new RangeError('Body dimensions must be positive and finite');
    this.width = width;
    this.height = height;
    this.world = world;
  }
  get steps() {
    return this.#steps;
  }
  onAttach(node: Node2D): undefined {
    if (this.#owner || this.#retired)
      throw new Error('Body already attached or retired');
    this.world.validateSpawn(node, this.width, this.height);
    this.#owner = node;
  }
  assertOwner(node: Node2D): void {
    this.#assertLive();
    if (this.#owner !== node) throw new Error('Body owner mismatch');
  }
  setVelocity(x: number, y: number): void {
    this.#assertLive();
    if (![x, y].every(Number.isFinite))
      throw new RangeError('Velocity must be finite');
    this.#vx = x;
    this.#vy = y;
  }
  fixedUpdate(dt: number): undefined {
    this.#assertLive();
    this.world.solve(
      this.#owner!,
      this.width,
      this.height,
      this.#vx,
      this.#vy,
      dt,
    );
    this.#steps++;
  }
  dispose(): undefined {
    this.#retired = true;
    this.#owner = null;
    this.#vx = this.#vy = 0;
  }
  #assertLive(): void {
    if (this.#retired || !this.#owner || this.#owner.disposed)
      throw new Error('Body is detached or retired');
  }
}
