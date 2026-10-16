import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Panel,
  ChatBox,
  type ChatPort,
  type ChatSnapshot,
  type ChatCommand,
} from '../src/ui/index.js';
import { ResourceScope } from '../src/ResourceScope.js';
import { InputScope } from '../src/Input.js';
import type { View } from '../src/View.js';
import { ScriptedChat } from '../examples/ui/ScriptedChat.js';
class Element extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    if (listener) {
      const set = this.listeners.get(type) ?? new Set();
      set.add(listener);
      this.listeners.set(type, set);
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
  parent: Element | null = null;
  nodes: (Element | string)[] = [];
  attributes = new Map<string, string>();
  className = '';
  hidden = false;
  tabIndex = -1;
  type = '';
  value = '';
  name = '';
  checked = false;
  required = false;
  rows = 0;
  maxLength = 0;
  disabled = false;
  scope = '';
  placeholder = '';
  scrollTop = 0;
  clientHeight = 200;
  style: Record<string, string> = {};
  constructor(
    readonly ownerDocument: Doc,
    readonly tag: string,
  ) {
    super();
  }
  get children(): Element[] {
    return this.nodes.filter((n): n is Element => n instanceof Element);
  }
  get scrollHeight(): number {
    return this.children.length * 40;
  }
  get isConnected(): boolean {
    return this.tag === 'host' || !!this.parent?.isConnected;
  }
  set textContent(value: string | null) {
    this.replaceChildren(value ?? '');
  }
  get textContent(): string {
    return this.nodes
      .map((n) => (typeof n === 'string' ? n : n.textContent))
      .join('');
  }
  append(...nodes: (Element | string)[]): void {
    for (const node of nodes) {
      if (node instanceof Element) {
        node.remove();
        node.parent = this;
      }
      this.nodes.push(node);
    }
  }
  insertBefore(node: Element, before: Element | null): void {
    node.remove();
    node.parent = this;
    const index = before ? this.nodes.indexOf(before) : this.nodes.length;
    this.nodes.splice(index, 0, node);
  }
  replaceChildren(...nodes: (Element | string)[]): void {
    for (const n of this.children) n.parent = null;
    this.nodes = [];
    this.append(...nodes);
  }
  remove(): void {
    if (this.parent)
      this.parent.nodes = this.parent.nodes.filter((n) => n !== this);
    this.parent = null;
  }
  contains(node: Element | null): boolean {
    return node === this || this.children.some((child) => child.contains(node));
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
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
  blur(): void {
    this.ownerDocument.activeElement = null;
    this.dispatchEvent(new Event('blur'));
  }
  hasPointerCapture(): boolean {
    return false;
  }
  getBoundingClientRect() {
    return { width: 560, height: 320, left: 0, top: 0 };
  }
  requestSubmit(): void {
    this.dispatchEvent(new Event('submit', { cancelable: true }));
  }
}
class Doc {
  activeElement: Element | null = null;
  createElement(tag: string): Element {
    return new Element(this, tag);
  }
}
function fixture() {
  const doc = new Doc(),
    host = doc.createElement('host'),
    canvas = doc.createElement('canvas');
  host.append(canvas);
  const resources = new ResourceScope();
  const scene = { update(): undefined {}, draw(): undefined {} },
    view = {
      scene,
      canvas,
      disposed: false,
      own: <T extends { dispose(): undefined }>(value: T) =>
        resources.own(value),
      clientToWorld: (point: { x: number; y: number }) => point,
    } as unknown as View;
  const panel = new Panel({
    target: host as unknown as HTMLElement,
    title: 'Test window',
    view,
  });
  return { doc, host, canvas, resources, scene, view, panel };
}
class Port implements ChatPort {
  state: ChatSnapshot = {
    sessionId: 'one',
    revision: 0,
    messages: [],
    choices: [],
    pending: null,
    error: null,
  };
  listeners = new Set<(state: ChatSnapshot) => void>();
  history: ((state: ChatSnapshot) => void)[] = [];
  commands: ChatCommand[] = [];
  read() {
    return this.state;
  }
  subscribe(listener: (state: ChatSnapshot) => void) {
    this.listeners.add(listener);
    this.history.push(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispatch(command: ChatCommand) {
    this.commands.push(command);
    this.state = {
      ...this.state,
      revision: this.state.revision + 1,
      pending: { requestId: command.requestId },
    };
    this.emit();
  }
  emit() {
    for (const listener of this.listeners) listener(this.state);
  }
}
void test('host action gates block unpublished authority without inventing a pending request', () => {
  const f = fixture(),
    port = new Port();
  port.state = {
    ...port.state,
    actions: [],
    status: 'Publishing quest updates…',
    error: { requestId: 'old', message: 'Storage unavailable' },
    choices: [{ id: 'accept', text: 'Accept' }],
  };
  const box = new ChatBox(f.panel, port);
  const element = box.element as unknown as Element;
  const form = element.children.at(-1)!;
  const actions = form.children.at(-1)!;
  assert.equal(actions.children[0]!.disabled, true);
  assert.equal(actions.children[2]!.hidden, true);
  assert.equal(element.children[1]!.children[0]!.disabled, true);
  box.input.value = 'Keep this input';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(port.commands.length, 0);
  assert.equal(box.input.value, 'Keep this input');
  port.state = {
    ...port.state,
    revision: 1,
    actions: ['send', 'choose'],
    error: null,
  };
  port.emit();
  assert.equal(actions.children[0]!.disabled, false);
  assert.equal(element.children[1]!.children[0]!.disabled, false);
  f.panel.dispose();
});
void test('panel focus clears held/fixed gameplay keys; close restores focus and view disposal releases the panel', () => {
  const f = fixture(),
    scope = new InputScope(
      f.scene,
      { move: 'KeyW' },
      () => true,
      () => {},
    );
  scope.bind(f.view);
  f.canvas.focus();
  f.canvas.dispatchEvent(
    Object.assign(new Event('keydown', { cancelable: true }), {
      code: 'KeyW',
      repeat: false,
      isComposing: false,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    }),
  );
  scope.snapshot(true, true);
  scope.snapshotFixed(true);
  assert.equal(scope.down('move'), true);
  assert.equal(scope.fixed.down('move'), true);
  const field = f.panel.field('Name', { name: 'name' });
  f.panel.append(field.element);
  f.panel.focus(field.input);
  assert.equal(scope.down('move'), false);
  assert.equal(scope.fixed.down('move'), false);
  f.panel.close();
  assert.equal(f.doc.activeElement, f.canvas);
  assert.equal(f.panel.shown, false);
  f.panel.show();
  f.resources.dispose();
  assert.equal(f.panel.disposed, true);
  assert.equal(f.host.children.length, 1);
  assert.throws(() => f.panel.show(), /disposed/);
  scope.dispose();
});
void test('close detaches chat, late replies cannot touch closed/disposed panels and reopen observes current host state', () => {
  const f = fixture(),
    port = new Port(),
    box = new ChatBox(f.panel, port);
  const late = port.history[0]!;
  port.state = {
    ...port.state,
    revision: 1,
    messages: [{ id: 'a', speaker: 'Guide', kind: 'assistant', text: 'First' }],
  };
  port.emit();
  assert.equal(box.log.textContent, 'GuideFirst');
  f.panel.close();
  assert.equal(port.listeners.size, 0);
  port.state = {
    ...port.state,
    revision: 2,
    messages: [{ id: 'b', speaker: 'Guide', kind: 'assistant', text: 'Later' }],
  };
  late(port.state);
  assert.equal(box.log.textContent, 'GuideFirst');
  f.panel.show();
  assert.equal(port.listeners.size, 1);
  assert.equal(box.log.textContent, 'GuideLater');
  f.panel.dispose();
  late({ ...port.state, revision: 3 });
  assert.equal(port.listeners.size, 0);
  assert.equal((f.panel.element as unknown as Element).parent, null);
});
void test('two chat presentations dispatch one command, share pending state and ignore stale revisions/session replies', () => {
  const one = fixture(),
    two = fixture(),
    port = new Port(),
    a = new ChatBox(one.panel, port),
    b = new ChatBox(two.panel, port);
  const form = (a.element as unknown as Element).children.at(-1)!;
  a.input.value = 'hello';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(port.commands.length, 1);
  const other = (b.element as unknown as Element).children.at(-1)!;
  b.input.value = 'second';
  other.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(port.commands.length, 1);
  assert.equal(b.input.value, 'second');
  port.state = {
    sessionId: 'two',
    revision: 0,
    messages: [
      { id: 'new', speaker: 'Guide', kind: 'assistant', text: 'New session' },
    ],
    choices: [],
    pending: null,
    error: null,
  };
  port.emit();
  for (const callback of port.history)
    callback({
      sessionId: 'one',
      revision: 99,
      messages: [
        { id: 'old', speaker: 'Old', kind: 'assistant', text: 'Stale' },
      ],
      choices: [],
      pending: null,
      error: null,
    });
  assert.equal(a.log.textContent, 'GuideNew session');
  assert.equal(b.log.textContent, 'GuideNew session');
  port.state = {
    ...port.state,
    revision: 2,
    messages: [
      {
        id: 'new',
        speaker: 'Guide',
        kind: 'assistant',
        text: '<img src=x onerror=alert(1)>',
      },
    ],
  };
  port.emit();
  port.history[0]!({ ...port.state, revision: 1, messages: [] });
  assert.equal(a.log.textContent, 'Guide<img src=x onerror=alert(1)>');
  one.panel.dispose();
  two.panel.dispose();
  assert.equal(port.listeners.size, 0);
});
void test('panel cleanup continues through callback errors and removes command listeners', () => {
  const f = fixture();
  let commands = 0;
  const button = f.panel.button('Command', () => {
    commands++;
  });
  f.panel.append(button);
  button.dispatchEvent(new Event('click'));
  assert.equal(commands, 1);
  f.panel.observeVisibility(() => {
    throw new Error('host failed');
  });
  assert.throws(() => f.panel.dispose(), /cleanup/);
  assert.equal((button as unknown as Element).listenerCount, 0);
  button.dispatchEvent(new Event('click'));
  assert.equal(commands, 1);
  assert.equal(f.panel.disposed, true);
  f.panel.dispose();
});
void test('scripted host correlates requests, retries once without duplicating the user message and cancels old sessions', async () => {
  const provider = new ScriptedChat();
  provider.delayMs = 0;
  provider.failNext();
  const sessionId = provider.read().sessionId;
  provider.dispatch({
    kind: 'send',
    text: 'hello',
    sessionId,
    requestId: 'send',
  });
  provider.dispatch({
    kind: 'send',
    text: 'hello',
    sessionId,
    requestId: 'send',
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(provider.commands, 1);
  assert.equal(provider.read().error?.requestId, 'send');
  provider.dispatch({
    kind: 'retry',
    failedRequestId: 'send',
    sessionId,
    requestId: 'retry',
  });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(
    provider.read().messages.filter((m) => m.kind === 'user').length,
    1,
  );
  assert.equal(
    provider.read().messages.filter((m) => m.kind === 'assistant').length,
    2,
  );
  provider.delayMs = 10;
  provider.dispatch({
    kind: 'send',
    text: 'obsolete',
    sessionId,
    requestId: 'old',
  });
  provider.reset();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(provider.read().messages.length, 1);
  assert.equal(provider.read().pending, null);
  provider.dispatch({
    kind: 'send',
    text: 'cancel',
    sessionId: provider.read().sessionId,
    requestId: 'pending',
  });
  provider.dispatch({
    kind: 'cancel',
    pendingRequestId: 'pending',
    sessionId: provider.read().sessionId,
    requestId: 'cancel',
  });
  assert.equal(provider.read().pending, null);
  provider.dispose();
  assert.equal(provider.listeners, 0);
});

void test('a displayed choice cannot dispatch against a newer unpublished revision with a reused ID', () => {
  const f = fixture(),
    port = new Port();
  port.state = {
    ...port.state,
    choices: [{ id: 'accept', text: 'Original offer' }],
  };
  const box = new ChatBox(f.panel, port);
  const choices = (box.element as unknown as Element).children[1]!;
  const old = choices.children[0]!;
  port.state = {
    ...port.state,
    revision: 1,
    choices: [{ id: 'accept', text: 'Replacement offer' }],
  };
  old.dispatchEvent(new Event('click'));
  assert.equal(port.commands.length, 0);
  assert.equal(choices.children[0]!.textContent, 'Replacement offer');
  choices.children[0]!.dispatchEvent(new Event('click'));
  assert.equal(port.commands.length, 1);
  f.panel.dispose();
});
