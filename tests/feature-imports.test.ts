import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from 'production-workshop';
import { AnimationPlayer, sampleLayers } from 'sprite-animation';
import { timeline, appearance } from '../examples/sprite-layers/fixture.js';

void test('imported Workshop owns attached equipment, exact swaps and contextual attributes', () => {
  const sim = new Simulation({
    resources: [
      { id: 'sword', label: 'Sword', kind: 'material', storage: 'individual' },
    ],
    recipes: [],
    facilities: [],
  });
  sim.createInventory({
    id: 'bag',
    attachment: { objectId: 'pilot' },
    capacity: { kind: 'slots', limit: 1, stackLimit: 1 },
  });
  sim.createInventory({
    id: 'hand',
    attachment: { objectId: 'pilot', slot: 'mainHand' },
    equipment: { accepts: ['sword'] },
    modifiers: { power: 1.5 },
  });
  const next = sim.spawnItem('bag', 'sword', { power: 10 });
  const old = sim.spawnItem('hand', 'sword', { power: 4 });
  assert.ok(next && old);
  assert.ok(sim.equipItem('bag', 'hand', next).ok);
  assert.equal(sim.inventory('hand').item(next)!.attributes.power, 10);
  assert.equal(sim.inventory('hand').effectiveItemAttributes(next)!.power, 15);
  assert.equal(sim.inventory('bag').item(old)!.id, old);
  const restored = Simulation.restore(sim.save());
  assert.equal(
    restored.inventory('hand').effectiveItemAttributes(next)!.power,
    15,
  );
  assert.equal(restored.save().version, 7);
});

void test('imported synchronized layers sample one paused master without changing phase or completion', () => {
  const player = new AnimationPlayer(timeline);
  player.play('walk', { mode: 'once' });
  player.advance(0.3);
  player.pause();
  const before = player.snapshot;
  const first = sampleLayers(appearance(), before)!;
  assert.equal(first.layers.at(-1)!.id, 'weapon');
  assert.deepEqual(player.snapshot, before);
  assert.equal(sampleLayers(appearance(), player.snapshot)!.layers.length, 3);
  player.resume();
  assert.ok(player.advance(1));
  assert.equal(player.advance(1), null);
  player.dispose();
  assert.equal(sampleLayers(appearance(), player.snapshot), null);
});
