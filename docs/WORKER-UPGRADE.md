# Terrain worker consumer 0.4.0

Rocket now pins the accepted standalone Rocket-Workers 0.4.0 archive, SHA256 `5691f42e3ad93e72aa6585f3904af4b6b962b2e83b5305e404c3dfd0bdec0dc1`. The browser bootstrap and import map use that exact installed runtime. The original 0.2.0 archive remains retained for historical comparisons. No peer package source is changed.

`WorkerChunks` retains two workers, four queued records and the existing finite startup/job deadlines. The terrain task still imports the authoritative TerrainGenerator and returns the same signed 8×8 biome bytes. ChunkStream owns demand, edits, stale result rejection and update-phase publication. Inputs are frozen while borrowed by the queue.

The task-specific admission unit is **generated cell-passes**: cost = 64 × passes. Each homogeneous pool uses maximum 6 × 64 × configured passes, corresponding to two physically occupied plus four queued records. This is a declared work allowance, not measured CPU time or heap bytes. It intentionally retains capacity for cancelled occupied jobs alongside a new four-job stream demand. The package retains cancelled occupied reservations until physical response/termination; no adapter retry queue or execution fallback is added. After successful handoff, the package reservation ends. ChunkStream independently keeps pending plus buffered results within its existing four job slots; it owns resident chunks and artwork separately.

The diagnostics opt in to task-reported `computeMs`. The page preserves the adapter's accepted-result compute and full caller round-trip counters and adds distinctly labelled package lifetime measurements:

- Queue wait: reservation commit to native dispatch.
- Active validated physical response: dispatch to matched response, excluding queue wait.
- Cancelled physical response: a separate population; it is not successful domain work.
- Task-reported compute: worker-owned elapsed duration, not an absolute cross-clock subtraction.
- Censored deadline/disposal counts: excluded from successful response/compute means.
- Declared reservation occupancy, queued work and cancelled occupied work.

No samples are displayed as “no samples”, rather than fabricated zero. Round trip minus compute is not labelled transfer cost. There is no new engine clock or timing history.

Run `npm start`, open `terrain-workers.html?seed=42&scale=96`. Compare with `terrain-streaming.html?seed=42&scale=96`, same passes and the existing finite repeatable route, one active demo at a time. Only base biome generation moves off-thread; artwork/decorations remain main-thread work. Exercise failure/retry, far demand cancellation and stream recreation. Cleanup reports zero prior workers, occupancy and queue; saved edits remain untouched. The deterministic installed-pool boundary test confirms reservation retention until physical reply, separate cancelled/active timing populations, successful compute extraction and disposal. Native browser behavior is checked separately.

A benchmark demonstrates this specific workload on this host; it does not establish general terrain speedups or RSS bounds. The 256-pass workload is synthetic repeated generation of identical bytes, not additional world objects.

## Rocket verification, 2026-10-14

`npm run check` passes strict TypeScript, lint, formatting, build and all 298 tests. Native browser failure injection enabled Retry; retry restored 198/198 chunks with no failed jobs. Far/return demand changes recorded two pool cancellations, four discarded stream results and a separate 5.500 ms cancelled physical-response mean. Recreation reported zero prior owners/chunks/jobs/artwork and zero prior workers/occupancy/queue. Browser console warnings/errors were empty.

One matched six-stop run per backend used seed 42, scale 96, 256 passes, three 640×360 views, zero delay, fresh caches and no active edits. Both completed 960/960 viewport chunks, with no unfinished stop or final pending jobs.

| Measurement                     | Main thread | Two native workers |
| ------------------------------- | ----------: | -----------------: |
| Mean frame interval             |     7.12 ms |            6.96 ms |
| p95 frame interval upper bucket |        8 ms |               8 ms |
| Worst frame interval            |    28.80 ms |           27.60 ms |
| Frames over 16.7 ms             |           2 |                  1 |
| Mean chunk readiness            |    304.1 ms |           285.3 ms |
| Worst chunk readiness           |    632.3 ms |           582.9 ms |

This pair shows a modest readiness improvement on this host and no substantial frame difference. It is one synthetic-load comparison, not a statistical performance verdict. Published data readiness excludes artwork completion. Raw run JSON and screenshots are retained under `docs/evidence/sprite-worker-2026-10-14/`.
