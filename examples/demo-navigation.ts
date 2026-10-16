interface DemoPage {
  readonly title: string;
  readonly href: string;
  readonly children?: readonly DemoPage[];
}
const groups: readonly { title: string; pages: readonly DemoPage[] }[] = [
  {
    title: 'Runtime',
    pages: [
      { title: 'API experiment', href: './api-experiment.html' },
      {
        title: 'Arms & cameras',
        href: './',
        children: [
          { title: 'Fixed timing', href: './fixed.html' },
          { title: 'Physics sandbox', href: './physics.html' },
          { title: 'Sprite animation', href: './sprites.html' },
          { title: 'Synchronized sprite layers', href: './sprite-layers.html' },
        ],
      },
    ],
  },
  {
    title: '3D',
    pages: [
      { title: '01 · Grid & camera', href: './3d-grid.html' },
      { title: '02 · Wireframe cube', href: './3d-cube.html' },
      { title: '03 · Solid cube', href: './3d-solid.html' },
      { title: '04 · Cockpit frame', href: './3d-cockpit.html' },
      { title: '05 · Cockpit overlay', href: './3d-overlay.html' },
      { title: '06 · Reusable foundation', href: './3d-foundation.html' },
      { title: '07 · Visibility & depth', href: './3d-visibility.html' },
      { title: '08 · GLB model loading', href: './3d-model.html' },
      { title: '09 · Independent lighting', href: './3d-lighting.html' },
      { title: '10 · Point lights', href: './3d-point-light.html' },
      { title: '11 · WebGL triangle', href: './webgl-triangle.html' },
      { title: '12 · WebGL meshes & depth', href: './webgl-meshes.html' },
      { title: '13 · Per-pixel GPU lighting', href: './webgl-lighting.html' },
      { title: '14 · Base-color textures', href: './webgl-textures.html' },
      { title: '15 · Metallic & roughness', href: './webgl-materials.html' },
      {
        title: '16 · Packed material maps',
        href: './webgl-material-maps.html',
      },
      { title: '17 · Normal mapping', href: './webgl-normals.html' },
      { title: '18 · Textured cockpit', href: './webgl-cockpit.html' },
      {
        title: '19 · Environment reflections',
        href: './webgl-environment.html',
      },
      {
        title: '20 · Cockpit environment',
        href: './webgl-cockpit-environment.html',
      },
      { title: '21 · Directional shadows', href: './webgl-shadows.html' },
      { title: '22 · Cockpit shadows', href: './webgl-cockpit-shadows.html' },
      { title: '23 · Dynamic textures', href: './webgl-dynamic-textures.html' },
      {
        title: '24 · Cockpit instruments',
        href: './webgl-cockpit-displays.html',
      },
      { title: '25 · Bloom', href: './webgl-bloom.html' },
      { title: '26 · Cockpit bloom', href: './webgl-cockpit-bloom.html' },
      { title: '27 · Screen light spill', href: './webgl-cockpit-spill.html' },
      { title: '28 · Asteroid field', href: './webgl-asteroids.html' },
      {
        title: '29 · Cockpit asteroid field',
        href: './webgl-cockpit-asteroids.html',
      },
    ],
  },
  {
    title: 'Terrain',
    pages: [
      {
        title: 'Tile board',
        href: './tiles.html',
        children: [{ title: 'Chunk streaming', href: './streaming.html' }],
      },
      {
        title: 'Terrain fields',
        href: './terrain.html',
        children: [
          { title: 'Classic tiles & vegetation', href: './terrain-tiles.html' },
          {
            title: 'Streamed terrain',
            href: './terrain-streaming.html',
            children: [
              { title: 'Worker comparison', href: './terrain-workers.html' },
            ],
          },
          { title: 'Camera controls', href: './camera-terrain.html' },
        ],
      },
    ],
  },
  {
    title: 'Production',
    pages: [
      {
        title: 'Inventory & equipment',
        href: './examples/inventory/context.html',
      },
      {
        title: 'Workshop basics',
        href: './workshop.html',
        children: [
          {
            title: 'Streamed factory',
            href: './factory-terrain.html',
            children: [
              {
                title: 'Transport',
                href: './factory-terrain.html?transport=1',
              },
              {
                title: 'Construction & staffing',
                href: './factory-terrain.html?transport=1&workshop=1',
              },
              {
                title: '6,000-facility stress test',
                href: './factory-terrain.html?stress=6000&range=128',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'Movement',
    pages: [
      {
        title: 'Finite navigation',
        href: './navigation.html',
        children: [
          {
            title: 'Actor streaming & corridors',
            href: './navigation-streaming.html',
          },
          {
            title: 'Workplace journeys',
            href: './navigation-workshop.html',
            children: [
              {
                title: 'Streamed workplaces',
                href: './navigation-workshop-streaming.html',
              },
              {
                title: 'Two-worker staffing',
                href: './navigation-staffing.html',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    title: 'UI & characters',
    pages: [
      {
        title: 'Basic panels',
        href: './ui-panels.html',
        children: [
          { title: 'Chat box', href: './ui-chat.html' },
          { title: 'Mara & the Old Grove', href: './character-dialogue.html' },
          {
            title: 'Archived character sprites',
            href: './character-sprites.html',
          },
          { title: 'WASD character control', href: './character-control.html' },
          { title: 'Work → takeover → resume', href: './character-work.html' },
          {
            title: 'Authored guide dialogue',
            href: './character-situations.html',
          },
          { title: 'Grove evidence & pickup', href: './character-grove.html' },
          { title: 'Watchtower quest', href: './character-encounter.html' },
          { title: 'Generated quest consumer', href: './quest-consumer.html' },
        ],
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
  const section = document.createElement('section');
  const heading = document.createElement('h2');
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
