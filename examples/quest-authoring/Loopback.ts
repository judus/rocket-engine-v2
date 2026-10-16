import { createServer } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import type { McpService } from '../../src/mcp/index.js';
/** Fixture-only HTTP boundary. Optional drain processes zero-time authoring work, never game time. */
export function listen(
  host: McpService,
  port: number,
  drain?: () => void,
  application?: (request: Request) => Promise<Response | undefined>,
  interfaceHost = '127.0.0.1',
) {
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (typeof value === 'string') headers.set(name, value);
        else if (value) headers.set(name, value.join(','));
      }
      const method = incoming.method ?? 'GET';
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) {
        const bytes = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as string);
        size += bytes.length;
        if (size > 131072) {
          outgoing.writeHead(413);
          outgoing.end('Body limit');
          return;
        }
        chunks.push(bytes);
      }
      const address = server.address();
      const actualPort =
        address && typeof address === 'object' ? address.port : port;
      const request = new Request(
        `http://${interfaceHost}:${actualPort}${incoming.url ?? '/'}`,
        {
          method,
          headers,
          ...(method !== 'GET' && method !== 'HEAD'
            ? { body: Buffer.concat(chunks) }
            : {}),
        },
      );
      const applicationResult = await application?.(request);
      const pending = applicationResult
        ? Promise.resolve(applicationResult)
        : host.handle(request);
      if (drain && !applicationResult) {
        let settled = false;
        void pending.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        while (!settled) {
          drain();
          await setImmediate();
        }
      }
      const result = await pending;
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    })().catch((error: unknown) => {
      console.error(
        error instanceof Error ? error.message : 'Fixture request failed',
      );
      if (!outgoing.headersSent) outgoing.writeHead(500);
      outgoing.end();
    });
  });
  server.listen(port, interfaceHost, () => {
    const address = server.address();
    const actualPort =
      address && typeof address === 'object' ? address.port : port;
    console.log(
      `MCP fixture: http://${interfaceHost}:${actualPort}/mcp (credential configured, not printed)`,
    );
  });
  return server;
}
