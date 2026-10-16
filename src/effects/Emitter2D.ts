import { Particles2D, nonnegative } from './Particles2D.js';
import type { Particle2D } from './Particles2D.js';
export interface EmitterOptions2D {
  rate?: number;
  angle?: number;
  spread?: number;
  speed?: readonly [number, number];
  life?: readonly [number, number];
  size?: readonly [number, number];
  endSize?: number;
  acceleration?: { x: number; y: number };
  color?: string;
  seed?: number;
}
function range(
  value: readonly [number, number],
  name: string,
  positive = false,
): readonly [number, number] {
  if (
    value.length !== 2 ||
    !value.every(Number.isFinite) ||
    value[0] < (positive ? Number.MIN_VALUE : 0) ||
    value[1] < value[0]
  )
    throw new RangeError(`Invalid ${name} range`);
  return [value[0], value[1]];
}
/** One emitter, no timer/RAF. Emits into an independently owned world-space pool. */
export class Emitter2D {
  x = 0;
  y = 0;
  emitting = true;
  #rate: number;
  #angle: number;
  #spread: number;
  #speed: readonly [number, number];
  #life: readonly [number, number];
  #size: readonly [number, number];
  #seed: number;
  #phase = 0;
  #disposed = false;
  #recipe: Particle2D;
  constructor(
    readonly particles: Particles2D,
    options: EmitterOptions2D = {},
  ) {
    this.#rate = nonnegative(options.rate ?? 80, 'rate');
    this.#angle = options.angle ?? -Math.PI / 2;
    this.#spread = nonnegative(options.spread ?? Math.PI / 4, 'spread');
    if (!Number.isFinite(this.#angle))
      throw new RangeError('angle must be finite');
    this.#speed = range(options.speed ?? [80, 160], 'speed');
    this.#life = range(options.life ?? [0.5, 1.5], 'life', true);
    this.#size = range(options.size ?? [2, 5], 'size');
    this.#seed = options.seed ?? 42;
    if (!Number.isInteger(this.#seed))
      throw new RangeError('seed must be an integer');
    this.#seed >>>= 0;
    const ax = options.acceleration?.x ?? 0,
      ay = options.acceleration?.y ?? 80;
    if (![ax, ay].every(Number.isFinite))
      throw new RangeError('acceleration must be finite');
    this.#recipe = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 1,
      size: 1,
      endSize: nonnegative(options.endSize ?? 0, 'endSize'),
      ax,
      ay,
      color: options.color ?? '#8ce6c9',
    };
  }
  get disposed() {
    return this.#disposed;
  }
  get rate() {
    return this.#rate;
  }
  set rate(value: number) {
    this.#live();
    this.#rate = nonnegative(value, 'rate');
  }
  #live() {
    if (this.#disposed) throw new Error('Emitter disposed');
  }
  #random() {
    // Mulberry32: repeatable visual variation, not gameplay randomness.
    let t = (this.#seed = (this.#seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  #between([lo, hi]: readonly [number, number]) {
    return lo + (hi - lo) * this.#random();
  }
  #emit(count: number, dt = 0, first = 0, interval = 0): number {
    if (![this.x, this.y].every(Number.isFinite))
      throw new RangeError('Emitter position must be finite');
    let spawned = 0;
    const attempts = Math.min(count, this.particles.capacity);
    first += (count - attempts) * interval;
    for (let i = 0; i < attempts; i++) {
      const p = this.#recipe,
        angle = this.#angle + (this.#random() - 0.5) * this.#spread,
        speed = this.#between(this.#speed);
      p.x = this.x;
      p.y = this.y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = this.#between(this.#life);
      p.size = this.#between(this.#size);
      if (this.particles.spawn(p, Math.max(0, dt - first - i * interval)))
        spawned++;
    }
    this.particles.drop(count - attempts);
    return spawned;
  }
  burst(count: number): number {
    this.#live();
    if (!Number.isSafeInteger(count) || count < 0)
      throw new RangeError('burst must be a nonnegative safe integer');
    return this.#emit(count);
  }
  /** Call after particles.update(dt); scheduled births age within this step. */
  update(dt: number): undefined {
    this.#live();
    nonnegative(dt, 'dt');
    if (!this.emitting || !this.#rate) return;
    const total = this.#phase + dt * this.#rate;
    if (!Number.isSafeInteger(Math.floor(total)))
      throw new RangeError('Emission count exceeds safe integers');
    const count = Math.floor(total + 1e-10),
      first = (1 - this.#phase) / this.#rate;
    this.#phase = Math.max(0, total - count);
    if (count) this.#emit(count, dt, first, 1 / this.#rate);
  }
  dispose(): undefined {
    this.#disposed = true;
    this.emitting = false;
    this.#phase = 0;
  }
}
