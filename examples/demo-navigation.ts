import { demoGroups, demoPageUrl, isCurrentDemo } from './demo-catalog.js';
import type { DemoPage } from './demo-catalog.js';

const sidebar = document.querySelector<HTMLElement>('#demo-navigation');
if (!sidebar) throw new Error('Missing demo navigation');
const current = new URL(window.location.href);
const base = new URL('../../', import.meta.url);
function isCurrent(page: DemoPage) {
  return isCurrentDemo(page.href, current, base);
}
function containsCurrent(page: DemoPage): boolean {
  return isCurrent(page) || !!page.children?.some(containsCurrent);
}
function tree(pages: readonly DemoPage[]): HTMLUListElement {
  const list = document.createElement('ul');
  for (const page of pages) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = demoPageUrl(page.href, base).href;
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
brand.href = base.href;
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
for (const group of demoGroups) {
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
