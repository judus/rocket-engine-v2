import type { ActionMapping, InputButton } from '../../src/index.js';
import {
  Rocket,
  Scene2D,
  Input,
  firstPersonInput,
  topDownInput,
  platformerInput,
  beltScrollerInput,
  flightInput,
} from '../../src/index.js';
import {
  CanvasRenderer3D,
  PerspectiveCamera,
  Node3D,
  Mesh3D,
} from '../../src/3d/index.js';
import { FlightDemo, createFlightDrawing } from './FlightDemo.js';
import { BeltScrollerDemo, drawBeltScroller } from './BeltScrollerDemo.js';
import { PlatformerDemo, platformerBlocks } from './PlatformerDemo.js';
import { cubeGeometry, cubeMaterials } from '../3d/CubeGeometry.js';

function describe(mapping: ActionMapping): string {
  if (typeof mapping === 'string') return mapping;
  if (Array.isArray(mapping))
    return mapping.map((item: InputButton) => describe(item)).join(' / ');
  if ('pointer' in mapping)
    return `Mouse Δ${mapping.pointer.toUpperCase()} × ${mapping.scale ?? 1}`;
  if ('negative' in mapping)
    return `${describe(mapping.negative)} (−) / ${describe(mapping.positive)} (+)`;
  const chord = mapping as { code: string; modifiers: readonly string[] };
  return [...chord.modifiers, chord.code].join(' + ');
}

const flight = document.body.dataset.inputDemo === 'flight';
const beltScroller = document.body.dataset.inputDemo === 'belt-scroller';
const platformer = document.body.dataset.inputDemo === 'platformer';
const firstPerson = document.body.dataset.inputDemo === 'first-person';
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>(`#${id}`)!;
const captureMode = document.querySelector<HTMLInputElement>('#capture-mode')!;
const ui = document.querySelector<HTMLElement>('#ui-panel')!;
const status = document.querySelector<HTMLOutputElement>('#demo-status')!;
const instructions = document.querySelector<HTMLElement>('#instructions')!;
instructions.textContent = flight
  ? 'W/S: forward/back · A/D: strafe · Left Alt/Ctrl: local up/down · Space/Left mouse: fire · Arrows: yaw/pitch · Q/E: roll · Shift: boost · Ctrl+R: reset. Optional mouse capture: pitch/yaw.'
  : firstPerson
    ? 'WASD: move relative to facing · Mouse/Arrows: look · Shift: sprint · Ctrl: crouch · Space: jump · R: reload · Left mouse: fire · Ctrl+R: reset.'
    : platformer
      ? 'A/D or ←/→: walk west/east · Shift: run · Space/↑: jump · Right Ctrl/Left mouse: attack · Ctrl+R: reset · Reach the flag. No north/south movement.'
      : beltScroller
        ? 'WASD or arrows: ground movement · Shift: run · Space: jump · Right Ctrl/Left mouse: attack preview · Ctrl+R: reset. Walk east through the street.'
        : 'W/S: north/south · A/D: west/east (arrows also work) · Shift: sprint · Space: fire · Left mouse: unbound · Ctrl+R: reset.';
instructions.textContent +=
  ' · F: interact · Tab: health/consumables action preview.';
document.querySelector<HTMLElement>('#capture-option')!.hidden = !(
  firstPerson || flight
);
let current: Rocket | undefined;
async function start() {
  button('restart').disabled = true;
  await current?.dispose();
  ui.hidden = true;
  const app = new Rocket({
    ...(platformer || beltScroller ? { fixed: {} } : {}),
    onError: (error) => {
      status.textContent = String(error);
    },
  });
  current = app;
  const camera = new PerspectiveCamera();
  camera.y = 1.7;
  camera.z = -8;
  camera.far = 100;
  const craft = new FlightDemo();
  const drawFlight = createFlightDrawing();
  const platform = new PlatformerDemo();
  const belt = new BeltScrollerDemo();
  const player = { x: 480, y: 270 },
    events: string[] = [];
  let time = 0,
    reloads = 0,
    attacks = 0,
    lastAttack = -1,
    interactions = 0,
    healthActions = 0,
    shots = 0,
    jump = 0,
    verticalSpeed = 0,
    lastFire = 0,
    remapped = false;
  const reset = () => {
    craft.reset();
    platform.reset();
    belt.reset();
    attacks = 0;
    interactions = healthActions = shots = 0;
    lastAttack = -1;
    player.x = 480;
    player.y = 270;
    camera.x = 0;
    camera.z = -8;
    camera.yaw = 0;
    camera.pitch = 0;
    jump = verticalSpeed = 0;
  };
  const renderer = new CanvasRenderer3D(),
    root = new Node3D('input landmarks');
  for (let i = 0; i < 9; i++) {
    const node = new Node3D(`landmark ${i}`);
    node.mesh = new Mesh3D(cubeGeometry, cubeMaterials);
    node.transform = {
      ...node.transform,
      position: { x: ((i % 3) - 1) * 6, y: 1, z: Math.floor(i / 3) * 8 + 6 },
    };
    root.add(node);
  }
  const scene = app.scene(
    new Scene2D({
      ...(platformer || beltScroller
        ? {
            fixedUpdate(dt: number) {
              if (beltScroller) {
                belt.step(
                  dt,
                  controls.value('horizontal'),
                  controls.value('depth'),
                  controls.value('sprint') !== 0,
                );
                return;
              }
              platform.step(
                dt,
                controls.value('horizontal'),
                controls.value('sprint') !== 0,
              );
            },
          }
        : {}),
      update(dt) {
        time += dt;
        const speed =
          (flight ? 0 : controls.value('sprint') ? 7 : 3) *
          (firstPerson && controls.value('crouch') ? 0.4 : 1);
        if (flight) {
          craft.step(dt, {
            forward: controls.value('forward'),
            right: controls.value('right'),
            up: controls.value('up'),
            yaw: controls.value('yaw'),
            pitch: controls.value('pitch'),
            roll: controls.value('roll'),
            lookX: controls.value('lookX'),
            lookY: controls.value('lookY'),
            boost: controls.value('boost') !== 0,
          });
        } else if (firstPerson) {
          const forward = controls.value('forward'),
            right = controls.value('right'),
            length = Math.max(1, Math.hypot(forward, right));
          camera.yaw +=
            controls.value('lookX') + controls.value('turn') * dt * 1.5;
          camera.pitch = Math.max(
            -1.3,
            Math.min(
              1.3,
              camera.pitch -
                controls.value('lookY') +
                controls.value('tilt') * dt,
            ),
          );
          camera.x +=
            ((Math.sin(camera.yaw) * forward + Math.cos(camera.yaw) * right) *
              speed *
              dt) /
            length;
          camera.z +=
            ((Math.cos(camera.yaw) * forward - Math.sin(camera.yaw) * right) *
              speed *
              dt) /
            length;
          verticalSpeed -= 9.8 * dt;
          jump = Math.max(0, jump + verticalSpeed * dt);
          if (jump === 0) verticalSpeed = 0;
          camera.y = (controls.value('crouch') ? 0.95 : 1.7) + jump;
        } else if (!platformer && !beltScroller) {
          const east = controls.value('east'),
            north = controls.value('north'),
            length = Math.max(1, Math.hypot(east, north));
          player.x = Math.max(
            16,
            Math.min(944, player.x + (east * speed * 35 * dt) / length),
          );
          player.y = Math.max(
            16,
            Math.min(524, player.y - (north * speed * 35 * dt) / length),
          );
        }
        if (
          !platformer &&
          !beltScroller &&
          controls.value('fire') &&
          time - lastFire > 0.15
        ) {
          shots++;
          lastFire = time;
        }
        const position = flight
          ? `X ${craft.position.x.toFixed(2)} Y ${craft.position.y.toFixed(2)} Z ${craft.position.z.toFixed(2)} · speed ${craft.speed.toFixed(2)} · forward ${craft.forward.x.toFixed(2)},${craft.forward.y.toFixed(2)},${craft.forward.z.toFixed(2)} · up ${craft.up.x.toFixed(2)},${craft.up.y.toFixed(2)},${craft.up.z.toFixed(2)}`
          : firstPerson
            ? `X ${camera.x.toFixed(2)} Z ${camera.z.toFixed(2)} heading ${((camera.yaw * 180) / Math.PI).toFixed(1)}°`
            : platformer
              ? `X ${platform.x.toFixed(1)} height ${(480 - platform.y).toFixed(1)} · ${platform.grounded ? 'grounded' : 'airborne'}${platform.x > 2290 ? ' · FLAG REACHED!' : ''}`
              : beltScroller
                ? `X ${belt.x.toFixed(1)} · ground depth ${belt.depth.toFixed(1)} · jump height ${belt.height.toFixed(1)} · ${belt.grounded ? 'grounded' : 'airborne'}${belt.x > 2290 ? ' · STREET COMPLETE!' : ''}`
                : `X ${player.x.toFixed(1)} Y ${player.y.toFixed(1)}`;
        const counters = ` · interactions ${interactions} · health/consumables ${healthActions}${platformer || beltScroller ? ` · attacks ${attacks}` : ` · shots ${shots}`}${firstPerson ? ` · reloads ${reloads}` : ''}`;
        status.textContent = `World time ${time.toFixed(1)} s · ${position}${counters} · ${controls.enabled ? 'game context' : 'UI context'}`;
        for (const name of controls.names)
          document.querySelector<HTMLElement>(
            `[data-value="${name}"]`,
          )!.textContent = controls.value(name).toFixed(3);
      },
      draw(ctx) {
        ctx.fillStyle = '#081420';
        ctx.fillRect(0, 0, 960, 540);
        if (flight) {
          drawFlight(ctx, craft);
          if (controls.value('fire')) {
            ctx.strokeStyle = '#ffc077';
            ctx.beginPath();
            ctx.arc(480, 270, 16, 0, Math.PI * 2);
            ctx.stroke();
          }
        } else if (firstPerson) {
          for (let x = -30; x <= 30; x += 3)
            renderer.line(
              ctx,
              camera,
              960,
              540,
              { x, y: 0, z: -30 },
              { x, y: 0, z: 60 },
              '#284553',
            );
          for (let z = -30; z <= 60; z += 3)
            renderer.line(
              ctx,
              camera,
              960,
              540,
              { x: -30, y: 0, z },
              { x: 30, y: 0, z },
              '#284553',
            );
          renderer.render(ctx, root, camera, 960, 540, {
            color: '#a1e3d0',
            width: 1,
          });
          ctx.strokeStyle = controls.value('fire') ? '#ffc077' : '#a1e3d0';
          ctx.beginPath();
          ctx.moveTo(472, 270);
          ctx.lineTo(488, 270);
          ctx.moveTo(480, 262);
          ctx.lineTo(480, 278);
          ctx.stroke();
        } else if (beltScroller) {
          drawBeltScroller(ctx, belt, time - lastAttack < 0.22);
        } else if (platformer) {
          const scroll = Math.max(0, Math.min(1440, platform.x - 320));
          ctx.fillStyle = '#152a3b';
          for (let x = -scroll % 120; x < 960; x += 120)
            ctx.fillRect(x, 70, 1, 410);
          ctx.save();
          ctx.translate(-scroll, 0);
          for (const block of platformerBlocks) {
            ctx.fillStyle = '#294658';
            ctx.fillRect(block.x, block.y, block.width, block.height);
            ctx.fillStyle = '#80dbbd';
            ctx.fillRect(block.x, block.y, block.width, 4);
          }
          ctx.fillStyle = '#d3dce5';
          ctx.fillRect(2320, 345, 4, 135);
          ctx.fillStyle = '#ffc077';
          ctx.fillRect(2324, 345, 50, 30);
          ctx.fillStyle = '#80dbbd';
          ctx.fillRect(platform.x - 12, platform.y - 32, 24, 32);
          ctx.fillStyle = '#081420';
          ctx.fillRect(
            platform.x + platform.facing * 5 - 2,
            platform.y - 25,
            4,
            5,
          );
          if (time - lastAttack < 0.22) {
            ctx.strokeStyle = '#ffc077';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(
              platform.x + platform.facing * 14,
              platform.y - 18,
              22,
              0,
              Math.PI * 2,
            );
            ctx.stroke();
          }
          ctx.restore();
          ctx.font = '16px monospace';
          ctx.fillStyle = '#c3d9e5';
          ctx.fillText('WEST ←    SIDE VIEW    → EAST', 24, 36);
          ctx.fillText(
            'Jump onto the ledges · Shift to run · Reach the flag →',
            24,
            62,
          );
        } else {
          ctx.strokeStyle = '#203849';
          ctx.lineWidth = 1;
          for (let x = 0; x < 960; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 540);
            ctx.stroke();
          }
          for (let y = 0; y < 540; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(960, y);
            ctx.stroke();
          }
          ctx.fillStyle = '#8199af';
          ctx.font = '16px monospace';
          ctx.fillText('NORTH ↑', 435, 28);
          ctx.fillText('EAST →', 850, 276);
          for (const [x, y] of [
            [200, 150],
            [750, 390],
            [720, 120],
          ]) {
            ctx.fillStyle = '#38566b';
            ctx.fillRect(x!, y!, 45, 45);
          }
          ctx.fillStyle = controls.value('fire') ? '#ffc077' : '#80dbbd';
          ctx.beginPath();
          ctx.arc(player.x, player.y, 13, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#c3d9e5';
        ctx.fillRect(24, 510, ((Math.sin(time * 2) + 1) / 2) * 130 + 8, 5);
      },
    }),
  );
  const preset = flight
    ? flightInput
    : firstPerson
      ? firstPersonInput
      : platformer
        ? platformerInput
        : beltScroller
          ? beltScrollerInput
          : topDownInput;
  const controls = app.use(Input).actions(scene).use(preset);
  for (const name of controls.names)
    controls.on(name, (event) => {
      const kind = preset.actions[name]!.kind;
      if (kind !== 'axis') {
        events.unshift(
          `${name}: ${event.value ? 'start' : 'end'}${event.cancelled ? ' (cancelled)' : ''}`,
        );
        events.length = Math.min(events.length, 10);
        document.querySelector<HTMLElement>('#event-log')!.textContent =
          events.join('\n');
      }
      if (name === 'fire' && event.value) {
        shots++;
        lastFire = time;
      }
      if (name === 'attack') {
        attacks++;
        lastAttack = time;
      }
      if (name === 'reload') reloads++;
      if (name === 'interact') interactions++;
      if (name === 'health') healthActions++;
      if (name === 'reset') reset();
      if (name === 'jump') {
        if (beltScroller) belt.requestJump();
        else if (platformer) platform.requestJump();
        else if (!jump) verticalSpeed = 4.5;
      }
    });
  const tbody = document.querySelector<HTMLElement>('#action-values')!;
  tbody.replaceChildren();
  for (const name of controls.names) {
    const row = document.createElement('tr');
    for (const text of [
      name,
      preset.actions[name]!.kind,
      describe(preset.actions[name]!.mapping),
      '0.000',
    ]) {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.append(cell);
    }
    (row.children[2] as HTMLElement).dataset.mapping = name;
    (row.lastElementChild as HTMLElement).dataset.value = name;
    tbody.append(row);
  }
  document.querySelector<HTMLElement>('#event-log')!.textContent =
    'No events yet';
  const view = app.view({
    target: '#input-viewport',
    scene,
    width: 960,
    height: 540,
  });
  view.canvas.setAttribute(
    'aria-label',
    flight
      ? 'Free-flight input playground'
      : firstPerson
        ? 'First-person input playground'
        : platformer
          ? 'Platformer input playground'
          : beltScroller
            ? 'Belt-scroller input playground'
            : 'Top-down input playground',
  );
  controls.bind(view, {
    capture:
      (firstPerson || flight) && captureMode.checked ? 'pointer-lock' : 'focus',
  });
  const eventController = new AbortController();
  scene.own(() => {
    eventController.abort();
    return undefined;
  });
  const signal = eventController.signal;
  const close = () => {
    ui.hidden = true;
    controls.setEnabled(true);
    controls.activate();
  };
  button('ui-toggle').addEventListener(
    'click',
    () => {
      if (ui.hidden) {
        controls.setEnabled(false);
        ui.hidden = false;
        document.querySelector<HTMLInputElement>('#ui-text')!.focus();
      } else close();
    },
    { signal },
  );
  button('ui-close').addEventListener('click', close, { signal });
  const remapName = flight
    ? 'boost'
    : firstPerson
      ? 'reload'
      : platformer || beltScroller
        ? 'jump'
        : 'interact';
  const defaultMapping = preset.actions[remapName]!.mapping;
  button('remap').textContent = `Remap ${remapName} to G`;
  button('remap').addEventListener(
    'click',
    () => {
      remapped = !remapped;
      controls.map(remapName, remapped ? 'KeyG' : defaultMapping);
      document.querySelector<HTMLElement>(
        `[data-mapping="${remapName}"]`,
      )!.textContent = remapped ? 'KeyG' : describe(defaultMapping);
      button('remap').textContent = remapped
        ? 'Restore default binding'
        : `Remap ${remapName} to G`;
    },
    { signal },
  );
  await app.start();
  button('restart').disabled = false;
}
button('restart').addEventListener('click', () => {
  void start();
});
captureMode.addEventListener('change', () => {
  void start();
});
window.addEventListener(
  'pagehide',
  () => {
    void current?.dispose();
  },
  { once: true },
);
await start();
