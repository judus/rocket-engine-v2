import { Simulation } from '../../dist/vendor/production-workshop-2.4.0/index.js';
export function createInventoryOperationsDemo() {
  const sim = new Simulation({
    resources: [
      {
        id: 'coin',
        label: 'Coins',
        kind: 'currency',
        unitWeight: 0,
        unitVolume: 0,
      },
      {
        id: 'food',
        label: 'Food',
        kind: 'material',
        unitWeight: 2,
        unitVolume: 1,
      },
      {
        id: 'water',
        label: 'Water',
        kind: 'material',
        unitWeight: 1,
        unitVolume: 1,
      },
      {
        id: 'bucket',
        label: 'Empty bucket',
        kind: 'material',
        storage: 'individual',
        unitWeight: 1,
        unitVolume: 2,
      },
      {
        id: 'full-bucket',
        label: 'Full bucket',
        kind: 'material',
        storage: 'individual',
        unitWeight: 6,
        unitVolume: 5,
      },
      {
        id: 'tool',
        label: 'Tool',
        kind: 'material',
        storage: 'individual',
        unitWeight: 4,
        unitVolume: 2,
      },
    ],
    recipes: [],
    facilities: [],
  });
  sim.createInventory({
    id: 'bag',
    attachment: { objectId: 'player' },
    capacity: { kind: 'slots', limit: 4, stackLimit: 5 },
    rules: { maxWeight: 10, maxVolume: 8 },
    initial: { coin: 5 },
  });
  sim.spawnItem('bag', 'bucket', { durability: 80 });
  sim.createInventory({
    id: 'trader',
    attachment: { objectId: 'trader' },
    capacity: { kind: 'units', limit: 30 },
    rules: { accepts: ['coin', 'food', 'tool'] },
    initial: { food: 5 },
  });
  sim.spawnItem('trader', 'tool', { durability: 100 });
  sim.createInventory({
    id: 'lake',
    attachment: { objectId: 'lake', slot: 'water' },
    capacity: { kind: 'units', limit: 30 },
    rules: { accepts: ['water'], maxWeight: 30, maxVolume: 30 },
    initial: { water: 30 },
  });
  return sim;
}
export function buyFood(sim) {
  return sim.exchange([
    {
      sourceInventoryId: 'bag',
      destinationInventoryId: 'trader',
      quantities: { coin: 3 },
    },
    {
      sourceInventoryId: 'trader',
      destinationInventoryId: 'bag',
      quantities: { food: 1 },
    },
  ]);
}
export function fillBucket(sim) {
  const bucket = sim.inventory('bag').itemPage({ resourceId: 'bucket' })
    .items[0];
  if (!bucket) return { ok: false, reason: 'You need an empty bucket.' };
  return sim.mutateInventory({
    inventoryId: 'bag',
    consume: { water: 5 },
    consumeItemIds: [bucket.id],
    createItems: [{ resourceId: 'full-bucket', attributes: bucket.attributes }],
  });
}
