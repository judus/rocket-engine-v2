import { readFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { isIP } from 'node:net';
import { EncounterWorld } from '../character-encounter/World.js';
import type { WorldSpec } from '../character-encounter/World.js';
import type { AuthorContext } from './ContextProvider.js';
import { combinedFixture } from './CombinedFixture.js';
import { listen } from './Loopback.js';
import { generationBridge } from './GenerationBridge.js';
import type { GenerationConnection } from './GenerationBridge.js';
const credential = process.env.ROCKET_MCP_TOKEN;
if (!credential)
  throw new Error('Set ROCKET_MCP_TOKEN for the loopback fixture');
const base = new URL('../../../examples/', import.meta.url);
const path = resolve(
  process.env.ROCKET_AUTHOR_STORE ??
    '/tmp/rocket-watchtower-builder206/author.sqlite',
);
await mkdir(dirname(path), { recursive: true });
const port = Number(process.env.ROCKET_MCP_PORT ?? 8095);
const privateHost = process.env.ROCKET_MCP_PRIVATE_HOST;
if (
  privateHost &&
  (isIP(privateHost) !== 4 ||
    !/^(10\.(?:\d{1,3}\.){2}\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/.test(
      privateHost,
    ))
)
  throw new Error(
    'MCP private listener requires an explicit private IPv4 interface',
  );
if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
  throw new Error('Invalid loopback port');
const authorContext = JSON.parse(
  await readFile(
    new URL('quest-authoring/village-author-context.json', base),
    'utf8',
  ),
) as AuthorContext;
const fixture = combinedFixture({
  credential,
  port,
  ...(privateHost ? { privateHost } : {}),
  authorContext,
  path,
  world: new EncounterWorld(
    JSON.parse(
      await readFile(
        new URL('quest-authoring/village-world.json', base),
        'utf8',
      ),
    ) as WorldSpec,
  ),
  ...(process.env.ROCKET_AUTHOR_SESSION_ID
    ? { sessionId: process.env.ROCKET_AUTHOR_SESSION_ID }
    : {}),
  ...(process.env.ROCKET_AUTHOR_CHARACTER_ID
    ? { characterId: process.env.ROCKET_AUTHOR_CHARACTER_ID }
    : {}),
});
console.log(JSON.stringify({ bindingHeaders: fixture.headers, store: path }));
const bridge = generationBridge({
  connection: async () =>
    JSON.parse(
      await readFile(
        process.env.ROCKET_GENERATION_CONNECTION ??
          '/tmp/rocket-context-tools-endpoint/generation.json',
        'utf8',
      ),
    ) as GenerationConnection,
  headers: fixture.headers,
  checkpointDirectory:
    process.env.ROCKET_GENERATION_CHECKPOINTS ??
    '/tmp/rocket-generation-requests',
  readDefinition: (id) => fixture.author.readPublishedDefinition(id),
  brief: authorContext.assignment,
  browserOrigin: 'http://127.0.0.1:8092',
  port,
});
const server = listen(
  fixture.host,
  port,
  () => fixture.drain(),
  (request) => bridge.handle(request),
);
// Only MCP is exposed on the private container interface. Browser operations remain loopback-only.
const privateServer = privateHost
  ? listen(fixture.host, port, () => fixture.drain(), undefined, privateHost)
  : undefined;
async function close() {
  bridge.close();
  fixture.host.dispose();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  if (privateServer)
    await new Promise<void>((resolve, reject) =>
      privateServer.close((error) => (error ? reject(error) : resolve())),
    );
  await fixture.close();
}
process.once('SIGINT', () => {
  void close().catch(console.error);
});
process.once('SIGTERM', () => {
  void close().catch(console.error);
});
