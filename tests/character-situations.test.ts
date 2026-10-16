import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { readFile } from 'node:fs/promises';
import type { SituationDefinition } from 'character-framework';
import { MeetingHost } from '../examples/character-situations/MeetingHost.js';
import { MeetingChat } from '../examples/character-situations/MeetingChat.js';
const definition: unknown = JSON.parse(
  await readFile(
    new URL(
      '../../examples/characters/situations/meeting.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const meeting = definition as SituationDefinition; // CFW publish validates every fixture.
async function ticks(host: MeetingHost, n = 8) {
  for (let i = 0; i < n; i++) {
    host.advance(1 / 60);
    await setImmediate();
  }
}
async function pump<T>(host: MeetingHost, promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let i = 0; i < 200 && !done; i++) await ticks(host, 1);
  assert.ok(done, 'command must settle under existing host advancement');
  return promise;
}
void test('Rocket authored choices converge with current interaction, exact replay and retirement', async (t) => {
  const host = new MeetingHost(meeting);
  t.after(() => host.dispose());
  const run = await pump(host, host.start());
  await ticks(host);
  assert.equal(host.handle.read(run.runId).choices.length, 0);
  host.setInteraction(true);
  await ticks(host);
  let view = host.handle.read(run.runId);
  assert.equal(view.choices.length, 3);
  const choice = view.choices[0]!,
    revision = view.revision;
  const command = () =>
    host.handle.choose(run.runId, choice.id, revision, 'choice-1');
  const receipt = await pump(host, command());
  await ticks(host);
  assert.equal(host.handle.read(run.runId).situationId, 'grove');
  assert.deepEqual(await pump(host, command()), receipt);
  view = host.handle.read(run.runId);
  await pump(
    host,
    host.handle.choose(
      run.runId,
      view.choices[0]!.id,
      view.revision,
      'choice-2',
    ),
  );
  await ticks(host);
  assert.equal(host.handle.read(run.runId).status, 'closed');
  assert.equal(host.handle.read(run.runId).dialogue, 'Safe travels.');
  await pump(host, host.handle.retire(run.runId, 'retire-guide'));
  await ticks(host);
  assert.equal(host.handle.read(run.runId).status, 'retired');
  assert.equal(host.retired, 1);
});
void test('Rocket stale proximity choice rejects; journal failure retries original command', async (t) => {
  const host = new MeetingHost(meeting);
  t.after(() => host.dispose());
  host.setInteraction(true);
  const run = await pump(host, host.start());
  await ticks(host);
  const view = host.handle.read(run.runId),
    choice = view.choices[1]!;
  host.setInteraction(false);
  await assert.rejects(
    pump(
      host,
      host.handle.choose(run.runId, choice.id, view.revision, 'old-choice'),
    ),
    /Interaction/,
  );
  assert.equal(host.handle.read(run.runId).situationId, 'greeting');
  host.setInteraction(true);
  await ticks(host);
  host.failNextJournal();
  const retry = () =>
    host.handle.choose(run.runId, choice.id, view.revision, 'journal-choice');
  await assert.rejects(pump(host, retry()), /Injected host journal failure/);
  assert.equal(host.handle.read(run.runId).situationId, 'greeting');
  await pump(host, retry());
  await ticks(host);
  assert.equal(host.handle.read(run.runId).situationId, 'workshop');
  const journal = host.journal!;
  (journal.runs as unknown[]).length = 0;
  assert.equal(host.journal!.runs.length, 1);
});
void test('Rocket situation disposal rejects pending input and releases held host persistence', async () => {
  const host = new MeetingHost(meeting);
  host.holdNextJournal();
  const p = host.start();
  const rejection = assert.rejects(p, /disposed|Disposed/);
  await ticks(host, 2);
  assert.equal(host.journalHeld, true);
  host.dispose();
  await rejection;
  host.dispose();
  await setImmediate();
  assert.equal(host.runtime.situations!.stats.disposed, true);
  assert.equal(host.journalHeld, false);
});
async function chatTicks(chat: MeetingChat, n = 12) {
  for (let i = 0; i < n; i++) {
    chat.advance(1 / 60, true);
    await setImmediate();
  }
}
void test('Rocket ChatBox pending/error/retry and stop-waiting preserve admitted situation choice', async (t) => {
  const chat = new MeetingChat(meeting);
  t.after(() => chat.dispose());
  await chatTicks(chat);
  let view = chat.read();
  assert.equal(view.choices.length, 3);
  assert.ok(!view.actions!.includes('send'));
  chat.host.failNextJournal();
  chat.dispatch({
    sessionId: chat.sessionId,
    requestId: 'ui-1',
    kind: 'choose',
    choiceId: view.choices[0]!.id,
  });
  assert.equal(chat.read().pending!.requestId, 'ui-1');
  await chatTicks(chat);
  assert.equal(chat.read().error!.requestId, 'ui-1');
  assert.deepEqual(chat.read().actions, ['retry']);
  chat.host.holdNextJournal();
  chat.dispatch({
    sessionId: chat.sessionId,
    requestId: 'ui-retry',
    kind: 'retry',
    failedRequestId: 'ui-1',
  });
  await chatTicks(chat, 2);
  assert.equal(chat.host.journalHeld, true);
  chat.dispatch({
    sessionId: chat.sessionId,
    requestId: 'ui-stop',
    kind: 'cancel',
    pendingRequestId: 'ui-1',
  });
  assert.equal(chat.read().pending, null);
  assert.deepEqual(chat.read().actions, []);
  chat.host.releaseJournal();
  await chatTicks(chat);
  view = chat.read();
  assert.equal(view.error, null);
  assert.equal(view.messages[0]!.text, 'The old grove lies east of here.');
  chat.dispose();
  assert.deepEqual(chat.read().actions, []);
  assert.equal(chat.read().pending, null);
});
