# WORKERS-001: imported validator rejection isolation

Rocket independently reviewed message 678 and imported exact Workers 0.4.1.
Archive: `vendor/rocket-workers-0.4.1.tgz`, SHA256
`0b9087fea605b93f087edb1570df1753631230d7c6ef8bf7af521e223ce77718`.
The accepted 0.4.0 archive remains intact. Host input/output and worker input still
require synchronous true; a returned native Promise is invalid, but its rejected
result is consumed without leaking an unhandled rejection. No async validation.

Independently inspected the guarded Promise.prototype.then sinks and existing
callback/lifecycle guards. Ran upstream full check in an isolated copy: all 74 tests,
strict TypeScript/lint/format/build pass. Peer source was not edited. The installed
Rocket package's 18 runtime/declaration files match the delivered archive exactly.
Ran the upstream four-mode fixture against Rocket's exact installed package:
rejected/async/overridden-catch/resolved Promise cases each report three validator
paths, zero unhandled rejections and three reentrancy checks. Resolved true Promises
remain invalid. Proof: `/tmp/rocket-workers-041-installed-proof.json`.

Updated package/lock pin, browser copy version, terrain import map and worker bridge.
Main full `npm run check`: 446 tests and coverage/static gates pass; log
`/tmp/rocket-workers-041-main-check.log`. Experimental branch receives the same
bounded import separately, with no merge of experimental APIs into main.

Upstream additionally reports 12 native browser suites / 78 checks and 51/51 worker
creation/termination; its results artifact was inspected, not independently rerun.
The failure-isolation fixture uses controlled transport and Node rejection observation;
it is not native-browser certification of every invalid callback shape. Existing native
browser evidence and Rocket's ordinary worker-backed terrain check are separate.
Arbitrary thenables/modified Promise constructors remain outside this narrow guarantee.

Sprite Q2 tooling was also independently reviewed and accepted in messages 675/676;
its archive/runtime are unchanged, so no additional Sprite import was required.
[Independent Sprite review](/tmp/rocket-sprite-q2-independent-review.md).
