import { createHash, timingSafeEqual } from 'node:crypto';
// Low-level Server preserves provider-authored JSON schemas without rebuilding them.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  isInitializeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpBinding, McpOptions, McpProvider } from './contracts.js';

type Connection = {
  binding: McpBinding;
  signature: string;
  controller: AbortController;
  server: Server;
  transport: WebStandardStreamableHTTPServerTransport;
  initialized: boolean;
  closing: boolean;
  used: number;
  key: string;
  tools: Map<string, { tool: Tool; provider: McpProvider }>;
};
const response = (status: number, body: string) =>
  new Response(body, { status });
/** Optional Node MCP service. No domain runtime, scheduler or world state is owned here. */
export class McpService {
  #options: McpOptions | undefined;
  #providers = new Map<string, McpProvider>();
  #connections = new Map<string, Connection>();
  #closing = new Set<Promise<void>>();
  #errors: unknown[] = [];
  #disposed = false;
  configure(options: McpOptions): this {
    if (this.#options || this.#disposed)
      throw new Error('MCP service already configured or disposed');
    if (
      !options.credential ||
      !options.allowedHosts.length ||
      options.allowedHosts.some((h) => !h)
    )
      throw new Error('MCP credential and allowed hosts are required');
    if (
      !Number.isSafeInteger(options.maxConnections ?? 64) ||
      (options.maxConnections ?? 64) < 1 ||
      !Number.isFinite(options.idleTimeoutMs ?? 1_800_000) ||
      (options.idleTimeoutMs ?? 1_800_000) <= 0
    )
      throw new RangeError('Invalid MCP connection limits');
    if (!(options.path ?? '/mcp').startsWith('/'))
      throw new Error('Invalid MCP path');
    this.#options = Object.freeze({
      ...options,
      allowedHosts: Object.freeze([...options.allowedHosts]),
      allowedOrigins: Object.freeze([...(options.allowedOrigins ?? [])]),
    });
    return this;
  }
  register(provider: McpProvider): () => void {
    if (this.#disposed || !provider.id || this.#providers.has(provider.id))
      throw new Error('Duplicate or invalid MCP provider');
    this.#providers.set(provider.id, provider);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      if (this.#providers.get(provider.id) !== provider) return;
      this.#providers.delete(provider.id);
      for (const c of this.#connections.values())
        if (c.binding.providers.includes(provider.id)) this.#drop(c);
    };
  }
  get stats() {
    return Object.freeze({
      providers: this.#providers.size,
      connections: this.#connections.size,
      disposed: this.#disposed,
    });
  }
  stop(): undefined {
    for (const c of this.#connections.values()) this.#drop(c);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.stop();
    this.#providers.clear();
  }
  /** Await this after engine disposal or before releasing provider-owned resources. */
  async close(): Promise<void> {
    this.dispose();
    while (this.#closing.size) await Promise.all([...this.#closing]);
    if (this.#errors.length)
      throw new AggregateError(
        this.#errors.splice(0),
        'MCP transport shutdown failed',
      );
  }
  async handle(request: Request): Promise<Response> {
    const o = this.#options;
    if (this.#disposed || !o) return response(503, 'MCP unavailable');
    const url = new URL(request.url);
    if (url.pathname !== (o.path ?? '/mcp')) return response(404, 'Not found');
    if (
      !o.allowedHosts.includes(url.host) ||
      (request.headers.has('host') && request.headers.get('host') !== url.host)
    )
      return response(403, 'Invalid host');
    const origin = request.headers.get('origin');
    if (origin && !o.allowedOrigins?.includes(origin))
      return response(403, 'Invalid origin');
    const expected = createHash('sha256')
      .update(`Bearer ${o.credential}`)
      .digest();
    const actual = createHash('sha256')
      .update(request.headers.get('authorization') ?? '')
      .digest();
    if (!timingSafeEqual(expected, actual))
      return response(401, 'Unauthorized');
    const resolved = o.resolveBinding(request);
    if (!resolved || !resolved.scope || !resolved.isCurrent())
      return response(403, 'Invalid binding');
    const binding = resolved; // Preserve the domain provider's opaque authority token.
    const signature = JSON.stringify([
      binding.scope,
      binding.providers,
      Object.entries(binding.metadata ?? {}).sort(),
    ]);
    for (const c of this.#connections.values())
      if (
        !this.#current(c) ||
        Date.now() - c.used > (o.idleTimeoutMs ?? 1_800_000)
      )
        this.#drop(c);
    const sessionId = request.headers.get('mcp-session-id');
    let c = sessionId ? this.#connections.get(sessionId) : undefined;
    if (sessionId && (!c || c.signature !== signature))
      return response(404, 'Unknown session');
    if (request.method !== 'POST' && request.method !== 'DELETE')
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'POST, DELETE' },
      });
    if (request.method === 'DELETE') {
      if (!c) return response(400, 'Session required');
      const result = await c.transport.handleRequest(request);
      this.#drop(c);
      return result;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await limitedBody(request));
    } catch {
      return response(400, 'Invalid or oversized JSON');
    }
    if (!c) {
      if (!isInitializeRequest(parsed))
        return response(400, 'Initialize first');
      if (this.#connections.size >= (o.maxConnections ?? 64))
        return response(503, 'Connection limit');
      try {
        c = await this.#connect(binding, signature);
      } catch {
        return response(400, 'Invalid provider catalogue');
      }
    } else {
      const version = request.headers.get('mcp-protocol-version');
      if (!version || !SUPPORTED_PROTOCOL_VERSIONS.includes(version))
        return response(400, 'Unsupported protocol');
      if (
        !c.initialized &&
        !(
          typeof parsed === 'object' &&
          parsed !== null &&
          'method' in parsed &&
          parsed.method === 'notifications/initialized'
        )
      )
        return response(400, 'Initialize first');
    }
    c.used = Date.now();
    const connection = c;
    if (!this.#current(connection)) {
      this.#drop(connection);
      return response(409, 'Binding retired');
    }
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        connection.transport.handleRequest(request, { parsedBody: parsed }),
        new Promise<Response>((resolve) => {
          abort = () => resolve(response(409, 'Binding retired'));
          connection.controller.signal.addEventListener('abort', abort, {
            once: true,
          });
          if (connection.controller.signal.aborted) abort();
        }),
      ]);
    } finally {
      if (abort)
        connection.controller.signal.removeEventListener('abort', abort);
      if (!connection.transport.sessionId) this.#drop(connection);
    }
  }
  #current(c: Connection): boolean {
    return (
      !this.#disposed &&
      !c.controller.signal.aborted &&
      c.binding.isCurrent() &&
      c.binding.providers.every((id) => this.#providers.has(id)) &&
      [...c.tools.values()].every(
        (t) => this.#providers.get(t.provider.id) === t.provider,
      )
    );
  }
  async #connect(binding: McpBinding, signature: string): Promise<Connection> {
    const tools = new Map<string, { tool: Tool; provider: McpProvider }>();
    if (new Set(binding.providers).size !== binding.providers.length)
      throw new Error('Duplicate provider');
    for (const id of binding.providers) {
      const provider = this.#providers.get(id);
      if (!provider) throw new Error('Missing provider');
      for (const tool of provider.tools(binding)) {
        if (!tool.name || tools.has(tool.name) || tools.size >= 128)
          throw new Error('Invalid tool catalogue');
        tools.set(tool.name, { tool: structuredClone(tool), provider });
      }
    }
    const server = new Server(
      { name: 'rocket-mcp', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      enableJsonResponse: true,
      maxRequestBodySize: 131_072,
      onsessioninitialized: (id) => {
        this.#connections.delete(c.key);
        c.key = id;
        if (this.#current(c)) this.#connections.set(id, c);
      },
    });
    const c: Connection = {
      binding,
      signature,
      server,
      transport,
      controller: new AbortController(),
      initialized: false,
      closing: false,
      used: Date.now(),
      key: crypto.randomUUID(),
      tools,
    };
    this.#connections.set(c.key, c); // Reserve capacity before awaiting SDK connection.
    server.oninitialized = () => {
      c.initialized = true;
    };
    transport.onclose = () => {
      c.controller.abort();
      this.#connections.delete(c.key);
    };
    server.setRequestHandler(ListToolsRequestSchema, (request) => {
      if (!this.#current(c))
        throw new McpError(ErrorCode.InvalidRequest, 'Binding retired');
      if (request.params?.cursor)
        throw new McpError(
          ErrorCode.InvalidParams,
          'Catalogue is not paginated',
        );
      return { tools: [...tools.values()].map((t) => t.tool) };
    });
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      if (!this.#current(c))
        throw new McpError(ErrorCode.InvalidRequest, 'Binding retired');
      const entry = tools.get(request.params.name);
      if (!entry) throw new McpError(ErrorCode.InvalidParams, 'Unknown tool');
      const headers = new Headers();
      for (const [name, value] of Object.entries(
        extra.requestInfo?.headers ?? {},
      ))
        if (typeof value === 'string') headers.set(name, value);
      const result = await entry.provider.call(
        request.params.name,
        request.params.arguments ?? {},
        {
          binding: c.binding,
          headers,
          signal: AbortSignal.any([c.controller.signal, extra.signal]),
        },
      );
      if (!this.#current(c))
        throw new McpError(ErrorCode.InvalidRequest, 'Binding retired');
      return result;
    });
    try {
      await server.connect(transport);
      return c;
    } catch (error) {
      this.#drop(c);
      throw error;
    }
  }
  #drop(c: Connection): void {
    if (c.closing) return;
    c.closing = true;
    c.controller.abort();
    this.#connections.delete(c.key);
    const closing = c.server.close().catch((e: unknown) => {
      this.#errors.push(e);
    });
    this.#closing.add(closing);
    void closing.finally(() => this.#closing.delete(closing));
  }
}
async function limitedBody(request: Request): Promise<string> {
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 131_072) {
        await reader.cancel();
        throw new Error('Body limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}
