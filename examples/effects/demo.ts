import { Rocket, Scene2D, Input, SpatialIndex } from '../../src/index.js';
import {
  Particles2D,
  Emitter2D,
  ParticleRenderer2D,
} from '../../src/effects/index.js';
import { Projectiles2D } from '../../src/projectiles/index.js';
import type { ProjectileState2D } from '../../src/projectiles/index.js';
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const projectileMode = document.body.dataset.demo === 'projectiles';
const metrics = $('metrics'),
  status = $('status'),
  cleanup = $('cleanup');
const rate = $<HTMLInputElement>('rate'),
  speed = $<HTMLInputElement>('speed'),
  continuous = $<HTMLInputElement>('continuous');
let app: Rocket | null = null,
  disposeModel: (() => void) | null = null,
  burst = 0,
  fire = 0,
  clear = false,
  recreating = false;
let created = 0,
  released = 0;
function grid(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#091622';
  ctx.fillRect(-1000, -1000, 4000, 3000);
  ctx.strokeStyle = '#183444';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= 960; x += 40) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 440);
  }
  for (let y = 0; y <= 440; y += 40) {
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
  }
  ctx.stroke();
  ctx.strokeStyle = '#35596b';
  ctx.strokeRect(0, 0, 960, 440);
}
async function start() {
  if (recreating) return;
  recreating = true;
  $('recreate').setAttribute('disabled', '');
  try {
    if (app) await app.dispose();
    burst = fire = 0;
    clear = false;
    const particles = new Particles2D(4096),
      renderer = new ParticleRenderer2D(particles, true);
    const emitter = new Emitter2D(particles, {
      rate: 200,
      seed: 42,
      spread: Math.PI * 0.8,
      speed: [80, 240],
      life: [0.4, 1.4],
      acceleration: { x: 0, y: 150 },
      color: '#ffb75c',
    });
    const smoke = new Emitter2D(particles, {
      rate: 70,
      seed: 81,
      angle: -Math.PI / 2,
      spread: 0.4,
      speed: [25, 70],
      life: [1, 3],
      size: [4, 10],
      endSize: 24,
      acceleration: { x: 12, y: -8 },
      color: '#577f91',
    });
    emitter.x = 260;
    emitter.y = 350;
    smoke.x = 700;
    smoke.y = 350;
    const impact = new Emitter2D(particles, {
      rate: 0,
      spread: Math.PI * 2,
      speed: [60, 230],
      life: [0.15, 0.6],
      acceleration: { x: 0, y: 100 },
      color: '#8ef1d0',
    });
    const index = new SpatialIndex<string>(128);
    index.insert(
      'near',
      { minX: 480, minY: 120, maxX: 484, maxY: 320 },
      'near target',
    );
    index.insert(
      'far',
      { minX: 760, minY: 80, maxX: 764, maxY: 360 },
      'far target',
    );
    const shots = new Projectiles2D(
      (b) =>
        index
          .query(b)
          .filter(
            (entry) =>
              entry.id !== 'near' || $<HTMLInputElement>('near-target').checked,
          ),
      128,
    );
    let snapshots: readonly ProjectileState2D[] = [],
      hits = 0,
      fired = 0,
      simulated = 0,
      updates = 0,
      last = 0,
      lastHit = 'No hits yet',
      aim = { x: 900, y: 220 },
      shotPhase = 0;
    const runtime = new Rocket({
      fixed: { step: 1 / 60, maxSteps: 8 },
      performance: true,
      onError(error) {
        status.textContent = String(error);
      },
    });
    app = runtime;
    const input = runtime.use(Input);
    const scene = runtime.scene(
      new Scene2D({
        fixedUpdate(dt): undefined {
          updates++;
          simulated += dt;
          const pointer = binding.fixedPointer;
          if (pointer.world) aim = { ...pointer.world };
          particles.update(dt);
          if (clear) {
            particles.clear();
            shots.clear();
            snapshots = [];
            clear = false;
          }
          if (projectileMode) {
            const hitsNow = shots.update(dt);
            for (const hit of hitsNow) {
              hits++;
              lastHit = `#${hit.projectileId} → ${hit.target.id} · x ${hit.position.x.toFixed(1)} · within-step ${(hit.time * 1000).toFixed(2)} ms`;
              impact.x = hit.position.x;
              impact.y = hit.position.y;
              impact.burst(36);
            }
            snapshots = shots.snapshot();
            for (const shot of snapshots) {
              particles.spawn({
                x: shot.x,
                y: shot.y,
                vx: 0,
                vy: 0,
                life: 0.2,
                size: 3,
                color: '#ffcf72',
              });
            }
            shotPhase += dt;
            const held = controls.fixed.down('fire') || pointer.down;
            if (
              fire > 0 ||
              ((held || continuous.checked) && shotPhase >= 0.12)
            ) {
              const dx = aim.x - 60,
                dy = aim.y - 220,
                length = Math.hypot(dx, dy) || 1;
              if (
                shots.spawn({
                  x: 60,
                  y: 220,
                  vx: (dx / length) * Number(speed.value),
                  vy: (dy / length) * Number(speed.value),
                  life: 2,
                }) !== null
              )
                fired++;
              fire = 0;
              shotPhase = 0;
            }
            snapshots = shots.snapshot();
          } else {
            emitter.rate = Number(rate.value);
            emitter.emitting = smoke.emitting = continuous.checked;
            emitter.update(dt);
            smoke.update(dt);
            if (burst) {
              impact.x = aim.x;
              impact.y = aim.y;
              impact.burst(burst);
              burst = 0;
            }
            if (pointer.pressed || controls.fixed.pressed('fire')) {
              impact.x = aim.x;
              impact.y = aim.y;
              impact.burst(120);
            }
          }
        },
        update(_dt, frame): undefined {
          if (frame.time - last < 0.12) return;
          last = frame.time;
          metrics.textContent = `${runtime.renderPerformance?.fps?.toFixed(0) ?? '…'} draw FPS · ${runtime.performance?.updateMs?.toFixed(2) ?? '…'} ms update CPU · ${particles.count}/${particles.capacity} particles · ${snapshots.length}/128 projectiles · ${updates} shared fixed updates`;
          status.textContent = projectileMode
            ? `${fired} fired · ${hits} hits · ${lastHit} · ${Number(speed.value).toLocaleString()} px/s (${(Number(speed.value) / 60).toFixed(0)} px per fixed tick) · target thickness 4 px`
            : `${simulated.toFixed(2)} simulated seconds · spawned ${particles.spawned} · dropped ${particles.dropped} · one pool / two read-only views`;
        },
        draw(ctx): undefined {
          grid(ctx);
          if (projectileMode) {
            ctx.fillStyle = '#5cdbbc';
            if ($<HTMLInputElement>('near-target').checked)
              ctx.fillRect(480, 120, 4, 200);
            ctx.fillStyle = '#719bd7';
            ctx.fillRect(760, 80, 4, 280);
            ctx.font = '14px monospace';
            ctx.fillStyle = '#93b4c7';
            ctx.fillText('NEAR · 4 px', 428, 105);
            ctx.fillText('FAR · 4 px', 710, 64);
            ctx.fillStyle = '#ffcf72';
            ctx.fillRect(35, 210, 40, 20);
            ctx.strokeStyle = '#294956';
            ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.moveTo(60, 220);
            ctx.lineTo(aim.x, aim.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ffecb5';
            for (const shot of snapshots) {
              ctx.beginPath();
              ctx.arc(shot.x, shot.y, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          } else {
            ctx.fillStyle = '#274c60';
            ctx.fillRect(236, 350, 48, 14);
            ctx.fillRect(676, 350, 48, 14);
            ctx.font = '14px monospace';
            ctx.fillStyle = '#93b4c7';
            ctx.fillText('SPARKS / GRAVITY', 184, 397);
            ctx.fillText('PLUME / SIZE CURVE', 625, 397);
          }
          renderer.draw(ctx);
        },
      }),
    );
    created++;
    scene.own((): undefined => {
      released++;
      cleanup.textContent = `Scenes ${created} created / ${released} disposed · previous resources: particles ${particles.count}, projectiles ${shots.count}, spatial entries ${index.size}, emitter disposed ${emitter.disposed}`;
    });
    for (const resource of [particles, emitter, smoke, impact, shots, index])
      scene.own(resource);
    disposeModel = () => {
      void runtime
        .dispose()
        .then(() => {
          metrics.textContent = 'Disposed · 0 canvases';
          status.textContent =
            'All scene resources released. Recreate starts a fresh seeded demonstration.';
        })
        .catch(showError);
    };
    const controls = scene.own(input.scope(scene, { fire: 'Space' }));
    const view = runtime.view({
      target: '#effect-view',
      scene,
      width: 960,
      height: 440,
    });
    view.canvas.setAttribute(
      'aria-label',
      projectileMode
        ? 'Projectile range: click or hold Space to fire'
        : 'Particle effects: click or press Space for a burst',
    );
    const binding = controls.bind(view);
    const overview = runtime.view({
      target: '#effect-overview',
      scene,
      width: 960,
      height: 220,
    });
    overview.camera.zoom = 0.5;
    overview.camera.x = 0;
    overview.camera.y = 0;
    controls.bind(overview);
    await runtime.start();
    $('pause').textContent = 'Pause';
    cleanup.textContent =
      `Scenes ${created} created / ${released} disposed · 2 views share one fixed-step owner` +
      (released ? ' · previous resources released' : '');
  } catch (error) {
    showError(error);
    if (app) await app.dispose();
  } finally {
    recreating = false;
    $('recreate').removeAttribute('disabled');
  }
}
function showError(error: unknown) {
  status.textContent = String(error);
}
$('burst').addEventListener('click', () => {
  if (projectileMode) fire++;
  else burst = 120;
});
$('saturate').addEventListener('click', () => {
  burst = 100000;
});
$('clear').addEventListener('click', () => {
  clear = true;
});
$('pause').addEventListener('click', () => {
  if (!app || app.disposed) return;
  if (app.running) {
    app.stop();
    $('pause').textContent = 'Resume';
  } else {
    void app.start().catch(showError);
    $('pause').textContent = 'Pause';
  }
});
$('dispose').addEventListener('click', () => disposeModel?.());
$('recreate').addEventListener('click', () => {
  void start();
});
window.addEventListener('pagehide', () => {
  void app?.dispose().catch(showError);
});
void start();
