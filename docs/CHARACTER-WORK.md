# Work → takeover → resume

Run `npm start` and open `/character-work.html`. Two characters automatically walk
to a smelter and press. Click a sprite or choose A/B, then press **Take control**.
Focus the canvas and use WASD; Shift increases movement to 136 px/s and walk playback
to 1.5×. **Release control** resumes that worker's assignment. Merely selecting a
worker does not change control. Taking another worker first resumes the previous one.

The game adapter cancels autonomous travel, immediately clears attendance and releases
the slot on takeover. Fixed A/smelter and B/press intentions remain independent of the
journey. Release retires direct movement, creates a fresh autonomous mover at its last
pose, and claims/replans the assignment. Staffing updates and reconciles attendance
before Workshop advances production. Presentation observes that pose; it never moves
an actor. Every sprite player advances once in the existing Rocket fixed update.

Workshop 2.0.0 owns actual production, attendance, buffers, inventory and timed
transport. The press continues from supplied alloy while A is controlled, and waits
when inputs are exhausted. Counters and job states show this explicitly. Operators
use directional idle at their workplace: these sheets contain no work animation.
Characters are not cargo carriers; there is no separate production or delivery model,
CFW dependency, copied terrain generator or extra engine clock.

Toggle the gate to block crossing. Opening it reassigns remaining autonomous workers
and replans from their current pose. Closing a gate over a worker can trap it until
reopened. Remove retires the selected worker, attendance, reservation and player.
Its sheet lease stays scene-owned until disposal. Focus/blur behavior uses Rocket Input.

Save/restore is an in-memory, same-demo checkpoint, not an external save-file API.
It preserves Workshop's canonical save, worker positions, surviving fixed assignments
and gate. Restore disposes the old scene, clears keyboard/manual ownership and creates
fresh routes. Attendance is recomputed at the saved positions before the next
production advance; saved counts are not trusted. Restored inventory and completed
output are unchanged. Disposing releases both image leases and all players/movers;
Recreate starts a fresh factory. Asset preparation owns each successful lease as it
arrives, so failures/abort roll back through normal scene disposal.

`tests/character-work.test.ts` checks immediate attendance/claim release, manual speed,
paused smelter progress, continued press output, resume and exclusive handoff, stale
journey no-op, blocked-route recovery, removal, checkpoint inventory preservation,
recomputed attendance and idempotent cleanup. Native browser verification covers
selection, WASD/Shift, switching/release, gate recovery, checkpoint and disposal.

Verified in the native browser: A moved 432→296 in one second of Shift+A;
smelter progress stayed at 13% with attendance cleared while B retained its slot.
Selecting A while controlling B retained B's manual ownership. Switching then resumed
B. Closing the gate with A at x=160 made its released route unreachable while B
continued producing. Restore reset parts/inventory to the saved Workshop state and
returned A to autonomous travel. Removing controlled B cleared its slot; disposal
released two sheets per scene. Recreate prepared both workers again.

Validation: `npm run check` passed TypeScript, ESLint, formatting, build and all
267 tests. Browser checks cover this finite demo, not physical hauling or a stable
CFW integration.
