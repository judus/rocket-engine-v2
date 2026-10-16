import { Rocket, Scene2D, Input } from '../../src/index.js';
import type { Point, PerformanceStats } from '../../src/index.js';
import { PerspectiveCamera, CanvasRenderer3D } from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';

export type DrawLine = (
  a: Vec3,
  b: Vec3,
  color: string,
  weight?: number,
) => void;
export interface DrawSurface {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: PerspectiveCamera;
  readonly width: number;
  readonly height: number;
}
export interface LineContent {
  readonly referenceGrid?: boolean;
  readonly canvasLabel?: string;
  dispose?(): undefined;
  update?(dt: number): undefined;
  draw?(line: DrawLine, surface: DrawSurface): undefined;
  bind?(signal: AbortSignal, camera: PerspectiveCamera): undefined;
}

export interface CameraHome {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly verticalFov: number;
}
const gridCameraHome: CameraHome = {
  x: 8,
  y: 6,
  z: -12,
  yaw: -0.5,
  pitch: -0.32,
  verticalFov: Math.PI / 3,
};
/** Shared camera, grid and performance presentation for the 3D milestones. */
export async function runLineDemo(
  createContent: () => LineContent,
  cameraHome: CameraHome = gridCameraHome,
) {
  const host = document.querySelector<HTMLElement>('#grid-view')!;
  const status = document.querySelector<HTMLOutputElement>('#camera-status')!;
  const fov = document.querySelector<HTMLInputElement>('#fov')!;
  const fovValue = document.querySelector<HTMLOutputElement>('#fov-value')!;
  const restart = document.querySelector<HTMLButtonElement>('#restart')!;
  const metrics = Object.fromEntries(
    [
      'fps',
      'frame',
      'peak',
      'minimum',
      'jitter',
      'update',
      'render',
      'lines',
      'resolution',
    ].map((key) => [key, document.querySelector<HTMLElement>(`#perf-${key}`)!]),
  );
  function metric(key: string, value: string) {
    const element = metrics[key]!;
    if (element.textContent !== value) element.textContent = value;
  }
  let app: Rocket | undefined;
  let disposedScenes = 0;

  async function start() {
    restart.disabled = true;
    await app?.dispose();
    for (const key of Object.keys(metrics)) metric(key, 'Warming up…');
    const application = new Rocket({
      performance: true,
      onError: (error) => {
        status.textContent = String(error);
      },
    });
    app = application;
    const content = createContent();
    const camera = new PerspectiveCamera();
    const renderer = new CanvasRenderer3D();
    const reset = () => {
      Object.assign(camera, cameraHome);
      const degrees = Math.round((camera.verticalFov * 180) / Math.PI);
      fov.value = String(degrees);
      fovValue.value = `${degrees}°`;
    };
    reset();
    let width = 960,
      height = 540,
      lastPointer: Point | null = null,
      lastStats: PerformanceStats | undefined,
      submittedLines = 0,
      visibleLines = 0;
    const scene = application.scene(
      new Scene2D({
        update(dt) {
          content.update?.(dt);
          if (controls.pressed('reset')) reset();
          const turn =
            Number(controls.down('lookRight')) -
            Number(controls.down('lookLeft'));
          const tilt =
            Number(controls.down('lookUp')) - Number(controls.down('lookDown'));
          camera.yaw += turn * dt;
          camera.pitch = Math.max(
            -1.45,
            Math.min(1.45, camera.pitch + tilt * dt),
          );
          const pointer = binding.pointer;
          if (pointer.down && pointer.world) {
            if (lastPointer) {
              camera.yaw += (pointer.world.x - lastPointer.x) * 0.004;
              camera.pitch = Math.max(
                -1.45,
                Math.min(
                  1.45,
                  camera.pitch - (pointer.world.y - lastPointer.y) * 0.004,
                ),
              );
            }
            lastPointer = { ...pointer.world };
          } else lastPointer = null;
          const forward =
            Number(controls.down('forward')) - Number(controls.down('back'));
          const right =
            Number(controls.down('right')) - Number(controls.down('left'));
          const up =
            Number(controls.down('rise')) - Number(controls.down('lower'));
          const distance =
            ((controls.down('fast') ? 18 : 6) * dt) /
            (Math.hypot(forward, right, up) || 1);
          camera.x +=
            (Math.sin(camera.yaw) * forward + Math.cos(camera.yaw) * right) *
            distance;
          camera.z +=
            (Math.cos(camera.yaw) * forward - Math.sin(camera.yaw) * right) *
            distance;
          camera.y += up * distance;
        },
        draw(ctx) {
          submittedLines = visibleLines = 0;
          ctx.fillStyle = '#101b2b';
          ctx.fillRect(0, 0, width, height);
          const line = (a: Vec3, b: Vec3, color: string, weight = 1) => {
            submittedLines++;
            if (renderer.line(ctx, camera, width, height, a, b, color, weight))
              visibleLines++;
          };
          if (content.referenceGrid !== false) {
            for (let i = -30; i <= 30; i++) {
              const color = i % 5 === 0 ? '#40556d' : '#25364b';
              line({ x: i, y: 0, z: -30 }, { x: i, y: 0, z: 30 }, color);
              line({ x: -30, y: 0, z: i }, { x: 30, y: 0, z: i }, color);
            }
            line({ x: -30, y: 0, z: 0 }, { x: 30, y: 0, z: 0 }, '#ef987f', 2);
            line({ x: 0, y: 0, z: -30 }, { x: 0, y: 0, z: 30 }, '#83b9f5', 2);
            line({ x: 0, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }, '#80dbbd', 2);
            ctx.fillStyle = '#a3b5ca';
            ctx.font = '13px system-ui';
            ctx.fillText(
              '1 square = 1 unit · finite 60 × 60 ground grid',
              18,
              28,
            );
          }
          content.draw?.(line, { ctx, camera, width, height });
          const readout = `Position ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}, ${camera.z.toFixed(1)} · yaw ${((camera.yaw * 180) / Math.PI).toFixed(0)}° · pitch ${((camera.pitch * 180) / Math.PI).toFixed(0)}° · cleaned scenes ${disposedScenes}`;
          if (status.value !== readout) status.value = readout;
        },
        dispose() {
          content.dispose?.();
          disposedScenes++;
        },
      }),
    );
    const controls = scene.own(
      application.use(Input).scope(scene, {
        forward: 'KeyW',
        back: 'KeyS',
        left: 'KeyA',
        right: 'KeyD',
        rise: 'KeyE',
        lower: 'KeyQ',
        fast: ['ShiftLeft', 'ShiftRight'],
        lookLeft: 'ArrowLeft',
        lookRight: 'ArrowRight',
        lookUp: 'ArrowUp',
        lookDown: 'ArrowDown',
        reset: 'KeyR',
      }),
    );
    const view = application.view({
      target: host,
      scene,
      width,
      height,
      overlay() {
        const stats = application.performance;
        if (stats && stats !== lastStats) {
          lastStats = stats;
          metric(
            'fps',
            stats.fps === null ? 'Warming up…' : stats.fps.toFixed(1),
          );
          for (const [key, value] of [
            ['frame', stats.frameMs],
            ['peak', stats.maxFrameMs],
            ['minimum', stats.minFrameMs],
            ['jitter', stats.frameJitterMs],
            ['update', stats.updateMs],
            ['render', stats.renderMs],
          ] as const)
            metric(
              key,
              value === null ? 'Warming up…' : `${value.toFixed(2)} ms`,
            );
        }
        metric('lines', `${visibleLines} / ${submittedLines}`);
        metric(
          'resolution',
          `${view.canvas.width} × ${view.canvas.height} px · ${width} × ${height} logical`,
        );
      },
    });
    const binding = controls.bind(view);
    view.canvas.setAttribute(
      'aria-label',
      content.canvasLabel ??
        'Perspective grid. WASD moves, Q and E change height, arrow keys or drag look around.',
    );
    const resize = new ResizeObserver(() => {
      width = Math.max(1, host.clientWidth);
      height = Math.round((width * 9) / 16);
      view.resize(width, height);
    });
    resize.observe(host);
    scene.own(() => {
      resize.disconnect();
      return;
    });
    const events = new AbortController();
    scene.own(() => {
      events.abort();
      return;
    });
    content.bind?.(events.signal, camera);
    fov.addEventListener(
      'input',
      () => {
        camera.verticalFov = (Number(fov.value) * Math.PI) / 180;
        fovValue.value = `${fov.value}°`;
      },
      { signal: events.signal },
    );
    document
      .querySelector('#reset')!
      .addEventListener('click', reset, { signal: events.signal });
    await application.start();
    restart.disabled = false;
  }
  restart.addEventListener('click', () => {
    void start().catch(showError);
  });
  window.addEventListener(
    'pagehide',
    () => {
      void app?.dispose();
    },
    { once: true },
  );
  function showError(error: unknown) {
    status.value = String(error);
    restart.disabled = false;
  }
  await start().catch(showError);
}
