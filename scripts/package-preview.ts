import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const roots = [
  'examples',
  'games',
  'apps',
  'docs',
  'src',
  'dist/src',
  'dist/examples',
  'dist/games',
  'dist/apps',
  'dist/vendor',
] as const;
const extensions = new Set([
  'html',
  'css',
  'js',
  'json',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'glb',
  'gltf',
  'bin',
  'mp4',
  'webm',
  'mp3',
  'ogg',
  'wav',
  'woff',
  'woff2',
  'txt',
  'md',
  'wasm',
]);
export function publishable(path: string): boolean {
  const parts = path.split('/');
  if (
    parts.some(
      (p) =>
        p.startsWith('.') || ['node_modules', 'tests', 'scripts'].includes(p),
    )
  )
    return false;
  if (path.endsWith('.d.ts') || path.endsWith('.map')) return false;
  return (
    extensions.has(path.split('.').at(-1)!.toLowerCase()) ||
    ['LICENSE', 'NOTICE', 'COPYING'].includes(parts.at(-1)!)
  );
}
export async function packagePreview(
  source: string,
  destination: string,
  revision: string,
): Promise<void> {
  if (!/^[a-f0-9]{40}$/.test(revision))
    throw new Error('Preview requires a full Git commit SHA');
  const sourceRoot = resolve(source),
    output = resolve(destination),
    site = join(output, 'site');
  if (output === sourceRoot || sourceRoot.startsWith(output + '/'))
    throw new Error('Output must not replace the source checkout');
  const files: { path: string; bytes: number; sha256: string }[] = [];
  await rm(output, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  async function copy(path: string) {
    if (!publishable(path)) return;
    const data = await readFile(join(sourceRoot, path));
    await mkdir(join(site, path, '..'), { recursive: true });
    await cp(join(sourceRoot, path), join(site, path));
    files.push({
      path,
      bytes: data.byteLength,
      sha256: createHash('sha256').update(data).digest('hex'),
    });
  }
  async function walk(path: string) {
    let entries;
    try {
      entries = await readdir(join(sourceRoot, path), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const name = join(path, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Publish tree contains a symlink: ${name}`);
      if (entry.isDirectory()) {
        if (
          !entry.name.startsWith('.') &&
          !['node_modules', 'tests', 'scripts'].includes(entry.name)
        )
          await walk(name);
      } else if (entry.isFile()) await copy(name);
    }
  }
  for (const entry of await readdir(sourceRoot, { withFileTypes: true }))
    if (
      entry.isFile() &&
      (entry.name.endsWith('.html') ||
        ['README.md', 'LICENSE', 'NOTICE'].includes(entry.name))
    )
      await copy(entry.name);
  for (const root of roots) await walk(root);
  const paths = new Set(files.map((f) => f.path));
  for (const required of [
    'index.html',
    'games/ship/index.html',
    'dist/games/ship/main.js',
    'dist/examples/demo-navigation.js',
  ])
    if (!paths.has(required))
      throw new Error(`Missing browser build entry: ${required}`);
  // Check concrete local HTML references. JS-created URLs are exercised by browser demos/tests.
  for (const file of files.filter((f) => f.path.endsWith('.html'))) {
    const html = await readFile(join(site, file.path), 'utf8');
    for (const match of html.matchAll(
      /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi,
    )) {
      const url = new URL(
        match[1]!,
        new URL(file.path, 'https://preview.invalid/'),
      );
      if (url.origin !== 'https://preview.invalid') continue;
      let path = decodeURIComponent(url.pathname.slice(1));
      if (!path || path.endsWith('/')) path += 'index.html';
      if (!paths.has(path))
        throw new Error(
          `Broken packaged HTML reference: ${file.path} -> ${match[1]}`,
        );
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  await writeFile(
    join(output, 'release.json'),
    JSON.stringify(
      {
        schema: 1,
        revision,
        entries: { rocket: 'index.html', farwake: 'games/ship/index.html' },
        files,
      },
      null,
      2,
    ) + '\n',
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const source = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: source,
    encoding: 'utf8',
  }).trim();
  if (
    execFileSync('git', ['status', '--porcelain'], {
      cwd: source,
      encoding: 'utf8',
    }).trim()
  )
    throw new Error('Commit the preview before packaging it');
  const destination = join(source, 'build/preview');
  await packagePreview(source, destination, revision);
  console.log(
    `Static preview ${revision} packaged at ${relative(source, destination)}`,
  );
}
