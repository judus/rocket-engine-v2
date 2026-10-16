import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
void test('production bridge retains elapsed time independently of frame partitions and reads do not advance', () => {
  const a = new FactoryDemo(),
    b = new FactoryDemo();
  try {
    a.advance(12);
    for (let i = 0; i < 120; i++) b.advance(0.1);
    assert.deepEqual(a.read().summary, b.read().summary);
    assert.deepEqual(a.read().stock, b.read().stock);
    assert.deepEqual(a.read().facilities, b.read().facilities);
    const before = a.read();
    for (let i = 0; i < 100; i++) a.read();
    assert.deepEqual(a.read(), before);
    assert.ok(before.completed > 0);
    assert.ok(before.events.length <= 8);
  } finally {
    a.dispose();
    b.dispose();
  }
});
void test('Workshop owns output blocking, waiting inputs and resumption after collection', () => {
  const factory = new FactoryDemo();
  try {
    factory.enabled(1, false);
    factory.advance(5);
    assert.equal(factory.read().stock.quantities.parts ?? 0, 0);
    assert.equal(
      factory.read().facilities[2]?.jobs[0]?.state,
      'waiting-inputs',
    );
    factory.enabled(1, true);
    factory.advance(180);
    const full = factory.read();
    assert.equal(full.stock.quantities.parts, 20);
    assert.equal(full.facilities[2]?.jobs[0]?.state, 'output-blocked');
    assert.equal(factory.collect(), 20);
    assert.equal(factory.read().collected, 20);
    factory.advance(2.1);
    assert.ok((factory.read().stock.quantities.parts ?? 0) > 0);
    assert.ok(factory.read().completed > full.completed);
    assert.equal(factory.read().summary.inventoryCount, 1);
  } finally {
    factory.dispose();
  }
  factory.dispose();
  assert.throws(() => factory.read(), /disposed/);
});
