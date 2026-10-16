import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkDemo } from '../examples/character-work/WorkDemo.js';
function advance(game: WorkDemo, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) game.update(1 / 60);
}
void test('takeover clears attendance/reservation, preserves intent and resumes without duplicate production', () => {
  const game = new WorkDemo();
  advance(game, 20);
  assert.ok(game.staffing.snapshot().workers.every((w) => w.present));
  const before = game.factory.read();
  game.takeover('A');
  assert.equal(
    game.staffing.snapshot().workers.find((w) => w.id === 'A')!.present,
    null,
  );
  assert.deepEqual(
    game.staffing.snapshot().reservations.map((r) => r.worker),
    ['B'],
  );
  const smelter = game.factory.read().facilities[1]!;
  const pose = game.workers.get('A')!.position;
  game.update(1, { x: -1, y: 0 }, true);
  assert.equal(game.workers.get('A')!.position.x, pose.x - 136);
  assert.equal(
    game.factory.read().facilities[1]!.jobs[0]!.progress,
    smelter.jobs[0]!.progress,
  );
  assert.equal(
    game.factory.read().facilities[1]!.jobs[0]!.batchesCompleted,
    smelter.jobs[0]!.batchesCompleted,
  );
  advance(game, 4);
  assert.ok(
    game.factory.read().completed > before.completed,
    'press continues from existing alloy',
  );
  game.release();
  advance(game, 4);
  assert.ok(game.staffing.snapshot().workers.every((w) => w.present));
  assert.equal(game.staffing.snapshot().reservations.length, 2);
  game.dispose();
  game.dispose();
  assert.throws(() => game.update(1));
});
void test('switch control retires journeys; gate failure recovers; removal and checkpoint reconcile attendance', () => {
  const game = new WorkDemo();
  const stale = game.workers.get('A')!.move({
    destination: game.slots[0]!.position,
    speed: 90,
    arrivalTolerance: 0.1,
    replan: 'on-change',
  });
  game.takeover('A');
  game.takeover('B');
  assert.equal(game.controlled, 'B');
  assert.equal(game.workers.get('A')!.manual, false);
  assert.equal(game.workers.get('B')!.manual, true);
  stale.retry();
  stale.cancel();
  assert.equal(stale.snapshot().status, 'cancelled');
  assert.equal(game.controlled, 'B');
  game.release();
  game.toggleGate();
  advance(game, 1);
  assert.ok(game.staffing.snapshot().workers.every((w) => !w.present));
  game.toggleGate();
  advance(game, 7);
  assert.ok(game.staffing.snapshot().workers.every((w) => w.present));
  game.takeover('A');
  game.update(1, { x: -1, y: 0 });
  game.remove('B');
  const saved = JSON.parse(JSON.stringify(game.save())) as ReturnType<
    WorkDemo['save']
  >;
  const restored = new WorkDemo(saved);
  assert.equal(restored.controlled, null);
  assert.equal(restored.workers.has('B'), false);
  assert.equal(restored.staffing.snapshot().workers[0]!.present, null);
  assert.deepEqual(restored.factory.read().stock, game.factory.read().stock);
  advance(restored, 3);
  assert.equal(restored.staffing.snapshot().workers[0]!.present, 'A');
  restored.dispose();
  game.dispose();
});
