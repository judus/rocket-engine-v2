import Matter from 'matter-js';
import type { Body, IEventCollision, Pair as NativePair } from 'matter-js';
import { assertSynchronous, invokeSynchronous } from '../synchronous.js';

import { removeNativeBody } from './removeNativeBody.js';
import type { Point } from '../types.js';

export interface Contact {
  readonly phase: 'begin' | 'end';
  readonly a: PhysicsBody;
  readonly b: PhysicsBody;
  readonly reason: 'solver' | 'removed';
}
export class PhysicsBody {
  #disposed = false;
  constructor(
    readonly id: number,
    readonly width: number,
    readonly height: number,
    readonly kind: 'dynamic' | 'static' | 'sensor',
    private read: (() => { x: number; y: number; angle: number }) | null,
    private release: (() => void) | null,
    private readVelocity: (() => Point) | null,
    private writeVelocity: ((velocity: Readonly<Point>) => void) | null,
  ) {}
  get disposed() {
    return this.#disposed;
  }
  get pose() {
    if (this.#disposed || !this.read)
      throw new Error('Physics body is disposed');
    return Object.freeze(this.read());
  }
  /** Linear velocity in world units per second, independent of Matter's base tick. */
  get velocity(): Readonly<Point> {
    if (this.#disposed || !this.readVelocity)
      throw new Error('Physics body is disposed');
    return Object.freeze(this.readVelocity());
  }
  setVelocity(velocity: Readonly<Point>): undefined {
    if (this.#disposed || !this.writeVelocity)
      throw new Error('Physics body is disposed');
    this.writeVelocity(velocity);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const release = this.release;
    this.read = null;
    this.release = null;
    this.readVelocity = null;
    this.writeVelocity = null;
    release?.();
  }
}
type Listener = (event: Contact) => undefined;
type Pair = { a: PhysicsBody; b: PhysicsBody };

/** Optional scene-owned Matter service. Caller owns fixed-step scheduling. */
export class PhysicsWorld {
  #engine = Matter.Engine.create();
  #bodies = new Map<number, { native: Body; handle: PhysicsBody }>();
  #listeners = new Map<number, Set<Listener>>();
  #active = new Map<string, Pair>();
  #seen = new Map<string, Pair>();
  #queue: Contact[] = [];
  #phase: 'idle' | 'solver' | 'contacts' = 'idle';
  #disposed = false;
  #steps = 0;
  #begins = 0;
  #ends = 0;
  #capture = (event: IEventCollision<Matter.Engine>) => {
    for (const pair of event.pairs) {
      const a = this.#bodies.get(pair.bodyA.id)?.handle;
      const b = this.#bodies.get(pair.bodyB.id)?.handle;
      if (a && b) this.#seen.set(this.#key(a, b), { a, b });
    }
  };
  constructor() {
    Matter.Events.on(this.#engine, 'collisionStart', this.#capture);
    Matter.Events.on(this.#engine, 'collisionActive', this.#capture);
  }
  get stats() {
    const bodies = [...this.#bodies.values()].map((entry) => entry.handle);
    return Object.freeze({
      bodies: bodies.length,
      dynamic: bodies.filter((b) => b.kind === 'dynamic').length,
      sensors: bodies.filter((b) => b.kind === 'sensor').length,
      contacts: this.#active.size,
      listeners: [...this.#listeners.values()].reduce(
        (sum, set) => sum + set.size,
        0,
      ),
      steps: this.#steps,
      begins: this.#begins,
      ends: this.#ends,
      phase: this.#phase,
      disposed: this.#disposed,
      cachedPairs: (this.#engine.pairs as { list: NativePair[] }).list.length,
      cachedBodies: this.#engine.detector.bodies.length,
    });
  }
  rectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    kind: PhysicsBody['kind'] = 'dynamic',
  ): PhysicsBody {
    this.#assertLive();
    if (this.#phase === 'solver')
      throw new Error('Cannot create a body inside the solver');
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      width <= 0 ||
      height <= 0
    )
      throw new RangeError('Invalid rectangle dimensions');
    const native = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: kind !== 'dynamic',
      isSensor: kind === 'sensor',
      restitution: 0.15,
    });
    const handle = new PhysicsBody(
      native.id,
      width,
      height,
      kind,
      () => ({ ...native.position, angle: native.angle }),
      () => this.#remove(handle),
      () => {
        const velocity = Matter.Body.getVelocity(native);
        return { x: velocity.x * 60, y: velocity.y * 60 };
      },
      (velocity) => {
        this.#assertLive();
        if (this.#phase === 'solver')
          throw new Error('Cannot command a body inside the solver');
        if (kind !== 'dynamic') throw new Error('Only dynamic bodies can move');
        if (![velocity.x, velocity.y].every(Number.isFinite))
          throw new RangeError('Velocity must be finite');
        Matter.Body.setVelocity(native, {
          x: velocity.x / 60,
          y: velocity.y / 60,
        });
      },
    );
    this.#bodies.set(handle.id, { native, handle });
    Matter.Composite.add(this.#engine.world, native);
    return handle;
  }
  onContact(body: PhysicsBody, listener: Listener): { dispose(): undefined } {
    this.#assertLive();
    if (this.#bodies.get(body.id)?.handle !== body || body.disposed)
      throw new Error('Subscribe to a live body of this world');
    assertSynchronous(listener, 'physics contact');
    const listeners = this.#listeners.get(body.id) ?? new Set<Listener>();
    this.#listeners.set(body.id, listeners);
    listeners.add(listener);
    return {
      dispose: (): undefined => {
        listeners.delete(listener);
        if (!listeners.size) this.#listeners.delete(body.id);
      },
    };
  }
  step(dt: number): undefined {
    this.#assertLive();
    if (this.#phase !== 'idle')
      throw new Error('Physics step is not reentrant');
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1 / 60 + 1e-10)
      throw new RangeError(
        'Physics step must be positive and at most 1/60 seconds',
      );
    this.#phase = 'solver';
    this.#seen.clear();
    try {
      Matter.Engine.update(this.#engine, dt * 1000);
      this.#steps++;
      for (const [key, pair] of this.#seen) {
        if (!this.#active.has(key)) {
          this.#active.set(key, pair);
          this.#queue.push(
            Object.freeze({ ...pair, phase: 'begin', reason: 'solver' }),
          );
        }
      }
      for (const [key, pair] of this.#active) {
        if (!this.#seen.has(key)) {
          this.#active.delete(key);
          this.#queue.push(
            Object.freeze({ ...pair, phase: 'end', reason: 'solver' }),
          );
        }
      }
      this.#phase = 'contacts';
      this.#drain();
    } finally {
      this.#phase = 'idle';
      this.#seen.clear();
    }
  }
  #remove(body: PhysicsBody) {
    const entry = this.#bodies.get(body.id);
    if (!entry) return;
    this.#bodies.delete(body.id);
    this.#listeners.delete(body.id);
    Matter.Composite.remove(this.#engine.world, entry.native);
    // Preserve unrelated pair objects and their warm-start impulses.
    removeNativeBody(
      this.#engine,
      entry.native,
      [...this.#bodies.values()].map(({ native }) => native),
    );
    for (const [key, pair] of this.#seen)
      if (pair.a === body || pair.b === body) this.#seen.delete(key);
    for (const [key, pair] of this.#active) {
      if (pair.a === body || pair.b === body) {
        this.#active.delete(key);
        if (!this.#disposed)
          this.#queue.push(
            Object.freeze({ ...pair, phase: 'end', reason: 'removed' }),
          );
      }
    }
    if (this.#phase === 'idle' && !this.#disposed) {
      this.#phase = 'contacts';
      try {
        this.#drain();
      } finally {
        this.#phase = 'idle';
      }
    }
  }
  #drain() {
    const errors: unknown[] = [];
    while (this.#queue.length && !this.#disposed) {
      const event = this.#queue.shift();
      if (
        !event ||
        (event.phase === 'begin' && (event.a.disposed || event.b.disposed))
      )
        continue;
      if (event.phase === 'begin') this.#begins++;
      else this.#ends++;
      for (const body of [event.a, event.b]) {
        for (const listener of [...(this.#listeners.get(body.id) ?? [])]) {
          if (event.phase === 'begin' && (event.a.disposed || event.b.disposed))
            break;
          if (!this.#listeners.get(body.id)?.has(listener)) continue;
          try {
            invokeSynchronous(listener, undefined, [event], 'physics contact');
          } catch (error) {
            errors.push(error);
          }
        }
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Physics contact delivery failed');
  }
  #key(a: PhysicsBody, b: PhysicsBody) {
    return a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
  }
  #assertLive() {
    if (this.#disposed) throw new Error('Physics world is disposed');
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    Matter.Events.off(this.#engine, 'collisionStart', this.#capture);
    Matter.Events.off(this.#engine, 'collisionActive', this.#capture);
    this.#queue = [];
    this.#active.clear();
    this.#seen.clear();
    this.#listeners.clear();
    for (const { handle } of [...this.#bodies.values()]) handle.dispose();
    Matter.Composite.clear(this.#engine.world, false, true);
    Matter.Engine.clear(this.#engine);
  }
}
