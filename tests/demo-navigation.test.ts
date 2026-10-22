import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  demoGroups,
  demoPageUrl,
  isCurrentDemo,
} from '../examples/demo-catalog.js';
const root = new URL('../../', import.meta.url);
const base = new URL('https://rocket.example/');
void test('all navigation destinations exist; pages awaiting review have their own section', () => {
  const pages = demoGroups.flatMap((g) => g.pages);
  const urls = pages.map((p) => p.href);
  const review = demoGroups.find(
    (g) => g.title === 'Review · prototypes & tools',
  )!;
  assert.ok(review);
  const primaryUrls = demoGroups
    .filter((g) => g !== review)
    .flatMap((g) => g.pages.map((p) => p.href));
  assert.equal(new Set(urls).size, urls.length);
  for (const page of pages) {
    const url = new URL(page.href, root);
    const target = url.pathname.endsWith('/')
      ? new URL('index.html', url)
      : url;
    assert.ok(existsSync(fileURLToPath(target)), page.href);
  }
  for (const hidden of [
    'demos/webgl-cockpit-hi3d.html',
    'demos/quest-consumer.html',
    'demos/tools/flight-foundry/',
  ]) {
    assert.ok(!primaryUrls.some((url) => url.includes(hidden)), hidden);
    assert.ok(
      review.pages.some((page) => page.href.includes(hidden)),
      hidden,
    );
  }
  for (const removed of [
    './games/',
    './apps/',
    './apps/flight-foundry/surface-benchmark.html',
    './webgl-asteroid-family.html',
    './webgl-cockpit.html',
    './webgl-cockpit-displays.html',
    './webgl-cockpit-spill.html',
    './webgl-cockpit-bloom.html',
    './webgl-cockpit-asteroids.html',
  ])
    assert.ok(!urls.includes(removed), removed);
  assert.ok(urls.includes('./demos/webgl-video-textures.html'));
  for (const page of [
    'demos/journal.html',
    'demos/webgl-video-textures.html',
  ]) {
    const html = readFileSync(new URL(page, root), 'utf8');
    assert.ok(html.includes('id="demo-navigation"'));
    assert.ok(html.includes('dist/examples/demo-navigation.js'));
  }
});
void test('navigation resolves from the site root and highlights directory/index aliases and factory variants', () => {
  assert.equal(
    demoPageUrl('./demos/physics.html', base).href,
    'https://rocket.example/demos/physics.html',
  );
  const inventory = new URL('demos/inventory/operations.html', base);
  assert.equal(
    isCurrentDemo('./demos/inventory/operations.html', inventory, base),
    true,
  );
  assert.equal(
    isCurrentDemo(
      './demos/games/',
      new URL('demos/games/index.html', base),
      base,
    ),
    true,
  );
  assert.equal(isCurrentDemo('./', new URL('index.html', base), base), true);
  assert.equal(
    isCurrentDemo(
      './physics.html',
      new URL('https://other.example/physics.html'),
      base,
    ),
    false,
  );
  const modes = [
    '',
    '?transport=1',
    '?transport=1&workshop=1',
    '?stress=6000&range=128',
  ];
  for (const mode of modes)
    for (const other of modes)
      assert.equal(
        isCurrentDemo(
          './demos/factory-terrain.html' + mode,
          new URL('demos/factory-terrain.html' + other, base),
          base,
        ),
        mode === other,
      );
});

void test('demo pages are grouped and their import maps and authored model URLs resolve at the new depth', () => {
  assert.deepEqual(
    readdirSync(root).filter((name) => name.endsWith('.html')),
    ['index.html'],
  );
  assert.ok(existsSync(new URL('games/ship/index.html', root)));
  for (const group of demoGroups)
    for (const page of group.pages)
      assert.ok(page.href.startsWith('./demos/'), page.href);
  const directory = new URL('demos/', root);
  const files = readdirSync(directory, { recursive: true });
  for (const file of files) {
    if (typeof file !== 'string' || !file.endsWith('.html')) continue;
    const url = new URL(file, directory);
    const html = readFileSync(url, 'utf8');
    assert.ok(!/<base\b/i.test(html), file);
    const references: string[] = [];
    for (const match of html.matchAll(/data-model=["']([^"']+)["']/g))
      references.push(match[1]!);
    for (const match of html.matchAll(
      /<script type="importmap">([\s\S]*?)<\/script>/g,
    )) {
      const map = JSON.parse(match[1]!) as { imports: Record<string, string> };
      references.push(...Object.values(map.imports));
    }
    for (const reference of references) {
      const target = new URL(reference, url);
      if (target.protocol !== 'file:') continue;
      assert.ok(existsSync(fileURLToPath(target)), `${file}: ${reference}`);
    }
  }
});
