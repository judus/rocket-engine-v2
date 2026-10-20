import { normalizeInputBinding } from './Input.js';
import type {
  InputScope,
  InputBinding,
  InputTarget,
  ViewInput,
} from './Input.js';
import type { Scene } from './types.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';
import { ActionSource } from './ActionSource.js';
import { VirtualController } from './VirtualController.js';
import type { VirtualControllerOptions } from './VirtualController.js';
import { InputActivation } from './InputActivation.js';

export interface ActionEvent {
  readonly action: string;
  readonly value: number;
  readonly dt: number;
  readonly cancelled: boolean;
}
export type ActionHandler = (event: ActionEvent) => undefined;
export type ActionKind = 'press' | 'hold' | 'axis';
export type ActionMapping =
  | InputBinding
  | { readonly negative: InputBinding; readonly positive: InputBinding }
  | { readonly pointer: 'x' | 'y'; readonly scale?: number };
export interface InputPreset {
  readonly capture: 'focus' | 'pointer-lock';
  readonly actions: Readonly<
    Record<
      string,
      { readonly kind: ActionKind; readonly mapping: ActionMapping }
    >
  >;
}
interface Action {
  kind: ActionKind;
  handler?: ActionHandler;
  value: number;
  mapping?: ActionMapping;
}
/** Named action registry over the engine's existing scoped input snapshots.
 * Dispatches once in beforeUpdate, no DOM event gameplay callbacks or extra clock.
 */
export class ActionContext {
  #actions = new Map<string, Action>();
  #disposed = false;
  #active = false;
  #sources = new Set<ActionSource>();
  #controllers = new Set<VirtualController>();
  #capture: 'focus' | 'pointer-lock' = 'focus';
  #feedback = new Set<InputActivation>();
  constructor(
    readonly scope: InputScope<string>,
    readonly retired: () => void,
  ) {}
  get scene(): Scene {
    return this.scope.scene;
  }
  get enabled(): boolean {
    return this.scope.enabled;
  }
  get names(): readonly string[] {
    return [...this.#actions.keys()];
  }
  #live(): void {
    if (this.#disposed) throw new Error('Action context is disposed');
  }
  #action(name: string): Action {
    this.#live();
    const action = this.#actions.get(name);
    if (!action) throw new Error(`Unknown action: ${name}`);
    return action;
  }
  register(name: string, kind: ActionKind, handler?: ActionHandler): this {
    this.#live();
    assertSynchronous(handler, 'action handler');
    if (
      !name ||
      this.#actions.has(name) ||
      !['press', 'hold', 'axis'].includes(kind)
    )
      throw new Error('Invalid or duplicate action');
    this.#actions.set(name, {
      kind,
      value: 0,
      ...(handler ? { handler } : {}),
    });
    return this;
  }
  on(name: string, handler: ActionHandler): this {
    assertSynchronous(handler, 'action handler');
    this.#action(name).handler = handler;
    return this;
  }
  map(name: string, mapping: ActionMapping): this {
    const action = this.#action(name);
    if (
      typeof mapping === 'object' &&
      !Array.isArray(mapping) &&
      'pointer' in mapping
    ) {
      if (
        action.kind !== 'axis' ||
        !['x', 'y'].includes(mapping.pointer) ||
        !Number.isFinite(mapping.scale ?? 1)
      )
        throw new Error('Invalid pointer axis mapping');
      this.cancel();
      this.scope.setBinding(`${name}:positive`, undefined);
      this.scope.setBinding(`${name}:negative`, undefined);
      action.mapping = Object.freeze({ ...mapping });
    } else if (
      typeof mapping === 'object' &&
      !Array.isArray(mapping) &&
      'negative' in mapping
    ) {
      if (action.kind !== 'axis')
        throw new Error('Button action cannot use axis mapping');
      // Validate both sides without changing a live registry.
      normalizeInputBinding(mapping.negative);
      normalizeInputBinding(mapping.positive);
      this.cancel();
      this.scope.setBinding(`${name}:negative`, mapping.negative);
      this.scope.setBinding(`${name}:positive`, mapping.positive);
      action.mapping = structuredClone(mapping);
    } else {
      if (action.kind === 'axis')
        throw new Error(
          'Axis requires positive/negative buttons or pointer motion',
        );
      normalizeInputBinding(mapping as InputBinding);
      this.cancel();
      this.scope.setBinding(`${name}:positive`, mapping as InputBinding);
      action.mapping = structuredClone(mapping);
    }
    return this;
  }
  use(preset: InputPreset): this {
    this.#live();
    if (this.scope.views.length)
      throw new Error('Choose preset before binding a viewport');
    this.#capture = preset.capture;
    for (const [name, spec] of Object.entries(preset.actions))
      this.register(name, spec.kind).map(name, spec.mapping);
    return this;
  }
  bind<T extends InputTarget>(
    view: T,
    options: {
      readonly capture?: 'focus' | 'pointer-lock';
      readonly mouseButtons?: boolean;
    } = {},
  ): ViewInput<T> {
    this.#live();
    if (this.scope.views.length)
      throw new Error('One viewport per action context');
    const binding = this.scope.bind(view, {
      pointerLock: (options.capture ?? this.#capture) === 'pointer-lock',
      mouseButtons: options.mouseButtons ?? true,
    });
    const feedback = view.own(
      new InputActivation(
        binding,
        () => this.enabled,
        () => this.#sources.size > 0,
      ),
    );
    this.#feedback.add(feedback);
    return binding;
  }
  kind(name: string): ActionKind {
    return this.#action(name).kind;
  }
  /** Attach a device contribution; independent sources compose without stealing releases. */
  source(onReset?: () => void): ActionSource {
    this.#live();
    const source = new ActionSource(
      (name) => this.kind(name),
      () => this.enabled && this.#active,
      () => this.#sources.delete(source),
      onReset,
    );
    this.#sources.add(source);
    return source;
  }
  virtual(options: VirtualControllerOptions): VirtualController {
    this.#live();
    const binding = this.scope.views.find((v) => !v.disposed);
    if (!binding)
      throw new Error('Bind a live viewport before mounting virtual controls');
    if (options.target.ownerDocument !== binding.view.canvas.ownerDocument)
      throw new Error('Virtual controls must share the viewport document');
    const controller = new VirtualController(this, options, () =>
      this.#controllers.delete(controller),
    );
    this.#controllers.add(controller);
    return binding.view.own(controller);
  }
  activate(): void {
    this.#live();
    for (const feedback of this.#feedback) feedback.activate();
  }
  value(name: string): number {
    return this.#action(name).value;
  }
  setEnabled(enabled: boolean): void {
    this.#live();
    if (enabled === this.enabled) return;
    try {
      this.cancel();
    } finally {
      this.scope.setEnabled(enabled);
    }
  }
  #emit(action: Action, event: ActionEvent): void {
    invokeSynchronous(action.handler, undefined, [event], 'input action');
  }
  cancel(): void {
    this.#active = false;
    const errors: unknown[] = [];
    for (const source of this.#sources)
      try {
        source.clear();
      } catch (error) {
        errors.push(error);
      }
    for (const [name, action] of this.#actions)
      if (action.value !== 0) {
        action.value = 0;
        if (action.kind !== 'press')
          try {
            this.#emit(action, {
              action: name,
              value: 0,
              dt: 0,
              cancelled: true,
            });
          } catch (error) {
            errors.push(error);
          }
      }
    if (errors.length)
      throw new AggregateError(errors, 'Action cancellation failed');
  }
  /** Engine service hook; games read values or register handlers instead. */
  update(dt: number, active: boolean): void {
    this.#live();
    this.#active =
      active && this.enabled && this.scope.views.some((v) => !v.disposed);
    for (const feedback of this.#feedback) feedback.refresh();
    if (!this.#active) {
      this.cancel();
      return;
    }
    const views = this.scope.views.filter((v) => !v.disposed);
    const motion = views[0]?.capture?.consumeMovement() ?? { x: 0, y: 0 };
    const connected = views.some((v) =>
      v.capture
        ? v.capture.active
        : v.view.canvas.ownerDocument.activeElement === v.view.canvas,
    );
    if (!connected && !this.#sources.size) {
      this.cancel();
      return;
    }
    try {
      for (const [name, action] of this.#actions) {
        const mapping = action.mapping,
          previous = action.value;
        let value = 0;
        if (mapping && typeof mapping === 'object' && 'pointer' in mapping)
          value = motion[mapping.pointer] * (mapping.scale ?? 1);
        else if (action.kind === 'axis')
          value =
            Number(this.scope.down(`${name}:positive`)) -
            Number(this.scope.down(`${name}:negative`));
        else value = Number(this.scope.down(`${name}:positive`));
        const sources = [...this.#sources];
        const virtual = sources.reduce(
          (sum, source) => sum + source.value(name),
          0,
        );
        const pointer =
          mapping && typeof mapping === 'object' && 'pointer' in mapping;
        value =
          action.kind === 'axis'
            ? pointer
              ? value + virtual
              : Math.max(-1, Math.min(1, value + virtual))
            : Number(value !== 0 || virtual !== 0);
        const pressed =
          this.scope.pressed(`${name}:positive`) ||
          sources.some((source) => source.pressed(name));
        action.value = value;
        if (action.kind === 'press') {
          if (pressed)
            this.#emit(action, {
              action: name,
              value: 1,
              dt,
              cancelled: false,
            });
        } else if (action.kind === 'axis' || previous !== value || pressed) {
          // A short hold tap still emits its start and end in order.
          if (action.kind === 'hold' && !value && !previous && pressed)
            this.#emit(action, {
              action: name,
              value: 1,
              dt,
              cancelled: false,
            });
          this.#emit(action, { action: name, value, dt, cancelled: false });
        }
      }
    } finally {
      for (const source of this.#sources) source.finishFrame();
    }
  }
  dispose(): undefined {
    if (this.#disposed) return;
    const errors: unknown[] = [];
    try {
      this.cancel();
    } catch (error) {
      errors.push(error);
    }
    this.#disposed = true;
    for (const resource of [...this.#controllers, ...this.#sources])
      try {
        resource.dispose();
      } catch (error) {
        errors.push(error);
      }
    this.#controllers.clear();
    this.#sources.clear();
    for (const feedback of this.#feedback)
      try {
        feedback.dispose();
      } catch (error) {
        errors.push(error);
      }
    this.#feedback.clear();
    try {
      this.scope.dispose();
    } catch (error) {
      errors.push(error);
    }
    this.#actions.clear();
    this.retired();
    if (errors.length)
      throw new AggregateError(errors, 'Action context cleanup failed');
  }
}
