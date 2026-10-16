import { Rocket, Scene2D, Input } from '../../src/index.js';
import type { Node2D } from '../../src/index.js';
import { PhysicsWorld } from '../../src/physics/matter.js';
import type { PhysicsBody } from '../../src/physics/matter.js';
import { createBodyNode } from './createBodyNode.js';
import { createBoxController } from './createBoxController.js';

function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const match = document.querySelector(selector);
  if (!(match instanceof kind)) throw new Error(`Missing ${selector}`);
  return match;
}
const status = element('#physics-status', HTMLOutputElement);
const cleanup = element('#physics-cleanup', HTMLParagraphElement);
const spawn = element('#physics-spawn', HTMLButtonElement);
const remove = element('#physics-remove', HTMLButtonElement);
const reset = element('#physics-reset', HTMLButtonElement);
const hide = element('#physics-hide', HTMLButtonElement);
const sensorButton = element('#physics-sensor', HTMLButtonElement);
let app: Rocket | undefined;
let previous: PhysicsWorld | undefined;
let cleaned = 0;

async function start() {
  for (const button of [spawn, remove, reset, hide, sensorButton])
    button.disabled = true;
  await app?.dispose();
  if (previous) {
    const old = previous.stats;
    cleanup.textContent = `${cleaned} body nodes cleaned · previous world: ${old.bodies} bodies / ${old.contacts} contacts / ${old.listeners} listeners`;
  }
  const application = new Rocket({
    fixed: {},
    onError(error) {
      status.textContent = String(error);
    },
  });
  app = application;
  const input = application.use(Input);
  const world = new PhysicsWorld();
  previous = world;
  const boxes: { body: PhysicsBody; node: Node2D }[] = [];
  const inside = new Set<number>();
  let sensorEntries = 0,
    last = 'No contacts yet',
    spawnIndex = 0;
  const scene = application.scene(
    new Scene2D({
      fixedUpdate(dt) {
        controller.update();
        world.step(dt);
      },
      update() {
        const stats = world.stats;
        const text = `${stats.dynamic} boxes · ${inside.size} inside sensor · ${sensorEntries} sensor entries`;
        if (status.textContent !== text) status.textContent = text;
        const label = `Physics diagnostics: ${stats.bodies} bodies, ${stats.listeners} listeners, ${inside.size} inside sensor, ${sensorEntries} entries, ${controller.boosts} boosts`;
        if (diagnostic.canvas.getAttribute('aria-label') !== label)
          diagnostic.canvas.setAttribute('aria-label', label);
      },
    }),
  );
  scene.own(world);
  const controls = scene.own(
    input.scope(scene, {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      boost: 'Space',
    }),
  );
  const add = (body: PhysicsBody, color?: string) => {
    const node = scene.root.add(
      createBodyNode(
        body,
        () => {
          cleaned++;
        },
        color,
      ),
    );
    return node;
  };
  add(world.rectangle(320, 342, 620, 24, 'static'));
  add(world.rectangle(190, 250, 140, 18, 'static'));
  add(world.rectangle(460, 290, 130, 18, 'static'));
  const sensor = world.rectangle(320, 165, 560, 55, 'sensor');
  const sensorNode = add(sensor);
  scene.own(
    world.onContact(sensor, (event) => {
      const other = event.a === sensor ? event.b : event.a;
      if (other.kind !== 'dynamic') return;
      if (event.phase === 'begin') {
        inside.add(other.id);
        sensorEntries++;
      } else inside.delete(other.id);
      last = `${event.phase} ${other.id} · ${event.reason} · post-solver`;
    }),
  );
  const spawnBox = () => {
    const body = world.rectangle(110 + (spawnIndex++ % 6) * 80, 35, 28, 28);
    boxes.push({ body, node: add(body) });
  };
  for (let i = 0; i < 5; i++) spawnBox();
  const player = world.rectangle(530, 35, 28, 28);
  boxes.push({ body: player, node: add(player, '#8ab9ff') });
  const controller = createBoxController(player, controls.fixed);
  const view = application.view({
    target: '#physics-world',
    scene,
    width: 640,
    height: 360,
  });
  view.canvas.setAttribute(
    'aria-label',
    'Physics world: click to focus, A/D or arrows to move blue box, Space to boost',
  );
  controls.bind(view);
  const diagnostic = application.view({
    target: '#physics-diagnostics',
    width: 640,
    height: 360,
    scene: application.scene({
      draw(ctx) {
        const stats = world.stats;
        ctx.fillStyle = '#c6d5e6';
        ctx.font = '15px monospace';
        for (const [index, text] of [
          'Optional Matter service · fixed clock: 60 Hz',
          `${stats.bodies} bodies · ${stats.dynamic} dynamic · ${stats.sensors} sensors`,
          `${stats.contacts} active contacts · ${stats.listeners} listeners`,
          `${stats.steps} solver steps · ${stats.begins} begins / ${stats.ends} ends`,
          `${inside.size} in sensor · ${sensorEntries} total entries`,
          `Last: ${last}`,
          `Boost edges: ${controller.boosts} · player: ${player.disposed ? 'removed' : 'blue'}`,
          `World view: ${view.camera.x ? 'offscreen; simulation still runs' : 'visible'}`,
          'Input → physics → contacts → node sync → draw',
        ].entries())
          ctx.fillText(text, 16, 30 + index * 34);
      },
    }),
  });
  spawn.onclick = () => {
    if (world.stats.dynamic < 40) spawnBox();
  };
  remove.onclick = () => {
    const box = boxes.find((entry) => !entry.body.disposed);
    box?.node.dispose();
  };
  sensorButton.onclick = () => {
    sensorNode.dispose();
    inside.clear();
    sensorButton.disabled = true;
  };
  hide.onclick = () => {
    view.camera.x = view.camera.x ? 0 : 2000;
    hide.textContent = view.camera.x
      ? 'Show world artwork'
      : 'Hide world artwork';
  };
  hide.textContent = 'Hide world artwork';
  await application.start();
  for (const button of [spawn, remove, reset, hide, sensorButton])
    button.disabled = false;
}
reset.addEventListener('click', () => {
  void start().catch(showError);
});
function showError(error: unknown) {
  status.textContent = String(error);
  reset.disabled = false;
}
await start().catch(showError);
