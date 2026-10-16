import test from 'node:test';
import assert from 'node:assert/strict';
import { InputActivation } from '../src/InputActivation.js';
import type { InputTarget, ViewInput } from '../src/Input.js';
import { Target, Key } from './helpers/inputHost.js';
class Element extends Target {
  children: Element[] = [];
  textContent = '';
  hidden = false;
  disabled = false;
  type = '';
  className = '';
  removed = false;
  setAttribute() {}
  append(...children: Element[]) {
    this.children.push(...children);
  }
  insertBefore(child: Element) {
    this.children.push(child);
  }
  remove() {
    this.removed = true;
  }
}
void test('engine activation feedback owns gestures, refusal/unsupported states and complete DOM/listener cleanup', () => {
  const parent = new Element(),
    document = {
      activeElement: null as unknown,
      createElement: () => new Element(),
    };
  const canvas = Object.assign(new Element(), {
    parentElement: parent,
    ownerDocument: document,
    focus() {
      document.activeElement = this;
    },
  });
  const capture = {
    active: false,
    state: 'released',
    reason: 'refused',
    requests: 0,
    request() {
      this.requests++;
      return Promise.resolve();
    },
  };
  const binding = {
    view: { canvas },
    capture,
  } as unknown as ViewInput<InputTarget>;
  let enabled = true;
  const feedback = new InputActivation(binding, () => enabled);
  const element = parent.children[0]!,
    status = element.children[0]!,
    button = element.children[1]!;
  assert.match(status.textContent, /disconnected/);
  canvas.dispatchEvent(new Event('click'));
  button.dispatchEvent(new Event('click'));
  canvas.dispatchEvent(new Key('keydown', 'Space'));
  assert.equal(capture.requests, 3);
  canvas.dispatchEvent(new Key('keydown', 'Space', { repeat: true }));
  canvas.dispatchEvent(new Key('keydown', 'KeyW'));
  for (const [state, match] of [
    ['requesting', /Connecting/],
    ['error', /refused/],
    ['unavailable', /unavailable/],
  ]) {
    capture.state = state as string;
    feedback.refresh();
    assert.match(status.textContent, match as RegExp);
  }
  capture.state = 'captured';
  capture.active = true;
  feedback.refresh();
  assert.equal(button.hidden, true);
  enabled = false;
  feedback.refresh();
  assert.match(status.textContent, /UI context/);
  feedback.activate();
  assert.equal(capture.requests, 3);
  feedback.dispose();
  feedback.dispose();
  feedback.refresh();
  feedback.activate();
  assert.equal(element.removed, true);
  assert.equal(canvas.listenerCount + button.listenerCount, 0);
  const focusBinding = {
    view: { canvas },
    capture: undefined,
  } as unknown as ViewInput<InputTarget>;
  const focus = new InputActivation(focusBinding, () => true);
  focus.activate();
  focus.refresh();
  assert.match(
    parent.children[1]!.children[0]!.textContent,
    /Keyboard connected/,
  );
  focus.dispose();
});
