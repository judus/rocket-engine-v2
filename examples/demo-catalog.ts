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
      {
        title: 'Input · 3D first-person',
        href: './demos/input-first-person.html',
      },
      { title: 'Input · 2D top-down', href: './demos/input-top-down.html' },
      { title: 'Input · 2D platformer', href: './demos/input-platformer.html' },
      {
        title: 'Input · Belt-scroller',
        href: './demos/input-belt-scroller.html',
      },
      { title: 'Input · Free flight', href: './demos/input-flight.html' },
      {
        title: 'Arms & cameras',
        href: './demos/',
      },
      {
        title: 'Fixed timing',
        href: './demos/fixed.html',
      },
      { title: 'Particle emitters', href: './demos/particles.html' },
      {
        title: 'Swept projectiles & impacts',
        href: './demos/projectiles.html',
      },
      {
        title: 'Physics sandbox',
        href: './demos/physics.html',
      },
      {
        title: 'Nodes, layers & camera follow',
        href: './demos/api-experiment.html',
      },
      {
        title: 'Scene composition & navigation',
        href: './demos/scene-composition.html',
      },
    ],
  },
  {
    title: '02 · Tiles & procedural terrain',
    pages: [
      {
        title: 'Tile board',
        href: './demos/tiles.html',
      },
      {
        title: 'Chunk streaming',
        href: './demos/streaming.html',
      },
      {
        title: 'Terrain fields',
        href: './demos/terrain.html',
      },
      {
        title: 'Tiles & vegetation',
        href: './demos/terrain-tiles.html',
      },
      {
        title: 'Streamed terrain',
        href: './demos/terrain-streaming.html',
      },
      {
        title: 'Terrain camera controls',
        href: './demos/camera-terrain.html',
      },
      {
        title: 'Terrain worker comparison',
        href: './demos/terrain-workers.html',
      },
    ],
  },
  {
    title: '03 · Sprites & movement',
    pages: [
      {
        title: 'Sprite animation',
        href: './demos/sprites.html',
      },
      {
        title: 'Synchronized sprite layers',
        href: './demos/sprite-layers.html',
      },
      {
        title: 'Finite navigation',
        href: './demos/navigation.html',
      },
      {
        title: 'Actor streaming & corridors',
        href: './demos/navigation-streaming.html',
      },
    ],
  },
  {
    title: '04 · Interface',
    pages: [
      {
        title: 'Panels',
        href: './demos/ui-panels.html',
      },
      {
        title: 'Chat box',
        href: './demos/ui-chat.html',
      },
    ],
  },
  {
    title: '05 · Production & workplaces',
    pages: [
      {
        title: 'Object inventories',
        href: './demos/inventory/inventory.html',
      },
      {
        title: 'Atomic inventory operations',
        href: './demos/inventory/operations.html',
      },
      {
        title: 'Inventory & equipment',
        href: './demos/inventory/context.html',
      },
      {
        title: 'Workshop basics',
        href: './demos/workshop.html',
      },
      {
        title: 'Streamed factory',
        href: './demos/factory-terrain.html',
      },
      {
        title: 'Factory transport',
        href: './demos/factory-terrain.html?transport=1',
      },
      {
        title: 'Construction & staffing',
        href: './demos/factory-terrain.html?transport=1&workshop=1',
      },
      {
        title: 'Workplace journeys',
        href: './demos/navigation-workshop.html',
      },
      {
        title: 'Streamed workplaces',
        href: './demos/navigation-workshop-streaming.html',
      },
      {
        title: 'Two-worker staffing',
        href: './demos/navigation-staffing.html',
      },
      {
        title: '6,000-facility stress test',
        href: './demos/factory-terrain.html?stress=6000&range=128',
      },
    ],
  },
  {
    title: '06 · Characters & quests',
    pages: [
      {
        title: 'Dialogue & spatial picking',
        href: './demos/character-dialogue.html',
      },
      {
        title: 'Character sprites (archive)',
        href: './demos/character-sprites.html',
      },
      {
        title: 'Character control',
        href: './demos/character-control.html',
      },
      {
        title: 'Work, takeover & resume',
        href: './demos/character-work.html',
      },
      {
        title: 'Authored guide dialogue',
        href: './demos/character-situations.html',
      },
      {
        title: 'Grove evidence & pickup',
        href: './demos/character-grove.html',
      },
      {
        title: 'Watchtower quest',
        href: './demos/character-encounter.html',
      },
      { title: 'Journal & episode continuity', href: './demos/journal.html' },
    ],
  },
  {
    title: '07 · Software 3D foundations',
    pages: [
      {
        title: 'Grid & camera',
        href: './demos/3d-grid.html',
      },
      {
        title: 'Wireframe cube',
        href: './demos/3d-cube.html',
      },
      {
        title: 'Solid cube',
        href: './demos/3d-solid.html',
      },
      {
        title: 'Cockpit frame',
        href: './demos/3d-cockpit.html',
      },
      {
        title: 'Cockpit overlay',
        href: './demos/3d-overlay.html',
      },
      {
        title: 'Reusable 3D foundation',
        href: './demos/3d-foundation.html',
      },
      {
        title: 'Visibility & depth buffer',
        href: './demos/3d-visibility.html',
      },
      {
        title: 'GLB model loading',
        href: './demos/3d-model.html',
      },
      {
        title: 'Independent lighting',
        href: './demos/3d-lighting.html',
      },
      {
        title: 'Point lights',
        href: './demos/3d-point-light.html',
      },
    ],
  },
  {
    title: '08 · WebGL & materials',
    pages: [
      {
        title: 'GPU triangle',
        href: './demos/webgl-triangle.html',
      },
      {
        title: 'Meshes & depth',
        href: './demos/webgl-meshes.html',
      },
      {
        title: 'Per-pixel lighting',
        href: './demos/webgl-lighting.html',
      },
      {
        title: 'Base-color textures',
        href: './demos/webgl-textures.html',
      },
      {
        title: 'Metallic & roughness',
        href: './demos/webgl-materials.html',
      },
      {
        title: 'Packed material maps',
        href: './demos/webgl-material-maps.html',
      },
      {
        title: 'Normal mapping',
        href: './demos/webgl-normals.html',
      },
    ],
  },
  {
    title: '09 · Rendering techniques',
    pages: [
      {
        title: 'Environment reflections',
        href: './demos/webgl-environment.html',
      },
      {
        title: 'Directional shadows',
        href: './demos/webgl-shadows.html',
      },
      {
        title: 'Dynamic textures',
        href: './demos/webgl-dynamic-textures.html',
      },
      {
        title: 'Video texture transport',
        href: './demos/webgl-video-textures.html',
      },
      {
        title: 'Bloom',
        href: './demos/webgl-bloom.html',
      },
      {
        title: 'Procedural asteroid field',
        href: './demos/webgl-asteroids.html',
      },
    ],
  },
  {
    title: 'Review · prototypes & tools',
    pages: [
      {
        title: 'Hi3D cockpit · model fitting & lamps',
        href: './demos/webgl-cockpit-hi3d.html',
      },
      {
        title: 'Flight Foundry · motion bench',
        href: './demos/tools/flight-foundry/',
      },
      {
        title: 'Flight Foundry · acceleration curves',
        href: './demos/tools/flight-foundry/curves.html',
      },
      {
        title: 'Flight Foundry · assembled ship',
        href: './demos/tools/flight-foundry/ship.html',
      },
      {
        title: 'Quest authoring · requires local API',
        href: './demos/quest-consumer.html',
      },
      {
        title: 'Environment reflections',
        href: './demos/webgl-cockpit-environment.html',
      },
      {
        title: 'Directional shadows',
        href: './demos/webgl-cockpit-shadows.html',
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
