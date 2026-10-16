import { Simulation } from '../../dist/vendor/production-workshop-2.4.0/index.js';
export function createObjectInventoryDemo() {
  const sim = new Simulation({
    resources: [
      { id: 'water', label: 'Water', kind: 'material' },
      { id: 'food', label: 'Food', kind: 'material' },
      { id: 'tool', label: 'Tool', kind: 'material', storage: 'individual' },
    ],
    recipes: [],
    facilities: [],
  });
  sim.createInventory({
    id: 'player-bag',
    capacity: { kind: 'slots', limit: 3, stackLimit: 5 },
    attachment: { objectId: 'player' },
  });
  sim.createInventory({
    id: 'house-pantry',
    capacity: { kind: 'units', limit: 12 },
    initial: { food: 4 },
    attachment: { objectId: 'house', slot: 'pantry' },
  });
  sim.createInventory({
    id: 'house-tools',
    capacity: { kind: 'slots', limit: 2, stackLimit: 1 },
    attachment: { objectId: 'house', slot: 'tools' },
  });
  sim.spawnItem('house-tools', 'tool', { durability: 100 });
  sim.createInventory({
    id: 'lake-water',
    capacity: { kind: 'units', limit: 30 },
    initial: { water: 30 },
    attachment: { objectId: 'lake', slot: 'water' },
  });
  return sim;
}
