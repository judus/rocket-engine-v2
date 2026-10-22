# Watchtower recovery: a playable JSON quest

Open [the demo](../demos/character-encounter.html) after `npm run build` and serve the repository with `npm start` (port 8092). Focus the canvas: WASD moves, Shift runs, E interacts with the nearest visible sentry/item within 42 pixels. Clicking a visible object uses Rocket's spatial index and the same range validation.

Enter the courtyard and defeat three sentries, then approach the watchkeeper and press E, click the guide or use **Talk to watchkeeper**. The existing Panel/ChatBox displays “Do you want the blue seal or the red seal?” with two authored choices. Blue reveals the blue seal and leads to Beacon Ridge A (north); red reveals the red seal and leads to Beacon Ridge B (south). Collect the selected seal, stand within 42 pixels of its matching beacon and press E or click to deliver it. Only that beacon lights and the runtime closes the chosen branch. Arrival alone and delivery at the other beacon cannot complete the quest. The **Seals already carried** fixture skips only the pickup; a matching delivery is still required; one made before the dialogue choice also counts.

## Three authored inputs

- [session.json](../examples/character-encounter/session.json) selects the world, quest and `world-ready` start trigger. A generic bootstrap publishes/starts the selected definition. This is automatic; no quest-specific scene callback arms it.
- [world.json](../examples/character-encounter/world.json) supplies locations, spawn and existing entities. It contains no quest transitions.
- [quest.json](../examples/character-encounter/quest.json) defines `start`, twelve situations, prioritized routes, fact/event timing and consequences. It is displayed verbatim in the demo's expandable JSON view.

CFW's exact installed `c55c62467cad` browser package validates publication and executes the situation graph. No model/provider is configured or called. No new schema or interpreter API was needed for this bounded graph.

## Ownership and capability API

`EncounterWorld` owns ordinary movement observations, location crossings, range-checked interactions, defeat/pickup records and existing entity state. Collected seals have explicit game-owned carried/delivered custody; this does not introduce an inventory system. Beacon acceptance references are ordinary world rules. It knows no quest stage, route or definition ID. `QuestHost` supplies reusable handlers, trusted director/player binding, coherent observations, bounded event cuts and effect reconciliation. The scene only bootstraps the JSON-selected session, advances the existing fixed loop, handles input/picking and renders world/runtime state. It never checks whether the last enemy died or selects a quest consequence.

| Handler               | Input reference             | Completed result / effect                                               |
| --------------------- | --------------------------- | ----------------------------------------------------------------------- |
| `game_location`       | `locationRef`               | `inside`, `visited`, new-event `count`                                  |
| `game_encounter`      | `groupRef`                  | current `remaining`, new defeat `count`                                 |
| `game_entity`         | `entityRef`                 | visible-and-in-range `near`, `visible`, `collected`, new pickup `count` |
| `game_delivery`       | `itemRef`, `destinationRef` | matching `delivered` fact, new delivery `count`                         |
| `game_activate_group` | existing enemy `groupRef`   | Activate undefeated members                                             |
| `game_reveal`         | existing `entityRef`        | Reveal if not defeated/collected                                        |
| `game_open_gate`      | existing gate `entityRef`   | Open the navigation obstacle                                            |
| `game_light_beacon`   | existing beacon `entityRef` | Light the beacon                                                        |

Inputs use exact world reference enums and reject unknown references. Actions return `{ applied: true }`, validate game/binding/scope provenance and retain the original effect result. They never spawn replacements, grant inventory or rewards. This game is a small demo, not a second Workshop domain model. Its stationary sentries have a one-hit interaction; no enemy AI or player damage simulation is implied.

## Authored dialogue and timing

Courtyard entry must occur after run start, and defeats after encounter entry. JSON entry actions reveal the watchkeeper and open the gate. A proximity route enters `offer`; its dialogue/choices require current guide proximity. The two CFW choices select independent blue/red router, pickup, delivery and terminal situations. Only the chosen item's existing entity is revealed. Existing carried-item facts can skip pickup; otherwise it needs a new pickup after its stage. Completion checks the `game_delivery` delivered fact for the selected item and destination. A matching delivery made before the dialogue choice counts; a different seal/destination or mere arrival does not. Scene code never chooses color, stage or target.

`game_delivery` accepts exact `itemRef` and `destinationRef` enums, reports boolean `delivered` and event `count`, and captures both keys in `item-deliveries`. The game's normal beacon interaction checks range, possession, undelivered custody and the beacon's `acceptsItemRef`, commits once and emits the paired delivery record. An incorrect beacon changes no state. The terminal JSON action lights only that branch's beacon.

`QuestChat` presents runtime-authored dialogue and opaque choice IDs through existing ChatBox. Choices retain the original run/revision/request ID during retry. Stop-waiting detaches UI while the admitted command settles and prevents a second branch. CFW rechecks proximity at admission, so a stale displayed choice cannot bypass range. Closing the panel leaves the quest alive; disposal removes listeners and ignores late replies. Dialogue text can be removed without changing branch semantics, but an explicit choice is now required.

## Recovery, lifecycle and limitations

**Toggle event history** makes evidence unknown; it cannot be interpreted as zero. Restoring it keeps original event boundaries. **Lose next consequence reply** commits an action then loses its acknowledgement; CFW reconciles the same effect and it executes once. Start errors offer **Retry starting** with the original publication/start command keys. Runtime errors remain visible in the status area.

Scene disposal releases the host/runtime, world, spatial index, input scope, sprite player/movement and image lease. Recreating a fixture starts a fresh world and journal; old async completions cannot update the new scene. The journal/effect ledger are volatile. There is no process-crash recovery, multiplayer scope, quest authoring service, AI generation, persistent inventory or reward system. Event storage stops recording after 512 entries and marks history incomplete; a fresh world is required. Capture/effect ledgers are bounded to 256 identities.

## Verification

`npm run check` covers strict TypeScript, ESLint, Prettier, build and the complete Rocket test suite. `tests/character-encounter.test.ts` exercises fresh and prior-item paths, range guards, history recovery with preserved cuts, lost-ack exactly-once effects, JSON-only consequence changes, invalid-reference rejection, actual gate navigation, prior-entry timing, optional dialogue and disposed pending start.

Browser verification uses real WASD/Shift/E and spatial clicks, checks rendered stages and terminal beacon, recreates the prior-item fixture, and checks disposal/recreation and error/warning logs. No browser state injection is used. These checks demonstrate the bounded scene, not a general combat game or durable quest engine.

Original pre-dialogue verification 2026-10-14: `npm run check` passed **283 tests** (six encounter tests), including strict analysis, formatting and build. Log: `/tmp/rocket-encounter-check.log`. Browser completed both fresh and prior-seal paths with five/four consequence executions respectively, spatial click and keyboard interactions, zero warning/error logs, and two image releases across reset/dispose. Screenshot: `/tmp/rocket-watchtower-complete.png`. The original pre-dialogue proof was reviewed in mailbox396: delivered quest/host/demo hashes matched, all six encounter tests passed read-only, and CFW accepted the JSON/runtime boundary with no schema or interpreter correction needed. The full suite, browser and resource-release evidence remain Rocket-owned; acceptance covers this bounded deterministic proof, not AI authoring or production durability.

The dialogue extension adds red-branch/wrong-destination delivery and stale-choice retry/stop-waiting tests, updates the earlier tests for explicit blue choice/delivery, and keeps the same CFW pin. Independent CFW review completed in mailbox400: all five delivered source hashes matched, all eight compiled encounter tests passed read-only, and CFW accepted the authored dialogue/delivery boundary without schema or interpreter changes. The full 285-test suite, browser interactions and release checks remain Rocket-owned evidence. This acceptance covers the bounded volatile demo, not durable inventory, AI generation or general quest quality.

Branch extension verification (2026-10-14): **285 tests**, including eight encounter tests, pass strict TypeScript/ESLint/Prettier/build. Browser blue choice completed at A; red delivery at A was refused, arrival at B remained waiting, and E delivery at B completed. No browser warnings/errors. Choice screenshot `/tmp/rocket-watchkeeper-choice.png`; blue/red completion screenshots `/tmp/rocket-blue-seal-complete.png` and `/tmp/rocket-red-seal-complete.png`. Full check log `/tmp/rocket-watchkeeper-branch-check.log`.

## Accepted early-delivery correction

Julien accepted the fix after the independently reproduced ordering trap (quest channel424–434). The prior-carried fixture could permanently deliver a seal before dialogue choice, while the authored branch required a new event after delivery-stage entry. Both blue and red could then wait forever. Rocket reproduced both failures before the fix; logs: `/tmp/rocket-early-delivery-before.log`.

Both delivery conditions now use existing `game_delivery` with `delivered == true` in fact mode. This deliberately means **a matching delivery already made counts**, rather than delivery only after quest acceptance. Pickup still requires its authored new event unless the prior-carried fact selects the shortcut. No schema, interpreter, game-handler, custody, choice or dependency change is needed; duplicate delivery remains impossible. Four regression tests cover early delivery on both branches and exclude another seal's prior delivery and mere arrival. The prior quest artifact is retained at `/tmp/watchtower-quest-before-early-delivery-fix.json`; its SHA256 is `7e08409ee555f92347e9851084d88174577a8057c5c7e973cf80daff9b29811d`. The corrected quest becomes the new baseline; earlier review/test evidence above remains historical.

Corrected baseline SHA256: `32aabc76aaf1c3f0a8cc57bb6a9287ac3f55eb46334c78a3ba6086be8d0c9f9d`. `npm run check` passes **289 tests**, including 12 encounter tests; log `/tmp/rocket-early-delivery-check.log`. This supersedes the pre-fix baseline for future generator comparisons.

Native browser verification repeated the reported ordering on both prior-carried branches: deliver at the matching beacon before choosing, return to the guide, then choose the corresponding color. Both closed with four consequence executions, with no second delivery. Warning/error logs were empty. Screenshots: `/tmp/rocket-early-blue-delivery-fixed.png`, `/tmp/rocket-early-red-delivery-fixed.png`. Game source/handlers and CFW package are unchanged.

Independent review accepted the corrected baseline: CAI438 verified the exact two-condition JSON diff; CFW439 ran all 12 compiled encounter tests read-only; Steve440 built an isolated source copy, passed all 12 encounter tests and reran the original ordering probe successfully, closing S010/R010. Current quest hash was rechecked by Rocket and matches the delivered baseline. These reviews cover source/focused runtime evidence; full-suite and native-browser results remain Rocket-owned.
