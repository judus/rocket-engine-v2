export interface DemoPage {
  readonly title: string;
  readonly href: string;
  readonly children?: readonly DemoPage[];
}
export const demoGroups: readonly {
  title: string;
  pages: readonly DemoPage[];
}[] = [
  {
    title: '01 · Runtime & scenes',
    pages: [
      { title: 'Input · 3D first-person', href: './input-first-person.html' },
      { title: 'Input · 2D top-down', href: './input-top-down.html' },
      { title: 'Input · 2D platformer', href: './input-platformer.html' },
      { title: 'Input · Belt-scroller', href: './input-belt-scroller.html' },
      { title: 'Input · Free flight', href: './input-flight.html' },
      {
        title: 'Arms & cameras',
        href: './',
      },
      {
        title: 'Fixed timing',
        href: './fixed.html',
      },
      { title: 'Particle emitters', href: './particles.html' },
      { title: 'Swept projectiles & impacts', href: './projectiles.html' },
      {
        title: 'Physics sandbox',
        href: './physics.html',
      },
      {
        title: 'Nodes, layers & camera follow',
        href: './api-experiment.html',
      },
      {
        title: 'Scene composition & navigation',
        href: './scene-composition.html',
      },
    ],
  },
  {
    title: '02 · Tiles & procedural terrain',
    pages: [
      {
        title: 'Tile board',
        href: './tiles.html',
      },
      {
        title: 'Chunk streaming',
        href: './streaming.html',
      },
      {
        title: 'Terrain fields',
        href: './terrain.html',
      },
      {
        title: 'Tiles & vegetation',
        href: './terrain-tiles.html',
      },
      {
        title: 'Streamed terrain',
        href: './terrain-streaming.html',
      },
      {
        title: 'Terrain camera controls',
        href: './camera-terrain.html',
      },
      {
        title: 'Terrain worker comparison',
        href: './terrain-workers.html',
      },
    ],
  },
  {
    title: '03 · Sprites & movement',
    pages: [
      {
        title: 'Sprite animation',
        href: './sprites.html',
      },
      {
        title: 'Synchronized sprite layers',
        href: './sprite-layers.html',
      },
      {
        title: 'Finite navigation',
        href: './navigation.html',
      },
      {
        title: 'Actor streaming & corridors',
        href: './navigation-streaming.html',
      },
    ],
  },
  {
    title: '04 · Interface',
    pages: [
      {
        title: 'Panels',
        href: './ui-panels.html',
      },
      {
        title: 'Chat box',
        href: './ui-chat.html',
      },
    ],
  },
  {
    title: '05 · Production & workplaces',
    pages: [
      {
        title: 'Object inventories',
        href: './examples/inventory/inventory.html',
      },
      {
        title: 'Atomic inventory operations',
        href: './examples/inventory/operations.html',
      },
      {
        title: 'Inventory & equipment',
        href: './examples/inventory/context.html',
      },
      {
        title: 'Workshop basics',
        href: './workshop.html',
      },
      {
        title: 'Streamed factory',
        href: './factory-terrain.html',
      },
      {
        title: 'Factory transport',
        href: './factory-terrain.html?transport=1',
      },
      {
        title: 'Construction & staffing',
        href: './factory-terrain.html?transport=1&workshop=1',
      },
      {
        title: 'Workplace journeys',
        href: './navigation-workshop.html',
      },
      {
        title: 'Streamed workplaces',
        href: './navigation-workshop-streaming.html',
      },
      {
        title: 'Two-worker staffing',
        href: './navigation-staffing.html',
      },
      {
        title: '6,000-facility stress test',
        href: './factory-terrain.html?stress=6000&range=128',
      },
    ],
  },
  {
    title: '06 · Characters & quests',
    pages: [
      {
        title: 'Dialogue & spatial picking',
        href: './character-dialogue.html',
      },
      {
        title: 'Character sprites (archive)',
        href: './character-sprites.html',
      },
      {
        title: 'Character control',
        href: './character-control.html',
      },
      {
        title: 'Work, takeover & resume',
        href: './character-work.html',
      },
      {
        title: 'Authored guide dialogue',
        href: './character-situations.html',
      },
      {
        title: 'Grove evidence & pickup',
        href: './character-grove.html',
      },
      {
        title: 'Watchtower quest',
        href: './character-encounter.html',
      },
      { title: 'Journal & episode continuity', href: './journal.html' },
    ],
  },
  {
    title: '07 · Software 3D foundations',
    pages: [
      {
        title: 'Grid & camera',
        href: './3d-grid.html',
      },
      {
        title: 'Wireframe cube',
        href: './3d-cube.html',
      },
      {
        title: 'Solid cube',
        href: './3d-solid.html',
      },
      {
        title: 'Cockpit frame',
        href: './3d-cockpit.html',
      },
      {
        title: 'Cockpit overlay',
        href: './3d-overlay.html',
      },
      {
        title: 'Reusable 3D foundation',
        href: './3d-foundation.html',
      },
      {
        title: 'Visibility & depth buffer',
        href: './3d-visibility.html',
      },
      {
        title: 'GLB model loading',
        href: './3d-model.html',
      },
      {
        title: 'Independent lighting',
        href: './3d-lighting.html',
      },
      {
        title: 'Point lights',
        href: './3d-point-light.html',
      },
    ],
  },
  {
    title: '08 · WebGL & materials',
    pages: [
      {
        title: 'GPU triangle',
        href: './webgl-triangle.html',
      },
      {
        title: 'Meshes & depth',
        href: './webgl-meshes.html',
      },
      {
        title: 'Per-pixel lighting',
        href: './webgl-lighting.html',
      },
      {
        title: 'Base-color textures',
        href: './webgl-textures.html',
      },
      {
        title: 'Metallic & roughness',
        href: './webgl-materials.html',
      },
      {
        title: 'Packed material maps',
        href: './webgl-material-maps.html',
      },
      {
        title: 'Normal mapping',
        href: './webgl-normals.html',
      },
    ],
  },
  {
    title: '09 · Rendering techniques',
    pages: [
      {
        title: 'Environment reflections',
        href: './webgl-environment.html',
      },
      {
        title: 'Directional shadows',
        href: './webgl-shadows.html',
      },
      {
        title: 'Dynamic textures',
        href: './webgl-dynamic-textures.html',
      },
      { title: 'Video texture transport', href: './webgl-video-textures.html' },
      {
        title: 'Bloom',
        href: './webgl-bloom.html',
      },
      {
        title: 'Procedural asteroid field',
        href: './webgl-asteroids.html',
      },
    ],
  },
  {
    title: 'Review · prototypes & tools',
    pages: [
      {
        title: 'Hi3D cockpit · model fitting & lamps',
        href: './webgl-cockpit-hi3d.html',
      },
      {
        title: 'Flight Foundry · motion bench',
        href: './apps/flight-foundry/',
      },
      {
        title: 'Flight Foundry · acceleration curves',
        href: './apps/flight-foundry/curves.html',
      },
      {
        title: 'Flight Foundry · assembled ship',
        href: './apps/flight-foundry/ship.html',
      },
      {
        title: 'Quest authoring · requires local API',
        href: './quest-consumer.html',
      },
      {
        title: 'Environment reflections',
        href: './webgl-cockpit-environment.html',
      },
      {
        title: 'Directional shadows',
        href: './webgl-cockpit-shadows.html',
      },
    ],
  },
];

/** All catalogue paths are relative to the site root, including on nested pages. */
export function demoPageUrl(href: string, base: string | URL): URL {
  return new URL(href, base);
}
export function isCurrentDemo(href: string, current: URL, base: URL): boolean {
  const normalize = (path: string) =>
    path.endsWith('/index.html') ? path.slice(0, -'index.html'.length) : path;
  const page = demoPageUrl(href, base);
  const factoryMode = (url: URL) =>
    url.searchParams.get('stress') === '6000'
      ? 'stress'
      : url.searchParams.get('workshop') === '1'
        ? 'construction'
        : url.searchParams.get('transport') === '1'
          ? 'transport'
          : 'basic';
  return (
    page.origin === current.origin &&
    normalize(page.pathname) === normalize(current.pathname) &&
    (!page.pathname.endsWith('/factory-terrain.html') ||
      factoryMode(page) === factoryMode(current))
  );
}
