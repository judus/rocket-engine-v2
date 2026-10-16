import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

// Publish the exact installed dependency at a versioned browser URL; no second implementation.
const manifest: unknown = JSON.parse(
  await readFile(
    new URL(
      '../../node_modules/production-workshop/package.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
if (
  !manifest ||
  typeof manifest !== 'object' ||
  !('version' in manifest) ||
  manifest.version !== '2.4.0'
)
  throw new Error('Expected pinned Production Workshop 2.4.0');
await mkdir(new URL('../vendor/', import.meta.url), { recursive: true });
await cp(
  new URL('../../node_modules/production-workshop/dist/', import.meta.url),
  new URL('../vendor/production-workshop-2.4.0/', import.meta.url),
  { recursive: true },
);
// Publish the exact accepted CFW browser bundle, including its validators and notices.
await cp(
  new URL(
    '../../node_modules/character-framework/dist/browser/',
    import.meta.url,
  ),
  new URL('../vendor/character-framework-0.1.0-6692be8fd4e3/', import.meta.url),
  { recursive: true },
);

// Integration demos consume exact installed packages at native browser ESM URLs.
for (const [name, directory, version] of [
  ['sprite-animation', 'sprite-animation-0.3.0', '0.3.0'],
  ['sprite-animation-baseline', 'sprite-animation-0.2.0', '0.2.0'],
  ['rocket-workers', 'rocket-workers-0.4.0', '0.4.0'],
] as const) {
  const pkg: unknown = JSON.parse(
    await readFile(
      new URL(`../../node_modules/${name}/package.json`, import.meta.url),
      'utf8',
    ),
  );
  if (
    !pkg ||
    typeof pkg !== 'object' ||
    !('version' in pkg) ||
    pkg.version !== version
  )
    throw new Error(`Expected pinned ${name} ${version}`);
  await cp(
    new URL(`../../node_modules/${name}/dist/src/`, import.meta.url),
    new URL(`../vendor/${directory}/`, import.meta.url),
    { recursive: true },
  );
}
// Worker module scopes do not inherit page import maps. This bootstrap imports
// the same compiled task registry and the pinned package's worker helper.
await writeFile(
  new URL('../examples/workers/terrain.worker.js', import.meta.url),
  "import { serveTasks } from '../../vendor/rocket-workers-0.4.0/worker.js';\nimport { terrainTask } from './task.js';\nserveTasks({terrain:terrainTask});\n",
);
