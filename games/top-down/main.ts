import { createApp } from '../../src/experimental/index.js';
import { TopDownWorld } from './TopDownPhysics.js';
import { Explorer, SupplyPatrol } from './Explorer.js';
import { SupplyPickup } from './Pickups.js';
import { courtyard, scoutRoute } from './level.js';

const world = new TopDownWorld(courtyard);
const pickups: SupplyPickup[] = [];
const bags = document.querySelector<HTMLOutputElement>('#bags')!;
const feedback = document.querySelector<HTMLOutputElement>('#feedback')!;
const messages = {
  idle: 'Press F or Collect nearby to pick up a supply cell.',
  collected: 'Supply collected.',
  nothing: 'No reachable supplies nearby.',
  full: 'Bag full — the supply stays in the world.',
};
const app = createApp({
  target: '#game',
  width: 960,
  height: 540,
  runtime: { fixed: { step: 1 / 60, maxSteps: 8 } },
  fixedUpdate(): undefined {
    player.movement.move(
      Number(controls.fixed.down('east')) - Number(controls.fixed.down('west')),
      Number(controls.fixed.down('south')) -
        Number(controls.fixed.down('north')),
      controls.fixed.down('run'),
    );
    if (controls.fixed.pressed('interact')) player.interaction.request();
  },
  update(): undefined {
    bags.value = `YOU · ${player.inventory.count('cell')}/${player.inventory.capacity} cells · ${player.body.width}×${player.body.height} body | SCOUT · ${scout ? `${scout.inventory.count('cell')}/${scout.inventory.capacity} cells · ${scout.body.width}×${scout.body.height} body` : 'removed'} | Supplies remaining: ${pickups.filter((p) => !p.disposed).length}`;
    const message = messages[player.interaction.result];
    if (feedback.value !== message) feedback.value = message;
  },
  render(ctx): undefined {
    ctx.fillStyle = '#122936';
    ctx.fillRect(0, 0, 960, 540);
    ctx.strokeStyle = '#1c3844';
    ctx.lineWidth = 1;
    for (let x = 24; x < 960; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 76);
      ctx.lineTo(x, 516);
      ctx.stroke();
    }
    for (let y = 76; y < 540; y += 40) {
      ctx.beginPath();
      ctx.moveTo(24, y);
      ctx.lineTo(936, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#426274';
    ctx.strokeRect(24, 76, 912, 440);
    for (const p of world.obstacles) {
      ctx.fillStyle = '#08191f';
      ctx.fillRect(p.x + 6, p.y + 7, p.width, p.height);
      ctx.fillStyle = '#304e5c';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      ctx.fillStyle = '#4b6f7d';
      ctx.fillRect(p.x, p.y, p.width, 6);
      ctx.strokeStyle = '#678390';
      ctx.strokeRect(p.x + 7, p.y + 12, p.width - 14, p.height - 21);
    }
    ctx.fillStyle = '#c1d6dd';
    ctx.font = '18px system-ui';
    ctx.fillText('SALVAGE COURTYARD', 28, 40);
    ctx.font = '14px system-ui';
    ctx.fillStyle = '#8ce4cf';
    ctx.fillText('YOU', player.x - 13, player.y - player.body.height / 2 - 12);
    if (scout) {
      ctx.fillStyle = '#efbe78';
      ctx.fillText('SCOUT', scout.x - 22, scout.y - scout.body.height / 2 - 12);
    }
    ctx.strokeStyle = '#8ce4cf44';
    ctx.setLineDash([3, 7]);
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.interaction.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  },
});
const stage = app.stage;
const player = stage.entity(
  () =>
    new Explorer({
      x: 80,
      y: 420,
      color: '#8ce4cf',
      world,
      pickups: () => pickups,
      capacity: 6,
    }),
  { id: 'player', tags: ['actor'] },
);
for (const [x, y] of [
  [140, 420],
  [280, 430],
  [650, 420],
  [810, 425],
  [245, 130],
  [600, 130],
  [810, 130],
  [330, 355],
])
  pickups.push(
    stage.entity(() => new SupplyPickup({ x: x!, y: y! }), {
      tags: ['supply'],
    }),
  );
let scout: Explorer | null = createScout();
function createScout(): Explorer {
  const actor = stage.entity(
    () =>
      new Explorer({
        x: 200,
        y: 130,
        color: '#efbe78',
        world,
        pickups: () => pickups,
        width: 34,
        height: 30,
        speed: 110,
        runSpeed: 170,
        capacity: 3,
      }),
    { id: 'scout', tags: ['actor'] },
  );
  actor.attach(new SupplyPatrol(actor.movement, actor.interaction, scoutRoute));
  return actor;
}
const controls = app.input(stage, {
  west: ['KeyA', 'ArrowLeft'],
  east: ['KeyD', 'ArrowRight'],
  north: ['KeyW', 'ArrowUp'],
  south: ['KeyS', 'ArrowDown'],
  run: ['ShiftLeft', 'ShiftRight'],
  interact: 'KeyF',
});
document.querySelector<HTMLButtonElement>('#collect')!.onclick = () => {
  player.interaction.request();
  app.view.canvas.focus();
};
document.querySelector<HTMLButtonElement>('#scout')!.onclick = (event) => {
  if (scout) {
    scout.dispose();
    scout = null;
  } else scout = createScout();
  (event.currentTarget as HTMLButtonElement).textContent = scout
    ? 'Remove scout'
    : 'Create scout';
};
document.querySelector<HTMLButtonElement>('#reset')!.onclick = () =>
  location.reload();
await app.ready;
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
