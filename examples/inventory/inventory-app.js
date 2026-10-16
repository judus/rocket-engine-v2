import { Simulation } from '../../dist/vendor/production-workshop-2.4.0/index.js';
import { createObjectInventoryDemo } from './object-inventory-demo.js';
let sim = createObjectInventoryDemo(),
  checkpoint;
const cards = document.querySelector('#inventories'),
  message = document.querySelector('#message');
function render() {
  cards.replaceChildren();
  for (const [objectId, label] of [
    ['player', 'Player'],
    ['house', 'House'],
    ['lake', 'Lake'],
  ]) {
    for (const a of sim.objectInventories(objectId)) {
      const inventory = sim.inventory(a.inventoryId).summary(),
        c = inventory.capacity;
      const card = document.createElement('section');
      card.className = 'inventory-card';
      const heading = document.createElement('h2');
      heading.textContent = label + (a.slot === 'main' ? '' : ` · ${a.slot}`);
      const status = document.createElement('p');
      status.textContent = `${c.used} / ${c.limit} ${c.kind === 'slots' ? 'slots' : 'units'} used`;
      const list = document.createElement('ul');
      for (const [resource, n] of Object.entries(inventory.quantities)) {
        const li = document.createElement('li');
        li.textContent = `${sim.registry.resource(resource).label}: ${n}`;
        list.append(li);
      }
      card.append(heading, status, list);
      cards.append(card);
    }
  }
}
function action(f) {
  try {
    message.textContent = f();
  } catch (error) {
    message.textContent = error.message;
  }
  render();
}
document.querySelector('#take-water').onclick = () =>
  action(() =>
    sim.transfer('lake-water', 'player-bag', { water: 5 })
      ? 'Moved 5 water from the lake to your bag.'
      : 'Your bag is full or the lake has less than 5 water. Nothing moved.',
  );
document.querySelector('#store-water').onclick = () =>
  action(() =>
    sim.transfer('player-bag', 'house-pantry', { water: 5 })
      ? 'Stored 5 water in the house.'
      : 'Not enough water in your bag, or the pantry is full. Nothing moved.',
  );
document.querySelector('#take-tool').onclick = () =>
  action(() => {
    const item = sim.inventory('house-tools').itemPage().items[0];
    return item
      ? sim.transferItem('house-tools', 'player-bag', item.id)
        ? 'Tool moved to your bag with its identity and durability intact.'
        : 'Your bag is full. The tool remains in the cabinet.'
      : 'The tool is already out of the cabinet.';
  });
document.querySelector('#expand').onclick = () =>
  action(() => {
    const c = sim.inventory('player-bag').summary().capacity;
    sim.setInventoryCapacity('player-bag', {
      kind: 'slots',
      limit: c.limit + 1,
      stackLimit: c.stackLimit,
    });
    return 'Added one bag slot.';
  });
document.querySelector('#save').onclick = () =>
  action(() => {
    checkpoint = sim.save();
    document.querySelector('#restore').disabled = false;
    return 'Saved all inventory contents, capacity and object attachments.';
  });
document.querySelector('#restore').onclick = () =>
  action(() => {
    sim = Simulation.restore(checkpoint);
    return 'Restored the saved world. Contents, item identity and attachments are preserved.';
  });
document.querySelector('#reset').onclick = () =>
  action(() => {
    sim = createObjectInventoryDemo();
    checkpoint = undefined;
    document.querySelector('#restore').disabled = true;
    return 'Example reset. The lake has 30 water again.';
  });
render();
