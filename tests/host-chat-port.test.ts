import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterHostPort, type HostChoice } from 'character-framework/host';
import { HostChatPort } from '../examples/characters/HostChatPort.js';
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
void test('adapter preserves exact delivery revision and original effect on retry, conflicts never execute again', async () => {
  const calls: { id: string; key: string }[] = [];
  let fail = true;
  const host = new CharacterHostPort(
    {
      current() {},
      choices: () => [],
      run: async (id, key) => {
        calls.push({ id, key });
        if (fail) {
          fail = false;
          throw new Error('lost reply');
        }
        return 'Original retained reply';
      },
    },
    () => undefined,
  );
  const chat = new HostChatPort(host, 'Guide');
  const command = {
    kind: 'send' as const,
    requestId: 'original',
    sessionId: chat.sessionId,
    text: 'Hello',
  };
  chat.dispatch(command);
  await settle();
  assert.equal(chat.read().error?.requestId, 'original');
  assert.deepEqual(chat.read().actions, ['retry', 'cancel']);
  chat.dispatch({
    kind: 'retry',
    requestId: 'new-delivery',
    sessionId: chat.sessionId,
    failedRequestId: 'original',
  });
  await settle();
  assert.equal(chat.read().error, null);
  assert.equal(chat.read().messages.length, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], calls[1]);
  chat.dispatch(command);
  await settle();
  assert.equal(chat.read().error, null);
  assert.equal(calls.length, 2);
  chat.dispatch({ ...command, text: 'Changed' });
  await settle();
  assert.match(chat.read().error!.message, /conflict/);
  assert.equal(calls.length, 2);
  chat.dispose();
  host.dispose();
});
void test('authority projection broadcasts to attached presentations and storage gates map to actions without fake operations', async () => {
  let choices: HostChoice[] = [],
    fail = false;
  const host = new CharacterHostPort(
    { current() {}, choices: () => choices, run: async () => 'reply' },
    () => {
      if (fail) throw new Error('disk');
    },
  );
  const chat = new HostChatPort(host, 'Guide');
  let a = 0,
    b = 0;
  const detachA = chat.subscribe(() => a++),
    detachB = chat.subscribe(() => b++);
  choices = [{ id: 'offer/accept', label: 'Accept' }];
  await host.publishAuthority();
  assert.equal(a, 1);
  assert.equal(b, 1);
  assert.deepEqual(chat.read().choices, [
    { id: 'offer/accept', text: 'Accept' },
  ]);
  detachA();
  fail = true;
  choices = [];
  await assert.rejects(host.publishAuthority(), /disk/);
  assert.equal(a, 1);
  assert.equal(b, 2);
  assert.deepEqual(chat.read().actions, []);
  assert.equal(chat.read().pending, null);
  assert.match(chat.read().status!, /publishing/);
  fail = false;
  await host.publishAuthority();
  assert.equal(chat.read().choices.length, 0);
  assert.deepEqual(chat.read().actions, ['send', 'choose']);
  detachB();
  chat.dispose();
  host.dispose();
});
void test('stop waiting and adapter/view disposal preserve the shared operation and suppress late presentation', async () => {
  let release!: (text: string) => void;
  const host = new CharacterHostPort(
    {
      current() {},
      choices: () => [],
      run: () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    },
    () => undefined,
  );
  const chat = new HostChatPort(host, 'Guide');
  let notifications = 0;
  const detach = chat.subscribe(() => notifications++);
  chat.dispatch({
    kind: 'send',
    sessionId: chat.sessionId,
    requestId: 'one',
    text: 'Hello',
  });
  await settle();
  chat.dispatch({
    kind: 'cancel',
    sessionId: chat.sessionId,
    requestId: 'stop',
    pendingRequestId: 'one',
  });
  await settle();
  assert.equal(host.read().state, 'pending');
  assert.equal(chat.read().pending?.requestId, 'one');
  assert.match(chat.read().status!, /continues/);
  detach();
  chat.dispose();
  const count = notifications;
  release('Settled without a view');
  await settle();
  assert.equal(host.read().state, 'idle');
  assert.equal(host.read().messages.length, 2);
  assert.equal(notifications, count);
  assert.equal(chat.read().pending, null);
  host.dispose();
});

void test('restored saturated host recovers through the ordinary chat retry without growing its ledger', async () => {
  const calls: { id: string; key: string }[] = [];
  let lose = true;
  const driver = {
    current() {},
    choices: () => [],
    run: async (id: string, key: string) => {
      calls.push({ id, key });
      if (id === 'last' && lose) {
        lose = false;
        throw new Error('lost reply');
      }
      return 'Retained reply';
    },
  };
  const original = new CharacterHostPort(driver, () => undefined);
  for (let i = 0; i < 127; i++)
    await original.dispatch({
      kind: 'dialogue',
      requestId: `done-${i}`,
      expectedRevision: original.read().revision,
      message: 'Hello',
    });
  await assert.rejects(
    original.dispatch({
      kind: 'dialogue',
      requestId: 'last',
      expectedRevision: original.read().revision,
      message: 'Hello',
    }),
    /lost/,
  );
  const host = new CharacterHostPort(
    driver,
    () => undefined,
    JSON.parse(JSON.stringify(original.save())),
  );
  const chat = new HostChatPort(host, 'Guide');
  assert.deepEqual(chat.read().actions, ['retry', 'cancel']);
  assert.equal(chat.read().error?.requestId, 'last');
  assert.throws(
    () =>
      chat.dispatch({
        kind: 'retry',
        requestId: 'foreign',
        sessionId: chat.sessionId,
        failedRequestId: 'another-operation',
      }),
    /Unknown replay/,
  );
  const count = calls.length;
  chat.dispatch({
    kind: 'retry',
    requestId: 'fresh-ui-id',
    sessionId: chat.sessionId,
    failedRequestId: 'last',
  });
  await settle();
  assert.equal(chat.read().error, null);
  assert.equal(host.read().state, 'idle');
  assert.equal(host.save().deliveries.length, 128);
  assert.equal(host.save().operations.length, 128);
  assert.equal(calls.length, count + 1);
  assert.deepEqual(calls.at(-1), calls.at(-2));
  assert.equal(
    chat.read().messages.filter((m) => m.id === 'last/player').length,
    1,
  );
  assert.deepEqual(chat.read().actions, []);
  chat.dispose();
  host.dispose();
  original.dispose();
});
