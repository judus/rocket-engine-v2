import type { ViewInput } from '../../src/index.js';

export class Target extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (listener) {
      const entries = this.listeners.get(type) ?? new Set();
      entries.add(listener);
      this.listeners.set(type, entries);
    }
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ): void {
    if (listener) this.listeners.get(type)?.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  get listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}
export class Canvas extends Target {
  width = 0;
  height = 0;
  removed = false;
  style = { touchAction: '' };
  attributes = new Map<string, string>();
  captures = new Set<number>();
  constructor(readonly ownerDocument: Doc) {
    super();
  }
  set tabIndex(value: number) {
    this.setAttribute('tabindex', String(value));
  }
  get tabIndex(): number {
    return Number(this.getAttribute('tabindex') ?? -1);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  focus(): void {
    const previous = this.ownerDocument.activeElement;
    this.ownerDocument.activeElement = this;
    if (previous && previous !== this)
      previous.dispatchEvent(new Event('blur'));
  }
  setPointerCapture(id: number): void {
    this.captures.add(id);
  }
  hasPointerCapture(id: number): boolean {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number): void {
    this.captures.delete(id);
  }
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 300, height: 200 };
  }
  getContext() {
    // Minimal Canvas boundary; browser verification covers real rendering/capture.
    return {
      setTransform() {},
      clearRect() {},
      save() {},
      restore() {},
      beginPath() {},
      transform() {},
      translate() {},
    };
  }
  remove(): void {
    this.removed = true;
  }
}
export class Doc extends Target {
  hidden = false;
  defaultView = new Target();
  activeElement: Canvas | null = null;
  canvases: Canvas[] = [];
  createElement(): Canvas {
    const canvas = new Canvas(this);
    this.canvases.push(canvas);
    return canvas;
  }
}
export class Key extends Event {
  repeat = false;
  isComposing = false;
  ctrlKey = false;
  altKey = false;
  metaKey = false;
  constructor(
    type: string,
    readonly code: string,
    flags: Partial<Pick<Key, 'repeat' | 'ctrlKey' | 'isComposing'>> = {},
  ) {
    super(type, { cancelable: true });
    Object.assign(this, flags);
  }
}
export class Pointer extends Event {
  isPrimary = true;
  button = 0;
  pointerId = 1;
  constructor(
    type: string,
    readonly clientX = 160,
    readonly clientY = 120,
  ) {
    super(type, { cancelable: true });
  }
}
export function canvas(binding: ViewInput): Canvas {
  return binding.view.canvas as unknown as Canvas;
}
export async function withHost(
  run: (value: ReturnType<typeof host>) => Promise<void>,
): Promise<void> {
  const value = host();
  try {
    await run(value);
  } finally {
    value.restore();
  }
}
export function host() {
  const document = new Doc(),
    frames = new Map<number, FrameRequestCallback>();
  const saved = new Map<string, PropertyDescriptor | undefined>();
  let next = 0;
  for (const [key, value] of Object.entries({
    document,
    devicePixelRatio: 2,
    requestAnimationFrame(callback: FrameRequestCallback) {
      frames.set(++next, callback);
      return next;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  return {
    document,
    target: {
      ownerDocument: document,
      appendChild() {},
    } as unknown as HTMLElement,
    frame(now: number) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(now);
    },
    restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}
