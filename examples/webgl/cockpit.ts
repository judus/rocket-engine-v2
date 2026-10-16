import { cockpitAsteroidField } from '../space/CockpitAsteroidField.js';
import { cockpitScreenLights } from './CockpitScreenLights.js';
import type {
  WebGLBloomPass,
  WebGLRenderTarget,
} from '../../src/webgl/index.js';
import type { BloomOptions } from '../../src/webgl/index.js';
import { cockpitReticle } from './CockpitReticle.js';
import { attachCockpitDisplays } from './CockpitDisplays.js';
import { cockpitInstruments } from './CockpitInstruments.js';
import { cockpitShadowFit } from './CockpitShadowFit.js';
import { directionalShadowMatrix } from '../../src/3d/index.js';
import type { DirectionalShadow3D } from '../../src/3d/index.js';
import { studioEnvironment, previewEnvironment } from './StudioEnvironment.js';
import { referenceGrid } from './ReferenceGrid.js';
import { explorationInput } from './ExplorationInput.js';
import {
  WebGLSurface,
  WebGLAssets,
  WebGLBloomPipeline,
} from '../../src/webgl/index.js';
import {
  transformMatrix,
  multiplyMatrices,
  identityMatrix,
} from '../../src/3d/index.js';
import { normalMapProbe } from './NormalMapProbe.js';
import type { Light3D } from '../../src/3d/index.js';
import { Rocket, Scene2D } from '../../src/index.js';
import { WebGLMeshRenderer3D, WebGLGpuTimer } from '../../src/webgl/index.js';
import { Node3D, matrixPoint, PerspectiveCamera } from '../../src/3d/index.js';

const screenLightEnabled = document.querySelector<HTMLInputElement>(
  '#screen-light-enabled',
);
const screenPower = document.querySelector<HTMLInputElement>('#screen-power');
const screenLightStrength = document.querySelector<HTMLInputElement>(
  '#screen-light-strength',
);
const screenLightOnly =
  document.querySelector<HTMLInputElement>('#screen-light-only');

const bloomEnabled = document.querySelector<HTMLInputElement>('#bloom-enabled');
const bloomInput = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;

const instrumentRunning = document.querySelector<HTMLInputElement>(
  '#instruments-running',
);
const instrumentRate =
  document.querySelector<HTMLInputElement>('#instruments-rate');
const instruments = instrumentRunning ? cockpitInstruments() : undefined;
document
  .querySelector('#instruments-step')
  ?.addEventListener('click', () => instruments?.advance());

const host = document.querySelector<HTMLElement>('#gpu-view')!;
// Asset selection belongs to the demo; loader and rendering contracts are unchanged.
const modelUrl =
  host.dataset.model ?? './examples/3d/assets/cockpit-forward-v4-materials.glb';
const modelLabel = host.dataset.modelLabel ?? 'Cockpit v4';
// Inspection pages may place an unfamiliar asset without modifying its source.
function assetNumber(key: string, fallback: number): number {
  const value = Number(host.dataset[key] ?? fallback);
  if (!Number.isFinite(value))
    throw new Error(`Invalid asset placement: ${key}`);
  return value;
}
const modelScale = assetNumber('modelScale', 1);
if (modelScale <= 0) throw new Error('Model scale must be positive');
const asteroidWorld = host.dataset.world === 'asteroids';
const fieldControl = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;

const status = document.querySelector<HTMLOutputElement>('#gpu-status')!;
const diagnostics =
  document.querySelector<HTMLOutputElement>('#gpu-diagnostic')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
// Cockpit milestones share presentation/controls; each page opts into its rendering slice.
const environmentEnabled = document.querySelector<HTMLInputElement>(
  '#environment-enabled',
);
const environmentStrength = document.querySelector<HTMLInputElement>(
  '#environment-strength',
);
const environmentYaw =
  document.querySelector<HTMLInputElement>('#environment-yaw');
const environment = environmentEnabled ? studioEnvironment() : undefined;
if (environment)
  previewEnvironment(
    environment,
    document.querySelector<HTMLElement>('#environment-preview')!,
  );
const shadowsEnabled =
  document.querySelector<HTMLInputElement>('#shadows-enabled');
const shadowInput = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const ambientDefault = environment ? '0.02' : '0.08';
const directionalDefault = shadowsEnabled ? '1.4' : environment ? '0.35' : '1';
const pointDefault = shadowsEnabled ? '0' : environment ? '6' : '12';
const assets = new WebGLAssets(
  host.dataset.largeTextures === 'true'
    ? { maxImagePixels: 67108864, maxTotalPixels: 134217728 }
    : {},
);
let app: Rocket | undefined,
  retired = 0;
async function start() {
  restart.disabled = true;
  await app?.dispose();
  status.value = `Loading ${modelLabel} and embedded materials…`;
  const application = new Rocket({
    performance: true,
    onError: (error) => {
      status.value = String(error);
    },
  });
  app = application;
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        keys.update();
        look(
          (keys('ArrowRight') - keys('ArrowLeft')) * dt,
          (keys('ArrowDown') - keys('ArrowUp')) * dt,
        );
        const previousPosition = [
          Number(cameraX.value),
          Number(cameraY.value),
          Number(cameraZ.value),
        ] as const;
        const forward =
            keys('KeyW') -
            keys('KeyS') +
            Number(asteroidWorld && fieldControl('cruise').checked),
          right = keys('KeyD') - keys('KeyA'),
          up = keys('KeyE') - keys('KeyQ');
        const yaw = (Number(cameraYaw.value) * Math.PI) / 180,
          pitch = (Number(cameraPitch.value) * Math.PI) / 180;
        const speed = asteroidWorld ? 8 : 3;
        const boost = asteroidWorld ? 30 : 12;
        const distance =
          ((keys('ShiftLeft') || keys('ShiftRight') ? boost : speed) * dt) /
          (Math.hypot(forward, right, up) || 1);
        cameraX.value = String(
          Number(cameraX.value) +
            (Math.sin(yaw) * Math.cos(pitch) * forward +
              Math.cos(yaw) * right) *
              distance,
        );
        cameraY.value = String(
          Number(cameraY.value) + (Math.sin(pitch) * forward + up) * distance,
        );
        cameraZ.value = String(
          Number(cameraZ.value) +
            (Math.cos(yaw) * Math.cos(pitch) * forward -
              Math.sin(yaw) * right) *
              distance,
        );
        const navigationSpeed =
          dt > 0
            ? Math.hypot(
                Number(cameraX.value) - previousPosition[0],
                Number(cameraY.value) - previousPosition[1],
                Number(cameraZ.value) - previousPosition[2],
              ) / dt
            : 0;
        if (screenPower) instruments?.setPowered(screenPower.checked);
        instruments?.update(
          dt,
          instrumentRunning!.checked,
          Number(instrumentRate!.value),
          {
            x: Number(cameraX.value),
            y: Number(cameraY.value),
            z: Number(cameraZ.value),
            yaw: Number(cameraYaw.value),
            pitch: Number(cameraPitch.value),
            speed: navigationSpeed,
          },
        );
        const instrumentStatus = document.querySelector<HTMLOutputElement>(
          '#instruments-status',
        );
        if (instrumentStatus && instruments)
          instrumentStatus.value = `Five live displays · ${instrumentRate!.value} Hz · ${instruments.draws} draws per display · local ${Number(cameraX.value).toFixed(1)}, ${Number(cameraY.value).toFixed(1)}, ${Number(cameraZ.value).toFixed(1)} U · heading ${(((Number(cameraYaw.value) % 360) + 360) % 360).toFixed(1)}° / pitch ${Number(cameraPitch.value).toFixed(1)}° · ${navigationSpeed.toFixed(1)} U/s · ${pilot.checked ? 'pilot navigation' : 'free camera'}`;
        if (animate.checked) phase = (phase + dt * 0.5) % (Math.PI * 2);
        if (orbitLight.checked)
          lightPhase = (lightPhase + dt * 0.6) % (Math.PI * 2);
      },
    }),
  );
  const surface = new WebGLSurface({
    target: host,
    scene,
    label: `GPU lighting: ${modelLabel}. Click to focus. WASD moves, Q/E changes height, Shift speeds up, drag or arrows turn, R returns home.`,
    onError: (error) => {
      status.value = String(error);
    },
  });
  const { canvas, gl } = surface;
  const events = new AbortController(),
    signal = events.signal;
  window.addEventListener('pagehide', () => events.abort(), {
    once: true,
    signal,
  });
  const root = new Node3D('cockpit scene'),
    assembly = new Node3D('glTF-to-Rocket'),
    rig = new Node3D('pilot rig'),
    grid = referenceGrid();
  assembly.transform = { ...assembly.transform, scale: { x: 1, y: 1, z: -1 } };
  if (shadowsEnabled) {
    grid.castsShadow = false;
    grid.receivesShadow = false;
  }
  root.add(grid);
  // World content is a sibling of the pilot rig, never a cockpit child.
  let field = asteroidWorld ? cockpitAsteroidField(2126, 96) : undefined;
  if (field) root.add(field);
  if (asteroidWorld) {
    fieldControl('field-seed').value = '2126';
    fieldControl('field-count').value = '96';
    fieldControl('cruise').checked = false;
    document.querySelector('#field-generate')!.addEventListener(
      'click',
      () => {
        if (!fieldControl('field-seed').reportValidity()) return;
        try {
          const next = cockpitAsteroidField(
            Number(fieldControl('field-seed').value),
            Number(fieldControl('field-count').value),
          );
          if (field) root.remove(field);
          field = next;
          root.add(next);
        } catch (error) {
          status.value = String(error);
        }
      },
      { signal },
    );
  }
  root.add(rig);
  rig.add(assembly);
  let model;
  let modelLease: Awaited<ReturnType<WebGLAssets['acquireModel']>> | undefined;
  try {
    modelLease = await assets.acquireModel(modelUrl, { signal });
    model = modelLease.value;
  } catch (error) {
    events.abort();
    surface.dispose();
    await application.dispose();
    throw error;
  }
  if (app !== application || signal.aborted) {
    events.abort();
    modelLease?.dispose();
    surface.dispose();
    return;
  }
  const instance = model.instantiate();
  if (instruments)
    attachCockpitDisplays(
      instance.root,
      { image: instruments.radar },
      { image: instruments.telemetry },
      instruments.overhead.map((image) => ({ image })) as [
        { image: typeof instruments.radar },
        { image: typeof instruments.radar },
        { image: typeof instruments.radar },
      ],
    );
  const screenLights = screenLightEnabled
    ? cockpitScreenLights(instance.root)
    : undefined;
  const placement = new Node3D('asset placement');
  placement.transform = {
    position: { x: 0, y: assetNumber('modelY', 0), z: 0 },
    rotation: { x: 0, y: (assetNumber('modelYaw', 0) * Math.PI) / 180, z: 0 },
    scale: { x: modelScale, y: modelScale, z: modelScale },
  };
  placement.add(instance.root);
  const tuningPanel = document.querySelector('#cockpit-tuning');
  if (tuningPanel) {
    // Scale around the preview's visual center, independently of its exported origin.
    const pivotY = assetNumber('modelCenterY', 1.5);
    const tuning = new Node3D('cockpit tuning');
    placement.transform = {
      ...placement.transform,
      position: { x: 0, y: assetNumber('modelY', 0) - pivotY, z: 0 },
    };
    tuning.add(placement);
    assembly.add(tuning);
    const ids = ['cockpit-width', 'cockpit-height', 'cockpit-y', 'cockpit-z'];
    const controls = ids.map((id) =>
      document.querySelector<HTMLInputElement>(`#${id}`)!,
    );
    const defaults = controls.map((control) => Number(control.defaultValue));
    const storageKey = `rocket:cockpit-tuning:${modelUrl}`;
    const savedStatus = document.querySelector('#cockpit-tuning-status')!;
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(storageKey) ?? 'null',
      );
      if (Array.isArray(saved) && saved.length === controls.length) {
        controls.forEach((control, i) => {
          const value: unknown = saved[i];
          if (
            typeof value === 'number' &&
            Number.isFinite(value) &&
            value >= Number(control.min) &&
            value <= Number(control.max)
          )
            control.value = String(value);
        });
      }
    } catch {
      savedStatus.textContent =
        'Saved settings unavailable; controls still work.';
    }
    const applyTuning = (save: boolean) => {
      const values = controls.map((control) => Number(control.value));
      const [width, height, y, z] = values as [number, number, number, number];
      tuning.transform = {
        position: { x: 0, y: pivotY + y, z: -z },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: width, y: height, z: 1 },
      };
      controls.forEach((control, i) => {
        document.querySelector<HTMLOutputElement>(
          `#${control.id}-value`,
        )!.value = `${values[i]!.toFixed(2)}${i < 2 ? '×' : ' U'}`;
      });
      document.querySelector('#cockpit-tuning-values')!.textContent =
        JSON.stringify(
          {
            model: modelUrl,
            widthScale: width,
            heightScale: height,
            offsetY: y,
            offsetZ: z,
            camera: { x: home.x, y: home.y, z: home.z },
          },
          null,
          2,
        );
      if (save) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(values));
          savedStatus.textContent = 'Settings saved in this browser.';
        } catch {
          savedStatus.textContent =
            'Storage unavailable; copy the values below to keep them.';
        }
      }
    };
    controls.forEach((control) =>
      control.addEventListener('input', () => applyTuning(true), { signal }),
    );
    document.querySelector('#cockpit-tuning-reset')!.addEventListener(
      'click',
      () => {
        controls.forEach((control, i) => {
          control.value = String(defaults[i]);
        });
        applyTuning(true);
      },
      { signal },
    );
    // Delayed until the fixed camera home has been initialized below.
    queueMicrotask(() => {
      if (!signal.aborted) applyTuning(false);
    });
  } else {
    assembly.add(placement);
  }
  const shadowFit = shadowsEnabled ? cockpitShadowFit(assembly) : undefined;
  const reticle = instruments ? cockpitReticle() : undefined;
  if (reticle) assembly.add(reticle);
  const preset = instance.cameras[0];
  const position = preset
    ? matrixPoint(preset.node.worldMatrix(), { x: 0, y: 0, z: 0 })
    : { x: 0, y: assetNumber('eyeY', 1.5), z: assetNumber('eyeZ', 0) };
  const target = preset
    ? matrixPoint(preset.node.worldMatrix(), { x: 0, y: 0, z: -1 })
    : { x: position.x, y: position.y, z: position.z + 1 };
  const home = {
    ...position,
    yaw: Math.atan2(target.x - position.x, target.z - position.z),
    pitch: Math.asin(
      (target.y - position.y) /
        Math.hypot(
          target.x - position.x,
          target.y - position.y,
          target.z - position.z,
        ),
    ),
    fov: preset?.yfov ?? Math.PI / 3,
  };
  // Home camera inverse: rigid orientation transpose plus inverse translation.
  const pose = (x: number, y: number, z: number, yaw: number, pitch: number) =>
    transformMatrix({
      position: { x, y, z },
      rotation: { x: -pitch, y: yaw, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    });
  const base = pose(home.x, home.y, home.z, home.yaw, home.pitch);
  const inverseRotation = [
    base[0],
    base[4],
    base[8],
    0,
    base[1],
    base[5],
    base[9],
    0,
    base[2],
    base[6],
    base[10],
    0,
    0,
    0,
    0,
    1,
  ] as const;
  const inverseHome = multiplyMatrices(
    inverseRotation,
    transformMatrix({
      position: { x: -home.x, y: -home.y, z: -home.z },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }),
  );
  const pilot = document.querySelector<HTMLInputElement>('#pilot-rig')!;
  const showGrid = document.querySelector<HTMLInputElement>('#reference-grid')!;
  const response =
    document.querySelector<HTMLInputElement>('#material-response')!;
  const channel =
    document.querySelector<HTMLSelectElement>('#material-channel')!;
  const normalEnabled =
    document.querySelector<HTMLInputElement>('#normal-enabled')!;
  const normalDebug =
    document.querySelector<HTMLInputElement>('#normal-debug')!;
  const cameraX = document.querySelector<HTMLInputElement>('#camera-x')!,
    cameraY = document.querySelector<HTMLInputElement>('#camera-y')!,
    cameraZ = document.querySelector<HTMLInputElement>('#camera-z')!;
  for (const control of [cameraX, cameraY, cameraZ]) control.step = 'any';
  cameraX.value = String(home.x);
  cameraY.value = String(home.y);
  cameraZ.value = String(home.z);
  document.querySelector('#model-details')!.textContent =
    `${model.name} · ${model.meshCount} meshes · ${model.triangles} triangles · ${model.vertices} vertices · ${instance.cameras.length} embedded camera. Source material bindings, UVs and tangent signs preserved.`;
  const lit = document.querySelector<HTMLInputElement>('#lighting-enabled')!;
  const ambient = document.querySelector<HTMLInputElement>('#ambient')!;
  const directional = document.querySelector<HTMLInputElement>('#directional')!;
  const pointStrength =
    document.querySelector<HTMLInputElement>('#point-strength')!;
  const pointX = document.querySelector<HTMLInputElement>('#point-x')!;
  const pointY = document.querySelector<HTMLInputElement>('#point-y')!;
  const pointZ = document.querySelector<HTMLInputElement>('#point-z')!;
  const orbitLight = document.querySelector<HTMLInputElement>('#orbit-light')!;
  lit.checked = true;
  ambient.value = ambientDefault;
  directional.value = directionalDefault;
  pointStrength.value = pointDefault;
  pointX.value = '-1.5';
  pointY.value = '2';
  pointZ.value = '-2';
  orbitLight.checked = false;
  let lightPhase = 0;
  const camera = new PerspectiveCamera();
  camera.near = preset?.near ?? 0.03;
  camera.far = asteroidWorld ? 600 : (preset?.far ?? 100);
  const depthTest = document.querySelector<HTMLInputElement>('#depth-test')!;
  const reverseOrder =
    document.querySelector<HTMLInputElement>('#reverse-order')!;
  const cameraYaw = document.querySelector<HTMLInputElement>('#camera-yaw')!;
  const cameraPitch =
    document.querySelector<HTMLInputElement>('#camera-pitch')!;
  for (const control of [cameraX, cameraY, cameraZ, cameraYaw, cameraPitch])
    control.step = 'any';
  depthTest.checked = true;
  reverseOrder.checked = false;
  cameraYaw.value = String((home.yaw * 180) / Math.PI);
  cameraPitch.value = String((home.pitch * 180) / Math.PI);
  const animate =
    document.querySelector<HTMLInputElement>('#animate-triangle')!;
  const angle = document.querySelector<HTMLInputElement>('#triangle-angle')!;
  const scale = document.querySelector<HTMLInputElement>('#triangle-scale')!;
  const lose = document.querySelector<HTMLButtonElement>('#lose-context')!;
  const restore =
    document.querySelector<HTMLButtonElement>('#restore-context')!;
  const extension = gl.getExtension('WEBGL_lose_context');
  const antialias = gl.getContextAttributes()?.antialias ?? false;
  const renderScale =
    document.querySelector<HTMLInputElement>('#render-scale')!;
  let renderer: WebGLMeshRenderer3D | undefined,
    bloom: WebGLBloomPass | undefined,
    sceneTarget: WebGLRenderTarget | undefined,
    pipeline: WebGLBloomPipeline | undefined,
    timer: WebGLGpuTimer | undefined,
    lost = false,
    phase = 0,
    sample = false,
    width = 960,
    height = 540;
  animate.checked = false;
  angle.value = '0';
  scale.value = String(Math.round((home.fov * 180) / Math.PI));
  diagnostics.value =
    'Pixel readback runs only when requested, outside performance comparisons.';
  const retirePostProcess = () => {
    pipeline?.dispose();
    pipeline = undefined;
    bloom = undefined;
    sceneTarget = undefined;
  };
  const initialize = () => {
    retirePostProcess();
    timer?.dispose();
    timer = new WebGLGpuTimer(gl);
    renderer?.dispose();
    renderer = undefined;
    try {
      const next = new WebGLMeshRenderer3D(gl, {
        lighting: true,
        textures: true,
        materialResponse: true,
        materialMaps: true,
        normalMapping: true,
        environment: !!environment,
        shadows: !!shadowsEnabled,
      });
      renderer = next;
      if (bloomEnabled) {
        pipeline = new WebGLBloomPipeline(gl);
        sceneTarget = pipeline.target;
        bloom = pipeline.bloom;
      }
      status.value = `WebGL2 mesh renderer ready · cleaned presentations ${retired}`;
    } catch (error) {
      retirePostProcess();
      renderer?.dispose();
      renderer = undefined;
      status.value = String(error);
    }
  };
  const look = (dx: number, dy: number) => {
    cameraYaw.value = String(
      ((Number(cameraYaw.value) + (dx * 180) / Math.PI + 540) % 360) - 180,
    );
    cameraPitch.value = String(
      Math.max(
        -75,
        Math.min(75, Number(cameraPitch.value) - (dy * 180) / Math.PI),
      ),
    );
  };
  const keys = explorationInput(application, scene, surface, look, () =>
    document.querySelector<HTMLButtonElement>('#reset-triangle')!.click(),
  );
  application.presentation({
    scene,
    render() {
      if (lost || gl.isContextLost() || !renderer) return;
      // CSS owns layout; the drawing buffer follows physical display pixels.
      // Read DPR each frame so moving between monitors needs no new renderer.
      const ratio = window.devicePixelRatio || 1;
      const resolutionScale = Number(renderScale.value) / 100;
      surface.resize(resolutionScale);
      width = surface.width;
      height = surface.height;
      const w = canvas.width,
        h = canvas.height;
      const resolution = { limited: surface.limited };
      document.querySelector<HTMLOutputElement>('#render-scale-value')!.value =
        `${renderScale.value}%`;
      const rotation = (Number(angle.value) * Math.PI) / 180 + phase;
      assembly.transform = {
        ...assembly.transform,
        rotation: { x: 0, y: rotation, z: 0 },
      };
      camera.yaw = (Number(cameraYaw.value) * Math.PI) / 180;
      camera.pitch = (Number(cameraPitch.value) * Math.PI) / 180;
      camera.x = Number(cameraX.value);
      camera.y = Number(cameraY.value);
      camera.z = Number(cameraZ.value);
      camera.verticalFov = (Number(scale.value) * Math.PI) / 180;
      grid.visible = showGrid.checked;
      if (field) {
        field.visible = fieldControl('field-enabled').checked;
        document.querySelector('#field-status')!.textContent =
          `${field.name} · ${field.children.length} rocks · ${field.visible ? 'visible' : 'hidden'} · fixed world placement · camera far plane ${camera.far} U`;
      }
      if (reticle)
        reticle.visible =
          document.querySelector<HTMLInputElement>('#reticle-enabled')!.checked;
      if (pilot.checked)
        rig.matrix = multiplyMatrices(
          pose(camera.x, camera.y, camera.z, camera.yaw, camera.pitch),
          inverseHome,
        );
      const lightYaw = shadowsEnabled
        ? (Number(shadowInput('light-yaw').value) * Math.PI) / 180
        : 0;
      const lightElevation = shadowsEnabled
        ? (Number(shadowInput('light-elevation').value) * Math.PI) / 180
        : 0;
      const lightDirection = shadowsEnabled
        ? {
            x: Math.sin(lightYaw) * Math.cos(lightElevation),
            y: Math.sin(lightElevation),
            z: Math.cos(lightYaw) * Math.cos(lightElevation),
          }
        : { x: -0.5, y: 1, z: -0.6 };
      let shadow: DirectionalShadow3D | undefined;
      if (shadowFit) {
        const rotationMatrix = transformMatrix({
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: rotation, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        });
        const center = matrixPoint(
          multiplyMatrices(rig.worldMatrix(), rotationMatrix),
          shadowFit.center,
        );
        const extent = shadowFit.radius * 1.05;
        shadow = {
          lightIndex: 1,
          matrix: directionalShadowMatrix(
            lightDirection,
            center,
            extent,
            shadowFit.radius * 2.2,
          ),
          resolution: Number(
            document.querySelector<HTMLSelectElement>('#shadow-resolution')!
              .value,
          ),
          bias: Number(shadowInput('shadow-bias').value) / 10000,
          slopeBias: Number(shadowInput('shadow-slope').value) / 10000,
          filter: shadowInput('shadow-pcf').checked ? 'pcf' : 'hard',
          enabled: shadowsEnabled!.checked,
        };
      }
      const lights: Light3D[] = [
        {
          kind: 'ambient',
          color: [0.65, 0.78, 1],
          intensity: screenLightOnly?.checked ? 0 : Number(ambient.value),
        },
        {
          kind: 'directional',
          direction: lightDirection,
          color: [1, 0.97, 0.9],
          intensity: screenLightOnly?.checked ? 0 : Number(directional.value),
        },
        {
          kind: 'point',
          position: {
            x:
              Number(pointX.value) +
              (orbitLight.checked ? Math.sin(lightPhase) * 2 : 0),
            y: Number(pointY.value),
            z:
              Number(pointZ.value) +
              (orbitLight.checked ? Math.cos(lightPhase) * 2 : 0),
          },
          color: [1, 0.65, 0.28],
          intensity: screenLightOnly?.checked ? 0 : Number(pointStrength.value),
          minimumDistance: 0.2,
        },
      ];
      if (screenLights) {
        const spill = screenLights(
          screenLightEnabled!.checked ? Number(screenLightStrength!.value) : 0,
          screenPower!.checked,
        );
        lights.push(...spill);
        document.querySelector<HTMLOutputElement>(
          '#screen-light-value',
        )!.value = `${screenLightStrength!.value}×`;
        document.querySelector('#screen-light-status')!.textContent =
          `${screenPower!.checked ? 'Displays powered' : 'Displays off'} · ${spill.length} attached point lights · ${lights.length}/8 lighting slots · ${lit.checked ? (screenLightOnly!.checked ? 'screen lighting isolated' : 'scene lighting combined') : 'unlit view: surface illumination bypassed'}`;
      }
      document.querySelector('#light-status')!.textContent =
        `${lit.checked ? (response.checked ? 'GGX material response' : 'Lambert comparison') : 'Unlit base color'} · camera ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}, ${camera.z.toFixed(1)}`;
      if (sceneTarget) sceneTarget.resize(w, h);
      const renderScene = () =>
        renderer!.render(root, camera, w, h, {
          ...(sceneTarget ? { target: sceneTarget } : {}),
          depthTest: depthTest.checked,
          reverseOrder: reverseOrder.checked,
          lights,
          ...(shadow
            ? { shadow, shadowDebug: shadowInput('shadow-debug').checked }
            : {}),
          ...(environment
            ? {
                environment: {
                  map: environment,
                  intensity:
                    environmentEnabled!.checked && !screenLightOnly?.checked
                      ? Number(environmentStrength!.value) / 100
                      : 0,
                  rotation: (Number(environmentYaw!.value) * Math.PI) / 180,
                },
              }
            : {}),
          lightingEnabled: lit.checked,
          materialResponseEnabled: response.checked,
          normalMappingEnabled: normalEnabled.checked,
          normalDebug: normalDebug.checked,
          materialDebug: channel.value as
            'none' | 'occlusion' | 'roughness' | 'metallic',
        });
      const presentBloom = (draw = true) => {
        if (!bloom || !sceneTarget) return;
        const diagnostic =
          normalDebug.checked ||
          channel.value !== 'none' ||
          (shadowsEnabled && shadowInput('shadow-debug').checked);
        const view = document.querySelector<HTMLSelectElement>('#bloom-view')!
          .value as NonNullable<BloomOptions['view']>;
        if (draw)
          bloom.render(sceneTarget, {
            threshold: Number(bloomInput('bloom-threshold').value),
            strength: bloomEnabled!.checked
              ? Number(bloomInput('bloom-strength').value)
              : 0,
            radius: Number(bloomInput('bloom-radius').value),
            view: diagnostic ? 'scene' : view,
          });
        for (const name of ['threshold', 'strength', 'radius'])
          document.querySelector<HTMLOutputElement>(
            `#bloom-${name}-value`,
          )!.value = bloomInput(`bloom-${name}`).value;
        const stats = bloom.stats;
        document.querySelector('#bloom-status')!.textContent =
          `${diagnostic ? 'Scene diagnostic: bloom bypassed' : bloomEnabled!.checked ? view : 'Bloom disabled (stage views remain available)'} · ${stats.drawCalls} fullscreen passes · ${stats.width} × ${stats.height} glow · ${((sceneTarget.estimatedBytes + stats.estimatedBytes) / 1048576).toFixed(2)} MiB scene + glow targets · offscreen MSAA off`;
      };
      timer?.poll();
      const measuring = !sample && (timer?.begin() ?? false);
      try {
        let result;
        if (pipeline) {
          const diagnostic =
            normalDebug.checked ||
            channel.value !== 'none' ||
            (shadowsEnabled && shadowInput('shadow-debug').checked);
          result = pipeline.render(w, h, () => renderScene(), {
            threshold: Number(bloomInput('bloom-threshold').value),
            strength: bloomEnabled!.checked
              ? Number(bloomInput('bloom-strength').value)
              : 0,
            radius: Number(bloomInput('bloom-radius').value),
            view: diagnostic
              ? 'scene'
              : (document.querySelector<HTMLSelectElement>('#bloom-view')!
                  .value as NonNullable<BloomOptions['view']>),
          });
          // presentBloom updates the existing diagnostics below; avoid a second GPU pass.
          presentBloom(false);
        } else result = renderScene();
        if (environment) {
          const envStats = renderer.environmentStats!;
          document.querySelector('#environment-status')!.textContent =
            `Studio environment ${environmentEnabled!.checked && !screenLightOnly?.checked ? environmentStrength!.value : 0}% · world yaw ${environmentYaw!.value}° · ${envStats.textures} retained textures · ${(envStats.textureBytes / 1024).toFixed(1)} KiB (separate from material maps)`;
        }
        if (shadowFit) {
          const stats = renderer.shadowStats!;
          document.querySelector('#shadow-status')!.textContent =
            `${stats.drawCalls} depth draws · ${stats.triangles} caster triangles · ${stats.resolution}² / ${(stats.depthBytes / 1048576).toFixed(2)} MiB estimated · fitted width ${(shadowFit.radius * 2.1).toFixed(2)} units · bias ${shadow!.bias!.toFixed(4)} + slope ${shadow!.slopeBias!.toFixed(4)}`;
        }
        const resources = renderer.textureStats!;
        document.querySelector('#mesh-stats')!.textContent =
          `${result.drawCalls} draws · ${result.triangles} triangles · ${result.uploadedBytes} geometry bytes · ${resources.textures} textures · ${resources.samplers} samplers · ${(resources.textureBytes / 1048576).toFixed(2)} MiB RGBA8 + mip levels`;
      } finally {
        if (measuring) timer?.end();
      }
      const gpu = timer?.stats;
      document.querySelector('#perf-gpu')!.textContent =
        gpu?.averageMs == null
          ? (gpu?.status ?? 'unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-peak')!.textContent =
        gpu?.maxMs == null ? '—' : `${gpu.maxMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-samples')!.textContent =
        `${gpu?.samples ?? 0}/32 valid samples · ${gpu?.pending ?? 0}/4 pending · ${gpu?.status ?? 'unavailable'}`;
      document.querySelector<HTMLOutputElement>('#angle-value')!.value =
        `${((rotation * 180) / Math.PI).toFixed(0)}°`;
      document.querySelector<HTMLOutputElement>('#scale-value')!.value =
        `${scale.value}°`;
      const stats = application.performance;
      if (stats) {
        for (const [id, v] of [
          ['fps', stats.fps],
          ['frame', stats.frameMs],
          ['peak', stats.maxFrameMs],
          ['minimum', stats.minFrameMs],
          ['jitter', stats.frameJitterMs],
          ['update', stats.updateMs],
          ['render', stats.renderMs],
        ] as const) {
          document.querySelector(`#perf-${id}`)!.textContent =
            v === null
              ? 'Warming up…'
              : id === 'fps'
                ? v.toFixed(1)
                : `${v.toFixed(2)} ms`;
        }
      }
      document.querySelector('#perf-resolution')!.textContent =
        `${w} × ${h} raster pixels · ${width} × ${height} CSS · DPR ${ratio.toFixed(2)} · ${renderScale.value}% render scale${resolution.limited ? ' · limited by GPU dimensions' : ''} · ${sceneTarget ? 'offscreen MSAA off' : `GPU antialias ${antialias ? 'on' : 'off'}`}`;
      if (sample) {
        diagnostics.value = `${normalMapProbe(renderer, w, h)} GL error ${gl.getError()} (0 = no error).`;
        renderScene();
        presentBloom();
        sample = false;
      }
    },
    dispose() {
      events.abort();
      modelLease?.dispose();
      surface.dispose();
      retired++;
    },
  });
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      lost = true;
      retirePostProcess();
      // Retire old-generation handles while the context is lost. Deleting them
      // after restoration would submit stale objects to a new GL generation.
      renderer?.dispose();
      renderer = undefined;
      timer?.poll();
      document.querySelector('#perf-gpu')!.textContent = 'context lost';
      document.querySelector('#perf-gpu-peak')!.textContent = '—';
      document.querySelector('#perf-gpu-samples')!.textContent =
        'Samples invalidated';
      restore.disabled = !extension;
      lose.disabled = true;
      status.value =
        'WebGL context lost. Simulation continues; GPU draws suspended. Restore context to rebuild resources.';
    },
    { signal },
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      restore.disabled = true;
      lose.disabled = !extension;
    },
    { signal },
  );
  lose.disabled = !extension;
  restore.disabled = true;
  lose.addEventListener('click', () => extension?.loseContext(), { signal });
  restore.addEventListener('click', () => extension?.restoreContext(), {
    signal,
  });
  document.querySelector('#read-pixel')!.addEventListener(
    'click',
    () => {
      sample = true;
    },
    { signal },
  );
  document.querySelector('#reset-triangle')!.addEventListener(
    'click',
    () => {
      pilot.checked = true;
      if (asteroidWorld) fieldControl('cruise').checked = false;
      rig.matrix = identityMatrix;
      cameraX.value = String(home.x);
      cameraY.value = String(home.y);
      cameraZ.value = String(home.z);
      phase = 0;
      angle.value = '0';
      scale.value = String(Math.round((home.fov * 180) / Math.PI));
      animate.checked = false;
      cameraYaw.value = String((home.yaw * 180) / Math.PI);
      cameraPitch.value = String((home.pitch * 180) / Math.PI);
      lit.checked = true;
      ambient.value = ambientDefault;
      directional.value = directionalDefault;
      pointStrength.value = pointDefault;
      pointX.value = '-1.5';
      pointY.value = '2';
      pointZ.value = '-2';
      orbitLight.checked = false;
      lightPhase = 0;
    },
    { signal },
  );
  document.querySelector('#inspect-model')!.addEventListener(
    'click',
    () => {
      pilot.checked = false;
      if (asteroidWorld) fieldControl('cruise').checked = false;
      rig.matrix = identityMatrix;
      cameraX.value = '5';
      cameraY.value = '3';
      cameraZ.value = '-6';
      cameraYaw.value = '-30';
      cameraPitch.value = '-10';
      angle.value = '0';
      animate.checked = false;
      phase = 0;
    },
    { signal },
  );
  if (asteroidWorld)
    document
      .querySelector('#field-home')!
      .addEventListener(
        'click',
        () =>
          document.querySelector<HTMLButtonElement>('#reset-triangle')!.click(),
        { signal },
      );
  surface.manage(() => {
    initialize();
    return {
      value: gl,
      dispose(): undefined {
        retirePostProcess();
        timer?.dispose();
        timer = undefined;
        renderer?.dispose();
        renderer = undefined;
      },
    };
  });
  await application.start();
  restart.disabled = false;
}
restart.addEventListener('click', () => {
  void start().catch((error) => {
    status.value = String(error);
    restart.disabled = false;
  });
});
window.addEventListener(
  'pagehide',
  () => {
    void app?.dispose();
    assets.dispose();
  },
  { once: true },
);
await start().catch((error) => {
  status.value = String(error);
  restart.disabled = false;
});
