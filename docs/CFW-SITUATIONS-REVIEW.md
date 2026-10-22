# CFW authored situations: accepted consumer

Accepted 2026-10-14 following Character-Intelligence 316–319 and direct human
authorization to resume integration. The original accepted pin was
`vendor/character-framework-0.1.0-301b7c519055.tgz`.
SHA256: `301b7c51905564c3d3449081ff5f60e03fbb8aa13597ea70c21fee769372bdf4`.
No Git revision exists for the peer package; the archive hash identifies it.

Current pin: `c55c62467cad`, reviewed independently on 2026-10-14. See
[the bounded authoring consumer review](CFW-AUTHORING-CONSUMER-REVIEW.md) for the
immutable archive, snapshot correction and current verification. The original
archive remains available for recovery.

## Package review

The initial 181-test archive passed strict checks/headless situations, but native
browser import failed: Ajv is CommonJS and the unbundled root introduced its static
import. Rocket reported that exact blocker in message 317, without modifying CFW.
CFW delivered a bounded correction in 318: reproducible self-contained browser ESM
entries with the original Ajv/schema/mandatory semantic checks and dependency notices.

The corrected exact archive independently passed TypeScript, ESLint, formatting,
build and all 181 CFW tests in an isolated consumer. Native browser proof passed
ordinary runtime import without situations, mandatory structural/semantic rejection,
neutral publish/start/read/choose/closure/retire, one retirement, seven journal writes
and no Node globals. Browser imports now use `dist/browser/index.js` and `host.js`;
Node/declarations retain root/host APIs. Rocket publishes all browser files/notices
through `scripts/workshop-browser.ts`. CFW owns bundle/dependency maintenance.
Runtime validator compilation requires CSP permitting code generation; strict no-eval
CSP is not established. No paid provider or MCP generation work was invoked.

## Run the Rocket demo

`npm start`, then open `/demos/character-situations.html`. Focus the canvas for WASD/Shift;
walk into the guide's 80-pixel interaction circle. Click the guide sprite, selected
through Rocket SpatialIndex/pickTop plus sprite bounds, or open its panel. Choose an
authored response. Three neutral choices and two paths converge on farewell. The
JSON is `examples/characters/situations/meeting.json`; actual CFW publication checks
its schema and graph semantics. There is no acceptance, quest, reward or inventory
mutation, and no AI reasoning provider is configured.

MeetingHost registers only a game-owned interaction inspection. One coherent world
revision and current-revision guard revalidate proximity at choice commit. MeetingChat
implements existing ChatPort, retaining opaque choice/revision/effect identity across
retry. Only the scene's existing fixed update advances CFW; draw observes state.
The guide's single node-owned animation and player's fixed-owned animation each have
one update owner. Panel close detaches presentation and restores canvas focus.

**Fail next journal save** injects a precommit storage error. ChatBox **Retry reply**
reuses the original command. **Hold next journal save** holds a host persistence
promise without another timer; **Stop waiting** hides pending UI and blocks additional
commands while the admitted command settles. **Release held save** commits it.
Moving out of range hides dialogue/choices; stale rendered choices reject. Remove
retires the guide sprite/index membership and disposes the local CFW runtime, releasing
held persistence and blocking late writes/results. This flow has no owned world
effects requiring reconciliation. Scene disposal releases players, movement, input,
panels, index and both image leases. Recreate starts a fresh authored run.

The host journal is volatile. This demonstrates local authored interaction and
lifecycle handling, not durable process-crash world mutation recovery. Combat,
event streams, action/result chaining, cargo and arbitrary generated quest UI remain
future bounded consumers of the accepted contracts.

## Verification

`npm run check` passed TypeScript, ESLint, formatting, build and all 271 Rocket tests.
Four new consumer tests cover neutral convergence/exact replay/retirement, stale
interaction and exact journal-failure retry, held persistence disposal, and ChatBox
pending/error/retry/stop-waiting. Existing Mara/Workshop/sprite tests remain green.

Native browser: 500 ms D moved the player from x336 to x376 and exposed three choices;
typing A in chat preserved the pose. Failure showed retry; held retry exposed pending;
stop-waiting retained host work and release reached the original grove branch. Walking
out of range hid the dialogue, returning restored it, and clicking the guide opened
its panel. Removal during held work cleared the guide and pending state. The existing
Mara demo still offered Accept/Decline after sending “work” with the browser pin.
