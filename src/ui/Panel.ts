import type { View } from '../View.js';
import { ResourceScope, type Cleanup } from '../ResourceScope.js';
export interface PanelOptions {
  readonly target: string | Element;
  readonly title: string;
  readonly closable?: boolean;
  readonly view?: View;
}
export interface Field {
  readonly element: HTMLLabelElement;
  readonly input: HTMLInputElement;
}
/** Modeless DOM presentation. The caller owns data and commands; a view can own its lifetime. */
export class Panel {
  readonly element: HTMLElement;
  readonly content: HTMLDivElement;
  readonly document: Document;
  #resources = new ResourceScope();
  #visibility = new Set<(shown: boolean) => void>();
  #disposed = false;
  #returnFocus: HTMLElement | null = null;
  #view: View | undefined;
  constructor({ target, title, closable = true, view }: PanelOptions) {
    const host =
      typeof target === 'string' ? document.querySelector(target) : target;
    if (!host || view?.disposed)
      throw new Error('Panel requires a live host and view');
    this.document = host.ownerDocument;
    this.#view = view;
    this.element = this.document.createElement('section');
    this.element.className = 'rocket-panel';
    this.element.setAttribute('role', 'region');
    this.element.setAttribute('aria-label', title);
    this.element.tabIndex = -1;
    const header = this.document.createElement('header'),
      heading = this.document.createElement('h2');
    heading.textContent = title;
    header.append(heading);
    if (closable) {
      const close = this.button('×', () => this.close());
      close.className = 'rocket-panel-close';
      close.setAttribute('aria-label', `Close ${title}`);
      header.append(close);
    }
    this.content = this.document.createElement('div');
    this.content.className = 'rocket-panel-content';
    this.element.append(header, this.content);
    host.append(this.element);
    this.on(this.element, 'keydown', (event) => {
      event.stopPropagation();
    });
    this.on(this.element, 'keyup', (event) => {
      event.stopPropagation();
    });
    this.on(this.element, 'focusin', (raw) => {
      const previous = (raw as FocusEvent).relatedTarget as HTMLElement | null;
      if (
        previous &&
        typeof previous.focus === 'function' &&
        !this.element.contains(previous)
      )
        this.#returnFocus = previous;
    });
    view?.own(this);
  }
  get disposed(): boolean {
    return this.#disposed;
  }
  get shown(): boolean {
    return !this.#disposed && !this.element.hidden;
  }
  own<T extends Cleanup>(resource: T): T {
    this.#live();
    return this.#resources.own(resource);
  }
  on(target: EventTarget, type: string, listener: EventListener): void {
    this.#live();
    target.addEventListener(type, listener);
    this.#resources.own(() => {
      target.removeEventListener(type, listener);
    });
  }
  observeVisibility(listener: (shown: boolean) => void): () => void {
    this.#live();
    this.#visibility.add(listener);
    return () => {
      this.#visibility.delete(listener);
    };
  }
  append(...nodes: (Node | string)[]): void {
    this.#live();
    this.content.append(...nodes);
  }
  show(): void {
    this.#live();
    if (this.shown) return;
    this.element.hidden = false;
    this.#notify(true);
  }
  close(): void {
    this.#live();
    if (!this.shown) return;
    this.element.hidden = true;
    try {
      this.#notify(false);
    } finally {
      this.#restoreFocus();
    }
  }
  focus(target: HTMLElement = this.element): void {
    this.#live();
    if (!this.shown) return;
    if (!this.element.contains(target))
      throw new Error('Focus target must belong to panel');
    const previous = this.document.activeElement as HTMLElement | null;
    if (
      previous &&
      !this.element.contains(previous) &&
      typeof previous.focus === 'function'
    )
      this.#returnFocus = previous;
    target.focus({ preventScroll: true });
  }
  #restoreFocus(): void {
    if (!this.element.contains(this.document.activeElement)) return;
    const target =
      this.#returnFocus?.isConnected &&
      (this.#returnFocus !== this.#view?.canvas || !this.#view?.disposed)
        ? this.#returnFocus
        : !this.#view?.disposed
          ? this.#view?.canvas
          : undefined;
    if (target?.isConnected) target.focus({ preventScroll: true });
    else (this.document.activeElement as HTMLElement | null)?.blur();
    this.#returnFocus = null;
  }
  #notify(shown: boolean): void {
    const errors: unknown[] = [];
    for (const callback of this.#visibility)
      try {
        callback(shown);
      } catch (error) {
        errors.push(error);
      }
    if (errors.length)
      throw new AggregateError(errors, 'Panel visibility callbacks failed');
  }
  button(label: string, action: () => void): HTMLButtonElement {
    this.#live();
    const button = this.document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    this.on(button, 'click', () => {
      if (this.shown) action();
    });
    return button;
  }
  message(
    text: string,
    tone: 'info' | 'success' | 'warning' | 'error' = 'info',
  ): HTMLParagraphElement {
    this.#live();
    const message = this.document.createElement('p');
    message.className = `rocket-message ${tone}`;
    message.textContent = text;
    message.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    return message;
  }
  list(items: readonly string[]): HTMLUListElement {
    this.#live();
    const list = this.document.createElement('ul');
    list.className = 'rocket-list';
    for (const item of items) {
      const row = this.document.createElement('li');
      row.textContent = item;
      list.append(row);
    }
    return list;
  }
  table(
    headers: readonly string[],
    rows: readonly (readonly string[])[],
  ): HTMLTableElement {
    this.#live();
    if (rows.some((row) => row.length !== headers.length))
      throw new Error('Table rows must match columns');
    const table = this.document.createElement('table'),
      head = this.document.createElement('thead'),
      body = this.document.createElement('tbody'),
      heading = this.document.createElement('tr');
    for (const text of headers) {
      const cell = this.document.createElement('th');
      cell.scope = 'col';
      cell.textContent = text;
      heading.append(cell);
    }
    head.append(heading);
    for (const row of rows) {
      const line = this.document.createElement('tr');
      for (const text of row) {
        const cell = this.document.createElement('td');
        cell.textContent = text;
        line.append(cell);
      }
      body.append(line);
    }
    table.append(head, body);
    return table;
  }
  grid(items: readonly (Node | string)[]): HTMLDivElement {
    this.#live();
    const grid = this.document.createElement('div');
    grid.className = 'rocket-grid';
    for (const item of items) {
      const cell = this.document.createElement('div');
      cell.append(item);
      grid.append(cell);
    }
    return grid;
  }
  field(
    label: string,
    options: {
      name: string;
      type?: 'text' | 'number' | 'email' | 'checkbox';
      value?: string;
      checked?: boolean;
      required?: boolean;
    },
  ): Field {
    this.#live();
    const element = this.document.createElement('label'),
      input = this.document.createElement('input');
    element.className = 'rocket-field';
    element.append(label);
    input.name = options.name;
    input.type = options.type ?? 'text';
    input.value = options.value ?? '';
    input.checked = options.checked ?? false;
    input.required = options.required ?? false;
    element.append(input);
    return { element, input };
  }
  form(
    fields: readonly Field[],
    submit: (values: FormData) => void,
    label = 'Apply',
  ): HTMLFormElement {
    this.#live();
    const form = this.document.createElement('form');
    form.className = 'rocket-form';
    form.append(...fields.map((field) => field.element));
    const button = this.document.createElement('button');
    button.type = 'submit';
    button.textContent = label;
    form.append(button);
    this.on(form, 'submit', (event) => {
      event.preventDefault();
      if (this.shown) submit(new FormData(form));
    });
    return form;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    try {
      this.#notify(false);
    } catch (error) {
      errors.push(error);
    }
    this.#visibility.clear();
    try {
      this.#restoreFocus();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.#resources.dispose();
    } catch (error) {
      errors.push(error);
    } finally {
      this.element.remove();
    }
    if (errors.length) throw new AggregateError(errors, 'Panel cleanup failed');
  }
  #live(): void {
    if (this.#disposed) throw new Error('Panel disposed');
  }
}
