# Experimental API reference

Branch: `experiment/api-ergonomics`. Demo: [API experiment](http://127.0.0.1:8092/demos/api-experiment.html).
This branch is a runnable design experiment. `main` retains the consolidated runtime.
Import from `rocket-engine-v2/experimental`; existing root and optional module exports
are available unchanged. The examples below use the same runtime objects as explicit
Rocket programs.

Second pass: [scene activation and lifetime](./SCENE-ACTIVATION.md) is now implemented,
including named navigation and scene-local input. The details below retain the first
pass APIs with the updates noted here.

## Small applications

```ts
import { createApp } from 'rocket-engine-v2/experimental';

let x = 0;
const app = createApp({
  target: '#game', // optional: otherwise an owned div is appended to document.body
  width: 800, // logical pixels, DPR still follows the existing View
  height: 450,
  update(dt) {
    x = (x + 120 * dt) % 800;
  },
  render(ctx) {
    ctx.fillStyle = '#80dbbd';
    ctx.fillRect(x, 100, 24, 24);
  },
});
await app.ready;
app.pause();
await app.resume();
await app.dispose();
```

The module script must run after `document.body` exists. Startup is queued to a
microtask so synchronous configuration of `app.stage`, `app.view` or
`app.engine.use(Input)` finishes first. `autoStart: false` leaves the application
configured; `ready` resolves without loading or starting, and `await app.resume()`
is the explicit first start. Calling pause/dispose before the automatic microtask
prevents that automatic start.

`prepare({ signal })` may return a Promise. `update(dt, frame)` and `render(ctx, frame)`
remain synchronous; seconds and shared elapsed time retain Rocket's existing contract.
`runtime` accepts the ordinary `RocketOptions` (performance monitoring, fixed timing,
render cap, error handler). Initial load failure rejects `ready` and is reported through
`runtime.onError` or console.error. Awaiting `ready` still observes rejection even
though the callback-only path marks it handled. A later explicit resume has its own
Promise; `ready` always describes the initial attempt. Rendering errors use Rocket's
ordinary stop/error behavior. Construction errors throw synchronously.

Returned properties: `engine: Rocket`, current `stage: Stage2D`, `view: View`,
`navigator: SceneNavigator`, `current`, `addScene(id, route)`, `run(id)`, `previous()`,
`input(stage, bindings)`,
`ready: Promise<void>`, `pause()`, `resume(): Promise<void>`, `dispose(): Promise<void>`.
The engine owns the navigator root and view; stage owns its attached nodes and the
implicit target is removed on disposal. Targets supplied by the caller remain.

## Scene nodes and visual layers

```ts
app.stage.addLayer('actors', { sort: 'y' });
app.stage.addLayer('hud', { space: 'screen' });
const hero = app.stage.add({
  id: 'hero',
  tags: ['actor'],
  layer: 'actors',
  x: 80,
  y: 180,
  update(dt) {
    this.x += 100 * dt;
  },
  draw(ctx) {
    ctx.fillRect(-8, -24, 16, 24);
  },
});
app.stage.find('hero') === hero; // true: an actual Node2D
app.stage.query({ tag: 'actor' });
hero.attach(existingBehavior);
hero.dispose();
```

`Stage2D(options?: StageOptions)` exposes `world: Scene2D`, `screen: Scene2D` and
`disposed`. It supplies these methods:

- `addLayer(name, { space?, parallax?, sort? }): Node2D` creates an ordered layer.
  Space defaults to world; parallax defaults to 1; sort is absent, `'y'`, or a node
  comparator. Duplicate/empty layer names reject. Screen parallax is disallowed.
- `layer(name): Node2D` returns the actual container; unknown names reject.
- `add(EntityOptions): Node2D` accepts existing NodeOptions plus optional id, tags,
  layer and synchronous node-bound update. IDs are unique while attached; tags
  are copied. The initial/default layer is named `world`.
- `find(id): Node2D | undefined`; `query({ tag? } = {}): Node2D[]` return snapshots
  of indexed, live, attached nodes. This is a small scene-local index, not an ECS.
  Nodes added directly through roots are advanced unmanaged nodes and are not indexed.
- `prepare({ signal })`, `update(dt, frame)`, `drawWorld(ctx, frame, camera)`,
  `drawScreen(ctx, frame)` and idempotent synchronous `dispose()` allow explicit
  integration. A View draws world content with its camera and screen content in
  its overlay. `createApp` provides this adapter. A Stage has its own real Camera2D and world draw method, but no implicit view
  or RAF registration; its screen tree still uses a View overlay.

Insertion determines layer order. Screen layers render after world layers on the
**same canvas**. World and screen nodes update once through their existing Scene2D
trees. Sorting occurs after node updates and before drawing; only a changed order
rearranges child ownership. `'y'` sorts direct children by local Y, assuming their
origins represent their feet. Equal Y retains the existing relative order. Custom
comparators should be pure. Multipart art can be children of one sorted parent.
Layers are presentation groups, not physics/query memberships.

Node transforms and tree ownership retain the existing contract: `detach()` transfers
responsibility to the caller, who must reattach or dispose the node. Stage disposal
releases attached nodes, not nodes deliberately detached into caller ownership.
Disposing an indexed node unregisters its metadata immediately.

`parallax` is a camera-translation factor, applied while drawing world layers. Zero
ignores camera translation; 1 follows the normal world. Zoom still applies. It is
for decorative layers: world picking/physics does not incorporate the visual parallax
shift. Each draw supplies its camera explicitly; no global camera or extra canvas.
Finite/repeating artwork is independent of parallax. This experiment keeps artwork
sizing, repetition and edge policy in ordinary drawing callbacks; it does not invent
an image convenience before an asset-size/edge contract has been chosen.

## Camera follow

```ts
import { followCamera } from 'rocket-engine-v2/experimental';
// Call after movement, in the existing update callback:
followCamera(app.view, hero, dt, {
  halfLife: 0.12, // seconds; zero snaps
  bounds: { x: 0, y: 0, width: 1800, height: 480 },
});
```

This function changes the existing view.camera. It centers the subject's world origin;
zoom remains directly configurable. Bounds constrain the desired viewport origin;
levels smaller than the viewport are centered. Smoothing exponentially approaches
that constrained target, so a camera already outside bounds settles back rather than
snapping. There is no second clock, hidden input registration or character movement.
Half-life units stay meaningful across refresh rates. Existing Cameras controllers
remain independently available; consumers should choose one writer for a camera.
Platformer dead zones, orbit/framing, first/third-person presets are not implemented.

## Scene navigation

```ts
import { Rocket, Scene2D } from 'rocket-engine-v2';
import { SceneNavigator } from 'rocket-engine-v2/experimental';
const engine = new Rocket();
const routes = engine.scene(new SceneNavigator());
routes.add('home', { retain: true, create: () => new Scene2D(homeOptions) });
routes.add('play', { create: () => new Scene2D(playOptions) });
engine.view({ target: '#game', scene: routes });
await routes.run('home');
await engine.start();
await routes.run('play');
await routes.previous();
await engine.dispose();
```

`add(id, { create, retain? }): this` registers a synchronous scene factory; duplicate
or empty IDs reject. Default routes create fresh instances on each visit. Retained
routes prepare once and preserve state between visits. Factories must return distinct
new instances; do not share mutable scenes between applications/navigators.
`current`, `scene` and copied `history` are observable. `run(id)` and `previous()`
return completion Promises; previous with empty history and unknown routes reject.
Only successful commits update history. Reopening the same ID does not add a duplicate
history entry. Preparation errors leave the current scene/history intact. A newer
request aborts the pending preparation; the old active scene keeps updating/drawing
while the new one loads. A cancelled candidate is disposed after its prepare settles.
A loader must honor AbortSignal if prompt cancellation is needed.

At commit the new scene becomes active. An outgoing fresh scene is disposed; a
retained one is inactive without being disposed. Cleanup failure rejects the navigation
Promise **after activation** and does not claim a rollback. Dispose aborts preparation,
waits for candidate cleanup, releases every retained/active instance once and returns
the same Promise on repeated calls. There is no independent animation loop.

Fixed scenes require **both** `new Rocket({ fixed: … })` and
`new SceneNavigator({ fixed: true })`; otherwise they reject instead of silently
losing ticks. The navigator forwards ordinary/fixed updates and draw only to the
active scene. It does not suspend the entire engine during a transition. The second pass adds activeChildren, onChange/onDispose and facade wiring; see the
activation contract. Explicit enter/leave/pause/resume hooks, transition animations,
nested routers and transactional
rollback of external side effects are left out pending a clearer lifecycle contract.
Route preparation signals cover loading, not the lifetime of the active scene.
