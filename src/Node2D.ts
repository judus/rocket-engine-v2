import type { Frame, Point, Matrix2D } from './types.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';

const hosts = new WeakSet<object>();
const roots = new WeakSet<Node2D>();
const drawing = new WeakSet<Node2D>();
export function assertTreeMutable(node: Node2D) {
  if (node.disposed) throw new Error('Node is disposed');
  for (let n: Node2D | null = node; n; n = n.parent)
    if (drawing.has(n)) throw new Error('Cannot change tree during drawing');
}
export function withTreeDrawing<T>(node: Node2D, callback: () => T): T {
  const alreadyDrawing = drawing.has(node);
  drawing.add(node);
  try {
    return callback();
  } finally {
    if (!alreadyDrawing) drawing.delete(node);
  }
}
export function claimRoot(node: Node2D) {
  if (node.parent || node.disposed || roots.has(node))
    throw new Error('Root already owned or disposed');
  roots.add(node);
}

export interface Behavior {
  update?(dt: number, frame: Frame, node: Node2D): undefined;
  dispose?(node: Node2D): undefined;
}
export interface NodeOptions {
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  draw?: (
    this: Node2D,
    ctx: CanvasRenderingContext2D,
    frame: Frame,
  ) => undefined;
}
interface Entry {
  node: Node2D;
  revision: number;
  behaviors: [Behavior, object][];
}

/** Local transforms, exclusive child ownership, and synchronous behaviors. */
export class Node2D {
  #parent: Node2D | null = null;
  #children = new Set<Node2D>();
  #behaviors = new Map<Behavior, object>();
  #disposed = false;
  #revision = 0;
  #draw: NodeOptions['draw'];
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;

  constructor({
    x = 0,
    y = 0,
    rotation = 0,
    scaleX = 1,
    scaleY = 1,
    draw,
  }: NodeOptions = {}) {
    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this.scaleX = scaleX;
    this.scaleY = scaleY;
    assertSynchronous(draw, 'node.draw');
    this.#draw = draw;
  }
  get parent(): Node2D | null {
    return this.#parent;
  }
  get children() {
    return [...this.#children];
  }
  get disposed() {
    return this.#disposed;
  }

  #assertMutable() {
    assertTreeMutable(this);
  }
  #touch() {
    this.#revision++;
    for (const child of this.#children) child.#touch();
  }
  add<T extends Node2D>(child: T): T {
    this.#assertMutable();
    if (!(child instanceof Node2D))
      throw new TypeError('child must be a Node2D');
    child.#assertMutable();
    if (child.parent || roots.has(child))
      throw new Error('Child already owned; detach it first');
    for (let n: Node2D | null = this; n; n = n.parent)
      if (n === child) throw new Error('Tree cycle');
    this.#children.add(child);
    child.#parent = this;
    child.#touch();
    return child;
  }
  detach(): this {
    this.#assertMutable();
    if (roots.has(this)) throw new Error('Scene root cannot be detached');
    if (this.#parent) this.#parent.#children.delete(this);
    this.#parent = null;
    this.#touch();
    return this;
  }
  attach<T extends Behavior>(behavior: T & ThisType<T>): T {
    this.#assertMutable();
    if (!behavior || typeof behavior !== 'object')
      throw new TypeError('behavior must be an object');
    for (const hook of ['update', 'dispose'] as const)
      assertSynchronous(behavior[hook], `behavior.${hook}`);
    if (hosts.has(behavior))
      throw new Error('Behavior already owned; create a new instance');
    hosts.add(behavior);
    this.#behaviors.set(behavior, {});
    return behavior;
  }
  remove(behavior: Behavior) {
    this.#assertMutable();
    if (!this.#behaviors.delete(behavior)) return;
    invokeSynchronous(behavior.dispose, behavior, [this], 'behavior.dispose');
  }
  #snapshot(entries: Entry[] = []): Entry[] {
    entries.push({
      node: this,
      revision: this.#revision,
      behaviors: [...this.#behaviors],
    });
    for (const child of this.#children) child.#snapshot(entries);
    return entries;
  }
  #belongsTo(root: Node2D): boolean {
    for (let n: Node2D | null = this; n; n = n.parent)
      if (n === root) return true;
    return false;
  }
  update(dt: number, frame: Frame): undefined {
    if (this.#disposed) return;
    for (const { node, revision, behaviors } of this.#snapshot()) {
      for (const [behavior, token] of behaviors) {
        if (this.#disposed) return;
        if (
          node.#disposed ||
          node.#revision !== revision ||
          !node.#belongsTo(this)
        )
          break;
        if (node.#behaviors.get(behavior) !== token) continue;
        invokeSynchronous(
          behavior.update,
          behavior,
          [dt, frame, node],
          'behavior.update',
        );
      }
    }
  }
  #matrix(): Matrix2D {
    const { x, y, rotation, scaleX, scaleY } = this;
    if (![x, y, rotation, scaleX, scaleY].every(Number.isFinite))
      throw new RangeError('Transform must be finite');
    const c = Math.cos(rotation),
      s = Math.sin(rotation);
    return [c * scaleX, s * scaleX, -s * scaleY, c * scaleY, x, y];
  }
  localToWorld({ x, y }: Point): Point {
    const [a, b, c, d, e, f] = this.#matrix();
    const point = { x: a * x + c * y + e, y: b * x + d * y + f };
    return this.parent ? this.parent.localToWorld(point) : point;
  }
  worldToLocal(point: Point): Point {
    const { x, y } = this.parent ? this.parent.worldToLocal(point) : point;
    const [a, b, c, d, e, f] = this.#matrix(),
      determinant = a * d - b * c;
    if (!determinant) throw new Error('Transform is not invertible');
    return {
      x: (d * (x - e) - c * (y - f)) / determinant,
      y: (-b * (x - e) + a * (y - f)) / determinant,
    };
  }
  draw(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
    if (this.#disposed) return;
    return withTreeDrawing(this, (): undefined => {
      ctx.save();
      try {
        ctx.transform(...this.#matrix());
        // Keep callback state/path separate from descendants and siblings.
        ctx.save();
        try {
          ctx.beginPath();
          invokeSynchronous(this.#draw, this, [ctx, frame], 'node.draw');
        } finally {
          ctx.restore();
        }
        for (const child of this.#children) child.draw(ctx, frame);
      } finally {
        ctx.restore();
      }
    });
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#assertMutable();
    this.#disposed = true;
    if (this.#parent) this.#parent.#children.delete(this);
    this.#parent = null;
    this.#touch();
    const errors = [];
    for (const child of [...this.#children].reverse()) {
      try {
        child.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    for (const behavior of [...this.#behaviors.keys()].reverse()) {
      this.#behaviors.delete(behavior);
      try {
        invokeSynchronous(
          behavior.dispose,
          behavior,
          [this],
          'behavior.dispose',
        );
      } catch (error) {
        errors.push(error);
      }
    }
    this.#children.clear();
    this.#draw = undefined;
    if (errors.length) throw new AggregateError(errors, 'Node cleanup failed');
  }
}
