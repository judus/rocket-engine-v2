import test from 'node:test';
import assert from 'node:assert/strict';
import { Rocket } from '../src/Rocket.js';
import { McpService } from '../src/mcp/index.js';
import type { McpProvider } from '../src/mcp/index.js';
const url = new URL('http://127.0.0.1:8093/mcp');
async function fixture() {
  let text = 'First reading';
  const app = new Rocket();
  let current = true;
  let providers = ['test-reader'];
  const host = app.use(McpService).configure({
    credential: 'test-only',
    allowedHosts: [url.host],
    resolveBinding: (r) => ({
      scope: r.headers.get('scope') ?? 'game',
      providers,
      isCurrent: () => current,
    }),
  });
  const remove = host.register({
    id: 'test-reader',
    tools: () => [
      {
        name: 'read_test_state',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true },
      },
    ],
    call: (_name, args) => {
      if (Object.keys(args).length) throw new Error('Invalid arguments');
      return { content: [{ type: 'text', text }] };
    },
  });
  const client = new WireClient(host);
  await client.connect();
  return {
    app,
    host,
    client,
    setText: (value: string) => {
      text = value;
    },
    remove,
    setCurrent: (v: boolean) => {
      current = v;
    },
    setProviders: (v: string[]) => {
      providers = v;
    },
    async close() {
      await client.close();
      await app.dispose();
      await host.close();
    },
  };
}
void test('neutral MCP discovery and current plain-text reads without domain dependencies, engine disposal awaits explicit barrier', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  assert.deepEqual(
    (await f.client.listTools()).tools.map((t) => t.name),
    ['read_test_state'],
  );
  const first = await f.client.callTool({
    name: 'read_test_state',
    arguments: {},
  });
  assert.equal(first.structuredContent, undefined);
  assert.equal((first.content as { text: string }[])[0]!.text, 'First reading');
  f.setText('Updated reading');
  const second = await f.client.callTool({
    name: 'read_test_state',
    arguments: {},
  });
  assert.equal(
    (second.content as { text: string }[])[0]!.text,
    'Updated reading',
  );
  await assert.rejects(
    f.client.callTool({
      name: 'read_test_state',
      arguments: { invented: true },
    }),
  );
  await f.app.dispose();
  await f.host.close();
  assert.deepEqual(f.host.stats, {
    providers: 0,
    connections: 0,
    disposed: true,
  });
  assert.equal((await f.host.handle(new Request(url))).status, 503);
});
void test('composes neutral providers, forwards call metadata and rejects name collisions', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  let received = '';
  const provider: McpProvider = {
    id: 'domain',
    tools: () => [{ name: 'domain_read', inputSchema: { type: 'object' } }],
    call: (_name, _args, ctx) => {
      received = ctx.headers.get('x-cf-call-id') ?? '';
      return { content: [{ type: 'text', text: ctx.binding.scope }] };
    },
  };
  f.host.register(provider);
  f.setProviders(['test-reader', 'domain']);
  await f.client.close();
  await f.client.connect();
  assert.equal((await f.client.listTools()).tools.length, 2);
  await f.client.callTool({ name: 'domain_read', arguments: {} });
  assert.equal(received, 'call-proof');
  assert.throws(() => f.host.register(provider), /Duplicate/);
  f.host.register({ ...provider, id: 'collision' });
  f.setProviders(['domain', 'collision']);
  const request = new Request(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-only',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      },
    }),
  });
  assert.equal((await f.host.handle(request)).status, 400);
});
void test('unregister aborts an in-flight provider and stale sessions cannot dispatch', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  f.remove();
  let aborted = false,
    entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  f.host.register({
    id: 'test-reader',
    tools: () => [{ name: 'wait', inputSchema: { type: 'object' } }],
    call: (_n, _a, ctx) =>
      new Promise((resolve) => {
        entered();
        ctx.signal.addEventListener(
          'abort',
          () => {
            aborted = true;
            resolve({ content: [] });
          },
          { once: true },
        );
      }),
  });
  await f.client.close();
  await f.client.connect();
  const call = f.client.callTool({ name: 'wait', arguments: {} });
  const rejection = assert.rejects(call);
  await started;
  f.host.dispose();
  await rejection;
  await f.host.close();
  assert.equal(aborted, true);
});
void test('transport retains bearer, authority, origin, body and binding boundaries', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const req = (headers: Record<string, string>, body = '{}') =>
    new Request(url, { method: 'POST', headers, body });
  assert.equal((await f.host.handle(req({}))).status, 401);
  assert.equal(
    (
      await f.host.handle(
        req({ authorization: 'Bearer test-only', host: 'other.test' }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.host.handle(
        req({
          authorization: 'Bearer test-only',
          origin: 'https://other.test',
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await f.host.handle(
        req({ authorization: 'Bearer test-only' }, ' '.repeat(131073)),
      )
    ).status,
    400,
  );
  f.setCurrent(false);
  assert.equal(
    (await f.host.handle(req({ authorization: 'Bearer test-only' }))).status,
    403,
  );
});

/** Exercise actual Streamable HTTP initialization, session headers and JSON-RPC dispatch. */
class WireClient {
  #session = '';
  #id = 0;
  constructor(private host: McpService) {}
  async connect() {
    const r = await this.request('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'proof', version: '1' },
    });
    assert.ok(r);
    await this.request('notifications/initialized', {}, true);
  }
  async listTools() {
    return (await this.request('tools/list', {})) as {
      tools: { name: string }[];
    };
  }
  async callTool(params: { name: string; arguments: Record<string, unknown> }) {
    return (await this.request('tools/call', params)) as Record<
      string,
      unknown
    >;
  }
  async close() {
    if (!this.#session) return;
    await this.host.handle(
      new Request(url, { method: 'DELETE', headers: this.headers() }),
    );
    this.#session = '';
  }
  headers() {
    return {
      authorization: 'Bearer test-only',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-03-26',
      'x-cf-call-id': 'call-proof',
      'x-cf-turn-request-id': 'turn-proof',
      ...(this.#session ? { 'mcp-session-id': this.#session } : {}),
    };
  }
  async request(
    method: string,
    params: Record<string, unknown>,
    notification = false,
  ): Promise<unknown> {
    const response = await this.host.handle(
      new Request(url, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          jsonrpc: '2.0',
          ...(!notification ? { id: ++this.#id } : {}),
          method,
          params,
        }),
      }),
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    this.#session = response.headers.get('mcp-session-id') ?? this.#session;
    if (notification) return null;
    const body = (await response.json()) as {
      error?: { message: string };
      result?: unknown;
    };
    if (body.error) throw new Error(body.error.message);
    return body.result;
  }
}
