import type { Frame, FixedFrame, Point, Matrix2D } from './types.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';

const hosts = new WeakSet<object>();
const roots = new WeakSet<Node2D>();
const drawing = new WeakSet<Node2D>();
const attaching = new WeakSet<Node2D>();
export function assertTreeMutable(node: Node2D) {
  if (node.disposed) throw new Error('Node is disposed');
  for (let n: Node2D | null = node; n; n = n.parent)
    if (drawing.has(n) || attaching.has(n))
      throw new Error(
        'Cannot change tree during drawing or capability attachment',
      );
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

/** A capability may claim exclusive write access to a shared state channel. */
export const position2DWriter = Symbol('position2DWriter');
interface Attachment {
  readonly order: number;
  readonly requires: readonly Behavior[];
  readonly writes: readonly symbol[];
}
export interface Behavior {
  readonly fixedOrder?: number;
  readonly requires?: readonly Behavior[];
  readonly writes?: readonly symbol[];
  onAttach?(node: Node2D): undefined;
  fixedUpdate?(dt: number, frame: FixedFrame, node: Node2D): undefined;
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
  behaviors: [Behavior, Attachment][];
}

/** Local transforms, exclusive child ownership, and synchronous behaviors. */
export class Node2D {
  #parent: Node2D | null = null;
  #children = new Set<Node2D>();
  #behaviors = new Map<Behavior, Attachment>();
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
    for (const hook of [
      'onAttach',
      'fixedUpdate',
      'update',
      'dispose',
    ] as const)
      assertSynchronous(behavior[hook], `behavior.${hook}`);
    if (hosts.has(behavior))
      throw new Error('Behavior already owned; create a new instance');
    const order = behavior.fixedOrder ?? 0;
    if (!Number.isFinite(order))
      throw new RangeError('fixedOrder must be finite');
    const requires = [...(behavior.requires ?? [])];
    const writes = [...(behavior.writes ?? [])];
    if (writes.some((claim) => typeof claim !== 'symbol'))
      throw new TypeError('Write claims must be symbols');
    for (const dependency of requires)
      if (!this.#behaviors.has(dependency))
        throw new Error('Required capability is not attached to this entity');
    for (const installed of this.#behaviors.values())
      if (writes.some((claim) => installed.writes.includes(claim)))
        throw new Error('Conflicting capability state writer');
    hosts.add(behavior);
    attaching.add(this);
    try {
      invokeSynchronous(
        behavior.onAttach,
        behavior,
        [this],
        'capability.onAttach',
      );
    } catch (error) {
      try {
        invokeSynchronous(
          behavior.dispose,
          behavior,
          [this],
          'capability.dispose',
        );
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          'Capability attachment and cleanup failed',
        );
      }
      throw error;
    } finally {
      attaching.delete(this);
    }
    this.#behaviors.set(behavior, { order, requires, writes });
    return behavior;
  }
  remove(behavior: Behavior) {
    this.#assertMutable();
    for (const entry of this.#behaviors.values())
      if (entry.requires.includes(behavior))
        throw new Error('Capability still has attached dependents');
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
  /** One ordered fixed-step pass across this entire subtree, not one pipeline per node. */
  fixedUpdate(dt: number, frame: FixedFrame): undefined {
    if (this.#disposed) return;
    if (!Number.isFinite(dt) || dt <= 0)
      throw new RangeError('Fixed dt must be positive and finite');
    const tasks = this.#snapshot().flatMap(({ node, revision, behaviors }) =>
      behaviors
        .filter(([behavior]) => behavior.fixedUpdate !== undefined)
        .map(([behavior, token]) => ({ node, revision, behavior, token })),
    );
    tasks.sort((a, b) => a.token.order - b.token.order);
    for (const { node, revision, behavior, token } of tasks) {
      if (this.#disposed) return;
      if (
        node.#disposed ||
        node.#revision !== revision ||
        !node.#belongsTo(this) ||
        node.#behaviors.get(behavior) !== token
      )
        continue;
      try {
        invokeSynchronous(
          behavior.fixedUpdate,
          behavior,
          [dt, frame, node],
          'capability.fixedUpdate',
        );
      } catch (cause) {
        throw new Error(
          `Fixed capability ${behavior.constructor.name} failed at node (${node.x}, ${node.y})`,
          { cause },
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
