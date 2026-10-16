import { Rocket, Scene2D, Input } from '../../src/index.js';
export function playground() {
  const app = new Rocket({ performance: true }),
    input = app.use(Input);
  const state = { x: 280, y: 170, updates: 0, clicks: 0, color: '#80dbbd' };
  const scene = app.scene(
    new Scene2D({
      update(dt) {
        const dx =
            Number(controls.down('right')) - Number(controls.down('left')),
          dy = Number(controls.down('down')) - Number(controls.down('up'));
        state.x = Math.max(20, Math.min(540, state.x + dx * 160 * dt));
        state.y = Math.max(20, Math.min(300, state.y + dy * 160 * dt));
        state.updates++;
        status.textContent = `Orb (${state.x.toFixed(1)}, ${state.y.toFixed(1)}) · ${state.updates} shared updates · ${(app.performance?.fps ?? 0).toFixed(0)} FPS`;
      },
      draw(ctx) {
        ctx.fillStyle = '#101d2c';
        ctx.fillRect(0, 0, 560, 320);
        ctx.strokeStyle = '#233b52';
        for (let x = 0; x <= 560; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 320);
          ctx.stroke();
        }
        for (let y = 0; y <= 320; y += 32) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(560, y);
          ctx.stroke();
        }
        ctx.fillStyle = state.color;
        ctx.beginPath();
        ctx.arc(state.x, state.y, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9ebbd5';
        ctx.font = '14px monospace';
        ctx.fillText('Click canvas · WASD moves the orb', 18, 28);
      },
    }),
  );
  const controls = input.scope(scene, {
    left: 'KeyA',
    right: 'KeyD',
    up: 'KeyW',
    down: 'KeyS',
  });
  const status =
    document.querySelector<HTMLParagraphElement>('#simulation-status')!;
  const views = ['#world-one', '#world-two'].map((target) => {
    const view = app.view({ target, scene, width: 560, height: 320 });
    controls.bind(view);
    view.canvas.setAttribute(
      'aria-label',
      `WASD playground ${target.endsWith('one') ? 'one' : 'two'}`,
    );
    return view;
  });
  scene.own(controls);
  window.addEventListener(
    'pagehide',
    () => {
      void app.dispose();
    },
    { once: true },
  );
  return { app, scene, views, state, controls };
}
