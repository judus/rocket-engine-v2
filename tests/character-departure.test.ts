import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LocalDeparture,
  type DepartureRequest,
} from '../examples/characters/LocalDeparture.js';
import { MaraHost } from '../examples/characters/MaraHost.js';
import {
  Movement,
  GridNavigator,
  GridTraversal,
} from '../src/navigation/index.js';
function setup() {
  let blocked = false,
    revision = 0;
  const domain = { minX: 0, minY: 0, columns: 20, rows: 10, tileSize: 32 };
  const world = new GridTraversal(
    domain,
    () => (blocked ? { status: 'unknown' } : { status: 'passable', cost: 1 }),
    () => revision,
    () => [
      { id: 'wall', bounds: { minX: 288, minY: 64, maxX: 320, maxY: 256 } },
    ],
  );
  const movement = new Movement(
    new GridNavigator(world, domain),
    { x: 112, y: 144 },
    { radius: 9, clearance: 2, capabilities: ['walk'] },
  );
  const port = new LocalDeparture(
    movement,
    () => 'session',
    new Map([['grove', { x: 528, y: 208 }]]),
  );
  const request: DepartureRequest = {
    sessionId: 'session',
    operationId: 'op',
    effectKey: 'effect',
    actor: 'mara',
    incarnation: 'mara-body-1',
    destinationRef: 'grove',
  };
  return {
    port,
    request,
    movement,
    setBlocked(value: boolean) {
      blocked = value;
      revision++;
    },
  };
}
void test('departure validates authority, deduplicates pending/terminal outcomes, rejects supersession and keeps unknown terrain pending', async () => {
  const { port, request, setBlocked } = setup();
  for (const invalid of [
    { sessionId: 'foreign' },
    { actor: 'other' },
    { incarnation: 'retired' },
    { destinationRef: 'invented' },
  ])
    await assert.rejects(port.run({ ...request, ...invalid }));
  assert.equal(port.stats.starts, 0);
  setBlocked(true);
  const original = port.run(request);
  assert.equal(port.run({ ...request }), original);
  assert.equal(port.snapshot()?.status, 'blocked');
  port.update(1);
  assert.equal(port.stats.terminals, 0);
  await assert.rejects(
    port.run({ ...request, operationId: 'other', effectKey: 'other' }),
    /travelling/,
  );
  await assert.rejects(
    port.run({ ...request, effectKey: 'changed' }),
    /identity conflict/,
  );
  setBlocked(false);
  for (let i = 0; i < 200; i++) port.update(0.05);
  const outcome = await original;
  assert.equal(outcome.status, 'arrived');
  assert.equal(await port.run(request), outcome);
  assert.deepEqual(port.stats, {
    starts: 1,
    terminals: 1,
    retained: 1,
    retired: false,
  });
  port.dispose();
  assert.equal(await port.run(request), outcome);
  await assert.rejects(
    port.run({ ...request, operationId: 'new', effectKey: 'new' }),
    /retired/,
  );
});
void test('explicit cancel/removal settles once and cannot route stale actor commands to a replacement', async () => {
  const { port, request } = setup();
  const result = port.run(request);
  port.update(0.1);
  port.dispose();
  port.dispose();
  port.update(2);
  assert.equal((await result).status, 'cancelled');
  assert.equal(port.stats.terminals, 1);
  await assert.rejects(
    port.run({ ...request, incarnation: 'mara-body-2' }),
    /authority/,
  );
});
async function tick(host: MaraHost, departure: LocalDeparture, count: number) {
  for (let i = 0; i < count; i++) {
    departure.update(0.05);
    host.advance(0.05);
    await Promise.resolve();
    await Promise.resolve();
  }
}
void test('actual CFW decision starts one physical NPC journey; stop waiting and lost-reply retry preserve original outcome', async () => {
  const { movement } = setup();
  const departure: LocalDeparture = new LocalDeparture(
    movement,
    () => host.sessionId,
    new Map([['grove', { x: 528, y: 208 }]]),
  );
  const host: MaraHost = new MaraHost(departure);
  host.loseDepartureReply();
  host.dispatch({
    kind: 'send',
    sessionId: host.sessionId,
    requestId: 'leave',
    text: 'go to grove',
  });
  await tick(host, departure, 30);
  assert.equal(departure.stats.starts, 1);
  assert.equal(host.read().pending?.requestId, 'leave');
  host.dispatch({
    kind: 'cancel',
    sessionId: host.sessionId,
    requestId: 'stop',
    pendingRequestId: 'leave',
  });
  await tick(host, departure, 200);
  assert.equal(departure.snapshot()?.status, 'arrived');
  assert.equal(host.read().error?.requestId, 'leave');
  host.dispatch({
    kind: 'retry',
    sessionId: host.sessionId,
    requestId: 'retry',
    failedRequestId: 'leave',
  });
  await tick(host, departure, 30);
  assert.equal(departure.stats.starts, 1);
  assert.equal(departure.stats.terminals, 1);
  assert.match(host.read().messages.at(-1)!.text, /journey arrived/);
  assert.equal(
    host.read().messages.filter((m) => m.speaker === 'You').length,
    1,
  );
  assert.equal(host.visited, false);
  host.dispatch({
    kind: 'send',
    sessionId: host.sessionId,
    requestId: 'greeting-after-arrival',
    text: 'hello',
  });
  await tick(host, departure, 30);
  assert.match(host.read().messages.at(-1)!.text, /I reached the Old Grove/);
  assert.equal(host.questStatus, 'No quest offered');
  assert.equal(departure.stats.starts, 1);
  host.dispose();
  departure.dispose();
});
void test('terminal rejection and bounded ledger never evict original outcomes or admit duplicate effects', async () => {
  const { port, request } = setup();
  const first = port.run(request);
  port.cancel();
  assert.equal((await first).status, 'cancelled');
  await assert.rejects(
    port.run({ ...request, operationId: 'alias' }),
    /effect identity/,
  );
  for (let i = 1; i < 128; i++) {
    const result = port.run({
      ...request,
      operationId: `op-${i}`,
      effectKey: `effect-${i}`,
    });
    port.cancel();
    assert.equal((await result).status, 'cancelled');
  }
  await assert.rejects(
    port.run({ ...request, operationId: 'overflow', effectKey: 'overflow' }),
    /saturated/,
  );
  assert.equal(await port.run(request), await first);
  assert.equal(port.stats.retained, 128);
  port.dispose();
});
void test('unreachable is a terminal game outcome rather than an arrival claim', async () => {
  const domain = { minX: 0, minY: 0, columns: 2, rows: 2, tileSize: 32 };
  const world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
  );
  const port = new LocalDeparture(
    new Movement(
      new GridNavigator(world, domain),
      { x: 16, y: 16 },
      { radius: 1, clearance: 0, capabilities: [] },
    ),
    () => 'session',
    new Map([['grove', { x: 528, y: 208 }]]),
  );
  const result = await port.run({
    sessionId: 'session',
    operationId: 'op',
    effectKey: 'effect',
    actor: 'mara',
    incarnation: 'mara-body-1',
    destinationRef: 'grove',
  });
  assert.equal(result.status, 'unreachable');
  assert.equal(port.stats.terminals, 1);
  port.dispose();
});
