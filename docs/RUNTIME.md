# Runtime 0.1 — implemented API

TypeScript sources compile to native JavaScript ES modules for Canvas 2D. There are no browser runtime dependencies. This document describes implemented behavior; the broader API sketches remain proposals. Optional tree composition is now described in [NODES.md](NODES.md).

## Run

```sh
npm ci
npm start
# http://127.0.0.1:8092/
npm run check
```

Python 3 serves the example after a TypeScript build; Node runs tests against the emitted JavaScript. See [TOOLING.md](TOOLING.md) for checks and development. The runtime itself runs in a browser and uses its document, Canvas 2D, requestAnimationFrame and AbortController facilities.

## Smallest example

```js
import { Rocket } from './dist/src/index.js';

const app = new Rocket();
const scene = app.scene({
  x: 0,
  update(dt) {
    this.x = (this.x + 100 * dt) % 600;
  },
  draw(ctx) {
    ctx.fillRect(this.x, 100, 50, 50);
  },
});
app.view({ target: '#animation', scene, width: 600, height: 400 });
await app.start();
```

The selector identifies a container; Rocket appends and owns a new canvas. Registering a scene returns the supplied object without wrapping its state. Hooks run with that object as `this`. A scene instance belongs to one application for its lifetime, including after disposal; another application requires a new instance. An unviewed scene is retained but not updated or prepared. View creation requires a scene registered with the same application.

## Two views

```js
const detail = app.view({ target: '#detail', scene });
detail.camera.x = 100;
detail.camera.zoom = 2;
```

Create composition before start, or stop before adding scenes/views. Every active scene updates once per frame; every live view draws independently. Scene/view switching and background activation handles are not implemented. A disposed view no longer contributes scene activity.

## Timing

`update(dt, frame)` receives elapsed seconds. `draw(ctx, frame)` receives the same read-only `{dt, time}` context. Update/draw/overlay hooks are synchronous. `time` accumulates active application time; the first frame and first resumed frame have dt=0. All scene updates happen before any view draws.

Native async frame hooks are rejected before invocation. An ordinary function returning a Promise stops the loop with an error, but any async work it already started remains the caller's responsibility. If an earlier update removes a later scene's last view, that later scene is skipped immediately.

Stopping and hidden tabs pause the clock. Visibility changes reset the timestamp baseline so background elapsed time isn't replayed. Ordinary visible-frame delays are not clamped: the next update receives their full duration. Optional fixed scene timing, bounded catch-up, interpolation alpha and fixed input snapshots are now available; see [FIXED-TIMING.md](FIXED-TIMING.md). Time scaling and a production adapter remain deferred.

Frame exceptions stop scheduling and invoke `new Rocket({onError(error) { ... }})`. Without a handler, they are rethrown to the browser. Loading failures reject start(); disposal failures reject dispose() with AggregateError after remaining cleanup runs.

## Camera and picking

Camera x/y identify the world's top-left point; default (0,0), zoom 1 yields identity projection. Zoom must be positive and finite. Coordinates are logical pixels, independent of device pixel ratio.

```js
view.camera.worldToScreen({ x, y });
view.camera.screenToWorld({ x, y });
view.clientToWorld({ x: event.clientX, y: event.clientY });
```

Client picking includes canvas CSS scaling. Camera rotation, controllers, follow, bounds and fitting are future features. Scene/camera/canvas references on a view are read-only; camera x/y/zoom remain mutable.

## Sizing and drawing

View options: target, scene, width (default 600), height (default 400), pixelRatio (defaults to the device ratio), and optional overlay(ctx, frame). Use `view.resize(width, height)` to explicitly change logical size. Device-ratio changes are picked up on the next render. Backing dimensions are rounded to integer pixels. Automatic container sizing is not implemented; CSS scaling preserves aspect ratio in the example.

Each render clears the backing canvas, applies the camera for scene.draw(), then draws the optional screen-space overlay with only pixel-ratio scaling. Canvas state is saved/restored and the current path reset before each callback; user save()/restore() calls must be balanced. Drawing must not mutate scene state, since multiple views invoke it multiple times. No layer manager, retained cache or dirty-view scheduling exists yet.

## Optional performance monitor

```js
const app = new Rocket({ performance: true });
// In a screen-space overlay:
const { fps, frameMs, updateMs, renderMs } = app.performance;
ctx.fillText(fps === null ? 'Warming up' : `${fps.toFixed(0)} FPS`, 12, 20);
```

The read-only snapshot publishes averages over windows of at least half a second. FPS counts application frames, regardless of view count; frameMs is the average elapsed interval. minFrameMs and maxFrameMs report the shortest and longest callback intervals in the same window; frameJitterMs is their standard deviation. Equal average FPS can hide clustered or uneven callbacks. updateMs measures CPU time across all scene updates; renderMs measures CPU time across all views, including overlays. These are JavaScript callback/submission costs, not GPU timings or proof of displayed frames.

Values start as null. Stop/resume and visibility changes discard the current window and readings; zero-duration baseline frames are excluded. Paused canvases retain their last drawing until rendering resumes. Monitoring is disabled by default (`app.performance === null`) and incurs no performance.now() calls when disabled. The demo displays FPS plus update/render CPU costs on both shared-scene canvases.

## Preparation and disposal

Optional scene hooks:

```js
prepare({signal}) { /* may return a Promise; respect cancellation */ }
dispose() { /* may return a Promise */ }
```

Start awaits preparation once per active scene after successful preparation. Concurrent starts share a promise; starting while running doesn't create another loop. Failed preparation can be retried; the hook must release its own partial resources before rejecting. Scene2D/view synchronous resource ownership is now available; see [SERVICES-INPUT.md](SERVICES-INPUT.md).

Stop aborts pending preparation and cancels the frame. A pending cancelled start must settle before another start is attempted. Hooks that ignore abort can delay disposal: dispose waits for preparation to settle before releasing scene resources. Late resources remain the hook's responsibility.

Repeated and reentrant `app.dispose()` calls share the same completion promise, reserved before service stop callbacks run. Each owned scene, presentation and service is cleaned once; synchronous suspension still happens immediately and cleanup failures are aggregated.

Stop preserves time and scene state. Dispose is final and idempotent: mark disposed, stop, remove visibility listener, remove/release canvases, wait for preparation, dispose all registered scenes in reverse registration order and clear registries. Application disposal owns scene cleanup even for never-viewed scenes. Standalone view.dispose() removes only that view, unregisters it and releases its scene/overlay/context references; view.scene becomes null. Removing the last view deactivates a scene but does not dispose it. Custom scene callbacks and DOM handlers remain application-owned; register synchronous cleanup with scene/view own() where appropriate. View-bound input handlers clean up automatically. Installed services dispose after all scenes.

## Verification

Node tests exercise the runtime with a controlled browser host: single update/multiple draws, refresh-rate parity, stop/resume, hidden tabs, preparation/retry/cancellation, errors, aggregated cleanup, resize/DPR, CSS picking and stopping inside an update. These are contract tests, not browser emulation.

The [foundation review](FOUNDATION-REVIEW.md) extends this to 21 tests with ownership, synchronous hooks, path isolation, removal during updates, and controlled FPS/CPU measurements.

The browser example verifies actual Canvas 2D rendering, shared state in different projections, overlays, a time-driven wave, pointer picking, zoom, pause/resume and replacement of the complete application. Focused checks do not establish cross-browser compatibility or performance limits.

## Explicit simulation without views

`app.scene(definition, { keepAlive: true })` opts a registered scene into preparation and frame/fixed updates even with zero views. Multiple views still update it once. Default scenes keep their existing last-view pause policy. App stop, document visibility and fixed catch-up limits still apply; no second clock or worker is introduced. SceneOptions must be supplied while the runtime is stopped, like other composition. See [actor-owned streaming proof](STREAMED-NAVIGATION.md).

## Independent presentation cap

`maxFps` (null or 1–240, including fractional values) gates presentations only.
Services, input, fixed steps and ordinary updates run on every visible RAF callback.
`update` receives that callback’s elapsed seconds; `draw`/presentation receives elapsed
seconds since its last admitted application draw, with the same elapsed `time`.
Start/resume/visibility reset both baselines. Cap changes preserve elapsed draw time
and allow the next callback to draw. Stalls do not replay overdue presentations.

With performance enabled, `app.performance` measures callback cadence and average
update/submission cost per callback (zero submission on skipped draws).
`app.renderPerformance` separately measures actual draw cadence and submission cost
per draw, with update cost zero. Both use their own half-second sampling windows.
Neither certifies screen presentation or uniform pacing across mismatched refresh
rates. No extra timer, automatic interpolation or unlimited fixed catch-up is added.
