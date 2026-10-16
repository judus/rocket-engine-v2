# CFW bounded authoring consumer review

Accepted on 2026-10-14 after Character-Intelligence readiness notice 366, within
existing Rocket integration authority. This reviews `cfw-authoring-prototype-1`,
not the proposed hardened persistent-authoring contract.

Current archive: `vendor/character-framework-0.1.0-c55c62467cad.tgz`.
SHA256: `c55c62467cadb90ed2595ce7bd8ebb9e1555d8557fa2eaba125555ae6f285e2e`.
The older `301b7c519055` archive remains available. Browser import maps and the
build copy target use the current archive's distinct hash URL. Node-only SQLite
and authoring exports remain separate from the browser runtime.

## Verification

The exact archive was unpacked in `/tmp/rocket-cfw185-review/package` and checked
with TypeScript, ESLint, formatting, build and all 185 peer tests. The snapshot
regression verifies publication ID/nested graph mutation after the call, player
scope mutation after start, and original-key replay. Execution now consumes the
same detached input captured for receipt identity.

The packaged headless example passed actual SDK/Streamable HTTP authoring calls,
catalogue discovery, incomplete save/read/correction, review, publication without
activation, SQLite reopen and receipt recovery. Its final subprocess launch was
blocked by the default sandbox, so the resume example was run as a separate Node
process against the printed database. It recovered the publication and original
command from saved descriptors, excluded a prior entry and closed on a new entry.
The full 185-test check was then rerun with subprocess permission and passed.

A temporary Rocket copy with the candidate passed all 277 existing tests and
strict checks. Its existing GroveHost imported the SQLite-recovered definition
under the maintained player-only scope. ControlledCharacter/DirectMovement moved
from x=336 to x=540 at y=208. The earlier visit was excluded by cut 1; the new
outside-to-inside event closed the terminal `end` situation. Marker reveal calls
remained zero and no pickup occurred.

Native browser verification on the isolated copy used the same stored definition,
existing grove scene and candidate browser bundle. Load prior visit, Arm, focus
canvas, Shift+D for 1.4 seconds moved x=336 to x=526.4. The display showed
`end · closed`, event sequence 2, `grove-entries>1`, and zero reveals. Browser
warning/error logs were empty. The temporary definition replacement was only a
review fixture: the maintained Rocket grove JSON and pickup demo retain their
existing behavior.

Review logs: `/tmp/rocket-cfw185-review-check.log`,
`/tmp/rocket-cfw185-review-proof.log`, `/tmp/rocket-cfw185-consumer-check.log`.
After promotion, the installed Rocket pin passed the full strict check and all
277 tests (`/tmp/rocket-cfw185-promoted-check.log`). Its maintained grove browser
flow also passed: arm, Shift+D into the grove, reveal once, E pickup, `found · closed`,
and empty warning/error logs. The local demo server was restored on port 8092.

## Delivered scope and limits

CFW provides seven tools, one main beat, three edit operations, SQLite ordinary
persistence and committed receipt replay under the same configured binding,
with one immutable publication per draft. Publication is not runtime import or
activation. The maintained `rocket_inspect_grove` descriptor and GroveHost seam
suffice; no additional Rocket domain API is needed.

Rocket receives the snapshot/comparison correction through the dependency upgrade.
This review does not add an authoring service, authoring UI, new scene, live CAI
client, provider call, reward or inventory system. The package's authoring module
is Node-only and uses Node 24 experimental built-in SQLite.

Prepared-command crash recovery, revocation races, cross-session successor grants,
general paging/history and production hardening remain outside the prototype.
Rocket's game evidence/capture/journal remains volatile. Authoring database reopen
does not prove durable world recovery or unrestricted narrative quality. Live CAI
results reported by peers were not independently rerun with a paid provider.
