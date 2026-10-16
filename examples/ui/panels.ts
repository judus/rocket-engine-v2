import { Panel } from '../../src/ui/index.js';
import { playground } from './Playground.js';
const { app, scene, views, state } = playground();
const tools = new Panel({
  target: '#tools',
  title: 'Controls & form',
  view: views[0]!,
});
const result = tools.message('Try a button or submit the form.');
const nickname = tools.field('Pilot name', {
  name: 'name',
  value: 'Ada',
  required: true,
});
const speed = tools.field('Preferred speed', {
  name: 'speed',
  type: 'number',
  value: '160',
  required: true,
});
const enabled = tools.field('Show notifications', {
  name: 'notifications',
  type: 'checkbox',
  checked: true,
});
tools.append(
  tools.grid([
    tools.button('Mint orb', () => {
      state.color = '#80dbbd';
    }),
    tools.button('Purple orb', () => {
      state.color = '#d29df5';
    }),
    tools.button('Reset orb', () => {
      state.x = 280;
      state.y = 170;
    }),
    tools.button('Count click', () => {
      state.clicks++;
      result.textContent = `${state.clicks} button commands received.`;
    }),
  ]),
  tools.form(
    [nickname, speed, enabled],
    (values) => {
      result.textContent = `Hello ${String(values.get('name'))}. Speed preference: ${String(values.get('speed'))}; notifications ${values.has('notifications') ? 'on' : 'off'}.`;
    },
    'Save preferences',
  ),
  result,
);
const inventory = new Panel({
  target: '#inventory',
  title: 'Cargo & quick slots',
  closable: false,
  view: views[1]!,
});
inventory.append(
  inventory.list([
    'Inspect the cargo table',
    'Pick an item from the grid',
    'Forms use native validation',
  ]),
  inventory.table(
    ['Item', 'Stock', 'Weight'],
    [
      ['Ore', '24', '48 kg'],
      ['Alloy', '8', '16 kg'],
      ['Parts', '3', '6 kg'],
    ],
  ),
  inventory.grid(['🔧 Repair kit', '📡 Scanner', '🧭 Compass', '💡 Lamp']),
  inventory.message('All systems ready.', 'success'),
  inventory.message('Fuel is getting low.', 'warning'),
  inventory.message('Example: destination unavailable.', 'error'),
);
const floating = new Panel({
  target: '#floating-host',
  title: 'Mission note',
  view: views[0]!,
});
floating.append(
  floating.message(
    'A modeless window above the canvas. Close it, then reopen it below.',
  ),
  floating.button('Mark as read', () => {
    floating.close();
  }),
);
const listeners = new AbortController();
scene.own(() => {
  listeners.abort();
});
document.querySelector('#open-tools')!.addEventListener(
  'click',
  () => {
    tools.show();
    tools.focus(nickname.input);
  },
  { signal: listeners.signal },
);
document.querySelector('#open-note')!.addEventListener(
  'click',
  () => {
    floating.show();
    floating.focus();
  },
  { signal: listeners.signal },
);
document
  .querySelector<HTMLButtonElement>('#close-first-view')!
  .addEventListener(
    'click',
    (event) => {
      views[0]!.dispose();
      (event.currentTarget as HTMLButtonElement).disabled = true;
      document.querySelector<HTMLButtonElement>('#open-tools')!.disabled = true;
      document.querySelector<HTMLButtonElement>('#open-note')!.disabled = true;
      document.querySelector('#lifecycle-status')!.textContent =
        'First view and its two panels disposed. The second view still observes the same simulation.';
    },
    { signal: listeners.signal },
  );
void app.start();
