# Game journal and current status

Rocket's optional journal records confirmed observations from application-owned producers. It does not execute game actions, infer mission outcomes, manage inventories or rebuild an entire game from events. Current status is read from domain-owned readers. The engine root imports neither SQLite, MCP nor CFW through this feature.

## Entries and ownership

- `rocket-engine-v2/journal`: neutral `Journal`, `MemoryJournalStore`, errors and contracts. Browser-safe, no CFW/Workshop/MCP/storage dependency.
- `rocket-engine-v2/journal/sqlite`: optional Node `SqliteJournalStore`, using built-in `node:sqlite`. File-backed, WAL/FULL synchronous transactions. Tested with Node 24.14.0; Node may print its experimental SQLite warning.
- `rocket-engine-v2/journal/mcp`: read-only provider composed on the existing `McpService`. The application resolves binding scope to one timeline.
- `examples/journal/WatchtowerReporter.ts`: game-specific observation/completion logic. This is deliberately outside the neutral engine package.

There is one configured store/timeline per Journal instance, not a process-global singleton. `gameId`, `saveId` and `timelineId` are checked against store identity. A world reset must use a new timeline. The application owns the store and closes it explicitly after accepted writes drain; scene/provider removal does not delete history.

```ts
import { Journal } from 'rocket-engine-v2/journal';
import { SqliteJournalStore } from 'rocket-engine-v2/journal/sqlite';

const store = new SqliteJournalStore('./game-journal.sqlite', {
  gameId: 'my-game',
  saveId: 'save-1',
  timelineId: 'timeline-1',
});
const journal = new Journal().configure(store);
const game = journal.registerProducer('my-game', {
  'game.item_delivered': {
    version: 1,
    validate: (payload) =>
      payload !== null &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof payload.itemRef === 'string',
  },
});
// Call after the game's ordinary validation and mutation succeed.
const receipt = await game.append({
  eventId: 'existing-delivery-operation-id',
  type: 'game.item_delivered',
  version: 1,
  subjectRefs: ['seal', 'beacon'],
  payload: { itemRef: 'seal', destinationRef: 'beacon' },
});
```

An application may also use `app.use(Journal).configure(store)`. It introduces no timer, frame loop or simulation clock. Persistence happens through explicit async operations outside synchronous engine hooks. The optional `simulationTime` comes from the existing simulation owner.

Producer event types, versions and payload validators are supplied by the game/subsystem. Registration copies the schema descriptors; producers cannot choose their source at append time. Data is finite, plain JSON, copied before admission and checked against finite byte/queue limits. Validation functions are trusted application code, not remote schemas or model-authored predicates.

## Persistence and identity

Every event has a store sequence, timeline identity, source, stable eventId, type/version, subject references, optional string correlations/simulation time, payload and recordedAt. Sequence means **journal acceptance order**, not reconstructed cross-subsystem physical causality. Include original source sequence/effect/run IDs where they matter.

Uniqueness is `(timeline, source, eventId)`. An identical canonical-content retry returns the original sequence with `replayed:true`; it preserves the first stored time. Reusing that identity with different content rejects `identity_conflict`. Different IDs with identical-looking payloads are distinct real events. Reopening SQLite retains the same identity/sequence/duplicate behavior. Store identity mismatch rejects rather than silently mixing worlds.

`appendBatch` atomically inserts 1–32 records in one producer's store transaction. A conflict/capacity error rolls back that entire batch. This does **not** make a previously executed external game action atomic with its journal write. On failure the caller receives an error; retry the original evidence with the original identity. Never rerun the gameplay action just to repair its reporting.

Bounds: 16 KiB per event envelope, 32 records per batch, 64 admitted pending records, query limit 1–100, response budget below 64 KiB, nesting depth 32, identifier length 160, at most 32 subject refs/16 correlations. Store capacity defaults to 10,000 records and is constructor-configurable. A full store rejects; it never evicts records while claiming complete history. Limits are proof defaults, not universal gameplay recommendations.

`MemoryJournalStore` follows the same archive/identity/batch contract but advertises `volatile`. SQLite is never loaded into the browser or root entry.

## Queries and status

```ts
const page = await journal.read({ type: 'game.item_delivered', limit: 20 });
const next = page.nextCursor
  ? await journal.read({
      type: 'game.item_delivered',
      limit: 20,
      cursor: page.nextCursor,
    })
  : null;
```

Filters: source, type, subjectRef, questRunId (the latter matches correlation.questRunId). Results are ascending by sequence. The first page freezes its head; later appends are excluded from that window. Repeat the same filters with the returned opaque cursor. It contains timeline/filter/window identity; it is not an authentication token. Scope comes from the host binding. Changed filters, malformed/out-of-range cursors and wrong timelines reject. The reader scans excluded records and advances past them; byte limits stop before the next matching record rather than skipping it. Missing/noncontiguous store history rejects `history_gap`. Store errors propagate instead of becoming an empty successful page.

```ts
const reader = journal.registerStatus('world', () => ({
  revision: world.revision,
  recordedThrough: lastSuccessfullyRecordedBoundary,
  availability: reportingFailed ? 'unavailable' : 'available',
  data: world.readOnlySummary(),
}));
const status = await journal.status(['world']);
```

The callback is synchronous and must return a copied JSON read model, availability, nonnegative domain revision and recordedThrough no greater than the observed journal head. Journal copies it again before exposing it. Domains are explicitly registered and discoverable via `journal.domains`; unknown domains reject. Disposing a reader unregisters it, without deleting stored events.

Status captures are labelled `atomic:false`. Journal does not claim a transaction across independent domain owners. Capture readers at the application's safe interaction/update boundary. `recordedThrough` is the adapter's accepted reporting boundary, not evidence that every change in the world is journalled. High-frequency pose/animation reads do not generate events. Availability distinguishes stale/unavailable evidence from empty data.

## MCP composition

```ts
import { journalProvider } from 'rocket-engine-v2/journal/mcp';
const unregister = host.register(
  journalProvider(journal, (scope) =>
    scope === 'save-1' ? journal.identity : null,
  ),
);
```

The provider offers `game_journal_read` and `game_status_read`. Status tool discovery includes the registered domain names. No append tool is exposed to the model. Register readers before the client connects; existing host sessions freeze their discovered catalogue, so reconnect after changing providers/domains. Calls still validate current registration and binding scope.

Each tool returns structured `{status:'completed',data}` or an explicit error result; cancelled/expired bindings do not receive successful data. Read failures are not converted into empty history. Unregistering the provider remains the existing MCP host's lifecycle operation. The provider does not own/dispose journal, store or subsystem state.

Mission reports currently use the ordinary journal query with `type:'quest.mission_report', source:'watchtower-quests'`. A separate convenience tool/store is unnecessary for this first consumer.

## Watchtower observation and two-episode proof

The original quest JSON, original browser demo and accepted CFW pin are unchanged. `WatchtowerReporter` reads public CFW recovery-save/run/action records and actual game state through a game-specific adapter. It records:

- actual world location/defeat/pickup/delivery evidence, retaining source sequence;
- acknowledged completed CFW action records keyed by original effect identity;
- the exact offered choice/label at the accepted choose-command seam, with its original command identity (stage paths are never used to infer a choice);
- a completion report only when the run is closed at a supported ending, the authored beacon action has an acknowledged applied result, the matching game beacon is lit, and the matching item was delivered there.

A pending/blocked/unknown run does not become a success report. The adapter implements the supported watchtower completion rule, not a generic CFW terminal-result inference. Other domains define their own adapters and outcome types. It does not yet generate failure/abandonment reports for arbitrary games or automatically subscribe every subsystem.

Reports retain the executed definition ID/canonical SHA256 digest, run/choice/ending identity and `{source,eventId}` evidence links within the same timeline. This digest describes the actual executed definition; it is not a claim of a CAI publication receipt when the fixture directly publishes its baseline. Episode B checks the parent report source/definition/digest and current matching delivery/beacon facts before selecting the other supported branch. It uses the baseline's existing reveal/pickup/delivery/light handlers in a separate definition; there are no candidate-specific rescue handlers. This is deterministic evidence continuity, not generated story quality.

The adapter explicitly captures at controlled interaction boundaries. Its `choose` wrapper dispatches through the existing CFW handle and retains the original command request for retry; only an accepted response becomes a choice record. A pre-existing run observed without that command seam reports choice history as unavailable, rather than guessing from its destination. This proof does not provide durable recovery of an in-flight choose command. Failed capture marks domain status unavailable; recapture retries original evidence and does not execute an action. Existing world history must be available/complete. The inherited 512-event example history is a finite proof bound; this adapter rescans it and is not a high-volume telemetry pipeline. Existing CFW save/ledger and journal sequences remain distinct.

## Controlled checkpoints and lifecycle

The optional Node adapter provides host-only `saveCheckpoint(data, expectedHead)` and `readCheckpoint()`. The blob is opaque domain JSON (maximum 256 KiB); the neutral journal does not understand it. Saving checks the expected journal head in a SQLite transaction and records the blob with that head. Reading rejects an older blob if journal records have since advanced. Only one latest matching checkpoint is supported.

The proof saves a world snapshot after episode A, closes everything, reopens the durable store, restores that matching world, then starts a **fresh** CFW run for episode B. It does not restore/resume an in-flight CFW run. A successful journal checkpoint is not proof that every external domain/CFW store was atomically committed. Crash between game mutation and event recording remains an explicit limitation; no outbox/distributed transaction is claimed. Unsupported rollback/fork/mismatched timeline rejects rather than replaying future facts into an older world.

Shutdown sequence:

```ts
producer.dispose(); // stops this producer; already-admitted writes may finish
reader.dispose();
journal.dispose(); // stops new admission/readers, does not close borrowed store
await journal.drain();
await store.close();
```

`drain` is a completion barrier, not automatic retry or an aggregate success receipt. Each append caller must handle its own rejection. The example reporter can recapture from retained domain evidence. Do not close a store while admitted writes still need it. No unbounded retry history or background worker is introduced.

## Run and verification

- `npm run check`: strict TypeScript/lint/format/build and the whole test suite.
- `npm run proof:journal`: both blue→red and red→blue sequences, four completed episodes, durable close/reopen, matching checkpoint, actual Rocket MCP handler reads using the official SDK Client, reports/status/digest checks and cleanup. The custom in-process transport sends real HTTP Request/Response objects through McpService; this proves the handler integration, not a new TCP test. Output identifies retained temporary SQLite/result artifacts.
- `npm start`, then `/demos/journal.html`: native browser proof with explicit volatile memory, both branch orders, visible recording failure/retry, disposal and new timeline. Reload intentionally starts empty.

Focused tests cover SQLite transaction rollback/reopen, duplicate/conflict/capacity behavior, input copying and finite admission, cancellation/disposal boundaries, filtered/frozen/byte-limited pagination, explicit gaps/unavailable stores, binding-scoped MCP reads, both real-game episode orders/restart and reporting-failure recovery. Browser evidence and actual check counts are recorded in the completion handoff.

Deferred: browser durable adapter, JSONL/Status.json export, generic mission read projection, CFW live observation subscription, full campaign history selection, pruning/migrations, arbitrary old-save forks, distributed producers and crash-safe domain/outbox composition. They do not become implicit engine responsibilities from this proof.

## Verified completion, 14 October 2026

`npm run check` passed all 311 tests, strict TypeScript, lint, formatting and build. The separate durable proof completed both branch orders/four episodes, matching SQLite/world reopen, actual MCP handler journal/status reads and zero remaining MCP connections/providers or pending writes after cleanup. Browser checks passed both orders, explicit unavailable→available reporting retry, disposal/new timeline, two confirmed reports and both actual beacons lit; console warnings/errors were empty.

Evidence: [manifest](evidence/journal-2026-10-14/manifest.json), [durable result](evidence/journal-2026-10-14/durable-proof.json), [browser readout](evidence/journal-2026-10-14/browser-state.json), [screenshot](evidence/journal-2026-10-14/browser.jpg). The original quest SHA256 remains `32aabc76aaf1c3f0a8cc57bb6a9287ac3f55eb46334c78a3ba6086be8d0c9f9d`; original demo SHA256 remains `921c721ee1917ba768f2fb0591fcec11ad3c6f937891bcddc9159cd98c9ec58d`. No CFW/Workshop implementation or dependency pin was modified.

The Watchtower reporter resolves the observed run's definition from CFW's saved definitions by owner key and definition ID. It compares the attached snapshot to that executed content before recording any evidence and derives the report digest from the executed definition. A same-ID attachment with different content rejects capture and marks reporting unavailable; supplying the matching attachment permits evidence retry without replaying gameplay.
