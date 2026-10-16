# Production Workshop demo

`workshop.html` is the first implemented Rocket/Workshop integration. Terrain, physics, moving goods, construction UI and persistence are deliberately later steps. Existing demos remain available.

## Dependency boundary

Rocket pins Production Workshop 2.0.0 from `/home/maduser/workspace/production-chain-demo` as `vendor/production-workshop-2.0.0.tgz`. The archive packages the upstream built distribution, sources and documentation without modifying that checkout. It is an example-only development dependency: the demos import Workshop rather than copying its production rules. `npm ci` works without the sibling checkout. Rocket's core exports do not import Workshop. Only the current package and save model are supported; there is no old dependency or compatibility implementation path.

Build copies the exact installed native ES modules into `dist/vendor/production-workshop-2.0.0`; browser import maps use this versioned path so an old cached module cannot silently supply a different package. This is a generated copy of the pinned dependency, not another implementation. Node tests use the same installed artifact and declarations. Updating the archive is explicit; changes to the sibling checkout do not silently change the demo.

## Factory and ownership

The ore source emits two ore per second. The smelter consumes two ore for one alloy in 1.5 seconds; the press consumes one alloy for one part in two seconds. All three reference one stockpile with capacity 20 per material. Workshop owns quantities, input reservations, job progress, batch outcomes, waiting-input and output-blocked states. There are no animated deliveries or duplicated inventories behind the arrows.

`FactoryDemo` is an example-specific coordinator. It creates the simulation, stores stable facility IDs, forwards commands and retains eight recent events plus aggregate completed/collected counts. Its event observer never reenters Workshop commands. The engine scene owns this coordinator; disposal unsubscribes and invalidates it. Closing the factory floor only destroys that view; the same scene keeps advancing through its diagnostic view. Reset disposes the previous app/scene/coordinator and creates a new factory.

Collection withdraws all finished parts through Workshop's atomic command and counts them as removed by the host. This is a sink, not a second inventory or a delivery system. Disabling the smelter eventually exposes downstream input starvation; full output storage blocks production until collection makes space.

## Time policy and presentation

Exactly one scene update calls `Simulation.advance(dt)`. Workshop retains fractional time and processes its own 50 ms ticks. Rocket's fixed clock and Workshop's optional Clock are unused. Ordinary visible-frame delays are forwarded in full: production does not silently discard elapsed time because a rendering loop is slow. Long delays can therefore cause synchronous catch-up work; this small demo does not introduce a worker or a production-time budget.

Manual pause stops the Rocket app. Resume discards the paused wall-time gap. Rocket's visibility lifecycle excludes hidden-tab time as in the other demos. The interface disables stock/facility commands while manually paused; reset remains available.

After advancing, the coordinator provides one detached state containing scoped inventory/facility reads. Both canvases render that state without advancing or mutating Workshop. Throughput means completed parts per simulated minute since reset, not a rolling wall-clock measure. FPS belongs to Rocket's frame monitor; ticks and stock belong to Workshop.

## Validation

The emitted-JavaScript tests use the installed Workshop package. They verify equivalent elapsed-time partitions, read-only presentation reads, bounded event history, input starvation, storage blocking and collection resumption. A Rocket runtime test proves that two views advance once, one-view removal preserves production, pause excludes the inactive gap, and a visible thirty-second delay is fully retained. Disposal prevents further adapter commands. Strict TypeScript, type-aware ESLint and Prettier checks apply to the example and tests.

This does not validate the entire upstream Workshop project or integrate its worker, logistics and checkpoint features. Those remain separate increments.
