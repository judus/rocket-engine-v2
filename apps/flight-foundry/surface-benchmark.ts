import { Rocket } from '../../src/index.js';
import { Stage2D } from '../../src/experimental/index.js';
import {
  WebGLSurface,
  WebGLAssets,
  WebGLMeshRenderer3D,
  WebGLGpuTimer,
} from '../../src/webgl/index.js';
import { loadAsteroidFamily } from '../../examples/space/AsteroidFamily.js';
import { createCockpitScene } from '../../games/ship/CockpitScene.js';
import {
  surfaceVariants,
  surfaceVariantSwitcher,
} from '../../games/ship/SurfaceVariants.js';
import type { SurfaceVariant } from '../../games/ship/SurfaceVariants.js';
import { Ship } from '../../games/ship/Ship.js';
import { loadShipSetup } from '../../games/ship/loadShipSetup.js';

function node<T extends HTMLElement>(id: string): T {
  const result = document.querySelector<T>(id);
  if (!result) throw new Error(`Missing benchmark element ${id}`);
  return result;
}
const run = node<HTMLButtonElement>('#run'),
  inspect = node<HTMLSelectElement>('#inspect'),
  status = node('#status');
const lifetime = new AbortController();
let engine: Rocket | undefined;
function fail(error: unknown): void {
  engine?.stop();
  run.disabled = inspect.disabled = true;
  status.textContent = error instanceof Error ? error.message : String(error);
}
const mean = (values: readonly number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
interface Result {
  pass: number;
  variant: SurfaceVariant;
  gpuMs: number | null;
  gpuStatus: string;
  cpuMs: number;
  draws: number;
  triangles: number;
  geometryBytes: number;
  materialBytes: number;
  skyBytes: number;
  samples: number;
}
async function start(): Promise<void> {
  engine = new Rocket({ onError: fail });
  const stage = engine.scene(new Stage2D());
  const surface = new WebGLSurface({
    target: node('#viewport'),
    scene: stage,
    label: 'Fixed pilot-seat renderer comparison',
    onError: fail,
  });
  const assets = new WebGLAssets({ maxTexturePixels: 67108864 });
  const base = new URL('../../../', import.meta.url);
  const [model, sky, family, setup] = await Promise.all([
    assets.acquireModel(
      new URL('examples/3d/assets/cockpit-hi3d-v3-gap-filled.glb', base).href,
      { signal: lifetime.signal },
    ),
    assets.acquireTexture(
      new URL('examples/3d/assets/galactic-plane-1/galactic-plane-1.png', base)
        .href,
      { signal: lifetime.signal },
    ),
    loadAsteroidFamily(lifetime.signal),
    loadShipSetup(new URL('games/ship/ships/science-ship.json', base)),
  ]);
  const ship = stage.entity(() => new Ship(setup.profile, setup.initialState));
  ship.dampers.requestEnabled(true);
  ship.cooling.requestEnabled(true);
  ship.cargo.requestEnabled(true);
  const cockpit = createCockpitScene(
    ship,
    model.value.instantiate().root,
    family.variants,
  );
  ship.fixedUpdate(1 / 60, { dt: 1 / 60, tick: 1, time: 1 / 60 });
  cockpit.instruments.update(1 / 15);
  const selectMaterials = surfaceVariantSwitcher(cockpit.root);
  let renderer: WebGLMeshRenderer3D | undefined,
    timer: WebGLGpuTimer | undefined;
  let variant: SurfaceVariant = 'full',
    phase: 'idle' | 'warm' | 'measure' = 'idle';
  let warm = 0,
    issued = 0,
    waited = 0;
  let cpu: number[] = [];
  const results: Result[] = [];
  const order: SurfaceVariant[] = [
    'full',
    'no-normal',
    'scalar-pbr',
    'diffuse',
    'diffuse',
    'scalar-pbr',
    'no-normal',
    'full',
    'full',
    'scalar-pbr',
    'diffuse',
    'no-normal',
    'full',
  ];
  let cursor = 0;
  const setVariant = (next: SurfaceVariant) => {
    timer?.dispose();
    timer = undefined;
    renderer?.dispose();
    renderer = undefined;
    selectMaterials(next);
    variant = next;
    renderer = new WebGLMeshRenderer3D(surface.gl, {
      lighting: true,
      textures: true,
      ...surfaceVariants[next],
    });
    inspect.value = next;
  };
  const finish = () => {
    phase = 'idle';
    timer?.dispose();
    timer = undefined;
    run.disabled = inspect.disabled = false;
    const groups = Object.keys(surfaceVariants).map((key) => {
      const name = key as SurfaceVariant,
        rows = results.filter((r) => r.variant === name);
      const gpu = rows.flatMap((r) => (r.gpuMs === null ? [] : [r.gpuMs]));
      return {
        variant: name,
        gpuMedianMs: gpu.length === rows.length ? median(gpu) : null,
        cpuMedianMs: median(rows.map((r) => r.cpuMs)),
        materialBytes: rows[0]!.materialBytes,
        geometryBytes: rows[0]!.geometryBytes,
        gpuWindows: gpu.length,
        windows: rows.length,
      };
    });
    node('#summary').textContent = groups
      .map(
        (g) =>
          `${g.variant}: GPU ${g.gpuMedianMs?.toFixed(3) ?? 'unavailable'} ms; CPU ${g.cpuMedianMs.toFixed(3)} ms; materials ${(g.materialBytes / 1048576).toFixed(2)} MiB`,
      )
      .join(' · ');
    const gl = surface.gl,
      info = gl.getExtension('WEBGL_debug_renderer_info');
    node('#raw').textContent = JSON.stringify(
      {
        resolution: [1920, 1080],
        warmFrames: 60,
        measuredFrames: 32,
        renderer: info
          ? (gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as string)
          : (gl.getParameter(gl.RENDERER) as string),
        userAgent: navigator.userAgent,
        antialias: gl.getContextAttributes()?.antialias,
        frozenScene: true,
        results,
        groups,
      },
      null,
      2,
    );
    status.textContent =
      'Comparison complete. Inspect each variant without changing the saved results.';
  };
  const beginPass = () => {
    setVariant(order[cursor]!);
    phase = 'warm';
    warm = issued = waited = 0;
    cpu = [];
    status.textContent = `Pass ${cursor + 1}/${order.length}: ${surfaceVariants[variant].label} · warming 60 frames`;
  };
  engine.presentation({
    scene: stage,
    render(): undefined {
      if (surface.lost)
        throw new Error(
          'Context lost: comparison invalid. Reload before repeating.',
        );
      surface.resize(
        1920 / node('#viewport').clientWidth / (window.devicePixelRatio || 1),
        16 / 9,
      );
      if (surface.canvas.width !== 1920 || surface.canvas.height !== 1080)
        throw new Error(
          `Fixed comparison buffer changed to ${surface.canvas.width}×${surface.canvas.height}; reload before measuring`,
        );
      if (!renderer) return undefined;
      timer?.poll();
      const measuring = phase === 'measure';
      if (measuring && timer!.stats.status === 'disjoint')
        throw new Error(
          'GPU timing became disjoint: comparison invalid. Rerun after reloading.',
        );
      const unsupported = timer?.stats.status === 'unsupported';
      const record =
        measuring && issued < 32 && (unsupported || timer!.begin());
      const started = performance.now();
      let stats;
      try {
        stats = cockpit.draw(renderer, 1920, 1080, sky.value);
      } finally {
        if (record) timer!.end();
      }
      if (record) {
        cpu.push(performance.now() - started);
        issued++;
      }
      if (phase === 'warm' && ++warm >= 60) {
        timer = new WebGLGpuTimer(surface.gl);
        phase = 'measure';
      }
      if (measuring) {
        waited++;
        const gpu = timer!.stats;
        if (waited > 1800)
          throw new Error(
            'GPU measurements did not finish; comparison aborted',
          );
        status.textContent = `Pass ${cursor + 1}/${order.length}: ${variant} · ${unsupported ? issued : gpu.samples}/32 measured frames`;
        if (
          issued === 32 &&
          (unsupported || (gpu.samples === 32 && gpu.pending === 0))
        ) {
          const row: Result = {
            pass: cursor + 1,
            variant,
            gpuMs: unsupported ? null : gpu.averageMs,
            gpuStatus: gpu.status,
            cpuMs: mean(cpu),
            draws: stats.drawCalls,
            triangles: stats.triangles,
            geometryBytes: stats.uploadedBytes,
            materialBytes: renderer.textureStats?.textureBytes ?? 0,
            skyBytes: renderer.backgroundStats?.textureBytes ?? 0,
            samples: unsupported ? 0 : gpu.samples,
          };
          const baseline = results[0];
          if (
            baseline &&
            (baseline.draws !== row.draws ||
              baseline.triangles !== row.triangles)
          )
            throw new Error(
              'Scene geometry/draw count changed: comparison invalid',
            );
          results.push(row);
          const tr = document.createElement('tr');
          for (const text of [
            String(row.pass),
            row.variant,
            row.gpuMs?.toFixed(3) ?? row.gpuStatus,
            row.cpuMs.toFixed(3),
            ...[row.geometryBytes, row.materialBytes, row.skyBytes].map((n) =>
              (n / 1048576).toFixed(2),
            ),
          ]) {
            const td = document.createElement('td');
            td.textContent = text;
            tr.append(td);
          }
          node('#results').append(tr);
          cursor++;
          if (cursor === order.length) finish();
          else beginPass();
        }
      }
      return undefined;
    },
    dispose(): undefined {
      timer?.dispose();
      renderer?.dispose();
      surface.dispose();
      model.dispose();
      sky.dispose();
      assets.dispose();
    },
  });
  setVariant('full');
  run.disabled = inspect.disabled = false;
  status.textContent =
    'Ready. Run comparison to warm and measure every renderer variant.';
  run.addEventListener(
    'click',
    () => {
      results.length = 0;
      cursor = 0;
      node('#results').replaceChildren();
      node('#raw').textContent = 'Comparison running…';
      run.disabled = inspect.disabled = true;
      beginPass();
    },
    { signal: lifetime.signal },
  );
  inspect.addEventListener(
    'change',
    () => {
      setVariant(inspect.value as SurfaceVariant);
      status.textContent = `Inspecting ${surfaceVariants[variant].label}. Saved measurements are unchanged.`;
    },
    { signal: lifetime.signal },
  );
  await engine.start();
}
window.addEventListener(
  'pagehide',
  () => {
    lifetime.abort();
    void engine?.dispose().catch(fail);
  },
  { once: true },
);
void start().catch(async (error) => {
  fail(error);
  await engine?.dispose();
});
