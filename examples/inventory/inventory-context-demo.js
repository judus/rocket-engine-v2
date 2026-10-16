import { Simulation } from '../../dist/vendor/production-workshop-2.4.0/index.js';
export function createInventoryContextDemo() {
  const sim = new Simulation({
    resources: [
      { id: 'apple', label: 'Apple', kind: 'material', storage: 'individual' },
      { id: 'sword', label: 'Sword', kind: 'material', storage: 'individual' },
      { id: 'hat', label: 'Hat', kind: 'material', storage: 'individual' },
    ],
    recipes: [],
    facilities: [],
  });
  sim.createInventory({
    id: 'bag',
    attachment: { objectId: 'player' },
    capacity: { kind: 'slots', limit: 4, stackLimit: 1 },
    metadata: { label: 'Travel bag', color: 'sand' },
  });
  sim.createInventory({
    id: 'fridge',
    attachment: { objectId: 'house' },
    capacity: { kind: 'slots', limit: 4, stackLimit: 1 },
    modifiers: { decay: 0.1 },
    metadata: { label: 'Cold storage', temperature: 'cold' },
  });
  sim.createInventory({
    id: 'hand',
    attachment: { objectId: 'player', slot: 'mainHand' },
    equipment: { accepts: ['sword'] },
    modifiers: { power: 1.5 },
    metadata: { label: 'Main hand' },
  });
  sim.createInventory({
    id: 'head',
    attachment: { objectId: 'player', slot: 'head' },
    equipment: { accepts: ['hat'] },
    metadata: { label: 'Head' },
  });
  sim.spawnItem('bag', 'apple', { decay: 1, freshness: 100 });
  sim.spawnItem('bag', 'sword', { power: 10, durability: 80 });
  sim.spawnItem('bag', 'hat', { armor: 2 });
  sim.spawnItem('hand', 'sword', { power: 6, durability: 100 });
  return sim;
}
/** Example host-owned item behavior. The core never automatically advances freshness. */
export function advanceFreshness(sim, seconds) {
  const ticks = (seconds * 1e6) / sim.registry.tickMicroseconds;
  if (!Number.isSafeInteger(ticks) || ticks < 0)
    throw new Error('Use an exact tick interval.');
  sim.advanceTicks(ticks);
  for (const inventoryId of ['bag', 'fridge']) {
    const inventory = sim.inventory(inventoryId);
    for (const item of inventory.itemPage({ resourceId: 'apple' }).items) {
      const rate = inventory.effectiveItemAttributes(item.id).decay;
      sim.updateItemAttributes(inventoryId, item.id, {
        freshness: Math.max(0, item.attributes.freshness - rate * seconds),
      });
    }
  }
}
