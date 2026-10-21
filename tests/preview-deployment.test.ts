import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(
  new URL('../../.github/scripts/deploy-preview.sh', import.meta.url),
);
void test(
  'deployment verifies artifact integrity, pins host trust and stops before activation on upload failure',
  { skip: process.platform === 'win32' },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rocket-deploy-'));
    try {
      const key = join(dir, 'key'),
        archive = join(dir, 'preview.tar.gz'),
        log = join(dir, 'calls'),
        upload = join(dir, 'upload');
      execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key]);
      await writeFile(archive, 'checked artifact');
      await writeFile(
        join(dir, 'ssh'),
        '#!/usr/bin/env bash\nset -eu\nprintf "%s\\n" "$*" >> "$MOCK_LOG"\nif [[ "${!#}" == upload* ]]; then cat > "$MOCK_UPLOAD"; [[ "${FAIL_UPLOAD:-0}" == 0 ]]; fi\n',
        { mode: 0o755 },
      );
      const sha = 'a'.repeat(40),
        digest = createHash('sha256').update('checked artifact').digest('hex');
      const env = {
        ...process.env,
        PATH: dir + ':' + process.env.PATH,
        RELEASE_SHA: sha,
        ARCHIVE_SHA256: digest,
        DEPLOY_HOST: 'host.example',
        DEPLOY_SSH_KEY: await readFile(key, 'utf8'),
        DEPLOY_KNOWN_HOSTS: 'host.example ssh-ed25519 test',
        MOCK_LOG: log,
        MOCK_UPLOAD: upload,
      };
      const good = spawnSync('bash', [script, archive], {
        env,
        encoding: 'utf8',
      });
      assert.equal(good.status, 0, good.stderr);
      assert.equal(await readFile(upload, 'utf8'), 'checked artifact');
      const calls = (await readFile(log, 'utf8')).trim().split('\n');
      assert.equal(calls.length, 2);
      assert.ok(calls[0]!.endsWith(`host.example upload ${sha} ${digest}`));
      assert.ok(calls[1]!.endsWith(`host.example deploy ${sha} ${digest}`));
      assert.ok(
        calls.every(
          (c) =>
            c.includes('StrictHostKeyChecking=yes') &&
            c.includes('BatchMode=yes') &&
            c.includes('IdentitiesOnly=yes'),
        ),
      );
      const bad = spawnSync('bash', [script, archive], {
        env: { ...env, ARCHIVE_SHA256: '0'.repeat(64) },
        encoding: 'utf8',
      });
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /checksum mismatch/);
      assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2);
      await writeFile(log, '');
      const failed = spawnSync('bash', [script, archive], {
        env: { ...env, FAIL_UPLOAD: '1' },
        encoding: 'utf8',
      });
      assert.notEqual(failed.status, 0);
      assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 1);
      const invalid = spawnSync('bash', [script, archive], {
        env: { ...env, RELEASE_SHA: 'invalid' },
        encoding: 'utf8',
      });
      assert.notEqual(invalid.status, 0);
      assert.match(invalid.stderr, /Invalid release/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
