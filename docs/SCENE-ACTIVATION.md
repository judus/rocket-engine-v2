# Scene activation and lifetime — second experimental pass

Branch: `experiment/api-ergonomics`. This changes experimental internals as well as
convenience syntax. Main is untouched by this pass.
Demo: [two interactive scenes](http://127.0.0.1:8092/scene-composition.html).

## One activation contract

A registered **root scene** owns preparation, simulation delegation and disposal.
`Scene.activeChildren?(): readonly Scene[]` declares which delegated child scopes are
currently active. It is synchronous. Rocket expands that graph for services, including
ordinary and fixed-update input snapshots. Cycles reject visibly. Rocket still prepares,
updates and disposes registered roots only: publishing a child never gives it a second
update or a second owner. A parent must delegate those operations itself. Do not also
register its managed children as independent roots.

A composite scene calls `engine.refreshScenes()` after committing a change to its
active children. Running services receive `scenesChanged(activeScenes)` immediately,
including between RAF callbacks. This hook is synchronous and does not publish another
input snapshot or advance a clock. Regular service start/beforeUpdate/beforeFixedUpdate
also receive the expanded active scope set. Stopped/disposed apps require no refresh;
service.stop already suspends them, and start rebuilds membership.

Services remain app-scoped. Scene resources and bindings remain scene-owned. A switch
does not restart the Input service or construct another scheduler; services use the
activation set to enable scene-specific work. Existing scenes without activeChildren
and services without scenesChanged retain their ordinary behavior.

Input resets departing **and entering** scopes on the boundary, clearing held keys,
queued edges, pointer snapshots and captures. Inactive scopes cannot accept DOM input.
A physically held key must be released and pressed again after a switch. Several
retained/candidate scopes can bind the same canvas: shared attribute ownership restores
tabindex/touch-action only when the last binding retires, independent of disposal order.
Cameras also reconciles activation through scenesChanged. Custom services can implement
the same optional hook without depending on the experimental navigator.

## Friendly named navigation

```ts
import { createApp, Stage2D } from 'rocket-engine-v2/experimental';

const app = createApp({ target: '#game', autoStart: false });
function makeRoom() {
  const room = new Stage2D({
    update(dt) {
      if (keys.down('right')) hero.x += 200 * dt;
    },
  });
  const hero = room.add({
    id: 'hero',
    draw(ctx) {
      ctx.fillRect(-8, -24, 16, 24);
    },
  });
  const keys = app.input(room, { right: 'KeyD' });
  return room;
}
app.addScene('bridge', { retain: true, create: makeRoom });
app.addScene('hangar', { create: makeRoom });
await app.run('bridge');
await app.run('hangar');
await app.previous();
await app.dispose();
```

The facade wires one Rocket, one navigator and one View. Consumers do not assemble a
second stack. `addScene(id, StageRoute)` registers a Stage2D factory; `run(id)` and
`previous()` select/load and start the engine unless explicitly paused. With
`autoStart:false`, ready means configured, not loaded: await run/resume for startup.
A parameterless resume selects the default route if nothing is active.

The existing callback createApp path is the retained route named `default`. Synchronous
`app.stage` access before startup returns that initial stage, preserving progressive
node setup. Automatic ready waits for an already-requested route when one was selected
synchronously, otherwise loads default. It continues to describe the initial attempt;
superseding that initial load can reject ready with cancellation. A failed default
instance is retired; dispose/recreate that small app rather than retrying a disposed
preconstructed stage. Named factories provide the fresh-instance retry path.

`app.stage` returns the currently selected Stage2D; `app.current` is its route ID.
`app.navigator`, `app.engine` and `app.view` retain advanced access. Input is configured
once before startup; app.input(room, bindings) creates an ordinary InputScope, binds
it to the shared presentation and puts its scope/binding in room.world's ResourceScope.
There is no caller-supplied boolean that bypasses engine scene membership.

Stage2D publishes its world/screen Scene2D scopes and implements world drawing with its
own real `camera: Camera2D`. View.camera now accepts a Camera2D reference. On commit,
the facade points the View at that room's camera and refreshes service scopes. Retained
rooms preserve their node and camera objects; fresh factories start with new objects.
Screen layers use the same View overlay/canvas and remain in logical screen pixels.
Explicit multi-view users can still call drawWorld with each view's camera and drawScreen
in each overlay. For a directly registered Stage2D, assign view.camera = stage.camera;
the facade supplies that wiring automatically.

## Transition and retirement semantics

SceneNavigator publishes only its active child. Retained inactive rooms are owned but
not active. Candidate loading does not replace the active room or receive input.
A successful commit changes the scene and history, then synchronously calls
`onChange(current, previous)`. The facade swaps the camera and refreshes scopes here,
before an outgoing fresh scene is disposed. Failed loads leave active state/history
unchanged. A newer request aborts the candidate; its eventual resources are retired
once after prepare settles. Loaders must honor AbortSignal for prompt cancellation.

New NavigatorOptions hooks `onChange` and `onDispose` are synchronous. A throwing
activation observer does not promise to roll back a committed route or skip outgoing
cleanup: notification and cleanup failures are aggregated. Final cleanup still runs
the owned onDispose hook after scene cleanup failures. The shared disposal completion
is reserved before callbacks can re-enter it. Disposal immediately publishes no active
children, notifies scopes with current=null and blocks update/draw/fixed delegation;
then it waits for outstanding preparations and releases all owned instances once.

For an explicit low-level stack:

```ts
const nav = new SceneNavigator({ onChange: () => engine.refreshScenes() });
engine.scene(nav);
// Register factories and a view as before; only roots are registered with Rocket.
```

The facade handles extra initial-stage/implicit-target cleanup through onDispose.
`app.pause()` suspends input and callbacks; it does not cancel a background candidate.
`app.dispose()` aborts loading and waits for retirement. Fixed scenes retain the existing
explicit opt-in on both Rocket and SceneNavigator; this Stage2D facade uses ordinary
updates. No enter/leave hook hierarchy, nested routing syntax, transition animation,
collision sugar, camera preset catalogue or generic render graph was added.

## Verification

Full strict/format/build/test/coverage gate: 460 tests after this pass. Existing coverage
floors were not lowered. Shared browser fixtures were extracted so old input tests and
new integration tests exercise the same DOM/event boundary.

Tests cover actual named-app input, no duplicated simulation, fixed child scope
visibility, immediate key reset, retained identity, fresh reset, failed/superseded
loading, pause/resume, activation cycles, shared canvas attributes, and immediate
retirement while a noncooperative load is pending. Observer/cleanup failures preserve
resource retirement and shared completion identity.

Browser evidence: held D + 2 switches Bridge to Hangar with x=360 and input idle;
return restores Bridge around x=517. Failed Hangar load keeps Bridge, retry succeeds,
and the active room moves while another loads. Cancelling retires that candidate.
Dispose during loading: 2 created / 2 disposed / 0 live, zero canvases and no console
errors. Focused Chromium evidence is not a browser/device acceptance matrix.
