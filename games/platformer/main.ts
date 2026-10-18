import { createApp, followCamera } from '../../src/experimental/index.js';
import {
  platformerBlocks,
  platformerWorld,
} from '../../examples/input/PlatformerDemo.js';
import { PlatformerSolver } from './PlatformerPhysics.js';
import { Runner, Patrol } from './Runner.js';

const status = document.querySelector<HTMLOutputElement>('#status')!;
const app = createApp({
  target: '#game',
  width: 960,
  height: 540,
  runtime: { fixed: { step: 1 / 60, maxSteps: 8 } },
  fixedUpdate(): undefined {
    hero.movement.move(
      Number(controls.fixed.down('right')) -
        Number(controls.fixed.down('left')),
      controls.fixed.down('run'),
    );
    if (controls.fixed.pressed('jump')) hero.movement.jump();
  },
  update(dt): undefined {
    followCamera(app.view, hero, dt, {
      halfLife: 0.12,
      bounds: { x: 0, y: 0, width: 2400, height: 540 },
    });
    status.value = `Player ${hero.body.width}×${hero.body.height}: ${hero.travel.distance.toFixed(0)} px travelled · ${hero.body.grounded ? 'grounded' : 'airborne'} · ${hero.body.steps} fixed steps | Courier: ${courier ? `${courier.body.width}×${courier.body.height} · ${courier.body.steps} steps` : 'removed — no updates'}`;
  },
  render(ctx): undefined {
    ctx.fillStyle = '#102735';
    ctx.fillRect(0, 0, 2400, 540);
    ctx.fillStyle = '#173b49';
    for (let x = 0; x < 2400; x += 120)
      ctx.fillRect(x, 170 + (x % 240), 90, 310);
    for (const block of platformerBlocks) {
      ctx.fillStyle = '#254653';
      ctx.fillRect(block.x, block.y, block.width, block.height);
      ctx.fillStyle = '#65cfb0';
      ctx.fillRect(block.x, block.y, block.width, 4);
    }
    ctx.fillStyle = '#9cb9c2';
    ctx.font = '16px system-ui';
    ctx.fillText('YOU', hero.x - 15, hero.y - hero.body.height - 14);
    if (courier)
      ctx.fillText('AI', courier.x - 8, courier.y - courier.body.height - 14);
  },
});
const stage = app.stage;
const solver = stage
  .layer('world')
  .attach(new PlatformerSolver(platformerWorld));
stage.addLayer('hud', { space: 'screen' });
stage.add({
  layer: 'hud',
  draw(ctx): undefined {
    ctx.fillStyle = '#9cb9c2';
    ctx.font = '16px system-ui';
    ctx.fillText('One movement capability. Two different controllers.', 28, 44);
  },
});
const hero = stage.entity(
  () =>
    new Runner({
      x: 80,
      color: '#8ce4cf',
      solver,
      width: 24,
      height: 32,
      movement: { speed: 180, runSpeed: 300, jumpSpeed: 600 },
    }),
  {
    id: 'player',
    tags: ['actor'],
  },
);
let courier: Runner | null = createCourier();
function createCourier(): Runner {
  const runner = stage.entity(
    () =>
      new Runner({
        x: 180,
        color: '#efbe78',
        solver,
        width: 40,
        height: 48,
        movement: { speed: 150, runSpeed: 240, jumpSpeed: 650 },
      }),
    {
      id: 'courier',
      tags: ['actor'],
    },
  );
  runner.attach(new Patrol(runner.movement));
  return runner;
}
const controls = app.input(stage, {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space', 'ArrowUp'],
  run: ['ShiftLeft', 'ShiftRight'],
});
document.querySelector<HTMLButtonElement>('#courier')!.onclick = (event) => {
  if (courier) {
    courier.dispose();
    courier = null;
  } else courier = createCourier();
  (event.currentTarget as HTMLButtonElement).textContent = courier
    ? 'Remove courier'
    : 'Create courier';
};
await app.ready;
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
