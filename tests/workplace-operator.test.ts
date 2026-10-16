import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GridTraversal,
  GridNavigator,
  Movement,
} from '../src/navigation/index.js';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import { WorkplaceOperator } from '../examples/workshop/WorkplaceOperator.js';
function fixture() {
  const factory = new FactoryDemo(1, true, true),
    smelter = factory.ids[1]!,
    press = factory.ids[2]!;
  const workplaces = new Map([
    [smelter, { x: 35, y: 15 }],
    [press, { x: 75, y: 15 }],
  ]);
  let revision = 0,
    unknown = false;
  const actor = { radius: 2, clearance: 0, capabilities: ['walk'] };
  const world = new GridTraversal(
    { minX: 0, minY: 0, columns: 10, rows: 4, tileSize: 10 },
    (x) =>
      unknown && x >= 5
        ? { status: 'unknown' }
        : { status: 'passable', cost: 1 },
    () => revision,
  );
  const movement = new Movement(
    new GridNavigator(world, world.domain),
    { x: 15, y: 15 },
    actor,
  );
  const changes: [string, boolean][] = [];
  const operator = new WorkplaceOperator(movement, {
    workplace(id) {
      return workplaces.get(id);
    },
    canStand(p) {
      return world.point(p, actor).status === 'passable';
    },
    setPresent(id, present) {
      changes.push([id, present]);
      factory.operatorOnSite(id, present);
    },
  });
  return {
    factory,
    smelter,
    press,
    operator,
    workplaces,
    changes,
    movement,
    unknown(value: boolean) {
      unknown = value;
      revision++;
    },
    step(dt = 0.05) {
      operator.reconcile();
      factory.advance(dt);
      operator.update(dt);
    },
    advance(seconds: number) {
      for (let i = 0; i < Math.round(seconds / 0.05); i++) {
        operator.reconcile();
        factory.advance(0.05);
        operator.update(0.05);
      }
    },
    dispose() {
      operator.dispose();
      factory.dispose();
    },
  };
}
void test('workplace arrival gates native production; one operator never staffs both destinations or earns work while walking', () => {
  const f = fixture();
  try {
    f.operator.assign(f.smelter);
    assert.equal(f.operator.snapshot().present, null);
    f.step(0.1);
    assert.equal(
      f.factory.read().facilities.find((x) => x.id === f.smelter)!.attendance
        .operator,
      undefined,
    );
    f.advance(8);
    assert.equal(f.operator.snapshot().present, f.smelter);
    assert.ok(
      f.factory.read().facilities.find((x) => x.id === f.smelter)!.jobs[0]!
        .batchesCompleted > 0,
    );
    assert.equal(f.factory.read().completed, 0);
    const before = f.factory.read().facilities.find((x) => x.id === f.smelter)!
      .jobs[0]!.progress;
    f.operator.assign(f.press);
    assert.equal(f.operator.snapshot().present, null);
    assert.equal(
      f.factory.read().facilities.find((x) => x.id === f.smelter)!.attendance
        .operator,
      undefined,
    );
    f.step(0.1);
    assert.equal(f.operator.snapshot().present, null);
    f.advance(8);
    assert.equal(f.operator.snapshot().present, f.press);
    assert.equal(
      f.factory.read().facilities.find((x) => x.id === f.smelter)!.jobs[0]!
        .progress,
      before,
    );
    assert.ok(f.factory.read().completed > 0);
    f.operator.cancel();
    const completed = f.factory.read().completed;
    f.advance(6);
    assert.equal(f.factory.read().completed, completed);
  } finally {
    f.dispose();
  }
});
void test('unknown journey data blocks staffing and unknown local terrain revokes attendance before the next production interval', () => {
  const f = fixture();
  try {
    f.unknown(true);
    f.operator.assign(f.press);
    f.advance(2);
    assert.equal(f.operator.snapshot().journey!.status, 'blocked');
    assert.equal(f.operator.snapshot().present, null);
    f.unknown(false);
    f.advance(2);
    assert.equal(f.operator.snapshot().present, f.press);
    f.unknown(true);
    f.operator.reconcile();
    assert.equal(f.operator.snapshot().present, null);
    const count = f.changes.length;
    f.advance(2);
    assert.equal(f.changes.length, count);
    f.unknown(false);
    f.operator.reconcile();
    assert.equal(f.operator.snapshot().present, f.press);
  } finally {
    f.dispose();
  }
});
void test('disappearing or relocated workplaces cancel assignment and clear presence without choosing a new destination', () => {
  const f = fixture();
  try {
    f.operator.assign(f.smelter);
    f.advance(1);
    assert.equal(f.operator.snapshot().present, f.smelter);
    f.workplaces.delete(f.smelter);
    f.operator.reconcile();
    assert.equal(f.operator.snapshot().target, null);
    assert.equal(f.operator.snapshot().present, null);
    assert.throws(() => f.operator.assign(f.smelter), /Unavailable/);
    f.operator.assign(f.press);
    f.step(0.1);
    f.workplaces.set(f.press, { x: 85, y: 25 });
    f.operator.reconcile();
    assert.equal(f.operator.snapshot().journey!.status, 'cancelled');
    assert.equal(f.operator.snapshot().target, null);
  } finally {
    f.dispose();
  }
});
void test('adapter owns movement cleanup but not Workshop; retry/cancel are not production clocks and disposal is idempotent', () => {
  const f = fixture();
  try {
    f.operator.assign(f.smelter);
    f.advance(1);
    const tick = f.factory.read().summary.tick;
    f.operator.retry();
    f.operator.reconcile();
    assert.equal(f.factory.read().summary.tick, tick);
    f.operator.dispose();
    f.operator.dispose();
    assert.equal(
      f.factory.read().facilities.find((x) => x.id === f.smelter)!.attendance
        .operator,
      undefined,
    );
    assert.throws(() => f.movement.update(0.1), /disposed/);
    assert.throws(() => f.operator.assign(f.press), /disposed/);
    f.factory.advance(1);
    assert.ok(f.factory.read().summary.tick > tick);
  } finally {
    f.dispose();
  }
});
