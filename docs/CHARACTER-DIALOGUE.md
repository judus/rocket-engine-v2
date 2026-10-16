# Character host-port integration

`character-dialogue.html` connects one spatially picked Mara NPC, one actual CFW
runtime/narrative system and CharacterHostPort to two existing Panel/ChatBox views.
Reasoning is scripted: no live CompanionAI, MCP server, endpoint or credentials.

## Try it

1. Pick Mara or Open Mara. Send `work`; the reply and committed offer appear in both chats.
2. Accept in either panel, then Walk to Old Grove. Rocket routes around the wall;
   CFW completes only after inspecting the game-owned physical arrival fact.
3. Chat again for the scripted completion reply. A text claim cannot publish arrival.
4. Fail next scripted reply, then Retry reply. The original host operation/effect
   stays retained, with one committed player/character message pair.
5. During a pending reply, **Stop waiting** preserves the authoritative operation.
   Close the panel to detach presentation; reopen to observe its settled outcome.
   Closing one view never disposes the shared host or the other presentation.

## Ownership and adapter

Rocket supplies its existing scene update clock, movement/navigation, spatial
picking and presentation. CFW owns dialogue journal/revision, command admission,
registration/reasoning, quest identities, offers, authenticated choices, condition
inspection and completion. MaraHost supplies game facts/context, validates the
bounded grove proposal and implements a scripted HostDriver retaining original
operation/effect identities and local results. No quest implementation is copied.

`examples/characters/HostChatPort.ts` maps the supported CFW read/subscribe/dispatch
contract into ChatPort. It borrows host authority. Scene-owned adapter disposal
unsubscribes and rejects late presentation; only MaraHost disposes CFW/runtime.
Messages and choices use CFW stable IDs. New dialogue/choice commands carry the
observed CFW revision; exact admitted UI delivery replay retains its original
revision. Retry uses a fresh delivery ID referencing the original operation while capacity remains.
At the 128-delivery limit, the same UI action maps to CFW replay of the retained
operation without another delivery entry; foreign operation IDs are rejected.

changed-input reuse conflicts, never dispatches another effect. A bounded local
revision cache is presentation metadata, not a second effect journal.

Mara calls host-only `publishAuthority()` on the existing scene update boundary.
Committed choice additions/removals are persisted into the host's projection and
versioned before subscriber delivery. Pending or failed authority publication
blocks new commands. ChatBox honors optional host `actions`, plain-text `status`
and `cancelLabel`; other chat providers retain their established pending/error
policy. Authority publication never invents a pending dialogue request. Adapter
presentation revisions include asynchronous errors/status changes independently
of the authoritative CFW revision used for dispatch.

Host dispatch rejection becomes a presentation error, with uncertainty retained
and retry gated by CFW available commands. Stop waiting is presentation only; it
neither aborts the CFW decision nor undoes committed quest effects. Replies appear
only after CFW acknowledgment, without optimistic duplicate history.

## Limits and package pin

The exact reviewed CFW artifact is
`vendor/character-framework-0.1.0-cc9267cf6a4d.tgz`, SHA256
`cc9267cf6a4d9082a1b5d030052ad3bab5cd0da63d3c93208db42de4ea2ea9bf`.
The installed core and host entries are copied to a revision-specific browser URL.
Native browser imports use standard crypto.randomUUID/structuredClone on loopback.
The full upstream package declares Node/MCP dependencies for its other exports;
this demo imports only the browser-compatible core/host graph, and configures no
HTTP/CAI backend. The CFW checkout remains authoritative and was not edited by Rocket.

The 650 ms delay/failure injection is part of the local scripted driver. One request
is active; CFW retains at most 128 deliveries/operations and 64 visible messages.
Storage callbacks are intentionally volatile; driver/game/port checkpoints are not
persisted across reload. Saturation disables new commands. Reload resets this entire
in-memory proof; it is not receipt recovery for a live provider. No production
storage, live transport/auth, remote rollback or CAI driver integration is claimed.

Tests exercise actual Rocket arrival/CFW completion, rejected text-only visit claims,
original effect replay after a lost acceptance reply, two-view authority notifications,
storage gates, exact delivery/conflicting input, stop waiting, detach and disposal.

The recovery build also catches throwing adapter getters during runtime result
capture and settles failure so scheduling capacity is released. The saturated
JSON-restore adapter regression proves one original effect and one history pair
with 128 retained deliveries; it does not claim durable game checkpoints.

## Local decision-driven NPC departure

Send `go to grove` to ask the scripted CFW reasoner to propose Mara's departure.
This is separate from the existing player visit quest. `MaraHost` validates the
intention shape and the scene-owned `LocalDeparture` accepts only the authored
`grove` destination, current session and Mara incarnation. Local HostDriver
provenance is explicit; no MCP mutation identity or remote bridge is fabricated.

The game adapter owns Mara's Movement, with one update per scene update. Player
movement remains independent. Picking bounds track Mara's actual position. Admission
starts one journey and remains pending while moving or blocked; only arrived,
unreachable or explicit cancelled outcomes settle the host reply. The immutable
outcome retains session/operation/effect/actor/incarnation and the original journey
ID. Replay of either a pending or terminal operation shares its original promise;
conflicting identities, foreign actors/sessions, busy supersession and ledger overflow
are rejected before another journey. The ledger retains at most 128 records without
eviction; it is volatile game-effect evidence, not a persisted checkpoint.

Use **Lose next departure reply**, send `go to grove`, wait for the injected terminal
reply error, then **Retry reply**. Counters remain one journey/one outcome. Stop waiting
and panel/view closure preserve game work. **Cancel Mara journey** explicitly settles
cancelled; **Retry Mara route** only retries an existing blocked route. **Remove Mara**
retires its incarnation and removes its picking entry; pending work settles cancelled
once, and new departures are rejected. **Dispose proof** disposes both views, the host,
input/index and both movement owners. Original terminal replay cannot target a new
actor. No replacement actor or durable handoff mechanism is implemented.

Five departure regressions cover validated authority, blocked terrain and replan,
pending/terminal replay, no supersession, explicit cancellation/removal, unreachable
outcomes, bounded non-evicting records and actual CFW decision/lost-reply recovery.
The complete Rocket gate has 260 passing tests, TypeScript, lint, formatting and build.

### Arrival-aware scripted replies

A free player visit is retained after Return to Mara and acknowledged by `hello`,
even with no quest. It does not invent quest completion. Mara's own arrived journey
is separately acknowledged in subsequent greetings and does not set the player's
visit fact. Reload clears both facts. The page instructions distinguish free visits,
accepted player quests and NPC departures, with an explicit scenario selector. These replies remain explicit scripted state branches, not live AI memory.

A grove visit is now a completed journey with its actual position inside the same
half-open 64×64 green bounds used for drawing, not a one-unit circle around its
center. Pointer destinations inside the displayed landmark count like the centered
button destination. Journeys elsewhere, pending or cancelled journeys do not count.
The current journey label includes target coordinates and marks Old Grove arrivals;
returning to Mara retains the visit. A regression accepts the actual CFW quest,
walks to a noncentral point through navigation, publishes the visit, verifies quest
completion and returns before checking the greeting.

Quest presentation applies monotonically increasing CFW revisions. A completion event
can arrive before an asynchronous acceptance inspection returns; an older inspection
must not replace the newer completed status or restore stale choices. The historical-mode ordering regression verifies the saved CFW quest and Mara's projection both remain completed when accepting an offer that already existed before the visit. This does not bypass the default new-visit policy.

## Explicit scenario policies

Choose the rule at the top of the page; changing it reloads into a fresh session.
The default `after-acceptance` policy remembers lifetime visits separately from quest
eligibility. At the actual CFW quest_accepted event, the game captures its current
visit sequence. The inspection capability reports success only for a later visit.
Scene observation records a completed journey inside the drawn grove once per
physical entry, and requires leaving its bounds before another arrival can count.
Repeated frames or another destination command while still inside do not count.
Accepting while already there leaves the quest active until you leave and return.

With `skip-if-visited`, asking for work after a lifetime visit yields acknowledgment
and no quest allocation or player choice. Asking before any visit still offers the
quest. In this historical scenario, a visit after an offer already exists can count
on acceptance. The policy is fixed for the session, not changed under an active quest.

CFW retains quest/choice authority; these are game-defined inspection/offer rules.
Neither uses text claims, Mara's own departure, nor a presentation closure as player
arrival evidence. The page exposes both lifetime visit and quest visit so their
meaning is visible rather than conflated.

The current CFW pin is private browser artifact `c55c62467cad` (accepted 2026-10-14).
The existing Mara root/host imports now select CFW's bundled browser entries; earlier
recovery evidence above identifies its historical build. Strict Rocket tests and a
native browser work-offer check pass after repinning. See [authored situations](CFW-SITUATIONS-REVIEW.md).
