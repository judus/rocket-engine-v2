import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
void test('Farwake implementation does not depend on demo modules; engine stays game independent', () => {
  for (const directory of ['games/farwake', 'src']) {
    const files = readdirSync(resolve(root, directory), { recursive: true });
    for (const file of files) {
      if (typeof file !== 'string' || !file.endsWith('.ts')) continue;
      const path = resolve(root, directory, file);
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(
        /(?:from\s+|import\()\s*['"]([^'"]+)['"]/g,
      )) {
        const specifier = match[1]!;
        if (!specifier.startsWith('.')) continue;
        const target = resolve(path, '..', specifier);
        assert.ok(!target.startsWith(resolve(root, 'examples') + '/'), path);
        if (directory === 'src')
          assert.ok(!target.startsWith(resolve(root, 'games') + '/'), path);
      }
    }
  }
});
