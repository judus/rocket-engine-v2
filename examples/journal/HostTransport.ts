import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { McpService } from '../../src/mcp/index.js';
/** Official Client transport to an actual Rocket HTTP handler, without a TCP listener. */
export class HostTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  #session = '';
  constructor(
    readonly host: McpService,
    readonly url: URL,
    readonly credential: string,
  ) {}
  start(): Promise<void> {
    return Promise.resolve();
  }
  #headers() {
    return {
      authorization: 'Bearer ' + this.credential,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-03-26',
      ...(this.#session ? { 'mcp-session-id': this.#session } : {}),
    };
  }
  async send(message: JSONRPCMessage): Promise<void> {
    const response = await this.host.handle(
      new Request(this.url, {
        method: 'POST',
        headers: this.#headers(),
        body: JSON.stringify(message),
      }),
    );
    if (!response.ok)
      throw new Error(
        'MCP HTTP ' + response.status + ': ' + (await response.text()),
      );
    this.#session = response.headers.get('mcp-session-id') ?? this.#session;
    if (response.status !== 202 && response.status !== 204)
      this.onmessage?.((await response.json()) as JSONRPCMessage);
  }
  async close(): Promise<void> {
    if (this.#session) {
      await this.host.handle(
        new Request(this.url, { method: 'DELETE', headers: this.#headers() }),
      );
      this.#session = '';
    }
    this.onclose?.();
  }
}
