import { Presentation } from './Presentation.js';
import type { PresentationOptions } from './Presentation.js';
import { FixedClock } from './FixedClock.js';
import type { Service, ServiceType } from './Service.js';
import type { Scene } from './types.js';
import type { ViewOptions } from './View.js';
import { View } from './View.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';

const sceneOwners = new WeakMap<Scene, symbol>();

export interface SceneOptions {
  /** Keep simulation active without views; visibility/stop still pause the app. */
  keepAlive?: boolean;
}

export interface RocketOptions {
  onError?: (error: unknown) => void;
  performance?: boolean;
  fixed?: { step?: number; maxSteps?: number };
  maxFps?: number | null;
}

/** One browser frame loop; scenes update once, views draw independently. */
export class Rocket {
  #services = new Map<ServiceType<Service>, Service>();
  #startedServices = new Set<Service>();
  #scenes = new Set<Scene>();
  #persistentScenes = new Set<Scene>();
  #views = new Set<View | Presentation>();
  #prepared = new Set<Scene>();
  #running = false;
  #disposed = false;
  #frameId: number | null = null;
  #lastTime: number | null = null;
  #lastRenderTime: number | null = null;
  #time = 0;
  #startPromise: Promise<void> | null = null;
  #disposePromise: Promise<void> | null = null;
  #preparation: AbortController | null = null;
  #generation = 0;
  #onError: (error: unknown) => void;
  #document: Document | undefined;
  #owner = Symbol('scene owner');
  #monitor: PerformanceMonitor | null;
  #renderMonitor: PerformanceMonitor | null;
  #fixed: FixedClock | null;
  #maxFps: number | null = null;
  #nextFrame: number | null = null;
  #visibilityChanged = () => {
    this.#lastTime = null;
    this.#lastRenderTime = null;
    this.#nextFrame = null;
    this.#fixed?.reset();
    this.#monitor?.reset();
    this.#renderMonitor?.reset();
  };

  constructor({
    onError = (error) => {
      throw error;
    },
    performance: monitor = false,
    fixed,
    maxFps = null,
  }: RocketOptions = {}) {
    if (typeof onError !== 'function')
      throw new TypeError('onError must be a function');
    if (typeof monitor !== 'boolean')
      throw new TypeError('performance must be a boolean');
    this.#fixed = fixed === undefined ? null : new FixedClock(fixed);
    this.maxFps = maxFps;
    this.#monitor = monitor ? new PerformanceMonitor() : null;
    this.#renderMonitor = monitor ? new PerformanceMonitor() : null;
    this.#onError = onError;
    this.#document = globalThis.document;
    this.#document?.addEventListener(
      'visibilitychange',
      this.#visibilityChanged,
    );
  }

  get running() {
    return this.#running;
  }
  get disposed() {
    return this.#disposed;
  }
  get fixed() {
    return this.#fixed?.stats ?? null;
  }
  get performance() {
    return this.#monitor?.stats ?? null;
  }
  /** Actual presentation cadence/cost, independent of callback/update cadence. */
  get renderPerformance() {
    return this.#renderMonitor?.stats ?? null;
  }
  get maxFps() {
    return this.#maxFps;
  }
  set maxFps(value: number | null) {
    if (value !== null && (!Number.isFinite(value) || value < 1 || value > 240))
      throw new RangeError('maxFps must be null or between 1 and 240');
    this.#maxFps = value;
    this.#nextFrame = null;
  }

  use<T extends Service>(type: ServiceType<T>): T {
    this.#assertConfigurable();
    const existing = this.#services.get(type);
    if (existing) return existing as T;
    const service = new type();
    for (const name of [
      'start',
      'stop',
      'beforeUpdate',
      'beforeFixedUpdate',
      'dispose',
    ] as const) {
      assertSynchronous(service[name], `service.${name}`);
    }
    this.#services.set(type, service);
    return service;
  }

  scene<T extends Scene>(
    definition: T & ThisType<T>,
    { keepAlive = false }: SceneOptions = {},
  ): T {
    this.#assertConfigurable();
    if (typeof keepAlive !== 'boolean')
      throw new TypeError('keepAlive must be a boolean');
    if (!definition || typeof definition !== 'object')
      throw new TypeError('scene must be an object');
    for (const name of [
      'fixedUpdate',
      'update',
      'draw',
      'prepare',
      'dispose',
    ] as const) {
      if (
        definition[name] !== undefined &&
        typeof definition[name] !== 'function'
      ) {
        throw new TypeError(`scene.${name} must be a function`);
      }
    }
    assertSynchronous(definition.fixedUpdate, 'scene.fixedUpdate');
    if (definition.fixedUpdate && !this.#fixed)
      throw new Error(
        'Enable fixed timing before registering a fixedUpdate scene',
      );
    assertSynchronous(definition.update, 'scene.update');
    assertSynchronous(definition.draw, 'scene.draw');
    const owner = sceneOwners.get(definition);
    if (owner !== undefined && owner !== this.#owner) {
      throw new Error(
        'Scene already has an application owner; create a new scene instance',
      );
    }
    sceneOwners.set(definition, this.#owner);
    this.#scenes.add(definition);
    if (keepAlive) this.#persistentScenes.add(definition);
    else this.#persistentScenes.delete(definition);
    return definition;
  }

  view(options: ViewOptions): View {
    this.#assertConfigurable();
    if (!options || !this.#scenes.has(options.scene))
      throw new Error('Register the view scene with this application first');
    const view = new View(options, () => this.#views.delete(view));
    this.#views.add(view);
    return view;
  }

  /** Attach an optional rendering backend to the same scene/frame/performance lifecycle. */
  presentation(options: PresentationOptions): Presentation {
    this.#assertConfigurable();
    if (!options || !this.#scenes.has(options.scene))
      throw new Error(
        'Register the presentation scene with this application first',
      );
    const presentation = new Presentation(options, () =>
      this.#views.delete(presentation),
    );
    this.#views.add(presentation);
    return presentation;
  }

  start(): Promise<void> {
    if (this.#disposed)
      return Promise.reject(new Error('Application is disposed'));
    if (this.#startPromise) return this.#startPromise;
    if (this.#running) return Promise.resolve();
    const generation = this.#generation;
    const controller = new AbortController();
    this.#preparation = controller;
    this.#startPromise = Promise.resolve()
      .then(async () => {
        for (const scene of this.#activeScenes()) {
          if (controller.signal.aborted) throw controller.signal.reason;
          if (!this.#prepared.has(scene)) {
            await scene.prepare?.({ signal: controller.signal });
            if (controller.signal.aborted) throw controller.signal.reason;
            this.#prepared.add(scene);
          }
        }
        if (generation !== this.#generation || this.#disposed)
          throw new Error('Start was cancelled');
        this.#lastTime = null;
        this.#lastRenderTime = null;
        this.#nextFrame = null;
        this.#monitor?.reset();
        this.#renderMonitor?.reset();
        for (const service of this.#services.values()) {
          this.#startedServices.add(service);
          invokeSynchronous(
            service.start,
            service,
            [this.#activeScenes()],
            'service.start',
          );
          if (generation !== this.#generation || this.#disposed)
            throw new Error('Start was cancelled');
        }
        this.#running = true;
        this.#frameId = requestAnimationFrame(this.#tick);
      })
      .catch((error) => {
        try {
          this.stop();
        } catch (stopError) {
          throw new AggregateError(
            [error, stopError],
            'Start and suspension failed',
          );
        }
        throw error;
      })
      .finally(() => {
        this.#startPromise = null;
        this.#preparation = null;
      });
    return this.#startPromise;
  }

  stop() {
    this.#generation++;
    this.#running = false;
    this.#preparation?.abort(new Error('Start was cancelled'));
    if (this.#frameId !== null) cancelAnimationFrame(this.#frameId);
    this.#frameId = null;
    this.#lastTime = null;
    this.#lastRenderTime = null;
    this.#nextFrame = null;
    this.#fixed?.reset();
    this.#monitor?.reset();
    this.#renderMonitor?.reset();
    const errors: unknown[] = [];
    for (const service of [...this.#startedServices].reverse()) {
      this.#startedServices.delete(service);
      try {
        invokeSynchronous(service.stop, service, [], 'service.stop');
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Service suspension failed');
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    this.#disposed = true;
    const errors: unknown[] = [];
    this.#disposePromise = Promise.resolve().then(async () => {
      // Remove views before waiting for preparation and scene cleanup.
      for (const view of this.#views) {
        try {
          view.dispose();
        } catch (error) {
          errors.push(error);
        }
      }
      await this.#startPromise?.catch(() => {});
      for (const scene of [...this.#scenes].reverse()) {
        try {
          await scene.dispose?.();
        } catch (error) {
          errors.push(error);
        }
      }
      for (const service of [...this.#services.values()].reverse()) {
        try {
          invokeSynchronous(service.dispose, service, [], 'service.dispose');
        } catch (error) {
          errors.push(error);
        }
      }
      this.#services.clear();
      this.#views.clear();
      this.#scenes.clear();
      this.#persistentScenes.clear();
      this.#prepared.clear();
      if (errors.length)
        throw new AggregateError(errors, 'Application cleanup failed');
    });
    // Publish the shared completion before stop invokes any consumer callbacks.
    // The queued cleanup starts only after synchronous suspension has finished.
    try {
      this.stop();
    } catch (error) {
      errors.push(error);
    }
    this.#document?.removeEventListener(
      'visibilitychange',
      this.#visibilityChanged,
    );
    return this.#disposePromise;
  }

  #activeScenes() {
    const active = new Set<Scene>(this.#persistentScenes);
    for (const view of this.#views)
      if (!view.disposed && view.scene) active.add(view.scene);
    return active;
  }

  #isActive(scene: Scene) {
    if (this.#persistentScenes.has(scene)) return true;
    for (const view of this.#views) if (view.scene === scene) return true;
    return false;
  }

  #assertConfigurable() {
    if (this.#disposed) throw new Error('Application is disposed');
    if (this.#running || this.#startPromise)
      throw new Error('Stop the application before changing its composition');
  }

  #tick = (now: number) => {
    this.#frameId = null;
    if (!this.#running) return;
    const generation = this.#generation;
    try {
      if (!this.#document?.hidden) {
        const dt =
          this.#lastTime === null
            ? 0
            : Math.max(0, (now - this.#lastTime) / 1000);
        this.#lastTime = now;
        this.#time += dt;
        const frame = Object.freeze({ dt, time: this.#time });
        const updateStart = this.#monitor ? performance.now() : 0;
        const active = this.#activeScenes();
        for (const service of this.#services.values()) {
          if (!this.#running || generation !== this.#generation) return;
          invokeSynchronous(
            service.beforeUpdate,
            service,
            [frame, active],
            'service.beforeUpdate',
          );
        }
        if (!this.#running || generation !== this.#generation) return;
        if (this.#fixed) {
          const fixedScenes = new Set(
            [...active].filter(
              (scene) => scene.fixedUpdate && this.#isActive(scene),
            ),
          );
          let steps = 0;
          if (fixedScenes.size) steps = this.#fixed.begin(dt);
          else this.#fixed.reset();
          for (let index = 0; index < steps; index++) {
            if (!this.#running || generation !== this.#generation) return;
            const current = new Set(
              [...fixedScenes].filter((scene) => this.#isActive(scene)),
            );
            if (!current.size) break;
            const tick = this.#fixed.next();
            for (const service of this.#services.values()) {
              if (!this.#running || generation !== this.#generation) return;
              invokeSynchronous(
                service.beforeFixedUpdate,
                service,
                [tick, current],
                'service.beforeFixedUpdate',
              );
            }
            for (const scene of current) {
              if (!this.#running || generation !== this.#generation) return;
              if (this.#isActive(scene))
                invokeSynchronous(
                  scene.fixedUpdate,
                  scene,
                  [tick.dt, tick],
                  'scene.fixedUpdate',
                );
            }
          }
        }
        for (const scene of active) {
          if (!this.#running || generation !== this.#generation) return;
          if (!this.#isActive(scene)) continue;
          invokeSynchronous(scene.update, scene, [dt, frame], 'scene.update');
        }
        if (!this.#running || generation !== this.#generation) return;
        const renderStart = this.#monitor ? performance.now() : 0;
        const shouldRender =
          this.#maxFps === null ||
          this.#nextFrame === null ||
          now + 1e-7 >= this.#nextFrame;
        if (shouldRender) {
          if (this.#maxFps !== null) {
            const interval = 1000 / this.#maxFps;
            this.#nextFrame =
              this.#nextFrame === null
                ? now + interval
                : this.#nextFrame +
                  (Math.floor((now - this.#nextFrame + 1e-7) / interval) + 1) *
                    interval;
          }
          const renderDt =
            this.#lastRenderTime === null
              ? 0
              : Math.max(0, (now - this.#lastRenderTime) / 1000);
          this.#lastRenderTime = now;
          const renderFrame = Object.freeze({ dt: renderDt, time: this.#time });
          for (const view of this.#views) {
            if (!this.#running || generation !== this.#generation) return;
            view.render(renderFrame);
          }
          if (this.#running && generation === this.#generation)
            this.#renderMonitor?.record(
              renderDt,
              0,
              performance.now() - renderStart,
            );
        }
        if (this.#monitor && this.#running && generation === this.#generation) {
          this.#monitor.record(
            dt,
            renderStart - updateStart,
            shouldRender ? performance.now() - renderStart : 0,
          );
        }
      } else {
        this.#nextFrame = null;
        this.#fixed?.reset();
        this.#lastTime = null;
        this.#lastRenderTime = null;
        this.#monitor?.reset();
        this.#renderMonitor?.reset();
      }
      if (this.#running && generation === this.#generation)
        this.#frameId = requestAnimationFrame(this.#tick);
    } catch (error) {
      try {
        this.stop();
      } catch (stopError) {
        error = new AggregateError(
          [error, stopError],
          'Frame and suspension failed',
        );
      }
      this.#onError(error);
    }
  };
}
