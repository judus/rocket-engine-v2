import type { ShipGunfire } from './ShipGunfire.js';
import { CrewCallVideo } from './CrewCallVideo.js';
import {
  WebGLSurface,
  WebGLAssets,
  WebGLMeshRenderer3D,
  WebGLBloomPipeline,
} from '../../src/webgl/index.js';
import { Assets } from '../../src/index.js';
import type { ImageLease } from '../../src/Assets.js';
import { WindshieldApp } from './WindshieldApp.js';
import { loadCrewProfiles } from './CrewProfiles.js';
import type { Rocket } from '../../src/index.js';
import type { Stage2D, SceneNavigator } from '../../src/experimental/index.js';
import { loadAsteroidFamily } from './visuals/AsteroidFamily.js';
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
  gunfire: ShipGunfire,
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
  const imageLeases: ImageLease[] = [];
  const callVideo = new CrewCallVideo(
    new URL('games/farwake/assets/comms/', base),
    onError,
  );
  try {
    const images = runtime.use(Assets);
    const crewProfiles = await loadCrewProfiles(
      new URL('games/farwake/characters/', base),
      (url) => fetch(url, { cache: 'no-cache', signal: assetSignal }),
    );
    const portraitResults = await Promise.allSettled(
      crewProfiles.map(async (profile) => {
        const lease = await images.acquireImage(
          new URL(
            `games/farwake/assets/crew/${profile.id}-reference-v1.png`,
            base,
          ),
          { signal: assetSignal },
        );
        imageLeases.push(lease);
        return { profile, image: lease.image };
      }),
    );
    const portraits = portraitResults.map((result) => {
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    });
    const [model, sky, family] = await Promise.all([
      assets.acquireModel(
        new URL('examples/3d/assets/cockpit-hi3d-v3-smartglass.glb', base).href,
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
    const app = new WindshieldApp(portraits, callVideo);
    const cockpit = createCockpitScene(
      ship,
      model.value.instantiate().root,
      family.variants,
      app,
      gunfire,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        app.setVisible(
          document.visibilityState !== 'hidden' &&
            navigator.scene === scene &&
            cockpit.windshield.mode === 'display',
        );
      },
      { signal: assetSignal },
    );
    const selectMaterials = surfaceVariantSwitcher(cockpit.root);
    // One managed resource across all quality switches, including context restoration.
    const gpu = surface.manage((gl) => {
      let detail = video().surfaceDetail;
      const createRenderer = (selected: SurfaceDetail) =>
        new WebGLMeshRenderer3D(gl, {
          lighting: true,
          textures: true,
          shadows: true,
          ...surfaceVariants[selected],
        });
      let renderer = createRenderer(detail);
      let bloom: WebGLBloomPipeline;
      try {
        selectMaterials(detail);
        bloom = new WebGLBloomPipeline(gl);
      } catch (error) {
        renderer.dispose();
        throw error;
      }
      return {
        value: {
          bloom,
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
          bloom.dispose();
          renderer.dispose();
        },
      };
    });
    const presentation = runtime.presentation({
      scene: navigator,
      render() {
        const showFps = video().showFps && navigator.scene === scene;
        if (showFps !== measuring) {
          measuring = showFps;
          counter.hidden = !showFps;
          resetFps();
        }
        app.setVisible(
          navigator.scene === scene &&
            cockpit.windshield.mode === 'display' &&
            document.visibilityState !== 'hidden',
        );
        if (navigator.scene !== scene) return;
        const resource = gpu.current;
        if (!resource) return;
        const renderer = resource.select(video().surfaceDetail);
        surface.resize(
          videoSurfaceScale(video(), window.devicePixelRatio || 1),
          host.clientWidth / Math.max(1, host.clientHeight),
        );
        resource.bloom.render(
          surface.canvas.width,
          surface.canvas.height,
          (target) =>
            cockpit.draw(
              renderer,
              surface.canvas.width,
              surface.canvas.height,
              sky.value,
              target,
            ),
          {
            threshold: 0.7,
            strength: 0.18,
            radius: 1,
            midtoneLift: 0.35,
            colorGrade: {
              shadows: [0.67, 0.79, 1],
              midtones: [1, 0.88, 0.72],
              highlights: [1, 0.98, 0.88],
              strength: 0.25,
            },
          },
        );
        if (showFps) {
          const fps = frameRate.frame(performance.now());
          if (fps !== null) counter.textContent = `FPS ${fps.toFixed(1)}`;
        }
      },
      dispose(): undefined {
        callVideo.dispose();
        loading.abort();
        surface.dispose();
        imageLeases.forEach((lease) => lease.dispose());
        model.dispose();
        sky.dispose();
        assets.dispose();
      },
    });
    return {
      surface,
      instruments: cockpit.instruments,
      setMouseSteering: cockpit.setMouseSteering,
      backWindshield() {
        return app.back();
      },
      selectWindshieldPage(index: number) {
        app.select(index);
      },
      setWindshieldDisplay(active: boolean) {
        cockpit.windshield.setMode(active ? 'display' : 'clear');
        app.setVisible(
          active &&
            navigator.scene === scene &&
            document.visibilityState !== 'hidden',
        );
      },
      update(dt: number) {
        app.update();
        cockpit.windshield.setCallVideo(app.callProjection);
        cockpit.update(dt);
        cockpit.instruments.update(dt);
        cockpit.windshield.update(dt);
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
    callVideo.dispose();
    loading.abort();
    surface.dispose();
    assets.dispose();
    imageLeases.forEach((lease) => lease.dispose());
    throw error;
  }
}
