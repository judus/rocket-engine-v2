import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { generationBridge } from '../examples/quest-authoring/GenerationBridge.js';

void test('generation bridge retains exact submissions, scopes reads, and verifies publication receipts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rocket-generation-test-'));
  const tokenFile = join(dir, 'token');
  await writeFile(tokenFile, 'private-test-token');
  const requestId = randomUUID(),
    jobId = randomUUID(),
    callId = randomUUID();
  const session = {
    id: 12,
    character: { id: 4 },
    mode: 'game',
    continuity_mode: 'session',
    version: 0,
    binding_key: 'author',
    binding_generation: 'generation-one',
  };
  // Captured from the real completed generation, not reconstructed from importer assumptions.
  const recorded = JSON.parse(
    await readFile(
      new URL(
        '../../tests/fixtures/recorded-quest-publication.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    arguments: { draft: { id: string; revision: number } };
    result: Record<string, unknown>;
    definition: { id: string };
  };
  const definition = recorded.definition;
  const job = {
    id: jobId,
    request_id: requestId,
    session_id: 12,
    version: 0,
    binding_generation: 'generation-one',
    status: 'finished',
    report: 'Published',
    failure_code: null,
    attempt_request_id: jobId,
    created_at: '2026-10-14T12:00:00Z',
    started_at: '2026-10-14T12:00:01Z',
    finished_at: '2026-10-14T12:00:02Z',
  };
  const call = {
    call_id: callId,
    ordinal: 1,
    tool_name: 'publish_quest_draft',
    provider_alias: 'cfw',
    provider_call_id: 'provider-call',
    binding_generation: 'generation-one',
    mutation: true,
    effect_key: 'effect',
    state: 'resolved',
    outcome_kind: 'mcp_result',
  };
  const submitted: string[] = [];
  let loseReply = true,
    wrongDefinition = false,
    wrongDraft = false,
    wrongRevision = false;
  const backendFetch: typeof fetch = async (input, init) => {
    assert.equal(
      new Headers(init?.headers).get('authorization'),
      'Bearer private-test-token',
    );
    const url = new URL(String(input));
    if (init?.method === 'POST') {
      assert.equal(typeof init.body, 'string');
      // The host checkpoint exists before any provider dispatch.
      assert.match(
        await readFile(join(dir, requestId + '.json'), 'utf8'),
        /A tiny quest/,
      );
      submitted.push(String(init.body));
      if (loseReply) {
        loseReply = false;
        throw new Error('Lost acknowledgement');
      }
      return Response.json({ data: job });
    }
    if (url.pathname.endsWith('/sessions/12'))
      return Response.json({ data: session });
    if (url.pathname.includes('/quest-authoring-jobs/'))
      return Response.json({ data: job });
    if (url.pathname.endsWith('/calls/' + callId))
      return Response.json({
        data: {
          request_id: jobId,
          call: {
            ...call,
            arguments: {
              draft: {
                id: wrongDraft ? 'another-draft' : recorded.arguments.draft.id,
                revision:
                  recorded.arguments.draft.revision + (wrongRevision ? 1 : 0),
              },
            },
            admission: null,
            result: recorded.result,
          },
        },
      });
    return Response.json({
      data: {
        request_id: jobId,
        input_version: 0,
        binding_generation: 'generation-one',
        session,
        dialogue_status: 'interrupted',
        continuation_allowed: true,
        turn: null,
        calls: [call],
        next_cursor: null,
      },
    });
  };
  const options = {
    connection: async () => ({
      origin: 'http://localhost:8000',
      credentialFile: tokenFile,
      sessionId: '12',
      characterId: '4',
      model: 'test-model',
      limits: 'one job',
    }),
    headers: {
      'X-CF-Binding-Key': 'author',
      'X-CF-CAI-Session-Id': '12',
      'X-CF-Binding-Generation': 'generation-one',
    },
    checkpointDirectory: dir,
    brief: 'A tiny quest',
    readDefinition: () =>
      wrongDefinition ? { ...definition, id: 'wrong' } : definition,
    browserOrigin: 'http://127.0.0.1:8092',
    port: 8120,
    fetch: backendFetch,
  } satisfies Parameters<typeof generationBridge>[0];
  const bridge = generationBridge(options);
  const request = (
    path: string,
    body?: unknown,
    origin = 'http://127.0.0.1:8092',
  ) =>
    new Request('http://127.0.0.1:8120/demo-api/' + path, {
      headers: {
        host: '127.0.0.1:8120',
        origin,
        'content-type': 'application/json',
      },
      ...(body === undefined
        ? {}
        : { method: 'POST', body: JSON.stringify(body) }),
    });
  try {
    assert.equal(
      (await bridge.handle(request('config', undefined, 'http://evil.test')))!
        .status,
      403,
    );
    const config = await (await bridge.handle(request('config')))!.text();
    assert.match(config, /test-model/);
    assert.doesNotMatch(config, /private-test-token|credentialFile/);
    const input = { requestId };
    assert.equal((await bridge.handle(request('jobs', input)))!.status, 503);
    assert.equal((await bridge.handle(request('jobs', input)))!.status, 200);
    assert.equal(submitted.length, 2);
    assert.equal(submitted[0], submitted[1]);
    assert.equal(
      (await bridge.handle(request('jobs', { ...input, brief: 'Changed' })))!
        .status,
      400,
    );
    const path = `jobs/${requestId}/${jobId}/publications`;
    const result = await bridge.handle(request(path));
    assert.equal(result!.status, 200);
    assert.ok((await result!.text()).includes(definition.id));
    session.binding_generation = 'generation-two';
    const refreshed = generationBridge({
      ...options,
      headers: {
        ...options.headers,
        'X-CF-Binding-Generation': 'generation-two',
      },
    });
    try {
      // Rebinding must not make an existing job or its original publication unreadable.
      assert.equal(
        (await refreshed.handle(request(`jobs/${requestId}/${jobId}`)))!.status,
        200,
      );
      assert.equal((await refreshed.handle(request(path)))!.status, 200);
      // It must not silently admit an uncertain old submission under a new binding.
      assert.equal(
        (await refreshed.handle(request('jobs', input)))!.status,
        409,
      );
      assert.equal(submitted.length, 2);
    } finally {
      refreshed.close();
    }
    session.binding_generation = 'generation-one';
    wrongDraft = true;
    assert.equal((await bridge.handle(request(path)))!.status, 503);
    wrongDraft = false;
    wrongRevision = true;
    assert.equal((await bridge.handle(request(path)))!.status, 503);
    wrongRevision = false;
    wrongDefinition = true;
    assert.equal((await bridge.handle(request(path)))!.status, 503);
    job.request_id = randomUUID();
    assert.equal(
      (await bridge.handle(request(`jobs/${requestId}/${jobId}`)))!.status,
      503,
    );
  } finally {
    bridge.close();
    await rm(dir, { recursive: true, force: true });
  }
});
