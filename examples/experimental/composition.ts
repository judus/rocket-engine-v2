import {
  createApp,
  Stage2D,
  followCamera,
} from '../../src/experimental/index.js';
const element = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const status = element('composition-status'),
  metrics = element('composition-metrics'),
  lifetime = element('lifetime');
const created = new Set<number>(),
  disposed = new Set<number>();
let instance = 0,
  failNext = false,
  lastReadout = 0;
const records = new Map<
  number,
  { name: string; x: number; updates: number; scene: Stage2D }
>();
const app = createApp({
  target: '#scene-view',
  width: 960,
  height: 440,
  autoStart: false,
  runtime: {
    performance: true,
    onError: (error) => {
      status.textContent = String(error);
    },
  },
});
function showLifetime() {
  lifetime.textContent = `Created ${created.size} · disposed ${disposed.size} · live ${created.size - disposed.size} · ${app.view.disposed ? 0 : 1} canvas`;
}
function makeScene(name: 'Bridge' | 'Hangar', delay = 0) {
  const id = ++instance;
  created.add(id);
  const failure = name === 'Hangar' && failNext;
  if (failure) failNext = false;
  let actions: ReturnType<
    typeof app.input<'left' | 'right' | 'up' | 'down' | 'bridge' | 'hangar'>
  >;
  const scene = new Stage2D({
    prepare: ({ signal }) => {
      if (failure)
        throw new Error('Demonstration load failure; active scene preserved');
      if (!delay) return;
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', abort);
          resolve();
        }, delay);
        function abort() {
          clearTimeout(timer);
          reject(signal.reason);
        }
        signal.addEventListener('abort', abort, { once: true });
      });
    },
    update(dt, frame): undefined {
      if (actions.pressed('bridge')) navigate(app.run('bridge'));
      if (actions.pressed('hangar')) navigate(app.run('hangar'));
      hero.x = Math.max(
        30,
        Math.min(
          1770,
          hero.x +
            ((actions.down('right') ? 1 : 0) - (actions.down('left') ? 1 : 0)) *
              220 *
              dt,
        ),
      );
      hero.y = Math.max(
        230,
        Math.min(
          400,
          hero.y +
            ((actions.down('down') ? 1 : 0) - (actions.down('up') ? 1 : 0)) *
              150 *
              dt,
        ),
      );
      followCamera(app.view, hero, dt, {
        halfLife: 0.12,
        bounds: { x: 0, y: 0, width: 1800, height: 440 },
      });
      const record = records.get(id)!;
      record.x = hero.x;
      record.updates++;
      if (frame.time >= lastReadout) {
        lastReadout = frame.time + 0.15;
        metrics.textContent = `${app.engine.renderPerformance?.fps?.toFixed(0) ?? '—'} draw FPS · active ${app.current} · instance ${id} · x ${hero.x.toFixed(0)} · input ${actions.down('right') ? 'right' : actions.down('left') ? 'left' : 'idle'}`;
        for (const label of ['Bridge', 'Hangar']) {
          const list = [...records.entries()].filter(
            ([, r]) => r.name === label,
          );
          const last = list.at(-1);
          if (last)
            element(`${label.toLowerCase()}-record`).textContent =
              `${label} #${last[0]} · x ${last[1].x.toFixed(0)} · updates ${last[1].updates} · ${last[1].scene === app.stage ? 'active' : last[1].scene.disposed ? 'disposed' : 'retained / inactive'}`;
        }
        showLifetime();
      }
    },
    render(ctx): undefined {
      ctx.fillStyle = name === 'Bridge' ? '#0c2130' : '#261e2d';
      ctx.fillRect(-10000, -10000, 20000, 20000);
    },
  });
  records.set(id, { name, x: 360, updates: 0, scene });
  scene.world.own((): undefined => {
    disposed.add(id);
    showLifetime();
  });
  scene.addLayer('distant', { parallax: 0.25 });
  scene.addLayer('ground');
  scene.addLayer('actors', { sort: 'y' });
  scene.addLayer('hud', { space: 'screen' });
  scene.add({
    layer: 'distant',
    draw(ctx): undefined {
      ctx.strokeStyle = name === 'Bridge' ? '#31556a' : '#624e68';
      ctx.lineWidth = 3;
      for (let x = -200; x < 2400; x += 180) {
        ctx.strokeRect(x, 100, 90, 170);
        ctx.beginPath();
        ctx.moveTo(x + 45, 100);
        ctx.lineTo(x + 45, 50);
        ctx.stroke();
      }
    },
  });
  scene.add({
    layer: 'ground',
    draw(ctx): undefined {
      ctx.fillStyle = name === 'Bridge' ? '#162f3a' : '#332b3b';
      ctx.fillRect(0, 230, 1800, 210);
      ctx.strokeStyle = '#66838b44';
      ctx.lineWidth = 1;
      for (let x = 0; x <= 1800; x += 90) {
        ctx.beginPath();
        ctx.moveTo(x, 230);
        ctx.lineTo(x, 440);
        ctx.stroke();
      }
      for (let y = 230; y <= 440; y += 52) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(1800, y);
        ctx.stroke();
      }
    },
  });
  for (let i = 0; i < 10; i++)
    scene.add({
      layer: 'actors',
      x: 150 + i * 160,
      y: i % 2 ? 380 : 300,
      draw(ctx): undefined {
        ctx.fillStyle = '#0005';
        ctx.beginPath();
        ctx.ellipse(0, 0, 26, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = name === 'Bridge' ? '#427480' : '#725d83';
        ctx.fillRect(-20, -65, 40, 65);
        ctx.fillStyle = '#b6d6ce';
        ctx.fillRect(-14, -56, 28, 15);
      },
    });
  const hero = scene.add({
    id: 'pilot',
    layer: 'actors',
    x: 360,
    y: 340,
    draw(ctx): undefined {
      ctx.fillStyle = '#f2bf70';
      ctx.fillRect(-11, -34, 22, 31);
      ctx.beginPath();
      ctx.arc(0, -42, 10, 0, Math.PI * 2);
      ctx.fill();
    },
  });
  scene.add({
    layer: 'hud',
    x: 24,
    y: 32,
    draw(ctx): undefined {
      ctx.font = '16px monospace';
      ctx.fillStyle = '#afe5d5';
      ctx.fillText(
        `${name.toUpperCase()} / ${name === 'Bridge' ? 'RETAINED' : 'FRESH'} / #${id}`,
        0,
        0,
      );
    },
  });
  actions = app.input(scene, {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    bridge: 'Digit1',
    hangar: 'Digit2',
  });
  showLifetime();
  return scene;
}
app.addScene('bridge', { retain: true, create: () => makeScene('Bridge') });
app.addScene('hangar', { create: () => makeScene('Hangar') });
app.addScene('slow', { create: () => makeScene('Hangar', 1800) });
let request = 0;
function navigate(job: Promise<void>) {
  const id = ++request;
  status.textContent =
    'Preparing requested scene; current scene remains active…';
  void job.then(
    () => {
      if (id === request)
        status.textContent = `Active: ${app.current}. Click canvas to focus.`;
    },
    (error) => {
      if (id === request)
        status.textContent = `${String(error)} · current: ${app.current}`;
    },
  );
}
element('bridge').onclick = () => navigate(app.run('bridge'));
element('hangar').onclick = () => navigate(app.run('hangar'));
element('slow').onclick = () => navigate(app.run('slow'));
element('back').onclick = () => navigate(app.previous());
element('fail').onclick = () => {
  failNext = true;
  navigate(app.run('hangar'));
};
const pause = element<HTMLButtonElement>('pause-scenes');
pause.onclick = () => {
  if (app.engine.running) {
    app.pause();
    pause.textContent = 'Resume';
    status.textContent = 'Paused; input cleared';
  } else
    void app.resume().then(
      () => {
        pause.textContent = 'Pause';
        status.textContent = 'Resumed';
      },
      (error) => {
        status.textContent = String(error);
      },
    );
};
element('dispose-scenes').onclick = () => {
  void app.dispose().then(() => {
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      '.toolbar button',
    ))
      button.disabled = true;
    metrics.textContent = 'Disposed · 0 canvases';
    status.textContent = `Every scene released once: ${created.size === disposed.size ? 'PASS' : 'FAIL'}`;
    showLifetime();
  });
};
navigate(app.run('bridge'));
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
