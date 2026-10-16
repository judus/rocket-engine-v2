import { Rocket, Scene2D, Input } from '../../src/index.js';
import {
  createApp,
  followCamera,
  SceneNavigator,
} from '../../src/experimental/index.js';

const element = <T extends HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const status = element('#stage-status'),
  metrics = element('#metrics');
let following = true,
  nextReadout = 0;
const app = createApp({
  target: '#stage',
  width: 960,
  height: 480,
  runtime: {
    performance: true,
    onError: (error) => {
      status.textContent = String(error);
    },
  },
  update(dt, frame): undefined {
    if (hero.disposed) return;
    hero.x = Math.max(
      0,
      Math.min(
        1800,
        hero.x +
          ((actions.down('right') ? 1 : 0) - (actions.down('left') ? 1 : 0)) *
            200 *
            dt,
      ),
    );
    hero.y = Math.max(
      260,
      Math.min(
        470,
        hero.y +
          ((actions.down('down') ? 1 : 0) - (actions.down('up') ? 1 : 0)) *
            160 *
            dt,
      ),
    );
    if (following)
      followCamera(app.view, hero, dt, {
        halfLife: 0.12,
        bounds: { x: 0, y: 0, width: 1800, height: 480 },
      });
    if (frame.time >= nextReadout) {
      nextReadout = frame.time + 0.25;
      metrics.textContent = `${app.engine.renderPerformance?.fps?.toFixed(0) ?? '—'} draw FPS · ${app.engine.performance?.updateMs?.toFixed(2) ?? '—'} ms update · ${app.stage.query({ tag: 'tree' }).length} trees · hero ${hero.x.toFixed(0)}, ${hero.y.toFixed(0)}`;
    }
  },
  render(ctx): undefined {
    ctx.fillStyle = '#0b182a';
    ctx.fillRect(-10000, -10000, 20000, 20000);
  },
});
app.stage.addLayer('mountains', { parallax: 0.2 });
app.stage.addLayer('ground');
app.stage.addLayer('actors', { sort: 'y' });
app.stage.addLayer('hud', { space: 'screen' });
app.stage.add({
  layer: 'mountains',
  draw(ctx): undefined {
    ctx.fillStyle = '#203b52';
    ctx.beginPath();
    ctx.moveTo(-600, 350);
    for (let x = -600; x <= 2400; x += 120) {
      ctx.lineTo(x, 160 + Math.sin(x * 0.01) * 65);
      ctx.lineTo(x + 60, 235);
    }
    ctx.lineTo(2400, 480);
    ctx.lineTo(-600, 480);
    ctx.fill();
  },
});
app.stage.add({
  layer: 'ground',
  draw(ctx): undefined {
    ctx.fillStyle = '#192e31';
    ctx.fillRect(0, 260, 1800, 220);
    ctx.strokeStyle = '#294443';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 1800; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 260);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 260; y <= 480; y += 55) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1800, y);
      ctx.stroke();
    }
  },
});
for (let i = 0; i < 16; i++)
  app.stage.add({
    id: `tree-${i}`,
    tags: ['tree'],
    layer: 'actors',
    x: 140 + (i % 8) * 210,
    y: i < 8 ? 350 : 440,
    draw(ctx): undefined {
      ctx.fillStyle = '#080f1b55';
      ctx.beginPath();
      ctx.ellipse(3, 0, 25, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#776249';
      ctx.fillRect(-5, -55, 10, 55);
      ctx.fillStyle = i < 8 ? '#38655c' : '#477665';
      ctx.beginPath();
      ctx.moveTo(0, -100);
      ctx.lineTo(32, -25);
      ctx.lineTo(-32, -25);
      ctx.closePath();
      ctx.fill();
    },
  });
const hero = app.stage.add({
  id: 'hero',
  tags: ['actor'],
  layer: 'actors',
  x: 480,
  y: 390,
  draw(ctx): undefined {
    ctx.fillStyle = '#0007';
    ctx.beginPath();
    ctx.ellipse(0, 1, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2ba65';
    ctx.fillRect(-10, -35, 20, 32);
    ctx.fillStyle = '#ffe2a6';
    ctx.beginPath();
    ctx.arc(0, -42, 10, 0, Math.PI * 2);
    ctx.fill();
  },
});
app.stage.add({
  layer: 'hud',
  x: 22,
  y: 30,
  draw(ctx): undefined {
    ctx.fillStyle = '#9be3cd';
    ctx.font = '14px monospace';
    ctx.fillText('ARROWS / WASD   ·   SCREEN SPACE', 0, 0);
  },
});
const actions = app.engine.use(Input).scope(app.view.scene!, {
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
});
actions.bind(app.view);
const pause = element<HTMLButtonElement>('#pause');
pause.onclick = () => {
  if (app.engine.running) {
    app.pause();
    pause.textContent = 'Resume';
    status.textContent = 'Paused';
  } else
    void app.resume().then(
      () => {
        pause.textContent = 'Pause';
        status.textContent = 'Running';
      },
      (error) => {
        status.textContent = String(error);
      },
    );
};
element<HTMLInputElement>('#follow').onchange = (event) => {
  following = (event.currentTarget as HTMLInputElement).checked;
};
element<HTMLInputElement>('#zoom').oninput = (event) => {
  app.view.camera.zoom = Number(
    (event.currentTarget as HTMLInputElement).value,
  );
};
element('#remove').onclick = () => {
  const tree = app.stage.query({ tag: 'tree' }).at(-1);
  tree?.dispose();
  status.textContent = `${app.stage.query({ tag: 'tree' }).length} trees remain`;
};
element('#dispose').onclick = () => {
  void app.dispose().then(() => {
    for (const control of document.querySelectorAll<
      HTMLInputElement | HTMLButtonElement
    >('#stage + .toolbar input, #stage + .toolbar button'))
      control.disabled = true;
    metrics.textContent = 'Disposed · 0 canvases';
    status.textContent = 'Stage, nodes, input scope and view released';
  });
};

const routeStatus = element('#route-status'),
  result = element('#route-result');
const navigator = new SceneNavigator();
let created = 0,
  disposed = 0;
function routeScene(name: string, color: string, delay = 0) {
  const instance = ++created;
  let elapsed = 0;
  return new Scene2D({
    prepare: ({ signal }) =>
      delay
        ? new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              signal.removeEventListener('abort', abort);
              resolve();
            }, delay);
            function abort() {
              clearTimeout(timer);
              reject(signal.reason);
            }
            signal.addEventListener('abort', abort, { once: true });
          })
        : undefined,
    update(dt): undefined {
      elapsed += dt;
    },
    draw(ctx): undefined {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 960, 170);
      ctx.fillStyle = '#e2ede8';
      ctx.font = '24px monospace';
      ctx.fillText(name, 28, 58);
      ctx.font = '16px monospace';
      ctx.fillText(
        `Instance ${instance} · active time ${elapsed.toFixed(1)}s`,
        28,
        100,
      );
      routeStatus.textContent = `Current ${navigator.current ?? '—'} · history ${navigator.history.join(' → ') || 'empty'} · created ${created} / disposed ${disposed}`;
    },
    dispose(): undefined {
      disposed++;
    },
  });
}
navigator.add('home', {
  retain: true,
  create: () => routeScene('HOME / RETAINED', '#173b40'),
});
navigator.add('fresh', {
  create: () => routeScene('FRESH / RECREATED', '#493e55'),
});
navigator.add('slow', {
  create: () => routeScene('SLOW / PREPARED', '#4c412a', 1500),
});
navigator.add('broken', {
  create: () => {
    created++;
    return {
      prepare() {
        throw new Error('Demonstration load failure');
      },
      dispose() {
        disposed++;
      },
    };
  },
});
const routeApp = new Rocket();
routeApp.scene(navigator);
routeApp.view({ target: '#routes', scene: navigator, width: 960, height: 170 });
function navigate(job: Promise<void>) {
  result.textContent = 'Preparing requested scene…';
  void job.then(
    () => {
      result.textContent = 'Scene ready';
    },
    (error) => {
      result.textContent = `Kept ${navigator.current}: ${String(error)}`;
    },
  );
}
for (const button of document.querySelectorAll<HTMLButtonElement>(
  '[data-route]',
))
  button.onclick = () => navigate(navigator.run(button.dataset.route!));
element('#previous').onclick = () => navigate(navigator.previous());
element('#dispose-routes').onclick = () => {
  void routeApp.dispose().then(() => {
    routeStatus.textContent = `Disposed · created ${created} / disposed ${disposed}`;
    result.textContent = 'Navigator released';
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '[data-route], #previous, #dispose-routes',
    ))
      button.disabled = true;
  });
};
void navigator
  .run('home')
  .then(() => routeApp.start())
  .catch((error) => {
    result.textContent = String(error);
  });
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
    void routeApp.dispose();
  },
  { once: true },
);
