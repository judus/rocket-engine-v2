import { Simulation } from '../../dist/vendor/production-workshop-2.4.0/index.js';
import {
  createInventoryOperationsDemo,
  buyFood,
  fillBucket,
} from './inventory-operations-demo.js';
let sim,
  stop,
  checkpoint,
  activity = [];
const names = { bag: 'Player', trader: 'Trader', lake: 'Lake' };
const message = document.querySelector('#message');
function subscribe() {
  stop?.();
  stop = sim.onInventoryEvent((event) => {
    const lines = event.changes.map((change) => {
      const parts = [];
      for (const id of new Set([
        ...Object.keys(change.added.quantities),
        ...Object.keys(change.removed.quantities),
      ])) {
        const n =
          (change.added.quantities[id] ?? 0) -
          (change.removed.quantities[id] ?? 0);
        if (n)
          parts.push(
            `${n > 0 ? '+' : ''}${n} ${sim.registry.resource(id).label.toLowerCase()}`,
          );
      }
      if (change.updatedItems.length)
        parts.push(`${change.updatedItems.length} item updated`);
      return `${names[change.inventoryId]}: ${parts.join(', ')}`;
    });
    activity.push(lines.join(' · '));
    activity = activity.slice(-20);
  });
}
function render() {
  const stores = document.querySelector('#stores');
  stores.replaceChildren();
  for (const id of ['bag', 'trader', 'lake']) {
    const view = sim.inventory(id).summary(),
      capacity = view.capacity,
      rules = view.rules;
    const card = document.createElement('section');
    card.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = names[id];
    const status = document.createElement('p');
    status.textContent = `${capacity.used} / ${capacity.limit} ${capacity.kind === 'slots' ? 'slots' : 'units'} used`;
    const dimensions = document.createElement('p');
    dimensions.textContent = [
      rules.usedWeight === undefined
        ? ''
        : `Weight ${rules.usedWeight}/${rules.maxWeight}`,
      rules.usedVolume === undefined
        ? ''
        : `Volume ${rules.usedVolume}/${rules.maxVolume}`,
      rules.accepts
        ? `Accepts: ${rules.accepts.map((r) => sim.registry.resource(r).label.toLowerCase()).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' · ');
    const list = document.createElement('ul');
    for (const [resource, n] of Object.entries(view.quantities)) {
      if (n) {
        const row = document.createElement('li');
        row.textContent = `${sim.registry.resource(resource).label}: ${n}`;
        list.append(row);
      }
    }
    card.append(title, status, dimensions, list);
    stores.append(card);
  }
  const log = document.querySelector('#activity');
  log.replaceChildren();
  for (const text of activity.length ? activity : ['No changes yet.']) {
    const li = document.createElement('li');
    li.textContent = text;
    log.append(li);
  }
}
function action(callback) {
  try {
    message.textContent = callback();
  } catch (error) {
    message.textContent = error.message;
  }
  render();
}
document.querySelector('#buy').onclick = () =>
  action(() =>
    buyFood(sim).ok
      ? 'Bought one food for 3 coins.'
      : 'Trade refused: not enough coins, food or room. Nothing changed.',
  );
document.querySelector('#draw').onclick = () =>
  action(() =>
    sim.transfer('lake', 'bag', { water: 5 })
      ? 'Moved 5 water into your bag.'
      : 'Cannot take 5 water: check your slots, weight, volume and the lake supply. Nothing moved.',
  );
document.querySelector('#fill').onclick = () =>
  action(() => {
    const result = fillBucket(sim);
    return result.ok
      ? 'Filled the bucket, preserving its durability. Water and empty bucket were consumed together.'
      : result.reason === 'You need an empty bucket.'
        ? result.reason
        : 'Filling refused: you need an empty bucket, 5 water and room for the full bucket.';
  });
document.querySelector('#eat').onclick = () =>
  action(() =>
    sim.mutateInventory({ inventoryId: 'bag', consume: { food: 1 } }).ok
      ? 'Ate one food.'
      : 'No unreserved food in your bag. Nothing changed.',
  );
document.querySelector('#reject').onclick = () =>
  action(() => {
    const tool = sim.inventory('trader').itemPage({ resourceId: 'tool' })
      .items[0];
    return sim.transferItem('trader', 'lake', tool.id)
      ? 'Moved tool.'
      : 'Refused: the lake inventory accepts only water. The trader keeps the tool.';
  });
document.querySelector('#expand-weight').onclick = () =>
  action(() => {
    const rules = sim.inventory('bag').summary().rules;
    sim.setInventoryRules('bag', {
      maxWeight: rules.maxWeight + 5,
      maxVolume: rules.maxVolume,
    });
    return 'Added 5 weight capacity. Slots and volume still apply.';
  });
document.querySelector('#save').onclick = () =>
  action(() => {
    checkpoint = { state: sim.save(), activity: [...activity] };
    document.querySelector('#restore').disabled = false;
    return 'Saved contents, rules, capacity and event position.';
  });
document.querySelector('#restore').onclick = () =>
  action(() => {
    sim = Simulation.restore(checkpoint.state);
    activity = [...checkpoint.activity];
    subscribe();
    return 'Restored the saved inventory world and its matching activity view.';
  });
document.querySelector('#reset').onclick = () =>
  action(() => {
    sim = createInventoryOperationsDemo();
    checkpoint = undefined;
    activity = [];
    subscribe();
    document.querySelector('#restore').disabled = true;
    return 'Example reset: 5 coins, one empty bucket and a fresh lake.';
  });
sim = createInventoryOperationsDemo();
subscribe();
render();
