import { ResourceScope } from './ResourceScope.js';
import type { Cleanup } from './ResourceScope.js';
import type { Frame, FixedFrame } from './types.js';
import {
  Node2D,
  claimRoot,
  assertTreeMutable,
  withTreeDrawing,
} from './Node2D.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';

export interface Scene2DOptions {
  prepare?: (
    this: Scene2D,
    context: { signal: AbortSignal },
  ) => void | Promise<void>;
  fixedUpdate?: (this: Scene2D, dt: number, frame: FixedFrame) => undefined;
  update?: (this: Scene2D, dt: number, frame: Frame) => undefined;
  draw?: (
    this: Scene2D,
    ctx: CanvasRenderingContext2D,
    frame: Frame,
  ) => undefined;
  dispose?: (this: Scene2D) => undefined;
}

/** Optional tree scene; ordinary update/draw scenes still work unchanged. */
export class Scene2D {
  #resources = new ResourceScope();
  #root = new Node2D();
  #hooks: Scene2DOptions;
  #disposed = false;
  readonly fixedUpdate?: (dt: number, frame: FixedFrame) => undefined;
  constructor(options: Scene2DOptions = {}) {
    const { fixedUpdate, update, draw, dispose } = options;
    for (const [name, hook] of Object.entries({
      fixedUpdate,
      update,
      draw,
      dispose,
    }))
      assertSynchronous(hook, `scene.${name}`);
    this.#hooks = options;
    if (fixedUpdate)
      this.fixedUpdate = (dt, frame): undefined => {
        if (this.#disposed) return;
        invokeSynchronous(
          this.#hooks.fixedUpdate,
          this,
          [dt, frame],
          'scene.fixedUpdate',
        );
      };
    claimRoot(this.#root);
  }
  get root() {
    return this.#root;
  }
  own<T extends Cleanup>(resource: T): T {
    if (this.#disposed) throw new Error('Scene is disposed');
    return this.#resources.own(resource);
  }
  prepare(context: { signal: AbortSignal }): void | Promise<void> {
    if (this.#disposed) throw new Error('Scene is disposed');
    return this.#hooks.prepare?.call(this, context);
  }
  update(dt: number, frame: Frame): undefined {
    if (this.#disposed) return;
    invokeSynchronous(this.#hooks.update, this, [dt, frame], 'scene.update');
    this.root.update(dt, frame);
  }
  draw(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
    if (this.#disposed) return;
    return withTreeDrawing(this.root, (): undefined => {
      ctx.save();
      try {
        ctx.beginPath();
        invokeSynchronous(this.#hooks.draw, this, [ctx, frame], 'scene.draw');
      } finally {
        ctx.restore();
      }
      this.root.draw(ctx, frame);
    });
  }
  dispose(): undefined {
    if (this.#disposed) return;
    if (!this.root.disposed) assertTreeMutable(this.root);
    this.#disposed = true;
    const errors = [];
    try {
      this.root.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      invokeSynchronous(this.#hooks.dispose, this, [], 'scene.dispose');
    } catch (error) {
      errors.push(error);
    }
    try {
      this.#resources.dispose();
    } catch (error) {
      errors.push(error);
    }
    this.#hooks = {};
    if (errors.length) throw new AggregateError(errors, 'Scene cleanup failed');
  }
}
