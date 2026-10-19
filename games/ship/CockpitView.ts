import {
  WebGLSurface,
  WebGLAssets,
  WebGLMeshRenderer3D,
} from '../../src/webgl/index.js';
import type { Rocket } from '../../src/index.js';
import type { Stage2D, SceneNavigator } from '../../src/experimental/index.js';
import { loadAsteroidFamily } from '../../examples/space/AsteroidFamily.js';
import { createCockpitScene } from './CockpitScene.js';
import { surfaceVariants, surfaceVariantSwitcher } from './SurfaceVariants.js';
import { FrameRate } from './FrameRate.js';
import { videoSurfaceScale } from './VideoSettings.js';
import type { VideoSettings, SurfaceDetail } from './VideoSettings.js';
import type { Ship } from './Ship.js';

/** Game presentation: reads the ship, owns GPU/asset lifetime, never advances physics. */
export async function createCockpitView(
  runtime: Rocket,
  navigator: SceneNavigator,
  scene: Stage2D,
  ship: Ship,
  host: HTMLElement,
  signal: AbortSignal,
  video: () => VideoSettings,
  onError: (error: unknown) => void,
) {
  signal.throwIfAborted();
  const loading = new AbortController();
  const assetSignal = AbortSignal.any([signal, loading.signal]);
  const surface = new WebGLSurface({
    target: host,
    scene,
    label:
      'Spaceship cockpit. Click to fly; use Systems for displays or Menu for settings.',
    onError,
  });
  const assets = new WebGLAssets({
    maxTexturePixels: 67108864,
    maxTextureDimension: surface.gl.getParameter(
      surface.gl.MAX_TEXTURE_SIZE,
    ) as number,
  });
  const counter = document.querySelector<HTMLOutputElement>('#fps-counter');
  if (!counter) throw new Error('Missing FPS counter');
  const hud = host.querySelector<HTMLElement>('#flight-hud');
  if (!hud) throw new Error('Missing flight HUD');
  const hudNode = (id: string) => {
    const element = hud.querySelector<HTMLElement>(id);
    if (!element) throw new Error(`Missing HUD field ${id}`);
    return element;
  };
  const hudFields = {
    speed: hudNode('#hud-speed'),
    mode: hudNode('#hud-mode'),
    target: hudNode('#hud-target'),
    weapons: hudNode('#hud-weapons'),
    heat: hudNode('#hud-heat'),
    alert: hudNode('#hud-alert'),
  };
  const frameRate = new FrameRate();
  let measuring = false;
  const resetFps = () => {
    frameRate.reset();
    counter.textContent = 'FPS —';
  };
  document.addEventListener('visibilitychange', resetFps, {
    signal: assetSignal,
  });
  surface.canvas.addEventListener('webglcontextlost', resetFps, {
    signal: assetSignal,
  });
  surface.canvas.addEventListener('webglcontextrestored', resetFps, {
    signal: assetSignal,
  });
  const base = new URL('../../../', import.meta.url);
  try {
    const [model, sky, family] = await Promise.all([
      assets.acquireModel(
        new URL('examples/3d/assets/cockpit-hi3d-v3-gap-filled.glb', base).href,
        { signal: assetSignal },
      ),
      assets.acquireTexture(
        new URL(
          'examples/3d/assets/galactic-plane-1/galactic-plane-1.png',
          base,
        ).href,
        { signal: assetSignal },
      ),
      loadAsteroidFamily(assetSignal),
    ]);
    assetSignal.throwIfAborted();
    const cockpit = createCockpitScene(
      ship,
      model.value.instantiate().root,
      family.variants,
    );
    let shownHud: typeof cockpit.instruments.status | undefined;
    const selectMaterials = surfaceVariantSwitcher(cockpit.root);
    // One managed resource across all quality switches, including context restoration.
    const gpu = surface.manage((gl) => {
      let detail = video().surfaceDetail;
      const createRenderer = (selected: SurfaceDetail) =>
        new WebGLMeshRenderer3D(gl, {
          lighting: true,
          textures: true,
          ...surfaceVariants[selected],
        });
      let renderer = createRenderer(detail);
      try {
        selectMaterials(detail);
      } catch (error) {
        renderer.dispose();
        throw error;
      }
      return {
        value: {
          select(selected: SurfaceDetail) {
            if (selected !== detail) {
              const next = createRenderer(selected);
              try {
                selectMaterials(selected);
              } catch (error) {
                next.dispose();
                throw error;
              }
              const previous = renderer;
              renderer = next;
              detail = selected;
              previous.dispose();
            }
            return renderer;
          },
        },
        dispose(): undefined {
          renderer.dispose();
        },
      };
    });
    const presentation = runtime.presentation({
      scene: navigator,
      render() {
        hud.hidden = navigator.scene !== scene;
        const showFps = video().showFps && navigator.scene === scene;
        if (showFps !== measuring) {
          measuring = showFps;
          counter.hidden = !showFps;
          resetFps();
        }
        if (navigator.scene !== scene) return;
        const resource = gpu.current;
        if (!resource) return;
        const renderer = resource.select(video().surfaceDetail);
        surface.resize(
          videoSurfaceScale(video(), window.devicePixelRatio || 1),
          host.clientWidth / Math.max(1, host.clientHeight),
        );
        cockpit.draw(
          renderer,
          surface.canvas.width,
          surface.canvas.height,
          sky.value,
        );
        if (showFps) {
          const fps = frameRate.frame(performance.now());
          if (fps !== null) counter.textContent = `FPS ${fps.toFixed(1)}`;
        }
      },
      dispose(): undefined {
        loading.abort();
        surface.dispose();
        model.dispose();
        sky.dispose();
        assets.dispose();
      },
    });
    return {
      surface,
      instruments: cockpit.instruments,
      update(dt: number) {
        cockpit.instruments.update(dt);
        const reading = cockpit.instruments.status;
        if (reading !== shownHud) {
          shownHud = reading;
          for (const key of [
            'speed',
            'mode',
            'target',
            'weapons',
            'heat',
            'alert',
          ] as const)
            hudFields[key].textContent = reading[key];
          hudFields.alert.dataset.critical = String(reading.critical);
        }
      },
      click(event: MouseEvent) {
        const rect = surface.canvas.getBoundingClientRect();
        const point = surface.clientToWorld({
          x: event.clientX,
          y: event.clientY,
        });
        if (!rect.width || !rect.height) return;
        cockpit.click(point.x, point.y, surface.width, surface.height);
      },
      dispose() {
        presentation.dispose();
      },
    };
  } catch (error) {
    loading.abort();
    surface.dispose();
    assets.dispose();
    throw error;
  }
}
