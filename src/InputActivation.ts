import type { InputTarget, ViewInput } from './Input.js';
/** Default engine-owned activation feedback and browser gestures for action contexts. */
export class InputActivation {
  #cleanups: (() => void)[] = [];
  #element: HTMLElement | undefined;
  #status: HTMLElement | undefined;
  #button: HTMLButtonElement | undefined;
  #disposed = false;
  constructor(
    readonly binding: ViewInput<InputTarget>,
    readonly enabled: () => boolean,
  ) {
    const canvas = binding.view.canvas,
      document = canvas.ownerDocument;
    const listen = (
      target: EventTarget,
      type: string,
      callback: EventListener,
    ) => {
      target.addEventListener(type, callback);
      this.#cleanups.push(() => target.removeEventListener(type, callback));
    };
    const activate = () => this.activate();
    listen(canvas, 'click', activate);
    listen(canvas, 'keydown', (raw) => {
      const event = raw as KeyboardEvent;
      if (
        event.code === 'Space' &&
        !event.repeat &&
        binding.capture &&
        !binding.capture.active
      ) {
        event.preventDefault();
        activate();
      }
    });
    if (canvas.parentElement) {
      const element = document.createElement('div'),
        status = document.createElement('span'),
        button = document.createElement('button');
      element.className = 'rocket-input-activation';
      element.setAttribute('role', 'group');
      element.setAttribute('aria-label', 'Viewport controls');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      button.type = 'button';
      button.textContent = 'Activate controls';
      element.append(status, button);
      canvas.parentElement.insertBefore(element, canvas);
      this.#element = element;
      this.#status = status;
      this.#button = button;
      listen(button, 'click', activate);
    }
    this.refresh();
  }
  activate(): void {
    if (this.#disposed || !this.enabled()) return;
    if (this.binding.capture) void this.binding.capture.request();
    else this.binding.view.canvas.focus({ preventScroll: true });
  }
  refresh(): void {
    if (this.#disposed || !this.#status || !this.#button) return;
    const capture = this.binding.capture,
      connected = capture
        ? capture.active
        : this.binding.view.canvas.ownerDocument.activeElement ===
          this.binding.view.canvas;
    const message = !this.enabled()
      ? 'Game input disabled · UI context'
      : capture?.state === 'error'
        ? `Mouse capture refused · ${capture.reason}`
        : capture?.state === 'unavailable'
          ? 'Mouse capture unavailable'
          : capture?.state === 'requesting'
            ? 'Connecting controls…'
            : connected
              ? capture
                ? 'Controls connected · Esc releases mouse capture'
                : 'Keyboard connected · Click outside to release'
              : 'Controls disconnected · Click viewport or Activate controls';
    if (this.#status.textContent !== message)
      this.#status.textContent = message;
    this.#button.hidden = connected;
    this.#button.disabled =
      !this.enabled() ||
      capture?.state === 'requesting' ||
      capture?.state === 'unavailable';
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const cleanup of this.#cleanups.reverse()) cleanup();
    this.#cleanups = [];
    this.#element?.remove();
  }
}
