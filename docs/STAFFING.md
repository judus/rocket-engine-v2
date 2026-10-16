# Two-worker staffing allocation

Open `navigation-staffing.html`. It is a separate two-worker proof; the finite and single-worker demos remain available. A and B share streamed terrain and Workshop production. Each actor owns its own StreamedWalker, local terrain demand and bounded route demand. The shared stream retains at most 64 chunks and runs at most four loader jobs.

## Ownership and authority

The game-side `Staffing` coordinator owns worker identities, their WorkplaceOperators, exclusive slot reservations and aggregate attendance publication. It imports no Workshop classes, defines no pathfinding and advances no production. The host supplies named slots with workplace IDs and entrances, actor-specific local traversal checks and an attendance-count callback. Slot capacity comes from the game's mapping of Workshop's workplace requirements: this demo exposes one operator slot on each Smelter and Press. FactoryDemo passes counts to Workshop's native attendance API. Workshop remains authoritative for capacity, workforce gating, job progress, inventories and cargo.

The game or character framework chooses worker and slot and decides whether to retry. There is no automatic assignment, queue, takeover or failed-journey retry. Rocket's existing navigation and movement controllers own routes and poses. This is game-side staffing orchestration, not a new Rocket core or character decision system.

## Reservation and attendance rules

A claim first checks the worker, slot and current owner. A conflicting claim throws before changing the requester's current assignment, attendance or demand. Successful reassignment clears previous presence and reservation, then reserves the new slot before walking. Each worker can reserve at most one slot, and each slot has at most one owner.

Travelling and temporarily blocked workers keep their reservation and contribute zero attendance. Validated arrival at a currently passable entrance contributes one worker to its workplace count. One coordinator aggregates these facts, so a worker leaving cannot clear another worker's attendance at the same workplace. Counts are published only when they change.

Unknown or blocked local terrain revokes attendance while preserving the assignment's reservation. Readiness can restore on-site attendance. Cancellation, reassignment, worker disposal, removed/relocated slots and terminal unreachable outcomes release reservations. Terminal failures retain their failed intention/status but cannot restart automatically; an explicit new assignment must claim a free slot again.

Reservations do not prevent physical actors from occupying the same terrain. Actor collision, crowd avoidance, shifts, skill types and population scheduling remain separate work.

## Timing and cleanup

One keepAlive scene publishes ready chunks, reconciles all workers and aggregate attendance, advances Workshop once, then advances each worker and reconciles arrival. The interval ending at arrival is not credited as work. Both views draw snapshots only. Closing them releases camera demand while actor movement, reservations and production survive. Removing one worker disposes its movement/demand and frees its claim without touching other workers or Workshop. Final cleanup clears attendance and disposes all workers before Workshop and terrain.

## Checkpoint

One current `rocket-staffing` version-1 envelope in the isolated `staffing-two-workers-v1` IndexedDB slot stores native Workshop state, bounded terrain edits, the surviving worker roster with stable IDs/poses/assignment phases, and explicit slot-to-worker reservations. No migrations or alternative loaders exist. The single-worker checkpoint slot is untouched.

Restore validates unique known worker IDs, unique slot owners, one reservation per worker, matching copied entrances, and an exact reservation for every travelling/arrived assignment. Idle and unreachable workers cannot have reservations. Duplicate, missing, mismatched or unknown associations reject the whole checkpoint before publication. Disposed workers are absent from the saved roster and remain absent; an empty roster never respawns defaults.

Workshop attendance is cleared through its public API before publication and rebuilt only from restored actors on ready local terrain. Active routes rebuild from precise saved poses; arrived facts remain gated on local readiness; terminal failures stay stopped. Identical checkpoints and readiness/update sequences continue deterministically. No offline time is applied. Failed writes preserve the last committed record and live state; loading failures gate startup and preserve saved data.

Tests cover atomic claim rejection, aggregate counts for multiple slots at one workplace, readiness revocation, terminal failure/reassignment, dynamic slot removal/relocation, ownership cleanup, two-worker deterministic restore, disposed/empty rosters, malformed reservation graphs and failed IndexedDB writes.
