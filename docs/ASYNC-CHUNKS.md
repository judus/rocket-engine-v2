# Asynchronous chunk loading

The existing example-owned ChunkStream accepts an optional fourth constructor argument. Synchronous consumers and their previous tests keep working unchanged; the browser demo now uses an injected delayed source. No new core engine API, worker or terrain/physics bridge is introduced. [Multiple demand owners](MULTIPLE-DEMANDS.md) are now a follow-on extension of this same stream and scheduler.

```ts
const stream = scene.own(
  new ChunkStream(edits, 40, 1, {
    load: source.load, // (signedChunk, AbortSignal) => Promise<Uint8Array>
    maxJobs: 4,
  }),
);
// One scene update, before either presentation draws:
stream.demand(cameraTileBounds);
stream.advance(2); // publish settled results, then start at most two jobs
// Explicit action after a load failure:
stream.retryFailures();
```

## Limits and priority

The original single-owner demo used forty retained records; the current two-view demo uses sixty-four. These records cover queued, loading, failed and ready chunks together. An occupied job slot covers an unsettled promise or a settled result buffered until the next controller update. There are at most four occupied slots in the demo. The maximum configurable concurrency is eight, also limited by record capacity. Results have exactly 64 values from the configured palette (0–2 by default; six biomes in the procedural adapter), and are copied on settlement so the source cannot alter buffered data.

Visible queued chunks start before the prefetch margin. Existing jobs are not restarted just because priority changes. `advance(2)` starts at most two jobs; publication processes at most the bounded occupied-slot count, in actual settlement order. There is no head-of-line wait for an earlier request: later requests can become ready first. Wrong-length/invalid data, rejected promises and synchronous loader exceptions become failed records.

Initial IndexedDB loading gates **job launch**. Promises do not change live terrain state or trigger rendering directly: their handlers buffer a result/error. Only the controller's advance() publishes it, before both canvases draw. Pausing the scene therefore permits at most four buffered results; it starts no additional jobs.

## Identity and cancellation

Every job is tied to the specific pending record object and an attempt ID, not only its coordinate key. Evicting that record aborts its signal and removes it from demand. Returning to the same coordinate creates a fresh record; the old job cannot satisfy it, even if its ignored-cancellation result later succeeds.

Aborted but unsettled jobs retain their slot. This is essential for a loader that ignores AbortSignal: rapid camera travel cannot create an unbounded trail of old promises. Such a loader can stall new work if all slots remain occupied; there is no fake cancellation that releases capacity while work continues. A cooperative source promptly settles its abort and frees the slot at the next controller update.

Disposal aborts all jobs, clears records/priority/demand and stops publication. Settled buffers are released immediately. Noncooperative jobs remain counted until their promises settle; then their late results/errors are discarded and released. A recreated stream has its own job limit, so production hosts requiring a global bound across multiple independent streams would need a shared scheduler. The demo source cooperates with cancellation, clearing its timers on abort. Non-cached pagehide synchronously disposes the current stream, starts application cleanup and closes host storage.

## Edits, failure and retry

A loader produces deterministic **base** terrain compatible with the existing `signed-hash-v1` generator identity. It does not capture or own edits. At controller publication, the stream overlays the current host edit store before exposing any ready tile. Edits changed during a job or while its result was buffered therefore take precedence. IndexedDB save failure does not erase memory overrides, so those latest unsaved edits also survive generation/eviction in this session.

Failed chunks remain retained with their error, display in pink, and cannot be edited. They are distinct from pending, missing and ready-empty terrain. Repeated demand does not automatically retry them. Retry failed chunks replaces failed records with fresh pending attempts, which again obey priority, per-update start budget and slot bounds. Leaving the area evicts the failed record; a future demand is naturally a new attempt.

The terrain canvas and separate diagnostic scene only read state. Diagnostics show occupied slots, queue length, buffered/discarded results, failed records, last published attempt and persistence state. Full load errors appear in the chunk-status paragraph. Cancellation is not reported as a load failure.

## Demo controls

Base delay ranges from 0 to 1000 ms and applies to newly launched requests. Vary delays makes each third source request slow (three times base), with the others fast (one quarter base), making out-of-order completion visible. Timing controls do not reschedule already active timers. Fail next chunk arms one future request; existing settled chunks do not reload automatically, so travel elsewhere or recreate the stream to start work. Retry failed chunks is enabled only while retained failures exist. Storage retry/save failure controls remain separate because chunk readiness and edit durability are different states.

This is timer-delayed generation on the main thread, demonstrating an asynchronous source contract. It does not offload CPU work; each timer still generates 64 cells synchronously. Workers or remote loads can be considered later if measured work needs them.

## Validation

All 98 emitted-JavaScript tests, strict TypeScript, type-aware lint and formatting checks pass. Seven async tests control promises without wall-clock sleeps to prove reverse-order publication, copied results, current edit overlays, saved-load gates, bounded noncooperative cancellation, stale results after same-address demand, failures/retry without storms, malformed/synchronous failures, final disposal and cooperative timer cleanup. Existing signed-address, retention, persistent edit, physics and two-view tests remain green.

Browser checks exercise the delay slider, delayed readiness, failed chunk display/retry, camera travel cancellation, preserved IndexedDB edits and whole-stream recreation. A forced failure remained visible until explicit retry; travel cancelled four jobs and reported four discarded results without exceeding the four-slot limit; returning recovered the persisted selection. These are contract checks, not a throughput or worker performance benchmark.
