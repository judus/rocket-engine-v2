import { Simulation } from '../../dist/vendor/production-workshop-2.4.0/index.js';
import {
  createInventoryContextDemo,
  advanceFreshness,
} from './inventory-context-demo.js';
let sim = createInventoryContextDemo(),
  checkpoint;
const message = document.querySelector('#message');
function render() {
  const stores = document.querySelector('#stores');
  stores.replaceChildren();
  for (const id of ['bag', 'fridge', 'hand', 'head']) {
    const view = sim.inventory(id),
      state = view.snapshot();
    const card = document.createElement('section');
    card.className = 'panel';
    const title = document.createElement('h2');
    title.textContent = state.metadata.label;
    const description = document.createElement('p');
    description.textContent = state.equipment
      ? `Equipment · accepts ${state.equipment.accepts.join(', ')} · ${state.items.length}/1`
      : `${state.capacity.used}/${state.capacity.limit} slots`;
    const modifiers = document.createElement('p');
    modifiers.textContent = Object.entries(state.modifiers ?? {})
      .map(([key, n]) => `${key} × ${n}`)
      .join(' · ');
    const list = document.createElement('ul');
    for (const item of state.items) {
      const li = document.createElement('li'),
        effective = view.effectiveItemAttributes(item.id);
      const values = Object.entries(item.attributes).map(
        ([key, n]) =>
          `${key}: ${Number(effective[key].toFixed(2))}${effective[key] === n ? '' : ` (base ${n})`}`,
      );
      li.textContent = `${sim.registry.resource(item.resourceId).label} · ${values.join(' · ')}`;
      list.append(li);
    }
    if (!state.items.length) {
      const li = document.createElement('li');
      li.textContent = 'Empty';
      list.append(li);
    }
    card.append(title, description, modifiers, list);
    stores.append(card);
  }
}
function action(fn) {
  try {
    message.textContent = fn();
  } catch (error) {
    message.textContent = error.message;
  }
  render();
}
const first = (id, resource) =>
  sim.inventory(id).itemPage({ resourceId: resource, limit: 1 }).items[0];
document.querySelector('#move-apple').onclick = () =>
  action(() => {
    const from = first('bag', 'apple') ? 'bag' : 'fridge',
      into = from === 'bag' ? 'fridge' : 'bag';
    const item = first(from, 'apple');
    return sim.transferItem(from, into, item.id)
      ? `Moved apple to ${into}. Its base decay rate is still 1.`
      : 'Destination is full. Apple stayed where it was.';
  });
document.querySelector('#wait').onclick = () =>
  action(() => {
    advanceFreshness(sim, 10);
    return '10 simulation seconds passed. Food used the rate of its current inventory.';
  });
document.querySelector('#cool').onclick = () =>
  action(() => {
    const cold = sim.inventory('fridge').summary().modifiers.decay === 0.1;
    sim.setInventoryModifiers('fridge', { decay: cold ? 1 : 0.1 });
    return cold
      ? 'Cooling off: normal decay.'
      : 'Cooling on: decay at one tenth of its base rate.';
  });
document.querySelector('#equip-sword').onclick = () =>
  action(() => {
    const item = first('bag', 'sword');
    return item && sim.equipItem('bag', 'hand', item.id).ok
      ? 'Sword equipped; previous sword returned to bag.'
      : 'No sword available, or swap refused. Nothing moved.';
  });
document.querySelector('#equip-hat').onclick = () =>
  action(() => {
    const item = first('bag', 'hat');
    return item && sim.equipItem('bag', 'head', item.id).ok
      ? 'Hat equipped.'
      : 'No available hat in the bag.';
  });
document.querySelector('#wrong-slot').onclick = () =>
  action(() => {
    const from = first('bag', 'hat') ? 'bag' : 'head',
      item = first(from, 'hat');
    return sim.equipItem(from, 'hand', item.id).ok
      ? 'Hat equipped.'
      : 'Refused: the hand accepts swords. Hat and sword stay put.';
  });
document.querySelector('#unequip').onclick = () =>
  action(() =>
    sim.unequipItem('hand', 'bag').ok
      ? 'Hand item returned to bag (or hand was already empty).'
      : 'Bag cannot accept the item. Nothing moved.',
  );
document.querySelector('#rename').onclick = () =>
  action(() => {
    const old = sim.inventory('bag').summary().metadata;
    sim.setInventoryMetadata('bag', {
      ...old,
      label: old.label === 'Travel bag' ? 'Julien’s bag' : 'Travel bag',
    });
    return 'Updated descriptive metadata. Contents and modifiers are unchanged.';
  });
document.querySelector('#save').onclick = () =>
  action(() => {
    checkpoint = sim.save();
    document.querySelector('#restore').disabled = false;
    return 'Saved equipment, item attributes, inventory modifiers and metadata.';
  });
document.querySelector('#restore').onclick = () =>
  action(() => {
    sim = Simulation.restore(checkpoint);
    return 'Restored checkpoint.';
  });
document.querySelector('#reset').onclick = () =>
  action(() => {
    sim = createInventoryContextDemo();
    checkpoint = undefined;
    document.querySelector('#restore').disabled = true;
    return 'Example reset.';
  });
render();
