import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { Rocket } from '../src/Rocket.js';
import { McpService } from '../src/mcp/index.js';
import { listen } from '../examples/quest-authoring/Loopback.js';

void test('HTTP adapter preserves its private listener authority and rejects a different Host header', async () => {
  const app = new Rocket();
  const host = app.use(McpService);
  // An alternate loopback address exercises the same URL/Host comparison without requiring Docker.
  const server = listen(host, 0, undefined, undefined, '127.0.0.2');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const authority = `127.0.0.2:${address.port}`;
  host.configure({
    credential: 'test-only',
    allowedHosts: [authority],
    resolveBinding: () => null,
  });
  async function probe(header: string) {
    return new Promise<number>((resolve, reject) => {
      const req = request(
        `http://${authority}/mcp`,
        { headers: { host: header } },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode!));
        },
      );
      req.once('error', reject);
      req.end();
    });
  }
  try {
    // A valid private authority reaches authentication rather than failing host validation.
    assert.equal(await probe(authority), 401);
    assert.equal(await probe(`127.0.0.1:${address.port}`), 403);
    assert.equal(await probe('untrusted.test'), 403);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await app.dispose();
    await host.close();
  }
});
