import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

/** Application-authenticated scope. Domain identities remain opaque to the host. */
export interface McpBinding {
  readonly scope: string;
  readonly providers: readonly string[];
  readonly metadata?: Readonly<Record<string, string>>;
  readonly isCurrent: () => boolean;
}
export interface McpCallContext {
  readonly binding: McpBinding;
  readonly headers: Headers;
  readonly signal: AbortSignal;
}
/** The application owns the provider and its simulation; unregister does not dispose either. */
export interface McpProvider {
  readonly id: string;
  tools(binding: McpBinding): readonly Tool[];
  call(
    name: string,
    args: Readonly<Record<string, unknown>>,
    context: McpCallContext,
  ): Promise<CallToolResult> | CallToolResult;
}
export interface McpOptions {
  readonly credential: string;
  readonly allowedHosts: readonly string[];
  readonly allowedOrigins?: readonly string[];
  readonly path?: string;
  readonly maxConnections?: number;
  readonly idleTimeoutMs?: number;
  /** Resolve existing domain headers here. Return null to reject the request. */
  readonly resolveBinding: (request: Request) => McpBinding | null;
}
