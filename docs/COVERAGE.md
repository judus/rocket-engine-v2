# Local coverage gate

`npm run check` runs strict TypeScript, lint, formatting, then one instrumented test
run through Node 24's built-in V8 coverage (`npm run coverage`). `npm test` remains
the ordinary test runner when full failure diagnostics are needed.

Reports are retained in ignored `coverage/summary.json` and `coverage/summary.txt`.
A run overwrites previous success with an incomplete marker before testing. Missing
coverage, missing test completion, failed tests, unknown/new runtime modules, stale
module baselines and per-module regressions fail the gate. The test suite exercises
missing evidence and an unrounded branch regression. Thresholds compare raw values;
rounding is only for text display.

`scripts/coverage-baseline.json` enumerates all 75 reusable runtime modules in this
snapshot. Three type-only emitted empty modules are explicitly excluded with reasons.
Each module's starting floor is its measured percentage minus 0.5 percentage points
(to tolerate tiny V8 attribution shifts), bounded at zero. Changing this inventory or
lowering a floor requires an explicit reviewed baseline edit. It is not an automatic
ratchet or a claim that today's weakly tested modules are sufficiently tested.

Initial full run: 446 tests passed. Before adding the reporter's own negative test,
V8 measured 95.68% lines, 87.98% branches and 94.25% functions over reusable source.
Generated JavaScript coverage measures V8's ranges, including initialization. It is
not TypeScript statement coverage. In particular browser loaders, shaders, WebGL
execution, real input focus and worker transport still need native browser evidence.
No fake device coverage or 100% target is implied.
