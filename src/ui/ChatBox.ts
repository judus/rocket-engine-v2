import { Panel } from './Panel.js';
export interface ChatMessage {
  readonly id: string;
  readonly speaker: string;
  readonly kind: 'user' | 'assistant' | 'system';
  readonly text: string;
}
export interface ChatChoice {
  readonly id: string;
  readonly text: string;
}
export interface ChatSnapshot {
  readonly sessionId: string;
  readonly revision: number;
  readonly messages: readonly ChatMessage[];
  readonly choices: readonly ChatChoice[];
  readonly pending: { readonly requestId: string } | null;
  readonly error: {
    readonly requestId: string;
    readonly message: string;
  } | null;
  /** Optional host command gate; omitted uses the existing pending/error policy. */
  readonly actions?: readonly ChatAction['kind'][];
  readonly status?: string;
  readonly cancelLabel?: string;
}
export type ChatAction =
  | { readonly kind: 'send'; readonly text: string }
  | { readonly kind: 'choose'; readonly choiceId: string }
  | { readonly kind: 'retry'; readonly failedRequestId: string }
  | { readonly kind: 'cancel'; readonly pendingRequestId: string };
export type ChatCommand = ChatAction & {
  readonly sessionId: string;
  readonly requestId: string;
};
/** Host owns conversation and asynchronous work. UI submits commands and observes snapshots. */
export interface ChatPort {
  read(): ChatSnapshot;
  subscribe(listener: (snapshot: ChatSnapshot) => void): () => void;
  dispatch(command: ChatCommand): void;
}
/** One panel presentation; closing detaches it, without cancelling another view's conversation. */
export class ChatBox {
  readonly element: HTMLDivElement;
  readonly input: HTMLTextAreaElement;
  readonly log: HTMLDivElement;
  #state: ChatSnapshot | null = null;
  #generation = 0;
  #disposed = false;
  #unsubscribe: (() => void) | undefined;
  #visibility: () => void;
  #listeners = new AbortController();
  #choiceListeners = new AbortController();
  #messages = new Map<
    string,
    { element: HTMLElement; speaker: HTMLElement; text: HTMLElement }
  >();
  #choices: HTMLDivElement;
  #status: HTMLParagraphElement;
  #send: HTMLButtonElement;
  #cancel: HTMLButtonElement;
  #retry: HTMLButtonElement;
  constructor(
    readonly panel: Panel,
    private readonly port: ChatPort,
  ) {
    const doc = panel.document;
    this.element = doc.createElement('div');
    this.element.className = 'rocket-chat';
    this.log = doc.createElement('div');
    this.log.className = 'rocket-chat-log';
    this.log.setAttribute('role', 'log');
    this.log.setAttribute('aria-label', 'Conversation');
    this.log.setAttribute('aria-live', 'polite');
    this.log.tabIndex = 0;
    this.#choices = doc.createElement('div');
    this.#choices.className = 'rocket-chat-choices';
    this.#status = doc.createElement('p');
    this.#status.className = 'rocket-chat-status';
    this.#status.setAttribute('role', 'status');
    const form = doc.createElement('form'),
      label = doc.createElement('label');
    label.className = 'rocket-field';
    label.append('Message');
    this.input = doc.createElement('textarea');
    this.input.rows = 3;
    this.input.required = true;
    this.input.maxLength = 2000;
    this.input.placeholder = 'Write a message…';
    label.append(this.input);
    this.#send = doc.createElement('button');
    this.#send.type = 'submit';
    this.#send.textContent = 'Send';
    this.#cancel = doc.createElement('button');
    this.#cancel.type = 'button';
    this.#cancel.textContent = 'Cancel reply';
    this.#retry = doc.createElement('button');
    this.#retry.type = 'button';
    this.#retry.textContent = 'Retry reply';
    const actions = doc.createElement('div');
    actions.className = 'rocket-chat-actions';
    actions.append(this.#send, this.#cancel, this.#retry);
    form.append(label, actions);
    this.element.append(this.log, this.#choices, this.#status, form);
    panel.append(this.element);
    form.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        const text = this.input.value.trim();
        if (text && this.#dispatch({ kind: 'send', text }))
          this.input.value = '';
      },
      { signal: this.#listeners.signal },
    );
    this.input.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
          event.preventDefault();
          form.requestSubmit();
        }
      },
      { signal: this.#listeners.signal },
    );
    this.#cancel.addEventListener(
      'click',
      () => {
        const pending = this.port.read().pending;
        if (pending)
          this.#dispatch({
            kind: 'cancel',
            pendingRequestId: pending.requestId,
          });
      },
      { signal: this.#listeners.signal },
    );
    this.#retry.addEventListener(
      'click',
      () => {
        const error = this.port.read().error;
        if (error)
          this.#dispatch({ kind: 'retry', failedRequestId: error.requestId });
      },
      { signal: this.#listeners.signal },
    );
    this.#visibility = panel.observeVisibility((shown) => {
      if (shown) this.#attach();
      else this.#detach();
    });
    panel.own(this);
    if (panel.shown) this.#attach();
  }
  #attach(): void {
    if (this.#disposed || this.#unsubscribe) return;
    const generation = ++this.#generation;
    const unsubscribe = this.port.subscribe((snapshot) => {
      if (
        !this.#disposed &&
        this.panel.shown &&
        generation === this.#generation
      )
        this.#render(snapshot);
    });
    if (
      this.#disposed ||
      !this.panel.shown ||
      generation !== this.#generation
    ) {
      unsubscribe();
      return;
    }
    this.#unsubscribe = unsubscribe;
    this.#render(this.port.read());
  }
  #detach(): void {
    this.#generation++;
    const unsubscribe = this.#unsubscribe;
    this.#unsubscribe = undefined;
    this.#state = null;
    unsubscribe?.();
  }
  #dispatch(action: ChatAction): boolean {
    if (this.#disposed || !this.panel.shown || !this.#state) return false;
    const state = this.port.read();
    if (
      state.sessionId !== this.#state.sessionId ||
      state.revision !== this.#state.revision
    ) {
      this.#render(state);
      return false;
    }
    if (state.pending && action.kind !== 'cancel') return false;
    if (state.actions && !state.actions.includes(action.kind)) return false;
    try {
      this.port.dispatch(
        Object.freeze({
          ...action,
          sessionId: state.sessionId,
          requestId: crypto.randomUUID(),
        }),
      );
      return true;
    } catch (error) {
      this.#status.textContent = String(error);
      return false;
    }
  }
  #render(snapshot: ChatSnapshot): void {
    if (snapshot.sessionId !== this.port.read().sessionId) return;
    if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0)
      throw new Error('Invalid chat revision');
    if (
      this.#state?.sessionId === snapshot.sessionId &&
      snapshot.revision <= this.#state.revision
    )
      return;
    if (
      new Set(snapshot.messages.map((message) => message.id)).size !==
      snapshot.messages.length
    )
      throw new Error('Duplicate chat message ID');
    const pinned =
      this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 32;
    if (this.#state?.sessionId !== snapshot.sessionId) {
      this.log.replaceChildren();
      this.#messages.clear();
    }
    this.#state = snapshot;
    const ids = new Set(snapshot.messages.map((message) => message.id));
    for (const [id, row] of this.#messages)
      if (!ids.has(id)) {
        row.element.remove();
        this.#messages.delete(id);
      }
    for (const [index, message] of snapshot.messages.entries()) {
      let row = this.#messages.get(message.id);
      if (!row) {
        const element = this.panel.document.createElement('article'),
          speaker = this.panel.document.createElement('strong'),
          text = this.panel.document.createElement('p');
        element.append(speaker, text);
        row = { element, speaker, text };
        this.#messages.set(message.id, row);
      }
      row.element.className = `rocket-chat-message ${message.kind}`;
      if (row.speaker.textContent !== message.speaker)
        row.speaker.textContent = message.speaker;
      if (row.text.textContent !== message.text)
        row.text.textContent = message.text;
      const existing = this.log.children[index];
      if (existing !== row.element)
        this.log.insertBefore(row.element, existing ?? null);
    }
    if (pinned) this.log.scrollTop = this.log.scrollHeight;
    this.#choiceListeners.abort();
    this.#choiceListeners = new AbortController();
    this.#choices.replaceChildren();
    for (const choice of snapshot.choices) {
      const button = this.panel.document.createElement('button');
      button.type = 'button';
      button.textContent = choice.text;
      button.disabled =
        !!snapshot.pending ||
        (snapshot.actions !== undefined &&
          !snapshot.actions.includes('choose'));
      button.addEventListener(
        'click',
        () => {
          this.#dispatch({ kind: 'choose', choiceId: choice.id });
        },
        { signal: this.#choiceListeners.signal },
      );
      this.#choices.append(button);
    }
    this.#send.disabled =
      !!snapshot.pending ||
      (snapshot.actions !== undefined && !snapshot.actions.includes('send'));
    this.#cancel.hidden =
      !snapshot.pending ||
      (snapshot.actions !== undefined && !snapshot.actions.includes('cancel'));
    this.#retry.hidden =
      !snapshot.error ||
      (snapshot.actions !== undefined && !snapshot.actions.includes('retry'));
    this.#cancel.textContent = snapshot.cancelLabel ?? 'Cancel reply';
    this.#status.textContent =
      snapshot.error?.message ??
      snapshot.status ??
      (snapshot.pending
        ? 'Reply pending…'
        : 'Enter sends · Shift+Enter adds a line');
    this.#status.setAttribute('role', snapshot.error ? 'alert' : 'status');
    this.log.setAttribute('aria-busy', String(!!snapshot.pending));
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#visibility();
    try {
      this.#detach();
    } finally {
      this.#listeners.abort();
      this.#choiceListeners.abort();
      this.#messages.clear();
      this.element.remove();
    }
  }
}
