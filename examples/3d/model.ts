import { runLineDemo } from './LineDemo.js';
import {
  loadGlb,
  parseGlb,
  Node3D,
  collectFaces,
  matrixPoint,
  SoftwareDepthRenderer3D,
  CanvasRenderer3D,
} from '../../src/3d/index.js';
import type { GlbModel, PerspectiveCamera, Face } from '../../src/3d/index.js';

const home = {
  x: 0,
  y: 1.5,
  z: 0,
  yaw: 0,
  pitch: 0,
  verticalFov: Math.PI / 3,
  near: 0.03,
  far: 100,
};
await runLineDemo(() => {
  const state = document.querySelector<HTMLOutputElement>('#model-status')!;
  const details = document.querySelector<HTMLElement>('#model-details')!;
  const file = document.querySelector<HTMLInputElement>('#model-file')!;
  const mode = document.querySelector<HTMLSelectElement>('#model-mode')!;
  const resolution =
    document.querySelector<HTMLSelectElement>('#raster-width')!;
  const reload = document.querySelector<HTMLButtonElement>('#load-model')!;
  const cancel = document.querySelector<HTMLButtonElement>('#cancel-load')!;
  const depth = new SoftwareDepthRenderer3D(),
    painter = new CanvasRenderer3D();
  const surface = document.createElement('canvas'),
    context = surface.getContext('2d')!;
  let image: ImageData | undefined,
    faces: Face[] = [],
    pending: AbortController | undefined,
    serial = 0;
  let pilot = { ...home };
  function install(model: GlbModel, camera: PerspectiveCamera) {
    const instance = model.instantiate();
    // glTF looks down -Z. Reflect the mount, preserving source geometry and +X screen-right.
    const mount = new Node3D('glTF-to-Rocket');
    mount.transform = { ...mount.transform, scale: { x: 1, y: 1, z: -1 } };
    mount.add(instance.root);
    faces = collectFaces(mount);
    const preset = instance.cameras[0];
    pilot = { ...home };
    if (preset) {
      const matrix = preset.node.worldMatrix(),
        position = matrixPoint(matrix, { x: 0, y: 0, z: 0 }),
        target = matrixPoint(matrix, { x: 0, y: 0, z: -1 });
      const dx = target.x - position.x,
        dy = target.y - position.y,
        dz = target.z - position.z;
      pilot = {
        ...position,
        yaw: Math.atan2(dx, dz),
        pitch: Math.asin(dy / Math.hypot(dx, dy, dz)),
        verticalFov: preset.yfov,
        near: preset.near,
        far: preset.far,
      };
    }
    Object.assign(home, pilot);
    Object.assign(camera, pilot);
    syncFov(camera);
    details.textContent = `${model.name} · ${model.meshCount} meshes · ${model.triangles.toLocaleString()} triangles · ${model.vertices.toLocaleString()} vertices. ${instance.nodes.filter((n) => n.name.includes('screen-black')).length} named screen surfaces. ${instance.cameras.length} embedded cameras.`;
    state.value =
      'Loaded. Free camera: explore outside too; this asset is an open forward cabin.';
  }
  function syncFov(camera: PerspectiveCamera) {
    const degrees = String(Math.round((camera.verticalFov * 180) / Math.PI));
    document.querySelector<HTMLInputElement>('#fov')!.value = degrees;
    document.querySelector<HTMLOutputElement>('#fov-value')!.value =
      `${degrees}°`;
  }
  return {
    canvasLabel:
      'Imported cockpit v3. Free camera: WASD moves, Q/E changes height; drag or arrows look. R resets to pilot view.',
    bind(signal, camera) {
      async function load(local?: File) {
        pending?.abort();
        const controller = new AbortController();
        pending = controller;
        const request = ++serial;
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        state.value = `Loading ${local?.name ?? 'cockpit v3'}…`;
        cancel.disabled = false;
        try {
          const model = local
            ? parseGlb(await local.arrayBuffer())
            : await loadGlb('./examples/3d/assets/cockpit-forward-v3.glb', {
                signal: controller.signal,
              });
          if (controller.signal.aborted || signal.aborted || request !== serial)
            return;
          install(model, camera);
        } catch (error) {
          if (!signal.aborted && request === serial)
            state.value = controller.signal.aborted
              ? 'Load cancelled. Current model retained.'
              : `Load failed: ${String(error)}. Current model retained; choose another file or retry.`;
        } finally {
          signal.removeEventListener('abort', abort);
          if (request === serial) {
            cancel.disabled = true;
            pending = undefined;
          }
        }
      }
      reload.addEventListener(
        'click',
        () => {
          void load();
        },
        { signal },
      );
      file.addEventListener(
        'change',
        () => {
          const selected = file.files?.[0];
          if (selected) void load(selected);
          file.value = '';
        },
        { signal },
      );
      cancel.addEventListener(
        'click',
        () => {
          pending?.abort();
          state.value = 'Load cancelled. Current model retained.';
        },
        { signal },
      );
      document.querySelector('#outside')!.addEventListener(
        'click',
        () => {
          Object.assign(camera, { x: 5, y: 3, z: -6, yaw: -0.7, pitch: -0.18 });
        },
        { signal },
      );
      void load();
    },
    draw(line, { ctx, camera, width, height }) {
      if (mode.value === 'wire') {
        for (const face of faces)
          for (let i = 0; i < face.vertices.length; i++)
            line(
              face.vertices[i]!,
              face.vertices[(i + 1) % face.vertices.length]!,
              '#88b9c9',
              0.7,
            );
      } else if (mode.value === 'painter')
        painter.drawFaces(ctx, faces, camera, width, height);
      else {
        const w = Number(resolution.value),
          h = Math.max(1, Math.round((w * height) / width));
        if (surface.width !== w || surface.height !== h) {
          surface.width = w;
          surface.height = h;
          image = undefined;
        }
        depth.drawFaces(faces, camera, w, h);
        image ??= new ImageData(depth.pixels, w, h);
        context.putImageData(image, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(surface, 0, 0, width, height);
        ctx.restore();
      }
    },
    dispose() {
      pending?.abort();
      serial++;
      faces = [];
      surface.width = surface.height = 0;
      image = undefined;
    },
  };
}, home);
