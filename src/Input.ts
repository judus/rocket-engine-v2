import type { View } from './View.js';
import type { Frame, FixedFrame, Point, Scene } from './types.js';
import type { Cleanup } from './ResourceScope.js';

export interface InputTarget {
  readonly canvas: HTMLCanvasElement;
  readonly scene: Scene | null;
  readonly disposed: boolean;
  clientToWorld(point: Point): Point;
  own<T extends Cleanup>(resource: T): T;
}

export type Bindings = Record<string, string | readonly string[]>;
export interface PointerState {
  readonly world: Readonly<Point> | null;
  readonly down: boolean;
  readonly pressed: boolean;
  readonly released: boolean;
}
const emptyPointer = (): PointerState =>
  Object.freeze({ world: null, down: false, pressed: false, released: false });

/** One scene's actions, shared across its focusable view bindings. */
export class InputScope<A extends string> {
  #bindings = new Map<A, readonly string[]>();
  #keys = new Set<string>();
  #pressed = new Set<A>();
  #released = new Set<A>();
  #held = new Set<A>();
  #pendingPress = new Set<A>();
  #pendingRelease = new Set<A>();
  #fixedHeld = new Set<A>();
  #fixedPressed = new Set<A>();
  #fixedReleased = new Set<A>();
  #fixedPendingPress = new Set<A>();
  #fixedPendingRelease = new Set<A>();
  readonly fixed = Object.freeze({
    down: (action: A): boolean => this.#fixedHeld.has(action),
    pressed: (action: A): boolean => this.#fixedPressed.has(action),
    released: (action: A): boolean => this.#fixedReleased.has(action),
  });
  #views = new Set<ViewInput<InputTarget>>();
  #keyboardOwner: ViewInput<InputTarget> | null = null;
  #disposed = false;
  #enabled: () => boolean;
  #onDispose: () => void;
  readonly scene: Scene;

  constructor(
    scene: Scene,
    bindings: Record<A, string | readonly string[]>,
    enabled: () => boolean,
    onDispose: () => void,
  ) {
    this.scene = scene;
    this.#enabled = enabled;
    this.#onDispose = onDispose;
    for (const name of Object.keys(bindings) as A[]) {
      const codes = bindings[name];
      const list = typeof codes === 'string' ? [codes] : codes;
      if (!Array.isArray(list) || !list.length) {
        throw new TypeError(`Invalid binding for ${name}`);
      }
      this.#bindings.set(
        name,
        Array.from(list, (code: unknown) => {
          if (typeof code !== 'string' || !code)
            throw new TypeError(`Invalid binding for ${name}`);
          return code;
        }),
      );
    }
  }
  down(action: A): boolean {
    return this.#held.has(action);
  }
  pressed(action: A): boolean {
    return this.#pressed.has(action);
  }
  released(action: A): boolean {
    return this.#released.has(action);
  }
  get views(): readonly ViewInput<InputTarget>[] {
    return [...this.#views];
  }
  bind<T extends InputTarget>(view: T): ViewInput<T> {
    if (this.#disposed) throw new Error('Input scope is disposed');
    if (view.disposed || view.scene !== this.scene)
      throw new Error('Bind a live view of this scope scene');
    if ([...this.#views].some((binding) => binding.view === view))
      throw new Error('View is already bound');
    const binding = new ViewInput(
      view,
      this.#enabled,
      (owner, event, down) => this.#key(owner, event, down),
      (owner) => {
        if (this.#keyboardOwner === owner) this.#resetKeys();
      },
      (owner) => {
        this.#views.delete(owner);
        if (this.#keyboardOwner === owner) this.#resetKeys();
      },
    );
    this.#views.add(binding);
    return view.own(binding);
  }
  #actions(): A[] {
    return [...this.#bindings.keys()];
  }
  #isHeld(action: A): boolean {
    return (
      this.#bindings.get(action)?.some((code) => this.#keys.has(code)) ?? false
    );
  }
  #key(
    owner: ViewInput<InputTarget>,
    event: KeyboardEvent,
    down: boolean,
  ): void {
    if (
      !this.#enabled() ||
      (down &&
        (event.isComposing || event.ctrlKey || event.altKey || event.metaKey))
    )
      return;
    if (
      !this.#actions().some((action) =>
        this.#bindings.get(action)?.includes(event.code),
      )
    )
      return;
    event.preventDefault();
    if (down && event.repeat) return;
    if (this.#keyboardOwner !== owner) {
      this.#resetKeys();
      this.#keyboardOwner = owner;
    }
    const before = new Set(
      this.#actions().filter((action) => this.#isHeld(action)),
    );
    if (down) this.#keys.add(event.code);
    else this.#keys.delete(event.code);
    for (const action of this.#actions()) {
      const after = this.#isHeld(action);
      if (!before.has(action) && after) this.#pendingPress.add(action);
      if (before.has(action) && !after) this.#pendingRelease.add(action);
    }
  }
  #resetFixed(): void {
    this.#fixedHeld.clear();
    this.#fixedPressed.clear();
    this.#fixedReleased.clear();
    this.#fixedPendingPress.clear();
    this.#fixedPendingRelease.clear();
  }
  #resetKeys(): void {
    this.#resetFixed();
    this.#keys.clear();
    this.#held.clear();
    this.#pressed.clear();
    this.#released.clear();
    this.#pendingPress.clear();
    this.#pendingRelease.clear();
    this.#keyboardOwner = null;
  }
  /** Runtime phase; callers should read snapshots rather than advancing scopes. */
  snapshot(active: boolean, fixed = false): void {
    if (!active) {
      this.reset();
      return;
    }
    this.#held = new Set(
      this.#actions().filter((action) => this.#isHeld(action)),
    );
    this.#pressed = new Set(this.#pendingPress);
    this.#released = new Set(this.#pendingRelease);
    if (fixed) {
      for (const action of this.#pressed) this.#fixedPendingPress.add(action);
      for (const action of this.#released)
        this.#fixedPendingRelease.add(action);
    } else this.#resetFixed();
    this.#pendingPress.clear();
    this.#pendingRelease.clear();
    for (const binding of this.#views) binding.snapshot(fixed);
  }
  snapshotFixed(active: boolean): void {
    if (!active) {
      this.#resetFixed();
      return;
    }
    this.#fixedHeld = new Set(this.#held);
    this.#fixedPressed = new Set(this.#fixedPendingPress);
    this.#fixedReleased = new Set(this.#fixedPendingRelease);
    this.#fixedPendingPress.clear();
    this.#fixedPendingRelease.clear();
    for (const binding of this.#views) binding.snapshotFixed();
  }
  reset(): void {
    this.#resetKeys();
    const errors: unknown[] = [];
    for (const binding of this.#views) {
      try {
        binding.reset();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Input reset failed');
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const binding of [...this.#views]) {
      try {
        binding.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      this.reset();
    } catch (error) {
      errors.push(error);
    }
    this.#onDispose();
    this.#enabled = () => false;
    this.#onDispose = () => {};
    if (errors.length)
      throw new AggregateError(errors, 'Input scope cleanup failed');
  }
}

// Several scene scopes can share one presentation. Restore its attributes only
// when the final binding retires, regardless of route disposal order.
const canvasOwners = new WeakMap<
  HTMLCanvasElement,
  { count: number; tab: string | null; touch: string }
>();
function ownCanvas(canvas: HTMLCanvasElement): () => void {
  let state = canvasOwners.get(canvas);
  if (!state) {
    state = {
      count: 0,
      tab: canvas.getAttribute('tabindex'),
      touch: canvas.style.touchAction,
    };
    canvasOwners.set(canvas, state);
    if (state.tab === null) canvas.tabIndex = 0;
    canvas.style.touchAction = 'none';
  }
  state.count++;
  const owned = state;
  return () => {
    if (--owned.count !== 0) return;
    canvasOwners.delete(canvas);
    if (owned.tab === null) canvas.removeAttribute('tabindex');
    else canvas.setAttribute('tabindex', owned.tab);
    canvas.style.touchAction = owned.touch;
  };
}

/** A view-owned primary pointer and canvas keyboard routing. */
export class ViewInput<T extends InputTarget = View> {
  readonly view: T;
  #resources: (() => void)[] = [];
  #pointer: PointerState = emptyPointer();
  #fixedPointer: PointerState = emptyPointer();
  #fixedPress = false;
  #fixedRelease = false;
  #client: Point | null = null;
  #id: number | null = null;
  #down = false;
  #pressed = false;
  #released = false;
  #disposed = false;
  #onDispose: (binding: ViewInput<InputTarget>) => void;

  constructor(
    view: T,
    enabled: () => boolean,
    key: (
      binding: ViewInput<InputTarget>,
      event: KeyboardEvent,
      down: boolean,
    ) => void,
    blur: (binding: ViewInput<InputTarget>) => void,
    onDispose: (binding: ViewInput<InputTarget>) => void,
  ) {
    this.view = view;
    this.#onDispose = onDispose;
    const canvas = view.canvas;
    this.#resources.push(ownCanvas(canvas));
    const listen = (type: string, callback: EventListener) => {
      canvas.addEventListener(type, callback);
      this.#resources.push(() => canvas.removeEventListener(type, callback));
    };
    listen('keydown', (event) => {
      if (event.target === canvas) key(this, event as KeyboardEvent, true);
    });
    listen('keyup', (event) => {
      if (event.target === canvas) key(this, event as KeyboardEvent, false);
    });
    listen('blur', () => {
      blur(this);
      this.reset();
    });
    listen('pointerdown', (raw) => {
      const event = raw as PointerEvent;
      if (
        !enabled() ||
        !event.isPrimary ||
        event.button !== 0 ||
        this.#id !== null
      )
        return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      this.#id = event.pointerId;
      this.#down = true;
      this.#pressed = true;
      this.#client = { x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
    });
    listen('pointermove', (raw) => {
      const event = raw as PointerEvent;
      if (
        !enabled() ||
        !event.isPrimary ||
        (this.#id !== null && this.#id !== event.pointerId)
      )
        return;
      this.#client = { x: event.clientX, y: event.clientY };
    });
    listen('pointerup', (raw) => {
      const event = raw as PointerEvent;
      if (this.#id !== event.pointerId) return;
      this.#client = { x: event.clientX, y: event.clientY };
      this.#down = false;
      this.#released = true;
      this.#releaseCapture();
    });
    listen('pointercancel', (raw) => {
      if ((raw as PointerEvent).pointerId === this.#id) this.reset();
    });
    listen('lostpointercapture', (raw) => {
      if ((raw as PointerEvent).pointerId === this.#id) this.reset();
    });
    listen('pointerleave', () => {
      if (!this.#down) this.#client = null;
    });
  }
  get fixedPointer(): PointerState {
    return this.#fixedPointer;
  }
  get pointer(): PointerState {
    return this.#pointer;
  }
  get disposed(): boolean {
    return this.#disposed;
  }
  #releaseCapture(): void {
    const id = this.#id;
    this.#id = null;
    if (id !== null && this.view.canvas.hasPointerCapture(id))
      this.view.canvas.releasePointerCapture(id);
  }
  snapshot(fixed = false): void {
    if (this.#disposed) return;
    const rect = this.view.canvas.getBoundingClientRect();
    const world =
      this.#client && rect.width && rect.height
        ? Object.freeze(this.view.clientToWorld(this.#client))
        : null;
    this.#pointer = Object.freeze({
      world,
      down: this.#down,
      pressed: this.#pressed,
      released: this.#released,
    });
    if (fixed) {
      this.#fixedPress ||= this.#pressed;
      this.#fixedRelease ||= this.#released;
    } else {
      this.#fixedPress = this.#fixedRelease = false;
      this.#fixedPointer = emptyPointer();
    }
    this.#pressed = this.#released = false;
  }
  snapshotFixed(): void {
    this.#fixedPointer = Object.freeze({
      ...this.#pointer,
      pressed: this.#fixedPress,
      released: this.#fixedRelease,
    });
    this.#fixedPress = this.#fixedRelease = false;
  }
  reset(): void {
    this.#releaseCapture();
    this.#client = null;
    this.#down = this.#pressed = this.#released = false;
    this.#pointer = emptyPointer();
    this.#fixedPointer = emptyPointer();
    this.#fixedPress = this.#fixedRelease = false;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    try {
      this.reset();
    } catch (error) {
      errors.push(error);
    }
    for (const cleanup of this.#resources.reverse()) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#resources = [];
    this.#onDispose(this);
    this.#onDispose = () => {};
    if (errors.length)
      throw new AggregateError(errors, 'View input cleanup failed');
  }
}

/** Install once per app. No global key capture; events only come from bound canvases. */
export class Input {
  #scopes = new Set<
    Pick<
      InputScope<string>,
      'scene' | 'snapshot' | 'snapshotFixed' | 'reset' | 'dispose'
    >
  >();
  #activeScenes: ReadonlySet<Scene> = new Set();
  #running = false;
  #disposed = false;
  #document = globalThis.document;
  #reset = () => {
    const errors: unknown[] = [];
    for (const scope of this.#scopes) {
      try {
        scope.reset();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length)
      throw new AggregateError(errors, 'Input service reset failed');
  };
  constructor() {
    this.#document.addEventListener('visibilitychange', this.#reset);
    this.#document.defaultView?.addEventListener('blur', this.#reset);
  }
  scope<A extends string>(
    scene: Scene,
    bindings: Record<A, string | readonly string[]>,
  ): InputScope<A> {
    if (this.#disposed) throw new Error('Input service is disposed');
    const scope: InputScope<A> = new InputScope<A>(
      scene,
      bindings,
      () =>
        this.#running &&
        !this.#document.hidden &&
        this.#activeScenes.has(scene) &&
        scope.views.some(
          (binding) => !binding.disposed && !binding.view.disposed,
        ),
      () => this.#scopes.delete(scope),
    );
    this.#scopes.add(scope);
    return scope;
  }
  start(activeScenes: ReadonlySet<Scene>): undefined {
    this.#activeScenes = new Set(activeScenes);
    this.#reset();
    this.#running = true;
  }
  stop(): undefined {
    this.#running = false;
    this.#activeScenes = new Set();
    this.#reset();
  }
  scenesChanged(activeScenes: ReadonlySet<Scene>): undefined {
    // Reset both departing and entering scopes: held keys must not survive a route boundary.
    for (const scope of this.#scopes)
      if (this.#activeScenes.has(scope.scene) !== activeScenes.has(scope.scene))
        scope.reset();
    this.#activeScenes = new Set(activeScenes);
  }
  beforeUpdate(_frame: Frame, activeScenes: ReadonlySet<Scene>): undefined {
    this.scenesChanged(activeScenes);
    for (const scope of this.#scopes)
      scope.snapshot(activeScenes.has(scope.scene), !!scope.scene.fixedUpdate);
  }
  beforeFixedUpdate(
    _frame: FixedFrame,
    activeScenes: ReadonlySet<Scene>,
  ): undefined {
    for (const scope of this.#scopes)
      scope.snapshotFixed(activeScenes.has(scope.scene));
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    try {
      this.stop();
    } catch (error) {
      errors.push(error);
    }
    for (const scope of [...this.#scopes]) {
      try {
        scope.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#document.removeEventListener('visibilitychange', this.#reset);
    this.#document.defaultView?.removeEventListener('blur', this.#reset);
    this.#scopes.clear();
    if (errors.length)
      throw new AggregateError(errors, 'Input service cleanup failed');
  }
}
