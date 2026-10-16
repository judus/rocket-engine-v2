# Rocket consolidation checklist

Collected 2026-10-16 at Julien’s request from the current Rocket discussion and
mailbox messages 643–663 listed below. This is a tracking checklist, not blanket
implementation approval, package acceptance or an assignment to peer projects.
No runtime changes, package upgrades, paid generation or deployments accompany it.

The cockpit/asteroid integration is complete as a bounded renderer demonstration.
Gameplay expansion is outside this consolidation. Preserve the simple callback path
and optional advanced modules; do not create services merely to rename helpers.

## Current execution order — Julien’s subsequent steering

1. Fix material bugs first.
2. Bring in the new Production-Workshop and Sprite-Animation features by copying or
   importing into Rocket for now. Keep upstream fixes coordinated in their channels;
   no submodules or elaborate repository migration.
3. Work through Rocket’s consolidation list, excluding packaging, acceptance and
   compatibility work from this pass. Normal tests/static checks still accompany changes.
4. Evaluate Julien and Steve’s API ergonomics ideas after consolidation.

Use local Git with straightforward commits from this point. Favor practical progress
and concrete failures over speculative edge-case expansion. Steve owns independent
review; peer projects own their fixes. Items below remain recorded even when excluded
or deferred by this execution order.

## 1. Runtime correctness first

Source: Steve’s timing request 643 and CORE-001 follow-up 644. Steve relays Julien’s
bounded v2 timing/lifecycle request; retain its exact scope. Leave legacy
`rocket-engine/Timer.js` untouched.

- [ ] Reproduce stop during the final `beforeUpdate` service: prevent a stopped frame
      from repopulating the fixed accumulator and leaking remainder into resume.
- [ ] Decouple the presentation cap from service/input/update/fixed processing on
      admitted RAF callbacks. Preserve one scheduler and bounded overload handling.
- [ ] Specify frame/update/render elapsed-time semantics, monitor populations,
      actual render cadence and cap-change behavior. A correct average cap does not
      guarantee uniform presentation spacing on a mismatched refresh rate.
- [ ] Add adversarial tests for stop/resume/dispose from every hook phase, catch-up
      interruption, repeated starts/stops, exceptions, one RAF chain, clean resume
      baseline, hidden time and retained timing totals.
- [ ] Exercise 60/120/144/165/240 Hz feeds, caps 1/5/10/30, non-divisor/fractional
      caps, changes, jitter, stalls and zero-origin timestamps. Healthy 60 Hz input
      must preserve 600 fixed ticks per 10 seconds at low render caps; never remove
      the bounded overload policy to force that result.
- [x] CORE-001: reserve the shared disposal completion before user teardown can
      re-enter; repeated/reentrant dispose must return the same completion and
      clean each owned scene once, preserving cleanup-error reporting.
- [ ] Report exact changed files/fingerprints, timing contract, tests and native
      browser limits for Steve’s independent review.

## 2. Other concrete correctness findings

Source: Steve 646–647. These are reported counterexamples, not a proposed rewrite.
Reproduce each against the current source before its focused correction.

- [ ] CORE-002, ChatBox: reject/refresh a displayed choice whose revision has changed
      before dispatch, even when its ID is reused. Evaluate expected-revision or
      immutable-ID contracts for delayed commands; domain authority still validates.
- [ ] CORE-003, MemoryJournalStore: avoid cloning all accepted history on every
      append. Stage/validate/clone new records and index source/event identity,
      preserving batch atomicity and copied immutable read boundaries.
- [ ] CORE-004, CPU 3D culling: support valid convex polygons whose first three
      vertices are collinear. Align normal/culling semantics and test both CPU
      pipelines; no wholesale renderer rewrite.
- [ ] CORE-005, ChunkStream: prevent synchronous abort listeners from resurrecting
      disposed state or overwriting newer nested demand with an old reconciliation.
      Cover both dispose and replacement-demand reentrancy while preserving physical
      occupancy for noncooperative jobs until settlement.

Current verification: Rocket.ts, FixedClock.ts, ChatBox.ts, MemoryJournalStore.ts,
SolidFaces.ts and ChunkStream.ts hashes still match Steve’s reported snapshots.
This confirms source identity; it does not substitute for reproducing the failures.
Evidence: `/home/maduser/Documents/Codex/2026-10-13/new-chat/work/timer-review/`
and `work/core-review-20261015/` under that same Steve workspace.

## 3. Reusable engine consolidation

Source: Rocket’s six-part assessment in this conversation; investigate concrete
consumers and agree small contracts before implementation.

- [ ] Extract WebGL presentation ownership: canvas/context creation, sizing/DPR,
      context loss/restoration, retained CPU data and complete cleanup. Preserve the
      low-level Presentation escape hatch and avoid a second frame loop.
- [ ] Make focus/action scopes, keyboard clearing and pointer capture usable across
      Canvas and WebGL presentations; replace example-only infrastructure where it
      duplicates an engine responsibility.
- [ ] Define consistent acquisition/sharing/cancellation/retry ownership for texture
      and GLB assets, building on image leases. Keep CPU assets separate from
      context-owned GPU caches and restoration.
- [ ] Design a small optional render composition path for scene, cabin shadow pass,
      offscreen target and bloom. Simple drawing must remain simple; cockpit layout,
      instruments and asteroid generation stay example-owned.
- [ ] Audit repeated demo plumbing and dependency boundaries before deciding what
      belongs in a service, system, ordinary object or example helper.
- [ ] Refresh README, roadmap, open questions and API docs to distinguish delivered,
      experimental, proposed and deferred work; remove stale counts/status claims.
- [ ] Test real installed-package consumers through public exports for a minimal
      animation, interactive 2D scene and loaded 3D scene; no copying infrastructure
      or depending on repository-internal import paths.
- [ ] Agree the v1 browser/device support baseline and selected repeatable browser
      acceptance checks: startup failure, cancellation, resize, multiple views,
      context recovery and disposal. Report browser evidence separately from mocks.

Proposed v1 acceptance: those small consumers work through documented public APIs,
advanced features remain opt-in, and ownership/error/teardown behavior is predictable.
This criterion and the extraction order remain to be agreed with Julien and Steve.

## 4. API ergonomics investigation

Source: Steve 662 and the verbatim
[exploratory concept](/home/maduser/Documents/Codex/2026-10-13/new-chat/rocket-api-ergonomics-exploratory-concept.md).
Every sketch is an idea, not an approved API or instruction to implement it verbatim.

- [ ] Compare small old-Rocket/v2 consumer programs and investigate a minimal callback
      entry point, default canvas/scene/startup, with explicit readiness/errors.
- [ ] Investigate scene preparation/enter/leave/pause/resume/dispose, retained versus
      fresh instances, history and interrupted/failed transitions.
- [ ] Investigate progressive entities/IDs/tags/queries and optional collider/body
      conveniences against existing nodes, physics and transform ownership. Do not
      introduce a competing entity model or imply discrete queries provide CCD.
- [ ] Investigate ordered world/screen layers, feet sorting, custom ordering and
      caching, distinct from gameplay/collision groups and canvas allocation.
- [ ] Investigate camera/control presets, tuning units, framing, focus and picking;
      camera controls and character controls remain separate.
- [ ] Investigate parallax independently from finite/repeating artwork, with explicit
      dimensions/edge behavior and no unnecessary per-copy entities.
- [ ] Evaluate primitive/tween conveniences only after the general foundations;
      preserve advanced access through the same underlying objects.
- [ ] Consolidate agreed ergonomics with the lifecycle/rendering contracts above
      before committing names, defaults or implementation scope.

## 5. Quality gates across owned packages

Source: QUALITY-002, Steve 652/653/654 and Sprite proposal 657. Peer packages own
implementation; their proposals await bounded review/agreement, not automatic dispatch.

- [ ] Rocket: add a reproducible built-in Node V8 coverage command, retained report,
      explicit reusable-source/module accounting and sensible line/branch/function
      baselines in the required gate.
- [ ] Review Rocket-Workers’ equivalent tooling correction against its own module
      inventory and baseline; keep native worker evidence separate.
- [ ] Review Sprite’s Q2 proposal: expected-module checks, text/machine reports,
      missing/incomplete/test-failure handling and unrounded baseline/branch ratchet;
      no redundant unit runs or changes to accepted archives/pins.
- [ ] Verify the gates reject intentional regressions/missing reports/modules.
      Do not chase 100% by touching lines. Browser loaders, native Canvas/worker
      behavior and shader execution need appropriate independent evidence.
- [ ] Decide separately whether automatic local/CI invocation is wanted. Existing
      `npm run check` is a local gate; hosted CI is not a prerequisite imposed here.

Audit percentages are snapshot evidence, not current acceptance thresholds. Steve’s
reports already confirm strict typing/lint/format enforcement; no new analyzer or
framework is implied by the coverage gap.

## 6. Package review and integration queue

- [ ] WORKERS-001 (648/651): review the proposed 0.4.1 support correction for rejected
      native Promises from host input/output and worker input validators. Keep
      validation synchronous and require exactly true; consume the rejected invalid
      return without awaiting/admitting it. Review overridden-catch/reentrancy cases,
      exact archive identity, strict gates and native regression before accepting.
      No Rocket pin change until independently verified; upstream owns the patch.
- [ ] Sprite L1 (660/661/663): review delivered synchronized-layer candidate 0.3.0,
      API/validation and ownership; one master timeline, immutable mappings/order,
      no image/clock/gameplay ownership. The old wait request was explicitly
      overridden by Julien upstream: do not reset that approval or call it unstarted.
- [ ] Correlate Sprite’s latest archive SHA256
      `c7a86853270bc50d61c72c4d797b1f49ac5fc8e653724e5bd8a3373ea99d59a4`
      at demo-fix commit d25c539 with its reported unchanged runtime. The earlier
      230-assertion packed proof belongs to digest f794364…; do not transfer that
      claim to the new digest without appropriate verification.
- [ ] Review the corrected Show weapon demo (visibility on every step, distinct from
      animated ordering), actual-package smoke and cleanup evidence. Keep Rocket’s
      accepted 0.2.1 pin and legacy baselines until a separate consumer upgrade gate.
- [ ] Consider actual sprite-pack validation before any further layer abstraction or
      Rocket integration; neither is automatically assigned by this checklist.

Sprite’s independent 0.2.1 review (649) reported no new material defect; keep it
support-only unless the above candidate/quality work needs a concrete next gate.
Package reports are received evidence, not Rocket acceptance.

## 7. Quest/CAI follow-ups — deferred while engine consolidation is the focus

Source: CAI 645/656/658. No generation or paid provider call authorized here.

- [ ] Check current CAI descriptor/account against the requested Rocket UI/private
      descriptor label alignment to gpt-6.1-sol / medium. The report says preserve
      256 authoring steps, 512 calls and 4096 output tokens. Verify current state
      before changing labels; no restart/rebind merely for labels.
- [ ] At the next quest integration gate, verify CAI’s reported output-truncation
      hardening at 4c51c2b: explicit failed/authoring_output_limit, draft/tool history
      retained, no automatic retry; retain honest resume/retry semantics.
- [ ] Keep safe diagnostic categories/request IDs distinct from provider prose,
      payloads and credentials. CAI owns its implementation and tests.
- [ ] If a genuinely larger MCP receipt/result is introduced, measure its actual
      envelope and coordinate capacity then. Message 658 resolves the earlier
      hypothetical 256 KiB receipt concern: current captured receipt was 812 bytes;
      no speculative limit increase or current repair is pending on that evidence.

Preserve the original watchtower baseline/demo and publication provenance. Previously
completed quest repairs/integrations are not reopened by this collection.

## 8. Deferred rendering ideas and exclusions

- [ ] HDR, exposure and tone mapping — noted, no scheduled milestone.
- [ ] Area lights and local-light occlusion/shadows — noted, no scheduled milestone.

No game expansion, physics flight model, collision gameplay, universe streaming,
blanket package upgrade, generic ECS/service rewrite or peer-source editing follows
from this checklist. Review dependency ownership and a finite acceptance gate for each
selected implementation slice.

Mailbox intake processed: 643, 644, 645, 646, 647, 648, 649, 651, 652, 653, 654,
656, 657, 658, 660, 661, 662, 663. Other subscribed channels had no unread messages.
