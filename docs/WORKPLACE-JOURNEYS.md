# Workplace journeys: finite integration proof

Open `navigation-workshop.html`. It combines the existing optional navigation module with Workshop 2's attendance API. There is one operator, one Mine/Smelter/Press chain, timed material deliveries and two presentations of one fixed-update scene. It does not change the streamed factory or its saves.

## Clean authority boundaries

Rocket's Movement owns the operator pose, route following and journey status. The game supplies blocking building footprints, distinct reachable workplace entrance points, terrain readiness and revisions. Workshop owns workforce gating, job progress, inventories and transport cargo. The example-level `WorkplaceOperator` bridges a narrow game port (`workplace`, `canStand`, `setPresent`) to a Movement; it imports no Workshop classes. The character framework can later issue assignment decisions without implementing pathfinding, attendance rules or production.

The adapter takes exclusive ownership of its Movement update/disposal. The page owns Workshop separately and disposes the operator before Workshop. There is no population allocator or multiplayer workforce arbitration: this proof has one actor and exclusive ownership of each target's single operator attendance slot. A broader staffing system will need actor/slot identity and allocation contracts rather than several actors independently overwriting a boolean.

## Presence rules

Assignment resolves and copies an entrance point. Buildings themselves block walking; the entrance is a game-selected position outside that footprint. Attendance remains zero while moving, blocked, cancelled or unreachable. Validated arrival within 0.1 world units and currently passable local terrain permits presence. An assignment also represents being on duty; simply standing near a building is insufficient.

Reassignment or release clears old attendance immediately, before further production, even if the actor is still physically near the old entrance. Cancelling work does not teleport the actor. A missing or relocated entrance cancels the assignment instead of silently choosing another destination. Clearing a removed workplace must be tolerated by the game port. Unknown/blocked local terrain revokes presence even for an arrived journey; restoring readiness can restore attendance at the same unchanged entrance while the assignment remains active.

The adapter emits attendance commands only when presence changes. Retry operates on the existing nonterminal journey; an unreachable terminal outcome requires a new assignment. No dialogue, quest or AI decisions are introduced.

## Update and lifecycle order

Each fixed step first reconciles current physical presence, then supplies elapsed time once to Workshop, then advances the operator and reconciles its arrival. This conservatively credits no production for time before arrival; arrival affects subsequent production ticks. It avoids granting an entire preceding interval merely because its movement ended at a workplace. Material deliveries continue on Workshop's existing clock.

Both views share the scene, so rendering never advances either subsystem. The diagnostic view replaces the map presentation with native Workshop snapshots. Closing/reopening it releases only view presentation; the operator, assignment and production survive. Reopening briefly stops the runtime for view registration and then restarts it, excluding that paused interval. Last-view removal follows Rocket's existing scene pause policy. Scene teardown releases DOM handlers, clears presence and disposes Movement before disposing Workshop.

## Limits and next decisions

This proof is finite and has no saved operator/assignment state. Existing factory checkpoint slots remain untouched. Do not restore an attendance assertion without also validating or restoring its authoritative actor state. Streamed movement needs actor/path-owned world demand, collision-data readiness and simulation ownership independent of cameras before this adapter is brought into streamed terrain. Cargo markers still represent Workshop delivery timing, not physical vehicles. Crowd avoidance, staffing allocation, worker schedules, physically transported construction materials and AI remain separate work.

Tests verify no remote work, handoff without dual attendance, progress frozen when absent, readiness revocation/restoration, missing/relocated workplace cancellation, cleanup, view closure and one production clock across two views.

## Streamed integration proof

Open `navigation-workshop-streaming.html`. The same `WorkplaceOperator` now consumes a narrow `WorkplaceMovement` interface (pose, move, update, dispose), implemented by both finite Movement and the existing StreamedWalker. The walker still owns local and bounded route demand, delegates searches to GridNavigator, and follows routes through Movement. Its returned journey releases route demand immediately on cancellation; cancelling an old handle cannot release a replacement route. No Workshop dependency enters navigation, and the operator contains no streaming or pathfinding policy.

One keepAlive scene publishes loaded chunks, reconciles presence, advances Workshop once, then advances movement and reconciles arrival. The interval ending at arrival is not credited as work. Local unknown or blocked terrain clears attendance before the next production interval; restoring the same entrance permits attendance again. Reassignment clears the old attendance immediately. Shared load slots remain bounded; failed chunks stay unknown until retry succeeds. Tile controls use the stream's write-through set operation, so edits update retained collision data as well as the edit store.

The terrain view owns only its camera demand; the diagnostic view reads Workshop snapshots. Closing both views releases camera demand while actor-local demand, assignment and production continue. Scene teardown clears attendance and disposes movement/demand before Workshop and the stream. The mine remains autonomous and existing Workshop deliveries remain timed cargo, not physical vehicles.

Try the Smelter first, then the Press for the wall detour. Seal the upper passage before assigning the Press to test no attendance without a route. Open it and assign again after a terminal unreachable outcome. Block the assigned entrance while on site to pause attendance and production; restore it to resume. Multiple workers and attendance allocation, unrestricted world routing, physical hauling and character decisions remain separate slices. This demo does not modify the streamed factory's save slots or restore attendance without authoritative actor state.

## Worker and assignment checkpoints

The streamed workplace demo now offers explicit **Save worker + Workshop** and **Reload saved checkpoint**. One atomic IndexedDB record in the isolated `workplace-worker-v1` slot contains format/version/terrain identity, native Workshop state, precise actor position, workplace ID and copied entrance, assignment phase/reason, and bounded terrain edits. It contains no cached chunks, routes, demand handles, job promises, timestamps or attendance assertion owned by the worker. There is one current format and no migration or fallback loader. Loading and complete validation finish before simulation starts; failures preserve the record and keep commands disabled until reload retries. A failed Save keeps the prior committed checkpoint and the running state; explicit Save can retry.

Restore uses the same pose owner and movement interface. Travelling assignments request a fresh bounded route from the saved pose and wait for ready collision data. Arrived assignments retain their arrival fact without starting another journey; local unknown/blocked terrain still prevents attendance, and readiness can restore attendance only at that unchanged entrance. Unreachable assignments remain terminal even if the passage opens; the game must issue a new assignment. Idle workers restore only their pose. Missing/relocated workplaces, inconsistent arrival positions, unknown versions and malformed/duplicate edits reject the whole checkpoint before publication.

Workshop progress, inventories, cargo identities/deadlines, production clock and pending time use its native save/restore. Its saved attendance is cleared through its public API before exposing the restored model, then earned again from actual local presence. That API also updates input-demand scheduling metadata; restored scheduling follows Workshop's ordinary absence/readiness rules rather than pretending the worker stayed continuously present. Identical restored checkpoints with identical readiness and update sequences continue deterministically. No wall-clock absence produces offline work or movement.

The page owns storage independently of the scene's model. Page teardown aborts storage operations and disposes the worker before Workshop and terrain; closing views still preserves the running model. The streamed factory's existing save slots remain separate. Multi-worker attendance allocation, schedules and physical cargo remain future work.
