import type { ActionMapping, InputButton } from '../../src/index.js';
import {
  Rocket,
  Scene2D,
  Input,
  firstPersonInput,
  topDownInput,
} from '../../src/index.js';
import {
  CanvasRenderer3D,
  PerspectiveCamera,
  Node3D,
  Mesh3D,
} from '../../src/3d/index.js';
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

const firstPerson = document.body.dataset.inputDemo === 'first-person';
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>(`#${id}`)!;
const captureMode = document.querySelector<HTMLInputElement>('#capture-mode')!;
const ui = document.querySelector<HTMLElement>('#ui-panel')!;
const status = document.querySelector<HTMLOutputElement>('#demo-status')!;
const instructions = document.querySelector<HTMLElement>('#instructions')!;
instructions.textContent = firstPerson
  ? 'WASD: move relative to facing · Mouse/Arrows: look · Shift: sprint · Ctrl: crouch · Space: jump · R: reload · Left mouse: fire · Ctrl+R: reset.'
  : 'W/S: north/south · A/D: west/east (arrows also work) · Shift: sprint · E: interact · Left mouse: fire · Ctrl+R: reset.';
document.querySelector<HTMLElement>('#capture-option')!.hidden = !firstPerson;
let current: Rocket | undefined;
async function start() {
  button('restart').disabled = true;
  await current?.dispose();
  ui.hidden = true;
  const app = new Rocket({
    onError: (error) => {
      status.textContent = String(error);
    },
  });
  current = app;
  const camera = new PerspectiveCamera();
  camera.y = 1.7;
  camera.z = -8;
  camera.far = 100;
  const player = { x: 480, y: 270 },
    events: string[] = [];
  let time = 0,
    reloads = 0,
    interactions = 0,
    shots = 0,
    jump = 0,
    verticalSpeed = 0,
    lastFire = 0,
    remapped = false;
  const reset = () => {
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
      update(dt) {
        time += dt;
        const speed =
          (controls.value('sprint') ? 7 : 3) *
          (firstPerson && controls.value('crouch') ? 0.4 : 1);
        if (firstPerson) {
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
        } else {
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
        if (controls.value('fire') && time - lastFire > 0.15) {
          shots++;
          lastFire = time;
        }
        status.textContent = `World time ${time.toFixed(1)} s · ${firstPerson ? `X ${camera.x.toFixed(2)} Z ${camera.z.toFixed(2)} heading ${((camera.yaw * 180) / Math.PI).toFixed(1)}°` : `X ${player.x.toFixed(1)} Y ${player.y.toFixed(1)}`} · reloads ${reloads} · interactions ${interactions} · shots ${shots} · ${controls.enabled ? 'game context' : 'UI context'}`;
        for (const name of controls.names)
          document.querySelector<HTMLElement>(
            `[data-value="${name}"]`,
          )!.textContent = controls.value(name).toFixed(3);
      },
      draw(ctx) {
        ctx.fillStyle = '#081420';
        ctx.fillRect(0, 0, 960, 540);
        if (firstPerson) {
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
  const preset = firstPerson ? firstPersonInput : topDownInput;
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
      if (name === 'reload') reloads++;
      if (name === 'interact') interactions++;
      if (name === 'reset') reset();
      if (name === 'jump' && !jump) verticalSpeed = 4.5;
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
    firstPerson ? 'First-person input playground' : 'Top-down input playground',
  );
  controls.bind(view, {
    capture: firstPerson && captureMode.checked ? 'pointer-lock' : 'focus',
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
  const remapName = firstPerson ? 'reload' : 'interact';
  button('remap').textContent = `Remap ${remapName} to F`;
  button('remap').addEventListener(
    'click',
    () => {
      remapped = !remapped;
      controls.map(
        firstPerson ? 'reload' : 'interact',
        remapped ? 'KeyF' : firstPerson ? 'KeyR' : 'KeyE',
      );
      document.querySelector<HTMLElement>(
        `[data-mapping="${remapName}"]`,
      )!.textContent = remapped ? 'KeyF' : firstPerson ? 'KeyR' : 'KeyE';
      button('remap').textContent = remapped
        ? 'Restore default binding'
        : `Remap ${remapName} to F`;
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
