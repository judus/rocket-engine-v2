import { Assets } from '../../src/index.js';
import type { Rocket } from '../../src/index.js';
import { Stage2D } from '../../src/experimental/index.js';
import type { SceneNavigator } from '../../src/experimental/index.js';
import type { InternalsReading } from './ShipInternals.js';

/** Presentation catalog: one inspection background per internal; two core-system views. */
export const shipCompartments = [
  { id: 'infirmary', label: 'Infirmary', internal: 'infirmary-starter' },
  { id: 'science-lab', label: 'Science lab', internal: 'science-lab-starter' },
  { id: 'galley', label: 'Galley', internal: 'galley-starter' },
  { id: 'fridge', label: 'Fridge', internal: 'fridge-starter' },
  { id: 'engine-room', label: 'Engine room', internal: null },
  { id: 'fabricator', label: 'Fabricator', internal: 'fabricator-starter' },
  { id: 'refinery', label: 'Refinery', internal: 'refinery-starter' },
  { id: 'quarters', label: 'Crew quarters', internal: 'quarters-starter' },
  { id: 'cargo-link', label: 'Cargo Link', internal: null },
] as const;
export type ShipCompartment = (typeof shipCompartments)[number];
export const compartmentRoute = (room: ShipCompartment) => `aboard:${room.id}`;
export function installedCompartments(
  reading: InternalsReading,
): readonly ShipCompartment[] {
  const installed = new Set(reading.installations.map((i) => i.definitionId));
  return shipCompartments.filter(
    (room) => room.internal === null || installed.has(room.internal),
  );
}

/** Source crop for a filled viewport, preserving image proportions. */
export function roomCrop(
  imageWidth: number,
  imageHeight: number,
  width: number,
  height: number,
) {
  if (
    ![imageWidth, imageHeight, width, height].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    throw new Error('Invalid room image or viewport dimensions');
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const cropWidth = Math.min(imageWidth, width / scale),
    cropHeight = Math.min(imageHeight, height / scale);
  return {
    x: (imageWidth - cropWidth) / 2,
    y: (imageHeight - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}

/** Each visit owns its image lease. Ship and Workshop state stay with the retained flight scene. */
export function compartmentScene(
  room: ShipCompartment,
  assets: Pick<Assets, 'acquireImage'>,
  size: () => { width: number; height: number },
): Stage2D {
  let image: ImageBitmap | undefined;
  const scene = new Stage2D({
    async prepare({ signal }) {
      const lease = await assets.acquireImage(
        new URL(
          `../../../games/ship/assets/rooms/${room.id}.png`,
          import.meta.url,
        ),
        { signal },
      );
      try {
        signal.throwIfAborted();
        scene.world.own(lease);
        image = lease.image;
      } catch (error) {
        lease.dispose();
        throw error;
      }
    },
    render(ctx): undefined {
      if (!image) throw new Error(`Compartment not prepared: ${room.id}`);
      const { width, height } = size();
      const crop = roomCrop(image.width, image.height, width, height);
      ctx.drawImage(
        image,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        width,
        height,
      );
      return undefined;
    },
  });
  return scene;
}

/** Small room selector over real Rocket scenes and one Canvas view. No transition effects yet. */
export function createShipInteriors(
  engine: Rocket,
  navigator: SceneNavigator,
  root: HTMLElement,
  readInternals: () => InternalsReading,
  navigate: (route: string) => void,
  signal: AbortSignal,
) {
  const get = <T extends HTMLElement>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (!node) throw new Error(`Missing compartment element ${selector}`);
    return node;
  };
  const viewport = get('#interior-viewport'),
    title = get('#interior-title'),
    choices = get('#interior-choices');
  const assets = engine.use(Assets);
  const canvas = engine.view({
    target: viewport,
    scene: navigator,
    width: 1672,
    height: 941,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
  });
  canvas.canvas.setAttribute('role', 'img');
  let last = 'aboard:infirmary';
  const buttons = new Map<string, HTMLButtonElement>();
  const resize = () => {
    const width = viewport.clientWidth,
      height = viewport.clientHeight;
    if (
      width > 0 &&
      height > 0 &&
      (canvas.width !== width || canvas.height !== height)
    )
      canvas.resize(width, height);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(viewport);
  canvas.own((): undefined => {
    observer.disconnect();
    return undefined;
  });
  for (const room of shipCompartments) {
    const route = compartmentRoute(room);
    navigator.add(route, {
      create: () =>
        compartmentScene(room, assets, () => ({
          width: canvas.width,
          height: canvas.height,
        })),
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = room.label;
    button.addEventListener('click', () => navigate(route), { signal });
    choices.appendChild(button);
    buttons.set(route, button);
  }
  get('#interior-cockpit').addEventListener('click', () => navigate('flight'), {
    signal,
  });
  root.addEventListener(
    'keydown',
    (event) => {
      if (event.code === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        navigate('flight');
      }
    },
    { signal },
  );
  return {
    get lastRoute() {
      return last;
    },
    show(route: string | null): boolean {
      const room = shipCompartments.find((r) => compartmentRoute(r) === route);
      root.hidden = !room;
      if (!room) return false;
      const available = installedCompartments(readInternals());
      if (!available.includes(room))
        throw new Error(`Internal no longer installed: ${room.label}`);
      last = compartmentRoute(room);
      title.textContent = room.label;
      canvas.canvas.setAttribute('aria-label', `${room.label} aboard the ship`);
      for (const candidate of shipCompartments) {
        const button = buttons.get(compartmentRoute(candidate))!;
        button.hidden = !available.includes(candidate);
        if (candidate === room) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
      }
      resize();
      return true;
    },
    focus() {
      get<HTMLButtonElement>('#interior-cockpit').focus();
    },
  };
}
