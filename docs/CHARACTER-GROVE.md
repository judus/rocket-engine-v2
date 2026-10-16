# Grove evidence and pickup

Run `npm start` and open `/character-grove.html`. Focus the canvas for WASD/Shift.
Arm the flow, walk into the green Old Grove, then press E or click the gold marker
from within 24 pixels. The authored situation closes after the actual pickup event.
The situation details Panel displays CFW's authored prose. No NPC, dialogue choice,
acceptance or reward is required.

## Two authored rules

`grove-events.json` requires at least one grove entry strictly after its **run-start**
cursor. Earlier visits do not count, and arming while already inside requires leaving
and returning. `grove-fact.json` accepts the game-owned **visited** fact, including a
prior visit, even if the player is currently outside. Changing the rule creates a
fresh world. Prior-visit/prior-pickup buttons load explicit world fixtures with the
player outside; they do not let CFW assert historical authority.

Both flows enter `pickup`, capture the marker-pickup stream at that situation's entry,
then invoke `rocket_reveal_marker`. Pickup requires an event strictly after that saved
entry cursor. A prior pickup stays collected, does not become new evidence, and causes
no replacement item: the pickup situation keeps waiting. The existing marker is a
single game-owned survey entity with a collection fact, not an inventory/reward system.
Workshop inventory/production contracts are unchanged.

## Ownership and recovery

Rocket's existing ControlledCharacter/DirectMovement and grove geometry supply actual
poses and crossing edges. GroveHost owns world-scoped player/location/item event records,
coherent revisions, trusted actor-generation/player scope, stable capture cuts and the
reveal effect ledger. CFW owns publication validation, authored conditions/transitions,
entry-effect admission and reconciliation. JSON names capabilities and references; it
cannot provide cursors or grant authority. One existing Rocket fixed step advances
movement, player evidence, pickup input and CFW; draw only reads committed state.

Capture retains the first cut under the original narrative effect identity, sharing a
cut for streams at one entry, even if history/capture acknowledgement is unavailable.
Unknown event evidence blocks the route; restoration retains its original cursor and
never substitutes a later baseline. The arming retry reuses the original publish/start
keys. The UI distinguishes an unavailable arming acknowledgement from an unarmed world.

Reveal validates and updates the existing entity only. Its immutable receipt is indexed
by effect identity and trusted narrative provenance/digest. **Lose next reveal reply**
throws after committing the game outcome; reconciliation returns that receipt and the
reveal execution count stays one. A removed marker rejects reveal/collection instead of
creating a replacement. Retirement leaves shared collected entities untouched. Scene
shutdown aborts CFW, stops input/movement, disposes the player/index/Panel and releases
the scene's single sprite lease. Preset recreation starts a distinct fresh world.

Evidence retention is bounded to 512 events with no eviction/rebasing: overflow makes
event history unavailable until recreation. Capture records are bounded to 256. These
ledgers and the CFW journal are volatile. This proves local game evidence and recovery
of lost replies, not durable process-crash reconciliation or physical inventory transfer.

## Verification

`npm run check` passes TypeScript, ESLint, formatting, build and all **277 tests**.
Six focused tests prove prior/new visit semantics, stage-scoped pickup, duplicate pickup
rejection, lost-reply reconciliation, prior-pickup exclusion, unavailable history/capture
recovery with original cursors, removed-marker rejection, retirement and pending disposal.

Native browser evidence:

- Shift+D moved x336 to approximately x529; the actual entry revealed the marker once,
  even with the injected lost reply. E closed the flow with cuts `grove-entries>0` and
  `marker-pickups>1`. Spatial clicking also collected exactly once.
- Prior visit under the event rule stayed at `watch`, cut 1. Entering while history was
  unavailable stayed blocked; restoring it reached `pickup` with the original cut 1.
- The fact rule with a prior visit revealed the marker while the player remained outside.
  A prior pickup stayed at `pickup` with cut 2 and no new item/event.
- Unavailable arming acknowledgement exposed **Retry arming**. Entry during that wait
  counted after history recovery and exact retry, with the original cut 0 retained.
- Removing the marker rejected subsequent E pickup. Disposal/recreation released the
  old sheet and prepared a fresh independent world.
