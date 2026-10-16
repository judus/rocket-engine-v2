# Watchtower author context tools

The game application owns this context. `examples/quest-authoring/author-context.json` stores the ordered game identity, setting, established story, creative assignment, mechanics, exact capability vocabulary and explicit initial protagonist knowledge. `ContextProvider.ts` renders this material and queries the existing world/navigation/journal. No engine core, CFW source, browser demo or baseline quest is changed.

The vocabulary must match the exact registered `QuestHost.capabilities` names; missing/extra keys fail setup. Inspection capabilities describe facts/events the protagonist produces through normal gameplay; action capabilities are quest consequences. The adapter does not invent aliases such as `defeat_enemy`. CFW authoring tools and their descriptions are obtained from the actual granted provider tools. All eight context tools return plain text, not a JSON envelope. The native MCP discovery schemas remain authoritative for parameters.

Tools:

- `show_authoring_example`: the complete63-call CFW Watchtower chain, with explanations from native discovery and short recorded return notes, followed by the final Mermaid from the same maintained source. No resulting quest JSON. Default `chain`; optional `steps` with start/limit, or `diagram`. Recorded IDs/revisions are illustrative; negative controls are labelled.
- `game_author_briefing`: complete ordered introduction, or one section (`identity`, `setting`, `story`, `assignment`, `mechanics`, `vocabulary`, `context_tools`, `authoring`). No illustrative user lore is promoted to canon.
- `game_entities_list`: category and protagonist known/unknown filters; bounded offset/limit with expected world revision. Characters include the protagonist, sentries and guide. Locations use their real IDs; only the real player spawn is listed. Buildings return an empty list because none are authored. `spawn:player` is a contextual reference, not an executable entityRef.
- `game_entity_details`: one exact reference, its state and provenance. Missing motives/relationships are explicitly not authored. No hidden-state mutation.
- `game_location_accessibility`: target reference or finite x/y from the current protagonist. Existing `GridNavigator`/`GridTraversal`, finite 24×13 map of32px cells, the demo's closed-gate rectangles and the actual8px radius+1px clearance. Location targets mean the centre. A point inside the closed gate is blocked, but the beacon beyond it is reachable around the gate. Search results are bounded grid evidence, not a globally shortest continuous route.
- `game_distance`: Euclidean or navigable grid-route length in canvas pixels, optionally from another reference. Unreachable yields no route distance. Reads never move the player.
- `game_journal_read` and `game_status_read`: existing neutral journal reader wrapped for plain-text presentation on this same application world. Journal records actual retained world events with stable source/event identities. Reads may capture previously unrecorded observations; they never execute game effects. Missing/incomplete world history is unavailable, not empty success. Current world status includes recording provenance; quest status describes actual gameplay runs, not published drafts.

The combined binding grants `watchtower-context` alongside CFW, for32 tools total (24 builder and eight context tools). Binding scope, current generation and provider grant are checked before and after reads. No context tool is available to an unrelated binding. Closing the fixture releases journal producers/status readers and drains storage after transport/domain teardown.

## Run and inspect

```sh
npm run check
ROCKET_CONTEXT_PORT=8098 node scripts/context-tools-proof.mjs /tmp/context-outputs
ROCKET_PROOF_PORT=8098 node scripts/quest-proof.mjs
ROCKET_MCP_PORT=8120 ROCKET_AUTHOR_STORE=/tmp/separate-author.sqlite ROCKET_MCP_TOKEN=local-proof-only node dist/examples/quest-authoring/combined-server.js
```

The proof uses actual official SDK calls over loopback HTTP, checks32-tool discovery and17 plain-text examples, invalid-filter rejection, and zero gameplay events/effects. It closes the listener and asserts zero providers/connections and disposed journal. With `ROCKET_CONTEXT_CONNECTION` set to an application-owned private connection descriptor, the same script reads an already running endpoint and exports the actual responses without restarting it. Native discovery/protocol transcripts are separate JSON evidence; user-facing output is `.txt`.

## Deliberate limits

This endpoint is an independent authoring fixture, not the running browser world. Its volatile journal starts empty and is lost when the fixture closes; it is not the separate journal demo's history. Protagonist knowledge is an explicit initial authored declaration independent of visibility; automatic discovery and relationship memory are not implemented. No larger world canon, buildings, enemy spawn records, relationship facts or extra mechanics are fabricated. There is no character-profile search or browser/backend bridge. The native capability catalogue remains authoritative; CAI owns fetching the briefing into model context. No automatic CAI prompt change or paid generation is claimed.

Filtered-empty journal results retain the exact query options and frozen page metadata (head, completeness, cursor). A nonempty timeline with no matches says "No events match this query/window"; only a zero-head window reports no recorded events. A lack of mission-report matches never implies that other events did not occur.

## Maintained authoring example

`AuthoringExample.ts` reads the installed CFW package's `docs/QUEST-BUILDER-TOOLS-WALKTHROUGH.md` at call time. It extracts all numbered inputs/local responses and the final Mermaid from that same document, verifies contiguous numbering and granted tool names, and checks successful input shapes using the registered authoring capabilities' existing pure validators. It never executes the example. Deliberately rejected sample inputs remain labelled negative controls. Missing grants, changed source format or successful-input contract drift fail explicitly instead of silently serving stale instructions. Source fingerprints remain in developer evidence, outside the author-facing response.

Descriptions in both the briefing and the example come from actual CFW tool discovery; no duplicate description list is maintained. The briefing calls them **authoring tools** and points to `show_authoring_example` before listing them. Game primitives remain exact executable game identifiers with game-owned semantic descriptions.

The example's return notes are short plain summaries. Author-facing output omits provider names, source paths, hashes and local/registered transport commentary. The resulting quest definition is never included. Its final semantic Mermaid retains conditions, boundaries, consequences and choices. The complete chain has a48KiB text cap (other context tools remain32KiB); steps can be paged1–8 calls at a time. The full current example is approximately34KiB.
