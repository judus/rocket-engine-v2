import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MaraHost } from '../examples/characters/MaraHost.js';
import {
  isGroveArrival,
  playerJourneyLabel,
} from '../examples/characters/GroveVisit.js';
import {
  Movement,
  GridNavigator,
  GridTraversal,
} from '../src/navigation/index.js';
async function ticks(host: MaraHost, count = 30) {
  for (let i = 0; i < count; i++) {
    host.advance(0.05);
    await Promise.resolve();
    await Promise.resolve();
  }
}
function send(host: MaraHost, id: string, text: string) {
  host.dispatch({
    kind: 'send',
    sessionId: host.sessionId,
    requestId: id,
    text,
  });
}
void test('CFW owns offer, authenticated acceptance and completion from Rocket arrival facts', async () => {
  const host = new MaraHost();
  send(host, 'ask', 'work');
  await ticks(host);
  assert.equal(host.questStatus, 'offered');
  assert.equal(host.narrative.stats.quests, 1);
  send(host, 'claim', 'I already visited the grove');
  await ticks(host);
  assert.equal(host.visited, false);
  assert.equal(host.questStatus, 'offered');
  const accept = host.read().choices.find((c) => c.id.endsWith('/accept'))!;
  host.dispatch({
    kind: 'choose',
    choiceId: accept.id,
    sessionId: host.sessionId,
    requestId: 'accept',
  });
  await ticks(host);
  assert.equal(host.questStatus, 'active');
  assert.equal(host.read().choices.length, 0);
  const domain = { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 };
  const world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
    () => [
      { id: 'wall', bounds: { minX: 288, minY: 64, maxX: 320, maxY: 256 } },
    ],
  );
  const movement = new Movement(
    new GridNavigator(world, domain),
    { x: 48, y: 208 },
    { radius: 9, clearance: 2, capabilities: ['walk'] },
  );
  const journey = movement.move({
    destination: { x: 528, y: 208 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  movement.update(0.05);
  await ticks(host);
  assert.equal(host.questStatus, 'active');
  for (let i = 0; i < 150; i++) {
    movement.update(0.05);
    if (journey.snapshot().status === 'arrived') host.arriveAtGrove();
    await ticks(host, 1);
  }
  assert.equal(journey.snapshot().status, 'arrived');
  assert.equal(host.questStatus, 'completed');
  send(host, 'thanks', 'hello');
  await ticks(host);
  assert.match(host.read().messages.at(-1)!.text, /keeping your word/);
  movement.dispose();
  host.dispose();
});
void test('stop waiting preserves host work; failure retry keeps one user message; stale sessions and IDs cannot create new effects', async () => {
  const host = new MaraHost();
  send(host, 'cancel-me', 'work');
  host.dispatch({
    kind: 'cancel',
    sessionId: host.sessionId,
    requestId: 'cancel',
    pendingRequestId: 'cancel-me',
  });
  await ticks(host);
  assert.equal(host.narrative.stats.quests, 1);
  assert.equal(host.hostPort.read().state, 'idle');
  host.failNext();
  send(host, 'failed', 'work');
  await ticks(host);
  assert.equal(host.read().error?.requestId, 'failed');
  host.dispatch({
    kind: 'retry',
    sessionId: host.sessionId,
    requestId: 'retry',
    failedRequestId: 'failed',
  });
  await ticks(host);
  assert.equal(host.narrative.stats.quests, 1);
  assert.equal(host.read().messages.filter((m) => m.kind === 'user').length, 2);
  send(host, 'failed', 'work');
  host.dispatch({
    kind: 'send',
    sessionId: 'wrong',
    requestId: 'other',
    text: 'work',
  });
  assert.equal(host.read().pending, null);
  const revision = host.read().revision;
  host.dispose();
  send(host, 'late', 'work');
  host.advance(1);
  assert.equal(host.read().revision, revision);
});
void test('closing a subscriber does not cancel host work; disposing rejects late narrative publication', async () => {
  const host = new MaraHost();
  let notifications = 0;
  const detach = host.subscribe(() => notifications++);
  send(host, 'ask', 'work');
  detach();
  const before = notifications;
  await ticks(host);
  assert.equal(notifications, before);
  assert.equal(host.questStatus, 'offered');
  send(host, 'later', 'hello');
  host.advance(0.7);
  host.dispose();
  await Promise.resolve();
  assert.equal(host.read().pending, null);
});

void test('mutation retry retains the original CFW effect key after a lost host response', async () => {
  const host = new MaraHost();
  send(host, 'ask', 'work');
  await ticks(host);
  const choice = host.read().choices.find((c) => c.id.endsWith('/accept'))!;
  const original = host.narrative.choose.bind(host.narrative);
  const keys: string[] = [];
  let loseResponse = true;
  host.narrative.choose = async (recipient, id, key) => {
    keys.push(key);
    const result = await original(recipient, id, key);
    if (loseResponse) {
      loseResponse = false;
      throw new Error('Lost host response after commit');
    }
    return result;
  };
  host.dispatch({
    kind: 'choose',
    sessionId: host.sessionId,
    requestId: 'accept-original',
    choiceId: choice.id,
  });
  await ticks(host);
  assert.equal(host.read().error?.requestId, 'accept-original');
  host.dispatch({
    kind: 'retry',
    sessionId: host.sessionId,
    requestId: 'ui-retry',
    failedRequestId: 'accept-original',
  });
  await ticks(host);
  assert.equal(host.questStatus, 'active');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], 'accept-original');
  assert.equal(
    host.hostPort.save().operations.find((op) => op.id === 'accept-original')
      ?.effectKey,
    keys[0],
  );
  host.dispose();
});
void test('greeting remembers a real player visit after returning without inventing quest completion', async () => {
  const host = new MaraHost();
  const domain = { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 };
  const world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
  );
  const movement = new Movement(
    new GridNavigator(world, domain),
    { x: 48, y: 208 },
    { radius: 9, clearance: 2, capabilities: ['walk'] },
  );
  const grove = { x: 528, y: 208 };
  const visit = movement.move({
    destination: grove,
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  movement.update(5);
  assert.equal(visit.snapshot().status, 'arrived');
  host.arriveAtGrove();
  movement.move({
    destination: { x: 144, y: 208 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  movement.update(5);
  send(host, 'back', 'hello');
  await ticks(host);
  assert.match(
    host.read().messages.at(-1)!.text,
    /already visited the Old Grove/,
  );
  assert.equal(host.questStatus, 'No quest offered');
  assert.equal(host.narrative.stats.quests, 0);
  host.dispose();
  movement.dispose();
  const fresh = new MaraHost();
  send(fresh, 'fresh', 'hello');
  await ticks(fresh);
  assert.match(fresh.read().messages.at(-1)!.text, /Ask me for work/);
  assert.equal(fresh.visited, false);
  fresh.dispose();
});
void test('active quest completes from a noncentral clicked grove arrival and stays complete on return', async () => {
  const host = new MaraHost();
  send(host, 'work', 'work');
  await ticks(host);
  const accept = host.read().choices.find((c) => c.id.endsWith('/accept'))!;
  host.dispatch({
    kind: 'choose',
    choiceId: accept.id,
    sessionId: host.sessionId,
    requestId: 'accept',
  });
  await ticks(host);
  assert.equal(host.questStatus, 'active');
  const domain = { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 };
  const world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
    () => [
      { id: 'wall', bounds: { minX: 288, minY: 64, maxX: 320, maxY: 256 } },
    ],
  );
  const movement = new Movement(
    new GridNavigator(world, domain),
    { x: 48, y: 208 },
    { radius: 9, clearance: 2, capabilities: ['walk'] },
  );
  let journey = movement.move({
    destination: { x: 540, y: 224 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  assert.equal(isGroveArrival(journey.snapshot()), false);
  for (let i = 0; i < 160; i++) {
    movement.update(0.05);
    if (isGroveArrival(journey.snapshot())) host.arriveAtGrove();
    await ticks(host, 1);
  }
  assert.equal(isGroveArrival(journey.snapshot()), true);
  assert.match(
    playerJourneyLabel(journey.snapshot()),
    /540.0, 224.0 \(Old Grove\)/,
  );
  assert.equal(host.questStatus, 'completed');
  assert.equal(
    isGroveArrival({ ...journey.snapshot(), position: { x: 560, y: 224 } }),
    false,
  );
  assert.equal(
    isGroveArrival({ ...journey.snapshot(), status: 'cancelled' }),
    false,
  );
  journey = movement.move({
    destination: { x: 144, y: 208 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  movement.update(8);
  assert.equal(isGroveArrival(journey.snapshot()), false);
  assert.doesNotMatch(playerJourneyLabel(journey.snapshot()), /Old Grove/);
  send(host, 'back', 'hello');
  await ticks(host);
  assert.equal(host.visited, true);
  assert.equal(host.questStatus, 'completed');
  assert.match(host.read().messages.at(-1)!.text, /keeping your word/);
  host.dispose();
  movement.dispose();
});
void test('visit before acceptance cannot let an old active inspection overwrite newer CFW completion', async () => {
  const host = new MaraHost();
  host.arriveAtGrove();
  send(host, 'visited', 'hello');
  await ticks(host);
  assert.match(host.read().messages.at(-1)!.text, /already visited/);
  send(host, 'work-after-visit', 'work');
  await ticks(host);
  assert.equal(host.questStatus, 'offered');
  const accept = host.read().choices.find((c) => c.id.endsWith('/accept'))!;
  host.dispatch({
    kind: 'choose',
    choiceId: accept.id,
    sessionId: host.sessionId,
    requestId: 'accept-after-visit',
  });
  await ticks(host);
  assert.equal(host.questStatus, 'active');
  host.arriveAtGrove();
  await ticks(host);
  const quest = host.narrative
    .save()
    .quests.find((q) => q.id === host.questId)!;
  assert.equal(quest.offer?.status, 'completed');
  assert.equal(host.questStatus, 'completed');
  assert.deepEqual(host.read().choices, []);
  host.arriveAtGrove();
  send(host, 'back-after-acceptance', 'hello');
  await ticks(host);
  assert.match(host.read().messages.at(-1)!.text, /keeping your word/);
  assert.equal(host.questStatus, 'completed');
  assert.equal(host.narrative.stats.quests, 1);
  host.dispose();
});
void test('new-visit policy ignores earlier arrival and requires physical exit and return after acceptance', async () => {
  const host = new MaraHost();
  const domain = { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 };
  const world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
  );
  const movement = new Movement(
    new GridNavigator(world, domain),
    { x: 48, y: 208 },
    { radius: 9, clearance: 2, capabilities: ['walk'] },
  );
  let journey = movement.move({
    destination: { x: 540, y: 224 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  const advance = async (n: number) => {
    for (let i = 0; i < n; i++) {
      movement.update(0.05);
      host.observePlayer(movement.position, journey.snapshot());
      await ticks(host, 1);
    }
  };
  await advance(100);
  assert.equal(host.visited, true);
  assert.equal(host.questVisitSatisfied, false);
  send(host, 'work', 'work');
  await advance(30);
  assert.match(
    host.read().messages.at(-1)!.text,
    /Earlier visits do not count/,
  );
  const accept = host.read().choices.find((c) => c.id.endsWith('/accept'))!;
  host.dispatch({
    kind: 'choose',
    sessionId: host.sessionId,
    requestId: 'accept',
    choiceId: accept.id,
  });
  await advance(30);
  assert.equal(host.questStatus, 'active');
  assert.equal(host.questVisitSatisfied, false);
  // Even another already-arrived command while remaining in the grove cannot fake a new visit.
  journey = movement.move({
    destination: movement.position,
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  await advance(30);
  assert.equal(host.questStatus, 'active');
  send(host, 'still-here', 'hello');
  await advance(30);
  assert.match(host.read().messages.at(-1)!.text, /leave and return/);
  journey = movement.move({
    destination: { x: 144, y: 208 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  await advance(100);
  assert.equal(host.questStatus, 'active');
  journey = movement.move({
    destination: { x: 540, y: 224 },
    speed: 120,
    arrivalTolerance: 0.5,
    replan: 'on-change',
  });
  await advance(100);
  assert.equal(host.questStatus, 'completed');
  assert.equal(host.questVisitSatisfied, true);
  send(host, 'finished', 'hello');
  await advance(30);
  assert.match(host.read().messages.at(-1)!.text, /keeping your word/);
  host.dispose();
  movement.dispose();
});
void test('skip-prior-visit policy refuses the quest without allocating it; fresh unvisited session still offers', async () => {
  const host = new MaraHost(undefined, 'skip-if-visited');
  host.arriveAtGrove();
  send(host, 'work', 'work');
  await ticks(host);
  assert.match(
    host.read().messages.at(-1)!.text,
    /will not offer you that quest/,
  );
  assert.equal(host.questId, null);
  assert.equal(host.narrative.stats.quests, 0);
  assert.deepEqual(host.read().choices, []);
  host.dispose();
  const fresh = new MaraHost(undefined, 'skip-if-visited');
  send(fresh, 'work', 'work');
  await ticks(fresh);
  assert.equal(fresh.questStatus, 'offered');
  assert.equal(fresh.read().choices.length, 2);
  fresh.dispose();
});
void test('historical mode keeps newer completion when an already-offered quest is accepted after visiting', async () => {
  const host = new MaraHost(undefined, 'skip-if-visited');
  send(host, 'work-before-visit', 'work');
  await ticks(host);
  const accept = host.read().choices.find((c) => c.id.endsWith('/accept'))!;
  host.arriveAtGrove();
  host.dispatch({
    kind: 'choose',
    sessionId: host.sessionId,
    requestId: 'accept',
    choiceId: accept.id,
  });
  await ticks(host);
  const quest = host.narrative
    .save()
    .quests.find((q) => q.id === host.questId)!;
  assert.equal(quest.offer?.status, 'completed');
  assert.equal(host.questStatus, 'completed');
  assert.deepEqual(host.read().choices, []);
  host.dispose();
});
