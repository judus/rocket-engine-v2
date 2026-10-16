import type { ActionContext } from './ActionContext.js';
import type { ActionSource } from './ActionSource.js';
export interface VirtualStick {
  readonly label: string;
  readonly mode?: 'analog' | 'digital';
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
export interface VirtualButtonGroup {
  readonly label?: string;
  readonly buttons: readonly VirtualButton[];
  readonly columns?: number;
}
export interface VirtualCorner {
  readonly side: 'left' | 'right';
  readonly pad?: VirtualStick;
  readonly face?: VirtualButtonGroup;
  readonly above?: readonly VirtualButtonGroup[];
  readonly inside?: readonly VirtualButtonGroup[];
}
export interface VirtualTheme {
  readonly color?: string;
  readonly opacity?: number;
  readonly size?: number;
}
export interface VirtualLayout {
  readonly sticks?: readonly VirtualStick[];
  readonly buttons?: readonly VirtualButton[];
  readonly groups?: readonly VirtualButtonGroup[];
  readonly corner?: VirtualCorner;
}
export interface VirtualControllerOptions extends VirtualLayout {
  readonly target: HTMLElement;
  readonly theme?: VirtualTheme;
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
    const corner = options.corner;
    if (
      corner &&
      (!['left', 'right'].includes(corner.side) ||
        Number(!!corner.pad) + Number(!!corner.face) !== 1)
    )
      throw new Error(
        'Corner requires a side and exactly one pad or face group',
      );
    const sticks = [
      ...(options.sticks ?? []),
      ...(corner?.pad ? [corner.pad] : []),
    ];
    const groups = [
      ...(options.groups ?? []),
      ...(corner?.above ?? []),
      ...(corner?.inside ?? []),
      ...(corner?.face ? [corner.face] : []),
    ];
    for (const group of groups)
      if (
        !Number.isInteger(group.columns ?? 2) ||
        (group.columns ?? 2) < 1 ||
        (group.columns ?? 2) > 4
      )
        throw new Error('Button group columns must be 1 to 4');
    for (const stick of sticks) {
      if (
        (!stick.x && !stick.y) ||
        !['analog', 'digital'].includes(stick.mode ?? 'analog') ||
        !Number.isFinite(stick.deadZone ?? 0.15) ||
        (stick.deadZone ?? 0.15) < 0 ||
        (stick.deadZone ?? 0.15) >= 1
      )
        throw new Error(
          'Stick requires axes, an analog/digital mode and a dead zone in [0, 1)',
        );
      for (const name of [stick.x, stick.y])
        if (name && context.kind(name) !== 'axis')
          throw new Error('Stick requires axis actions');
    }
    for (const button of [
      ...(options.buttons ?? []),
      ...groups.flatMap((group) => group.buttons),
    ]) {
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
    this.#validateTheme(options.theme ?? {});
    const doc = options.target.ownerDocument;
    this.element = doc.createElement('div');
    this.element.className = 'rocket-virtual-controls';
    this.element.setAttribute('role', 'group');
    this.element.setAttribute('aria-label', 'Virtual game controls');
    this.setTheme(options.theme ?? {});
    if (corner) {
      this.element.className += ' rocket-virtual-corner';
      this.element.setAttribute('data-side', corner.side);
      const above = doc.createElement('div'),
        inside = doc.createElement('div'),
        face = doc.createElement('div');
      above.className = 'rocket-virtual-above';
      inside.className = 'rocket-virtual-inside';
      face.className = 'rocket-virtual-face';
      for (const group of corner.above ?? [])
        above.append(this.#buttons({ ...group, columns: group.columns ?? 2 }));
      for (const group of corner.inside ?? [])
        inside.append(this.#buttons({ ...group, columns: group.columns ?? 1 }));
      face.append(
        corner.pad
          ? this.#pad(corner.pad)
          : this.#buttons({
              ...corner.face!,
              columns: corner.face!.columns ?? 2,
            }),
      );
      this.element.append(above, face, inside);
    }
    for (const spec of options.sticks ?? [])
      this.element.append(this.#pad(spec));
    if (options.buttons?.length)
      this.element.append(this.#buttons({ buttons: options.buttons }));
    for (const group of options.groups ?? [])
      this.element.append(
        this.#buttons({ ...group, columns: group.columns ?? 2 }),
      );
    // Discard the compatibility click; the pointer gesture already supplied the action.
    this.#listen(this.element, 'click', (event) => event.preventDefault());
    options.target.append(this.element);
  }
  #validateTheme(theme: VirtualTheme): void {
    if (
      (theme.opacity !== undefined &&
        (!Number.isFinite(theme.opacity) ||
          theme.opacity < 0 ||
          theme.opacity > 1)) ||
      (theme.size !== undefined &&
        (!Number.isFinite(theme.size) ||
          theme.size < 64 ||
          theme.size > 256)) ||
      (theme.color !== undefined && !theme.color.trim())
    )
      throw new Error('Invalid virtual theme');
  }
  /** Partial updates preserve other theme values. CSS variables may also be overridden directly. */
  setTheme(theme: VirtualTheme): void {
    if (this.#disposed) throw new Error('Virtual controller is disposed');
    this.#validateTheme(theme);
    if (theme.color !== undefined)
      this.element.style.setProperty('--virtual-color', theme.color);
    if (theme.opacity !== undefined)
      this.element.style.setProperty(
        '--virtual-opacity',
        String(theme.opacity),
      );
    if (theme.size !== undefined)
      this.element.style.setProperty('--virtual-size', `${theme.size}px`);
  }
  #pad(spec: VirtualStick): HTMLElement {
    const pad = this.element.ownerDocument.createElement('div'),
      thumb = this.element.ownerDocument.createElement('span'),
      label = this.element.ownerDocument.createElement('span');
    pad.className =
      spec.mode === 'digital'
        ? 'rocket-virtual-stick rocket-virtual-dpad'
        : 'rocket-virtual-stick';
    pad.setAttribute('data-has-x', String(!!spec.x));
    pad.setAttribute('data-has-y', String(!!spec.y));
    pad.setAttribute('data-x', '0');
    pad.setAttribute('data-y', '0');
    pad.setAttribute('role', 'group');
    pad.setAttribute('aria-label', spec.label);
    thumb.className = 'rocket-virtual-thumb';
    label.textContent = spec.label;
    label.className = 'rocket-virtual-label';
    if (spec.mode === 'digital') {
      for (const [direction, glyph] of [
        ['up', '▲'],
        ['right', '▶'],
        ['down', '▼'],
        ['left', '◀'],
        ['center', ''],
      ]) {
        const key = this.element.ownerDocument.createElement('span');
        key.className = `rocket-dpad-key rocket-dpad-${direction}`;
        key.setAttribute('aria-hidden', 'true');
        key.textContent = glyph!;
        pad.append(key);
      }
    } else pad.append(thumb);
    pad.append(label);

    this.#control(
      pad,
      () => {
        thumb.style.transform = 'translate(0px, 0px)';
        pad.setAttribute('data-x', '0');
        pad.setAttribute('data-y', '0');
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
        let dx = length ? (x / length) * magnitude : 0,
          dy = length ? (y / length) * magnitude : 0;
        if (spec.mode === 'digital') {
          dx = Math.abs(x) > dead ? Math.sign(x) : 0;
          dy = Math.abs(y) > dead ? Math.sign(y) : 0;
        }
        if (!spec.x) dx = 0;
        if (!spec.y) dy = 0;
        pad.setAttribute('data-x', String(Math.sign(dx)));
        pad.setAttribute('data-y', String(Math.sign(dy)));
        if (spec.x) source.set(spec.x, dx);
        if (spec.y) source.set(spec.y, dy);
        thumb.style.transform = `translate(${dx * radius}px, ${-dy * radius}px)`;
      },
    );
    return pad;
  }
  #buttons(group: VirtualButtonGroup): HTMLElement {
    const buttons = this.element.ownerDocument.createElement('div');
    buttons.className = 'rocket-virtual-buttons';
    buttons.setAttribute('role', 'group');
    buttons.setAttribute('aria-label', group.label ?? 'Action buttons');
    if (group.columns !== undefined) {
      buttons.className += ' rocket-virtual-button-group';
      buttons.style.setProperty('--virtual-columns', String(group.columns));
    }
    for (const spec of group.buttons) {
      const button = this.element.ownerDocument.createElement('button');
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
          !this.context.enabled
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
    return buttons;
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
