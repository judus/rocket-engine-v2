import {
  controls,
  bindingLabel,
  defaultControls,
  saveControls,
} from './ControlSettings.js';
import type { ControlSettings } from './ControlSettings.js';
import { normalizeInputBinding } from '../../src/Input.js';
import type { InputButton, InputModifier } from '../../src/Input.js';

/** HTML view of game-owned preferences. No simulation or global keyboard capture. */
export class SettingsPanel {
  #draft: ControlSettings;
  #pending: { id: string; append: boolean } | undefined;
  #buttons = new Map<string, HTMLButtonElement>();
  #status: HTMLElement;
  constructor(
    private root: HTMLElement,
    private current: () => ControlSettings,
    private apply: (settings: ControlSettings) => void,
    signal: AbortSignal,
  ) {
    this.#draft = structuredClone(current());
    this.#status = this.node('[role=status]');
    const list = this.node('#bindings');
    for (const [id, label] of controls) {
      const row = document.createElement('div');
      row.className = 'binding-row';
      const text = document.createElement('span');
      text.textContent = label;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', `Change ${label}`);
      const add = document.createElement('button');
      add.type = 'button';
      add.textContent = '+';
      add.setAttribute('aria-label', `Add alternative for ${label}`);
      let recordedClick = false;
      button.addEventListener(
        'click',
        () => {
          if (recordedClick) {
            recordedClick = false;
            return;
          }
          this.listen(id, false);
        },
        { signal },
      );
      add.addEventListener('click', () => this.listen(id, true), { signal });
      button.addEventListener(
        'pointerdown',
        (event) => {
          if (this.#pending?.id !== id) return;
          event.preventDefault();
          recordedClick = event.button === 0;
          this.record(`Mouse${event.button}`);
        },
        { signal },
      );
      button.addEventListener(
        'contextmenu',
        (event) => event.preventDefault(),
        { signal },
      );
      this.#buttons.set(id, button);
      row.append(text, button, add);
      list.append(row);
    }
    root.addEventListener(
      'keydown',
      (event) => {
        if (!this.#pending) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.code === 'Escape') {
          this.cancel();
          this.#status.textContent = 'Binding cancelled.';
          return;
        }
        if (
          event.repeat ||
          event.isComposing ||
          /^(Shift|Alt|Control|Meta)(Left|Right)$/.test(event.code)
        )
          return;
        const modifiers: InputModifier[] = [];
        if (event.ctrlKey) modifiers.push('Control');
        if (event.shiftKey) modifiers.push('Shift');
        if (event.altKey) modifiers.push('Alt');
        if (event.metaKey) modifiers.push('Meta');
        this.record(
          modifiers.length ? { code: event.code, modifiers } : event.code,
        );
      },
      { signal },
    );
    root.addEventListener(
      'keyup',
      (event) => {
        if (
          this.#pending &&
          /^(Shift|Alt|Control)(Left|Right)$/.test(event.code)
        ) {
          event.preventDefault();
          event.stopPropagation();
          this.record(event.code);
        }
      },
      { signal },
    );
    this.node('#reset-controls').addEventListener(
      'click',
      () => {
        this.#draft = defaultControls();
        this.cancel();
        this.render();
        this.#status.textContent =
          'Defaults restored in this draft. Apply to save.';
      },
      { signal },
    );
    this.node('#apply-controls').addEventListener(
      'click',
      () => {
        this.cancel();
        this.#draft.steering = this.node<HTMLSelectElement>('#steering')
          .value as ControlSettings['steering'];
        this.#draft.sensitivity = Number(
          this.node<HTMLInputElement>('#sensitivity').value,
        );
        this.#draft.invertPitch =
          this.node<HTMLInputElement>('#invert-pitch').checked;
        this.#draft.virtual = this.node<HTMLSelectElement>('#virtual-controls')
          .value as ControlSettings['virtual'];
        try {
          const settings = saveControls(localStorage, this.#draft);
          this.apply(settings);
          this.#status.textContent =
            'Controls applied and saved in this browser.';
        } catch (error) {
          this.#status.textContent =
            error instanceof Error ? error.message : String(error);
        }
      },
      { signal },
    );
    this.node('#sensitivity').addEventListener(
      'input',
      () => {
        this.node('output').textContent =
          `${Number(this.node<HTMLInputElement>('#sensitivity').value).toFixed(1)}×`;
      },
      { signal },
    );
  }
  private node<T extends HTMLElement>(selector: string): T {
    const node = this.root.querySelector<T>(selector);
    if (!node) throw new Error(`Missing settings element ${selector}`);
    return node;
  }
  open(): void {
    this.#draft = structuredClone(this.current());
    this.cancel();
    this.render();
  }
  cancel(): void {
    this.#pending = undefined;
    this.refreshBindings();
    this.#status.textContent = '';
  }
  private listen(id: string, append: boolean): void {
    this.#pending = { id, append };
    this.refreshBindings();
    this.#buttons.get(id)!.textContent = 'Press a key…';
    this.#buttons.get(id)!.focus();
    this.#status.textContent =
      'Press a key or chord, or click the waiting button for a mouse binding. Escape cancels.';
  }
  private record(button: InputButton): void {
    const pending = this.#pending!;
    const old = this.#draft.bindings[pending.id]!;
    this.#draft.bindings[pending.id] = pending.append
      ? [...normalizeInputBinding(old), button]
      : button;
    this.cancel();
    this.#status.textContent = 'Binding updated in this draft. Apply to save.';
  }
  private refreshBindings(): void {
    for (const [id, button] of this.#buttons)
      button.textContent = bindingLabel(this.#draft.bindings[id]!);
  }
  private render(): void {
    this.node<HTMLSelectElement>('#steering').value = this.#draft.steering;
    this.node<HTMLInputElement>('#sensitivity').value = String(
      this.#draft.sensitivity,
    );
    this.node('output').textContent = `${this.#draft.sensitivity.toFixed(1)}×`;
    this.node<HTMLInputElement>('#invert-pitch').checked =
      this.#draft.invertPitch;
    this.node<HTMLSelectElement>('#virtual-controls').value =
      this.#draft.virtual;
    this.refreshBindings();
  }
}
