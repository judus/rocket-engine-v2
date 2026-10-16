import { Rocket, Scene2D, Input, Assets } from '../src/index.js';
import type { Frame, Point, InputScope, ViewInput } from '../src/index.js';
import type { View } from '../src/View.js';
import type { Arm } from './createArm.js';
import { createArm } from './createArm.js';

function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const match = document.querySelector(selector);
  if (!(match instanceof kind)) throw new Error(`Missing ${selector}`);
  return match;
}
const status = element('#status', HTMLOutputElement);
const pause = element('#pause', HTMLButtonElement);
const restart = element('#restart', HTMLButtonElement);
const assetError = element('#asset-error', HTMLButtonElement);
const assetStatus = element('#asset-status', HTMLParagraphElement);
const zoom = element('#zoom', HTMLInputElement);
let app: Rocket | undefined;
let detail: View | undefined;
let updates = 0;
let arms: [Arm, Arm];
let cleanedArms = 0;
const replaceArm = element('#replace-arm', HTMLButtonElement);
const interaction = element('#interaction-status', HTMLParagraphElement);
const cleanupStatus = element('#cleanup-status', HTMLParagraphElement);
let startVersion = 0;

async function createExample(missingImage = false) {
  const version = ++startVersion;
  restart.disabled =
    pause.disabled =
    replaceArm.disabled =
    assetError.disabled =
      true;
  assetStatus.textContent = 'Loading arm image…';
  await app?.dispose();
  updates = 0;
  let marker: Point | null = null;
  let selected = 0;
  let moving = true;
  let dragging: { binding: ViewInput; offset: Point } | null = null;
  const application = new Rocket({
    performance: true,
    onError(error) {
      status.textContent =
        error instanceof Error ? error.message : String(error);
      pause.disabled = true;
    },
  });
  app = application;
  const input = application.use(Input);
  const assets = application.use(Assets);
  let image: ImageBitmap;
  let controls: InputScope<'toggle' | 'left' | 'right' | 'up' | 'down'>;
  const scene = application.scene(
    new Scene2D({
      async prepare({ signal }) {
        const lease = await assets.acquireImage(
          missingImage
            ? './examples/assets/missing.png'
            : './examples/assets/arm-base.png',
          { signal },
        );
        // Cancellation may happen between promise resolution and this continuation.
        if (signal.aborted) {
          lease.dispose();
          signal.throwIfAborted();
        }
        image = this.own(lease).image;
        arms = [makeArm(270, 250, image), makeArm(470, 285, image, '#79a9ed')];
        for (const arm of arms) this.root.add(arm.node);
        assetStatus.textContent =
          'One loaded image · two arms · two views · scene-owned';
      },
      update(dt) {
        updates++;
        if (controls.pressed('toggle')) {
          moving = !moving;
          for (const arm of arms) {
            if (moving) arm.resume();
            else arm.pause();
          }
        }
        const selectedArm = arms[selected];
        if (!selectedArm) return;
        const dx =
          Number(controls.down('right')) - Number(controls.down('left'));
        const dy = Number(controls.down('down')) - Number(controls.down('up'));
        const length = Math.hypot(dx, dy) || 1;
        selectedArm.moveBy((dx * 100 * dt) / length, (dy * 100 * dt) / length);
        for (const binding of controls.views) {
          const pointer = binding.pointer;
          if (pointer.pressed && pointer.world) {
            const point = pointer.world;
            marker = { ...point };
            const nearest = arms
              .map((arm, index) => ({
                index,
                distance: Math.hypot(
                  arm.node.x - point.x,
                  arm.node.y - point.y,
                ),
              }))
              .sort((a, b) => a.distance - b.distance)[0];
            if (nearest && nearest.distance < 40) {
              selected = nearest.index;
              const arm = arms[selected];
              if (arm)
                dragging = {
                  binding,
                  offset: {
                    x: arm.node.x - pointer.world.x,
                    y: arm.node.y - pointer.world.y,
                  },
                };
            }
          }
        }
        if (dragging) {
          const pointer = dragging.binding.pointer;
          const arm = arms[selected];
          if (pointer.world && (pointer.down || pointer.released) && arm)
            arm.moveTo({
              x: pointer.world.x + dragging.offset.x,
              y: pointer.world.y + dragging.offset.y,
            });
          if (!pointer.down) dragging = null;
        }
        const message = `Arm ${selected + 1} selected · motion ${moving ? 'on' : 'off'}`;
        if (interaction.textContent !== message)
          interaction.textContent = message;
      },
      draw(ctx) {
        ctx.fillStyle = '#101b2b';
        ctx.fillRect(-2000, -2000, 4000, 4000);
        ctx.strokeStyle = '#233449';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = 0; gx <= 640; gx += 40) {
          ctx.moveTo(gx, 0);
          ctx.lineTo(gx, 360);
        }
        for (let gy = 0; gy <= 360; gy += 40) {
          ctx.moveTo(0, gy);
          ctx.lineTo(640, gy);
        }
        ctx.stroke();
        ctx.fillStyle = '#f1b973';
        ctx.beginPath();
        ctx.arc(320, 180, 55, 0, Math.PI * 2);
        ctx.strokeStyle = '#f1b973';
        ctx.stroke();
        if (marker) {
          ctx.strokeStyle = '#eb8fba';
          ctx.beginPath();
          ctx.moveTo(marker.x - 10, marker.y);
          ctx.lineTo(marker.x + 10, marker.y);
          ctx.moveTo(marker.x, marker.y - 10);
          ctx.lineTo(marker.x, marker.y + 10);
          ctx.stroke();
        }
      },
    }),
  );
  controls = scene.own(
    input.scope(scene, {
      toggle: 'Space',
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
    }),
  );
  replaceArm.onclick = () => {
    arms[0].node.dispose();
    dragging = null;
    arms[0] = makeArm(270, 250, image);
    if (!moving) arms[0].pause();
    scene.root.add(arms[0].node);
  };

  const overlay = (ctx: CanvasRenderingContext2D, frame: Frame): undefined => {
    ctx.fillStyle = '#101b2be6';
    ctx.fillRect(12, 12, 470, 72);
    ctx.fillStyle = '#c6d5e6';
    ctx.font = '13px monospace';
    const stats = application.performance;
    if (!stats) return;
    const fps = stats.fps === null ? 'warming up' : stats.fps.toFixed(0);
    ctx.fillText(
      `${frame.time.toFixed(1)}s · ${updates} shared updates · ${fps} FPS`,
      22,
      32,
    );
    const update = stats.updateMs === null ? '—' : stats.updateMs.toFixed(2);
    const render = stats.renderMs === null ? '—' : stats.renderMs.toFixed(2);
    ctx.fillText(`CPU: update ${update} ms · render ${render} ms`, 22, 52);
    ctx.fillText(
      `Arm updates: ${arms.map((arm) => arm.updates).join(' / ')}`,
      22,
      72,
    );
  };
  const world = application.view({
    target: '#world',
    scene,
    width: 640,
    height: 360,
    overlay,
  });
  detail = application.view({
    target: '#detail',
    scene,
    width: 640,
    height: 360,
    overlay,
  });
  detail.camera.zoom = Number(zoom.value);
  centerDetail();
  for (const view of [world, detail]) {
    view.canvas.setAttribute(
      'aria-label',
      view === world ? 'World arm controls' : 'Detail arm controls',
    );
    controls.bind(view);
  }

  const wave = application.scene({
    draw(ctx, { time }) {
      ctx.strokeStyle = '#80dbbd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= 760; x += 2) {
        const y =
          90 + Math.sin(x / 45 - time * 2) * 30 * Math.sin(x / 190 + time / 2);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    },
  });
  application.view({ target: '#wave', scene: wave, width: 760, height: 180 });
  await application.start();
  if (version !== startVersion) return;
  status.textContent = 'Running · one update per scene';
  pause.textContent = 'Pause';
  restart.disabled =
    pause.disabled =
    replaceArm.disabled =
    assetError.disabled =
      false;
}

function makeArm(x: number, y: number, image: ImageBitmap, color = '#80dbbd') {
  return createArm({
    x,
    y,
    color,
    image,
    onCleanup() {
      cleanupStatus.textContent = `${++cleanedArms} arms cleaned up`;
    },
  });
}

function centerDetail() {
  if (!detail) return;
  detail.camera.x = 320 - detail.width / (2 * detail.camera.zoom);
  detail.camera.y = 180 - detail.height / (2 * detail.camera.zoom);
}

async function togglePause() {
  if (!app) return;
  if (app.running) {
    app.stop();
    pause.textContent = 'Resume';
    status.textContent = 'Paused';
  } else {
    await app.start();
    pause.textContent = 'Pause';
    status.textContent = 'Running';
  }
}
pause.addEventListener('click', () => {
  void togglePause().catch(showError);
});
zoom.addEventListener('input', () => {
  if (!detail) return;
  detail.camera.zoom = Number(zoom.value);
  centerDetail();
});
restart.addEventListener('click', () => {
  void createExample().catch(showError);
});
assetError.addEventListener('click', () => {
  void createExample(true).catch(showError);
});
function showError(error: unknown) {
  restart.disabled = assetError.disabled = false;
  assetStatus.textContent =
    'Loading failed. Restart example to retry the local image.';
  status.textContent = error instanceof Error ? error.message : String(error);
  console.error(error);
}
await createExample().catch(showError);
