import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CaiHttpBackend, CaiHttpError } from 'cfw-authoring-candidate/cai';
import type {
  CaiAuthoringInput,
  CaiAuthoringJob,
} from 'cfw-authoring-candidate/cai';

type RecordValue = Record<string, unknown>;
const record = (v: unknown): v is RecordValue =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(v);
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (record(v))
    return (
      '{' +
      Object.keys(v)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(v[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(v);
}
export interface GenerationConnection {
  origin: string;
  credentialFile: string;
  sessionId: string;
  characterId: string;
  model: string;
  limits: string;
}
interface Checkpoint {
  input: CaiAuthoringInput;
  sessionId: string;
  bindingGeneration: string;
}
/** Application-only local bridge. Credentials never cross into the player browser. */
export function generationBridge(options: {
  connection: () => Promise<GenerationConnection>;
  headers: Record<string, string>;
  checkpointDirectory: string;
  readDefinition: (id: string) => unknown;
  brief: string;
  browserOrigin: string;
  port: number;
  fetch?: typeof fetch;
}) {
  const lifetime = new AbortController();
  const expected = new Headers(options.headers);
  const reply = (data: unknown, status = 200) =>
    Response.json(data, { status });
  async function connected() {
    const config = await options.connection();
    if (!config.model || !config.limits)
      throw new Error('Model and trial limits are not configured.');
    const backend = new CaiHttpBackend({
      origin: config.origin,
      token: await readFile(config.credentialFile, 'utf8'),
      enableGameDraft: true,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    const session = await backend.attach(
      {
        sessionId: config.sessionId,
        characterId: config.characterId,
        bindingKey: expected.get('X-CF-Binding-Key')!,
      },
      AbortSignal.any([lifetime.signal, AbortSignal.timeout(15000)]),
    );
    if (
      session.id !== expected.get('X-CF-CAI-Session-Id') ||
      session.id !== config.sessionId ||
      session.characterId !== config.characterId ||
      session.bindingKey !== expected.get('X-CF-Binding-Key') ||
      session.bindingGeneration !== expected.get('X-CF-Binding-Generation')
    )
      throw new Error('CAI session and current game binding do not match.');
    return { config, backend, session };
  }
  async function checkpoint(id: string): Promise<Checkpoint> {
    if (!uuid(id)) throw new Error('Invalid request ID.');
    return JSON.parse(
      await readFile(join(options.checkpointDirectory, id + '.json'), 'utf8'),
    ) as Checkpoint;
  }
  async function route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204 });
    const { config, backend, session } = await connected();
    const signal = AbortSignal.any([
      lifetime.signal,
      AbortSignal.timeout(20000),
    ]);
    if (url.pathname === '/demo-api/config' && request.method === 'GET')
      return reply({
        ready: true,
        model: config.model,
        limits: config.limits,
        sessionId: session.id,
      });
    if (url.pathname === '/demo-api/jobs' && request.method === 'POST') {
      const input: unknown = await request.json();
      if (
        !record(input) ||
        Object.keys(input).some((k) => k !== 'requestId') ||
        !uuid(input['requestId'])
      )
        return reply(
          {
            error:
              'A request UUID is required; the game supplies its authoring assignment.',
          },
          400,
        );
      const id = input['requestId'];
      await mkdir(options.checkpointDirectory, {
        recursive: true,
        mode: 0o700,
      });
      let saved: Checkpoint;
      try {
        saved = await checkpoint(id);
        if (
          saved.sessionId !== session.id ||
          saved.bindingGeneration !== session.bindingGeneration
        )
          return reply(
            {
              error:
                'This request already belongs to different input or binding.',
            },
            409,
          );
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
        saved = {
          input: {
            request_id: id,
            version: session.version,
            brief: options.brief,
          },
          sessionId: session.id,
          bindingGeneration: session.bindingGeneration!,
        };
        // Exclusive write precedes dispatch. A lost reply can be retried with this exact payload.
        await writeFile(
          join(options.checkpointDirectory, id + '.json'),
          JSON.stringify(saved),
          { mode: 0o600, flag: 'wx' },
        );
      }
      const job = await backend.submitAuthoring(
        session.id,
        saved.input,
        signal,
      );
      return reply({ job });
    }
    const match = url.pathname.match(
      /^\/demo-api\/jobs\/([^/]+)\/([^/]+)(\/publications)?$/,
    );
    if (
      !match ||
      request.method !== 'GET' ||
      !uuid(match[1]) ||
      !uuid(match[2])
    )
      return reply({ error: 'Unknown demo operation.' }, 404);
    const saved = await checkpoint(match[1]);
    const job = await backend.readAuthoringJob(session.id, match[2], signal);
    if (
      saved.sessionId !== session.id ||
      job.requestId !== saved.input.request_id ||
      job.version !== saved.input.version ||
      job.bindingGeneration !== saved.bindingGeneration
    )
      throw new Error('Job identity does not match its saved request.');
    // Historical receipts retain their admission generation. Current caller authority
    // is checked by connected(); the job must match its original checkpoint, not today's binding.
    if (!match[3]) return reply({ job });
    if (!['finished', 'failed'].includes(job.status))
      return reply({ error: 'Job is still running.' }, 409);
    return reply({
      job,
      publications: await publications(job, backend, session, signal),
    });
  }
  async function publications(
    job: CaiAuthoringJob,
    backend: CaiHttpBackend,
    session: Awaited<ReturnType<CaiHttpBackend['attach']>>,
    signal: AbortSignal,
  ) {
    if (!job.attemptRequestId) return [];
    const found = new Map<string, unknown>();
    let cursor: string | undefined;
    const seen = new Set<string>();
    do {
      const page = await backend.readAttempt(
        session,
        job.attemptRequestId,
        signal,
        cursor,
      );
      if (
        page.bindingGeneration !== job.bindingGeneration ||
        page.inputVersion !== job.version
      )
        throw new Error('Attempt identity does not match the job.');
      for (const call of page.calls) {
        if (call.tool_name !== 'publish_quest_draft') continue;
        if (call.state !== 'resolved' || call.outcome_kind !== 'mcp_result')
          throw new Error(
            'Publication outcome is unresolved; retain this job for reconciliation.',
          );
        const detail = await backend.readCall(
          session.id,
          job.attemptRequestId,
          call.call_id,
          signal,
        );
        if (
          detail.binding_generation !== job.bindingGeneration ||
          detail.tool_name !== 'publish_quest_draft' ||
          detail.state !== 'resolved' ||
          detail.outcome_kind !== 'mcp_result'
        )
          throw new Error('Publication receipt mismatch.');
        const envelope = detail.result?.['structuredContent'];
        if (!record(envelope) || envelope['status'] !== 'completed') continue;
        const data = envelope['data'];
        const draft = detail.arguments['draft'];
        const publication = record(data) ? data['publication'] : undefined;
        if (
          !record(data) ||
          !record(draft) ||
          data['draftId'] !== draft['id'] ||
          data['revision'] !== draft['revision'] ||
          !record(publication) ||
          publication['sourceRevision'] !== draft['revision'] ||
          typeof publication['definitionId'] !== 'string' ||
          typeof publication['digest'] !== 'string' ||
          typeof data['commandId'] !== 'string'
        )
          throw new Error(
            'Unexpected publication receipt; candidate cannot be imported.',
          );
        const definition = options.readDefinition(publication['definitionId']);
        if (
          !record(definition) ||
          definition['id'] !== publication['definitionId'] ||
          createHash('sha256').update(canonical(definition)).digest('hex') !==
            publication['digest']
        )
          throw new Error(
            'Stored definition does not match its exact publication receipt.',
          );
        found.set(publication['definitionId'], {
          definition,
          receipt: data,
          jobId: job.id,
          callId: call.call_id,
        });
      }
      cursor = page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor))
        throw new Error('Repeated receipt cursor.');
      if (cursor) seen.add(cursor);
      if (seen.size > 64) throw new Error('Receipt page limit exceeded.');
    } while (cursor);
    return [...found.values()];
  }
  return {
    close() {
      lifetime.abort();
    },
    async handle(request: Request): Promise<Response | undefined> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/demo-api/')) return undefined;
      if (
        request.headers.get('host') !== `127.0.0.1:${options.port}` ||
        request.headers.get('origin') !== options.browserOrigin
      )
        return reply({ error: 'Untrusted demo origin.' }, 403);
      let response: Response;
      try {
        response = await route(request);
      } catch (error) {
        const message =
          error instanceof CaiHttpError
            ? error.message
            : error instanceof Error && !('code' in error)
              ? error.message
              : 'Generation connection is not configured or is unavailable.';
        response = reply({ error: message }, 503);
      }
      response.headers.set(
        'Access-Control-Allow-Origin',
        options.browserOrigin,
      );
      response.headers.set(
        'Access-Control-Allow-Methods',
        'GET, POST, OPTIONS',
      );
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      response.headers.set('Cache-Control', 'no-store');
      return response;
    },
  };
}
