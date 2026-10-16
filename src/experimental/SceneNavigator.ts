import type { Frame, FixedFrame, Scene } from '../types.js';
import { invokeSynchronous } from '../synchronous.js';

export interface Route {
  create: () => Scene;
  retain?: boolean;
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
  readonly fixedUpdate?: (dt: number, frame: FixedFrame) => undefined;
  constructor({ fixed = false }: { fixed?: boolean } = {}) {
    if (fixed)
      this.fixedUpdate = (dt, frame): undefined => {
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
      // Commit precedes cleanup: cleanup failure is reported but does not roll back activation.
      if (
        outgoing &&
        outgoing.scene !== scene &&
        this.#retained.get(outgoing.id) !== outgoing.scene
      )
        await outgoing.scene.dispose?.();
    } finally {
      if (this.#pending === controller) this.#pending = null;
      if (owned && scene) await scene.dispose?.();
    }
  }
  update(dt: number, frame: Frame): undefined {
    invokeSynchronous(
      this.#active?.scene.update,
      this.#active?.scene,
      [dt, frame],
      'scene.update',
    );
  }
  draw(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
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
      const errors = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason as unknown);
      if (errors.length)
        throw new AggregateError(errors, 'Route cleanup failed');
    });
    this.#pending?.abort();
    return this.#completion;
  }
}
