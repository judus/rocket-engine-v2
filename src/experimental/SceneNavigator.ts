import type { Frame, FixedFrame, Scene } from '../types.js';
import { assertSynchronous, invokeSynchronous } from '../synchronous.js';

export interface Route {
  create: () => Scene;
  retain?: boolean;
}
export interface NavigatorOptions {
  fixed?: boolean;
  onChange?: (current: Scene | null, previous: Scene | null) => undefined;
  onDispose?: () => undefined;
}
interface Instance {
  id: string;
  scene: Scene;
}
/** One delegate scene, retained/fresh factories and latest-request-wins preparation. */
export class SceneNavigator implements Scene {
  #routes = new Map<string, Route>();
  #retained = new Map<string, Scene>();
  #active: Instance | null = null;
  #history: string[] = [];
  #pending: AbortController | null = null;
  #jobs = new Set<Promise<void>>();
  #disposed = false;
  #completion: Promise<void> | null = null;
  #onChange: NavigatorOptions['onChange'];
  #onDispose: NavigatorOptions['onDispose'];
  activeChildren(): readonly Scene[] {
    return this.#disposed || !this.#active ? [] : [this.#active.scene];
  }
  readonly fixedUpdate?: (dt: number, frame: FixedFrame) => undefined;
  constructor({ fixed = false, onChange, onDispose }: NavigatorOptions = {}) {
    assertSynchronous(onChange, 'navigator.onChange');
    assertSynchronous(onDispose, 'navigator.onDispose');
    this.#onChange = onChange;
    this.#onDispose = onDispose;
    if (fixed)
      this.fixedUpdate = (dt, frame): undefined => {
        if (this.#disposed) return;
        invokeSynchronous(
          this.#active?.scene.fixedUpdate,
          this.#active?.scene,
          [dt, frame],
          'scene.fixedUpdate',
        );
      };
  }
  get current() {
    return this.#active?.id ?? null;
  }
  get scene() {
    return this.#active?.scene ?? null;
  }
  get history(): readonly string[] {
    return [...this.#history];
  }
  add(id: string, route: Route): this {
    if (this.#disposed || !id || this.#routes.has(id))
      throw new Error('Disposed navigator or duplicate/empty route');
    this.#routes.set(id, route);
    return this;
  }
  run(id: string): Promise<void> {
    return this.#navigate(id, false);
  }
  previous(): Promise<void> {
    const id = this.#history.at(-1);
    return id === undefined
      ? Promise.reject(new Error('No previous scene'))
      : this.#navigate(id, true);
  }
  #navigate(id: string, previous: boolean): Promise<void> {
    if (this.#disposed)
      return Promise.reject(new Error('Navigator is disposed'));
    const route = this.#routes.get(id);
    if (!route) return Promise.reject(new Error(`Unknown scene: ${id}`));
    const old = this.#pending;
    const controller = new AbortController();
    this.#pending = controller;
    old?.abort();
    const job = this.#transition(id, route, controller, previous);
    this.#jobs.add(job);
    void job.then(
      () => this.#jobs.delete(job),
      () => this.#jobs.delete(job),
    );
    return job;
  }
  async #transition(
    id: string,
    route: Route,
    controller: AbortController,
    previous: boolean,
  ): Promise<void> {
    let scene: Scene | undefined;
    let owned = false;
    try {
      // Defer factory invocation so all requests are tracked before user callbacks.
      await Promise.resolve();
      controller.signal.throwIfAborted();
      scene = this.#retained.get(id);
      if (!scene) {
        scene = route.create();
        if (
          scene === this.#active?.scene ||
          [...this.#retained.values()].includes(scene)
        )
          throw new Error(
            'Route factories must return distinct scene instances',
          );
        owned = true;
        if (scene.fixedUpdate && !this.fixedUpdate)
          throw new Error('Enable fixed timing on the navigator and Rocket');
        await scene.prepare?.({ signal: controller.signal });
      }
      controller.signal.throwIfAborted();
      const outgoing = this.#active;
      if (route.retain) this.#retained.set(id, scene);
      this.#active = { id, scene };
      if (this.#pending === controller) this.#pending = null;
      owned = false;
      if (previous) this.#history.pop();
      else if (outgoing && outgoing.id !== id) this.#history.push(outgoing.id);
      // The activation is committed; notify scopes before disposing outgoing resources.
      const errors: unknown[] = [];
      try {
        invokeSynchronous(
          this.#onChange,
          undefined,
          [scene, outgoing?.scene ?? null],
          'navigator.onChange',
        );
      } catch (error) {
        errors.push(error);
      }
      if (
        outgoing &&
        outgoing.scene !== scene &&
        this.#retained.get(outgoing.id) !== outgoing.scene
      ) {
        try {
          await outgoing.scene.dispose?.();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, 'Committed transition cleanup failed');
    } finally {
      if (this.#pending === controller) this.#pending = null;
      if (owned && scene) await scene.dispose?.();
    }
  }
  update(dt: number, frame: Frame): undefined {
    if (this.#disposed) return;
    invokeSynchronous(
      this.#active?.scene.update,
      this.#active?.scene,
      [dt, frame],
      'scene.update',
    );
  }
  draw(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
    if (this.#disposed) return;
    invokeSynchronous(
      this.#active?.scene.draw,
      this.#active?.scene,
      [ctx, frame],
      'scene.draw',
    );
  }
  dispose(): Promise<void> {
    if (this.#completion) return this.#completion;
    this.#disposed = true;
    const jobs = [...this.#jobs];
    const errors: unknown[] = [];
    this.#completion = Promise.resolve().then(async () => {
      await Promise.allSettled(jobs);
      const scenes = new Set(this.#retained.values());
      if (this.#active) scenes.add(this.#active.scene);
      this.#active = null;
      this.#retained.clear();
      this.#routes.clear();
      this.#history = [];
      const results = await Promise.allSettled(
        [...scenes].map(async (scene) => scene.dispose?.()),
      );
      errors.push(
        ...results
          .filter((result) => result.status === 'rejected')
          .map((result) => result.reason as unknown),
      );
      try {
        invokeSynchronous(
          this.#onDispose,
          undefined,
          [],
          'navigator.onDispose',
        );
      } catch (error) {
        errors.push(error);
      }
      this.#onChange = undefined;
      this.#onDispose = undefined;
      if (errors.length)
        throw new AggregateError(errors, 'Route cleanup failed');
    });
    try {
      invokeSynchronous(
        this.#onChange,
        undefined,
        [null, this.#active?.scene ?? null],
        'navigator.onChange',
      );
    } catch (error) {
      errors.push(error);
    }
    this.#pending?.abort();
    return this.#completion;
  }
}
