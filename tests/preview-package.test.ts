import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packagePreview, publishable } from '../scripts/package-preview.js';
const revision = 'a'.repeat(40);
void test('preview package preserves browser paths, verifies links and excludes development material', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rocket-package-')),
    source = join(dir, 'source'),
    output = join(dir, 'output');
  const files = {
    'index.html': '<a href="./games/ship/">Game</a>',
    'games/ship/index.html':
      '<script src="../../dist/games/ship/main.js"></script>',
    'dist/games/ship/main.js': 'export {};',
    'dist/examples/demo-navigation.js': 'export {};',
    'games/ship/assets/comms/test.mp4': 'test video',
    'examples/assets/licence.txt': 'notice',
    'src/input.css': 'body {}',
    'src/Rocket.ts': 'source',
    'dist/tests/test.js': 'private test',
    '.env': 'never publish',
    'node_modules/pkg/index.js': 'never publish',
    'dist/src/index.js.map': 'source map',
  };
  try {
    for (const [path, data] of Object.entries(files)) {
      await mkdir(join(source, path, '..'), { recursive: true });
      await writeFile(join(source, path), data);
    }
    await packagePreview(source, output, revision);
    const release = JSON.parse(
      await readFile(join(output, 'release.json'), 'utf8'),
    ) as { revision: string; files: { path: string; sha256: string }[] };
    assert.equal(release.revision, revision);
    assert.ok(
      release.files.some(
        (f) =>
          f.path === 'games/ship/assets/comms/test.mp4' &&
          f.sha256.length === 64,
      ),
    );
    assert.ok(
      release.files.every(
        (f) =>
          !f.path.endsWith('.ts') &&
          !f.path.endsWith('.map') &&
          !f.path.includes('node_modules'),
      ),
    );
    assert.equal(
      await readFile(
        join(output, 'site/games/ship/assets/comms/test.mp4'),
        'utf8',
      ),
      'test video',
    );
    await writeFile(
      join(source, 'index.html'),
      '<a href="missing.html">Broken</a>',
    );
    await assert.rejects(
      packagePreview(source, output, revision),
      /Broken packaged/,
    );
    await writeFile(join(source, 'index.html'), '');
    await symlink(join(source, '.env'), join(source, 'games/ship/leak.txt'));
    await assert.rejects(packagePreview(source, output, revision), /symlink/);
    await assert.rejects(packagePreview(source, output, 'bad'), /commit SHA/);
    await assert.rejects(packagePreview(source, source, revision), /replace/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
void test('publish manifest has an explicit browser-file allowlist', () => {
  for (const path of [
    '.env',
    'src/x.ts',
    'dist/tests/x.js',
    'examples/.env',
    'dist/src/x.js.map',
    'dist/src/x.d.ts',
    'node_modules/pkg/index.js',
  ])
    assert.equal(publishable(path), false, path);
  for (const path of [
    'dist/src/x.js',
    'src/virtual-controls.css',
    'games/ship/characters/sera.json',
    'examples/assets/LICENSE',
  ])
    assert.equal(publishable(path), true, path);
});
