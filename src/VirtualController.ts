import type { ActionContext } from './ActionContext.js';
import type { ActionSource } from './ActionSource.js';
export interface VirtualStick {
  readonly label: string;
  readonly x?: string;
  /** Positive means up/away from the bottom of the pad. */
  readonly y?: string;
  readonly deadZone?: number;
}
export interface VirtualButton {
  readonly label: string;
  readonly action: string;
  readonly value?: number;
}
export interface VirtualLayout {
  readonly sticks?: readonly VirtualStick[];
  readonly buttons?: readonly VirtualButton[];
}
export interface VirtualControllerOptions extends VirtualLayout {
  readonly target: HTMLElement;
}

/** DOM adapter for named actions. Uses pointer capture per control and no clock. */
export class VirtualController {
  readonly element: HTMLElement;
  #cleanups: (() => void)[] = [];
  #sources: ActionSource[] = [];
  #disposed = false;
  constructor(
    readonly context: ActionContext,
    options: VirtualControllerOptions,
    readonly retired: () => void = () => {},
  ) {
    for (const stick of options.sticks ?? []) {
      if (
        (!stick.x && !stick.y) ||
        !Number.isFinite(stick.deadZone ?? 0.15) ||
        (stick.deadZone ?? 0.15) < 0 ||
        (stick.deadZone ?? 0.15) >= 1
      )
        throw new Error('Stick requires axes and a dead zone in [0, 1)');
      for (const name of [stick.x, stick.y])
        if (name && context.kind(name) !== 'axis')
          throw new Error('Stick requires axis actions');
    }
    for (const button of options.buttons ?? []) {
      const kind = context.kind(button.action),
        value = button.value ?? 1;
      if (
        !Number.isFinite(value) ||
        Math.abs(value) > 1 ||
        value === 0 ||
        (kind !== 'axis' && value !== 1)
      )
        throw new Error('Invalid virtual button value');
    }
    const doc = options.target.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'rocket-virtual-controls';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Virtual game controls');
    for (const spec of options.sticks ?? []) {
      const pad = doc.createElement('div'),
        thumb = doc.createElement('span'),
        label = doc.createElement('span');
      pad.className = 'rocket-virtual-stick';
      pad.setAttribute('role', 'group');
      pad.setAttribute('aria-label', spec.label);
      thumb.className = 'rocket-virtual-thumb';
      label.textContent = spec.label;
      label.className = 'rocket-virtual-label';
      pad.append(thumb, label);
      this.element.append(pad);
      this.#control(
        pad,
        () => {
          thumb.style.transform = 'translate(0px, 0px)';
        },
        (source, event) => {
          const rect = pad.getBoundingClientRect(),
            radius = Math.min(rect.width, rect.height) * 0.4;
          if (radius <= 0) return;
          const x = (event.clientX - rect.left - rect.width / 2) / radius;
          const y = -(event.clientY - rect.top - rect.height / 2) / radius;
          const length = Math.hypot(x, y),
            dead = spec.deadZone ?? 0.15;
          const magnitude =
            length > dead ? (Math.min(1, length) - dead) / (1 - dead) : 0;
          const dx = length ? (x / length) * magnitude : 0,
            dy = length ? (y / length) * magnitude : 0;
          if (spec.x) source.set(spec.x, dx);
          if (spec.y) source.set(spec.y, dy);
          thumb.style.transform = `translate(${dx * radius}px, ${-dy * radius}px)`;
        },
      );
    }
    const buttons = doc.createElement('div');
    buttons.className = 'rocket-virtual-buttons';
    if (options.buttons?.length) this.element.append(buttons);
    for (const spec of options.buttons ?? []) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.textContent = spec.label;
      button.setAttribute('aria-label', spec.label);
      button.setAttribute('aria-pressed', 'false');
      buttons.append(button);
      const source = this.#control(
        button,
        () => button.setAttribute('aria-pressed', 'false'),
        (input) => {
          input.set(spec.action, spec.value ?? 1);
          button.setAttribute('aria-pressed', 'true');
        },
      );
      this.#listen(button, 'keydown', (raw) => {
        const event = raw as KeyboardEvent;
        if (
          !['Space', 'Enter'].includes(event.code) ||
          event.repeat ||
          !context.enabled
        )
          return;
        event.preventDefault();
        source.set(spec.action, spec.value ?? 1);
        button.setAttribute('aria-pressed', 'true');
      });
      this.#listen(button, 'keyup', (raw) => {
        if (['Space', 'Enter'].includes((raw as KeyboardEvent).code))
          source.release();
      });
      this.#listen(button, 'blur', () => source.clear());
    }
    // Discard the compatibility click; the pointer gesture already supplied the action.
    this.#listen(this.element, 'click', (event) => event.preventDefault());
    options.target.append(this.element);
  }
  #listen(target: EventTarget, type: string, listener: EventListener): void {
    target.addEventListener(type, listener);
    this.#cleanups.push(() => target.removeEventListener(type, listener));
  }
  #control(
    element: HTMLElement,
    reset: () => void,
    move: (source: ActionSource, event: PointerEvent) => void,
  ): ActionSource {
    let pointer: number | undefined;
    const source = this.context.source(() => {
      const old = pointer;
      pointer = undefined;
      reset();
      if (old !== undefined && element.hasPointerCapture(old))
        element.releasePointerCapture(old);
    });
    this.#sources.push(source);
    // Prevent scrolling/zooming only on the controls; ordinary page gestures still work.
    element.style.touchAction = 'none';
    element.style.userSelect = 'none';
    this.#listen(element, 'pointerdown', (raw) => {
      const event = raw as PointerEvent;
      if (
        !this.context.enabled ||
        pointer !== undefined ||
        (event.pointerType === 'mouse' && event.button !== 0)
      )
        return;
      event.preventDefault();
      pointer = event.pointerId;
      element.setPointerCapture(pointer);
      move(source, event);
    });
    this.#listen(element, 'pointermove', (raw) => {
      const event = raw as PointerEvent;
      if (event.pointerId === pointer) {
        event.preventDefault();
        move(source, event);
      }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      this.#listen(element, type, (raw) => {
        if ((raw as PointerEvent).pointerId === pointer) {
          if (type === 'pointerup') source.release();
          else source.clear();
        }
      });
    return source;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const cleanup of this.#cleanups.reverse()) cleanup();
    for (const source of this.#sources) source.dispose();
    this.#sources = [];
    this.#cleanups = [];
    this.element.remove();
    this.retired();
  }
}
