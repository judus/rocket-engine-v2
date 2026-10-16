# Foundation review — 2026-10-11

Scope: timing, lifecycle and ownership before introducing nodes and behaviors. The runtime is ready for the next composition slice after the fixes below; fixed-step simulation and generic resource scopes remain separate milestones.

## Defects reproduced and fixed

| Finding                                                   | Consequence                                                                   | Fix                                                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The same scene instance could belong to two applications. | Both loops could update it and both applications could dispose its resources. | Enforce one application owner per scene instance, including after disposal.                                                          |
| Async update/draw/overlay hooks were accepted.            | Work could overlap later frames and escape frame error handling.              | Reject native async hooks before execution and detect ordinary Promise-returning hooks. Preparation and disposal may still be async. |
| Canvas save/restore does not reset the current path.      | A callback could stroke geometry left by the previous frame or scene draw.    | Begin a fresh path before scene draw and overlay.                                                                                    |
| Active scenes were snapshotted before updates.            | A scene could update after an earlier callback removed its last view.         | Recheck activity before each update and immediately unregister disposed views.                                                       |

View disposal now releases references to scene, overlay and context. Disposing one of two views preserves the shared scene's update and the remaining view's rendering. Removing the last view pauses that scene; application disposal remains responsible for its final cleanup exactly once.

## Timing and monitoring

One application frame updates each active scene once, then renders each live view. The same frozen frame context reaches both views. Seconds-based dt is independent of refresh rate; start/resume establishes a zero-dt baseline and hidden time is excluded.

The opt-in performance monitor reports frame cadence and average update/render CPU costs over half-second windows. Two views increase render cost, not the number of reported frames. It excludes baseline frames and resets on stop/resume or visibility changes. No instrumentation clock calls occur when disabled.

## Verification

All 21 Node contract tests pass. Controlled clocks verify 60 Hz and 144 Hz sampling, combined render cost for two views, a single shared update, pause/visibility reset, and the fixes above. Existing preparation, cancellation, aggregated disposal, coordinate and DPR tests remain green.

Browser verification covers actual Canvas rendering, visible monitor readings, pause/resume and complete application replacement. These checks do not establish cross-browser support, GPU cost or workload capacity.

## Boundaries for the next milestone

- Visible-frame delays are deliberately passed through as full dt. Define a fixed-step and overload policy before physics or Workshop simulation integration.
- Preparation must cooperate with AbortSignal and release partial resources on failure. Disposal waits for preparation to settle; an uncooperative Promise can delay cleanup indefinitely.
- Promise-returning ordinary frame callbacks are detected after invocation. Their already-started async side effects cannot be recalled by the engine.
- Draw callbacks must keep simulation state unchanged and balance their own save/restore calls. The runtime cannot enforce arbitrary user callback purity.
- Nodes and behaviors need explicit detach versus destroy semantics, safe traversal mutation rules and scoped cleanup for subscriptions/resources. The current application/view lifetime is the base for these contracts, not a replacement for them.
