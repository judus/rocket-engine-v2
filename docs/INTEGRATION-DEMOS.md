# Sprite and worker integration demos

Run `npm start` and open [sprites](http://127.0.0.1:8092/demos/sprites.html),
[worker terrain](http://127.0.0.1:8092/demos/terrain-workers.html?seed=42&scale=96) or
[main-thread baseline](http://127.0.0.1:8092/demos/terrain-streaming.html?seed=42&scale=96).
These are Rocket consumer examples, not new engine subsystems or CFW dependencies.

## Sprites

`rocket-engine-v2/sprites` is the supported optional binding used by this demo; see [sprite binding](SPRITE-BINDING.md). `examples/sprites/createSprite.ts` remains the legacy factory for older character demos. Supply a validated
`createAtlas` result, a ready borrowed image and a clip name; attach its `node` to a
scene tree. Its `player` exposes play/pause/resume/rate and `flips` controls visual
mirroring. The node's behavior advances playback in seconds exactly once per scene
update. Drawing reads snapshots; two views double draws, not animation time.
`contains(worldPoint)` inverses the full node hierarchy and tests flipped local
visual bounds. Singular/disposed nodes cannot be picked. These bounds are visual,
not collision shapes.

The demo bindings acquire two leases sharing one cached image for both objects and views. A has nested
rotation/nonuniform scales; B independently blinks. Clicking either view selects
through that camera. Closing detail retains playback and image. Removing an object
disposes only its player. Disposing/recreating the application ends players before
releasing the scene's image lease. Controls and pagehide own their subscriptions.
Original 96×32 PNG artwork is included; no external asset needed.

## Worker terrain comparison

The separate HTML pages use **the same** streaming, cameras, persistence, terrain
raster and classic decoration renderer. Only the base-biome ChunkLoader changes.
Worker page imports `WorkerChunks`; baseline remains main-thread generation.
`examples/workers/task.ts` imports the existing authoritative TerrainGenerator and
returns its 8×8 biome bytes, generator identity, signed chunk address and measured
compute time. Worker-local generation cannot read or mutate saved edits.

`WorkerChunks` owns a pinned native pool: two workers, at most four queued records,
finite startup/job deadlines. ChunkStream retains its four logical load slots and
240 chunk bound. Stream cancellation propagates AbortSignal: queued pool requests
are removed; running promises reject but physical workers remain occupied until
result/deadline. There is no adapter retry queue or main-thread fallback. Identity
and buffer validation precede return; current saved edits and stale-job rejection
remain in ChunkStream's update-phase publication. Worker module bootstrap is
emitted at build time with explicit ESM URLs (worker scopes do not inherit import
maps). All runtime logic comes from the pinned package and compiled task registry.

Retry restarts only failed pool slots, then retries failed chunks and saves. Inject
failure + Visit far away proves explicit retry. Optional delay is the same demo
loading delay on both pages; it is not worker compute time. Recreate disposes old
stream demand/jobs, pool and caches before starting replacements; prior pool
workers/queue/occupancy are displayed as zero. Pagehide disposes the same resources.

Use identical seed/scale/viewport, zero delay and the same route, **one active page
at a time** when comparing. Diagnostics show rolling FPS, frame mean/max, main-thread
update/render cost, generation compute mean, worker round-trip mean/peak and physical
pool occupancy/cancellation/queue state. Round trip includes scheduling and queueing;
compute time does not. Timing counters are bounded aggregates, not retained histories.

Only base-biome generation moves off-thread. Elevation raster sampling, tile-friendly
shaping, image caches and decorations still use the generator on the main thread.
64-cell tasks may cost less than dispatch overhead; this demo establishes correctness
and observability, not a guaranteed speedup or a full terrain-rendering benchmark.
Saved edits use the same generator namespace: changes on either page appear on the
other after reload. Avoid concurrent editing tabs; multi-tab save conflict policy
is outside this existing store's contract.

## Repeatable terrain measurements

Both pages offer **Generation passes** (1/16/64/256/1024) and **Run repeatable route**.
Passes repeat the exact same 8×8 generation function and preserve its biome bytes;
this is synthetic generation CPU load, not more terrain objects or extra rendering.
Run recreates the stream and artwork caches, isolates an empty in-memory edit store
without deleting saves, forces zero artificial delay, and restores all three 640×360
views. Worker startup and image acquisition finish before measurement starts.

The shared route centers all cameras at six fixed tile positions: (-64,-48),
(96,-48), (192,64), (64,144), (-96,64), then (-64,-48). Each stop lasts two wall-clock
seconds. The final stop gets up to 15 extra seconds if its data is unfinished.
Controls and painting are locked during a run. Cancel, hiding the tab, load failure,
final readiness timeout or skipping an entire stop produces an explicit invalid
result. Hidden terrain pages pause their application loop. Recreate returns to
ordinary editable streaming.

The result reports raw frame intervals (mean, worst, integer histogram p95 upper
bound and counts above 16.7/33.3/50 ms), viewport chunk readiness from demand change
to update-phase publication, and all-ready time per stop. Readiness excludes the
stream's one-chunk prefetch margin and does not claim artwork is finished. Chunks
unfinished when leaving a stop are counted separately; latency means include only
observed-ready chunks. An unfinished stop has no all-ready time. The histogram's
last bucket reports p95 >499 ms, never a false upper bound. Six stop records and
bounded aggregates are retained; **Run data (JSON)** exposes the configuration and
results for copying.

Compare identical seed/scale/passes with one foreground page at a time. Pause or
close other demos, alternate main/worker order and repeat trials; fresh stream caches
do not reset browser JIT, CPU temperature or other processes. Main-thread async
loader computation happens between updates, so raw frame gaps capture costs that
update/render timers alone miss. These measurements locate the generation crossover
on this machine; they do not establish a general worker speedup or move rendering
off-thread.

## Package pins and checks

- sprite-animation 0.2.0 archive SHA256:
  `13b26e8ab2c8cbb98e9663143c4b64617e68be62f8a17cc15f6c04fda80b0ba6`
- rocket-workers 0.2.0 archive SHA256:
  `2ea111be07feed5c90ea0c1c2becac9fa52e1a66514ae1efa4dfca5488000599`

Archives live under vendor; browser builds publish exact installed ESM. No copied
player, worker protocol, clock, pathfinder, inventory or quest implementation.
Focused integration tests cover independent playback, two draws/update-once,
flip-aware nested picking, singular transforms, player-before-image cleanup,
signed deterministic generation, foreign outputs, abort/disposal and edit-aware
stream publication/discarded late demand. `npm run check` remains the full gate.

The upgraded terrain consumer pins Rocket-Workers0.4.0 and uses declared cell-pass admission plus separate host timing populations. See [reservation policy and timing limits](WORKER-UPGRADE.md).
