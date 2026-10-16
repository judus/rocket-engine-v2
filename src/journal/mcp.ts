import type { McpProvider } from '../mcp/contracts.js';
import type { Journal } from './Journal.js';
import type { JournalQuery, Timeline } from './contracts.js';
import { JournalError } from './contracts.js';
import { canonical, fail } from './value.js';
/** A binding-scoped reader, not an event writer. One explicit timeline per provider. */
export function journalProvider(
  journal: Journal,
  resolve: (scope: string) => Timeline | null,
): McpProvider {
  return {
    id: 'game-journal',
    tools: (binding) =>
      resolve(binding.scope) &&
      canonical(resolve(binding.scope)) === canonical(journal.identity)
        ? [
            {
              name: 'game_journal_read',
              description:
                'Read confirmed game events in a frozen, paginated timeline window. Return cursor unchanged with the same filters.',
              inputSchema: {
                type: 'object',
                properties: {
                  cursor: { type: 'string' },
                  limit: { type: 'integer', minimum: 1, maximum: 100 },
                  source: { type: 'string' },
                  type: { type: 'string' },
                  subjectRef: { type: 'string' },
                  questRunId: { type: 'string' },
                },
                additionalProperties: false,
              },
              annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
              },
            },
            {
              name: 'game_status_read',
              description:
                'Read current domain-owned status with availability and recorded-through provenance. Domains are application supplied.',
              inputSchema: {
                type: 'object',
                properties: {
                  domains: {
                    type: 'array',
                    items: { type: 'string', enum: [...journal.domains] },
                    minItems: 1,
                    maxItems: 16,
                    uniqueItems: true,
                  },
                },
                required: ['domains'],
                additionalProperties: false,
              },
              annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: false,
              },
            },
          ]
        : [],
    async call(name, args, context) {
      const allowed = resolve(context.binding.scope);
      if (!allowed || canonical(allowed) !== canonical(journal.identity))
        fail('wrong_timeline', 'Binding cannot read this journal');
      if (context.signal.aborted) fail('cancelled', 'Read cancelled');
      try {
        let result: unknown;
        if (name === 'game_journal_read')
          result = await journal.read(args as JournalQuery);
        else if (name === 'game_status_read') {
          if (
            Object.keys(args).some((k) => k !== 'domains') ||
            !Array.isArray(args['domains']) ||
            !args['domains'].every((v) => typeof v === 'string')
          )
            fail('invalid_input', 'Expected domains array');
          result = await journal.status(args['domains'] as string[]);
        } else fail('invalid_input', 'Unknown journal tool');
        if (context.signal.aborted || !context.binding.isCurrent())
          fail('cancelled', 'Read binding expired');
        const data = { status: 'completed', data: result };
        return {
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data,
        };
      } catch (error) {
        const data = {
          status: 'unavailable',
          code:
            error instanceof JournalError ? error.code : 'store_unavailable',
          message:
            error instanceof Error ? error.message : 'Journal unavailable',
        };
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify(data) }],
          structuredContent: data,
        };
      }
    },
  };
}
