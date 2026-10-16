interface DemoPage {
  readonly title: string;
  readonly href: string;
  readonly children?: readonly DemoPage[];
}
const groups: readonly { title: string; pages: readonly DemoPage[] }[] = [
  {
    title: '01 · Runtime & scenes',
    pages: [
      {
        title: 'Arms & cameras',
        href: './',
      },
      {
        title: 'Fixed timing',
        href: './fixed.html',
      },
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
      {
        title: 'Published quest consumer',
        href: './quest-consumer.html',
      },
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
    title: '10 · Cockpit integration',
    pages: [
      {
        title: 'Textured cockpit',
        href: './webgl-cockpit.html',
      },
      {
        title: 'Environment reflections',
        href: './webgl-cockpit-environment.html',
      },
      {
        title: 'Directional shadows',
        href: './webgl-cockpit-shadows.html',
      },
      {
        title: 'Live instruments & HUD',
        href: './webgl-cockpit-displays.html',
      },
      {
        title: 'Instrument bloom',
        href: './webgl-cockpit-bloom.html',
      },
      {
        title: 'Screen light spill',
        href: './webgl-cockpit-spill.html',
      },
      {
        title: 'Cockpit & asteroid field',
        href: './webgl-cockpit-asteroids.html',
      },
    ],
  },
];

const sidebar = document.querySelector<HTMLElement>('#demo-navigation');
if (!sidebar) throw new Error('Missing demo navigation');
const current = new URL(window.location.href);
const path = current.pathname.endsWith('/index.html')
  ? current.pathname.slice(0, -'index.html'.length)
  : current.pathname;
// World/benchmark parameters do not change the page; factory flags select a demo.
const factoryMode = (url: URL) =>
  url.searchParams.get('stress') === '6000'
    ? 'stress'
    : url.searchParams.get('workshop') === '1'
      ? 'construction'
      : url.searchParams.get('transport') === '1'
        ? 'transport'
        : 'basic';
function isCurrent(page: DemoPage) {
  const url = new URL(page.href, window.location.href);
  return (
    url.pathname === path &&
    (!path.endsWith('/factory-terrain.html') ||
      factoryMode(url) === factoryMode(current))
  );
}
function containsCurrent(page: DemoPage): boolean {
  return isCurrent(page) || !!page.children?.some(containsCurrent);
}
function tree(pages: readonly DemoPage[]): HTMLUListElement {
  const list = document.createElement('ul');
  for (const page of pages) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = page.href;
    link.textContent = page.title;
    if (isCurrent(page)) link.setAttribute('aria-current', 'page');
    if (containsCurrent(page)) item.classList.add('contains-current');
    item.append(link);
    if (page.children) item.append(tree(page.children));
    list.append(item);
  }
  return list;
}
const brand = document.createElement('a');
brand.className = 'demo-brand';
brand.href = './';
brand.textContent = 'ROCKET';
const caption = document.createElement('span');
caption.textContent = 'Engine demos';
brand.append(caption);
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'demo-menu-toggle';
toggle.textContent = 'Browse demos';
toggle.setAttribute('aria-controls', 'demo-menu');
toggle.setAttribute('aria-expanded', 'false');
const nav = document.createElement('nav');
nav.id = 'demo-menu';
nav.setAttribute('aria-label', 'Demo pages');
for (const group of groups) {
  const section = document.createElement('details');
  section.open = group.pages.some(containsCurrent);
  const heading = document.createElement('summary');
  heading.textContent = group.title;
  section.append(heading, tree(group.pages));
  nav.append(section);
}
sidebar.append(brand, toggle, nav);
toggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('menu-open');
  toggle.setAttribute('aria-expanded', String(open));
});
sidebar.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sidebar.classList.contains('menu-open')) {
    sidebar.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
});
