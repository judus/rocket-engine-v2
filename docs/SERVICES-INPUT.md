# Services and input — implemented slice

Optional synchronous application services, frame-domain keyboard actions and primary-pointer snapshots. Plain animations still install nothing. TypeScript, type-aware lint and formatting checks cover this slice.

```ts
const app = new Rocket();
const input = app.use(Input); // one instance per application/class
let controls: InputScope<'toggle' | 'left'>;
const scene = app.scene(
  new Scene2D({
    update(dt) {
      if (controls.pressed('toggle')) machine.toggle();
      if (controls.down('left')) machine.moveBy(-100 * dt, 0);
    },
  }),
);
controls = scene.own(
  input.scope(scene, {
    toggle: 'Space',
    left: ['ArrowLeft', 'KeyA'],
  }),
);
const main = app.view({ target: '#main', scene });
const detail = app.view({ target: '#detail', scene });
const mainInput = controls.bind(main);
const detailInput = controls.bind(detail);
await app.start();
```

The machine is an ordinary injected collaborator. Factories and behaviors do not fetch application services through a global locator. A behavior can receive controls in its constructor or closure; it reads the same frame snapshot as the scene hook.

## Service contract

`app.use(ServiceClass)` constructs an optional no-argument class once and returns that instance on repeated setup calls. Installation/retrieval through use() requires a stopped, live application. Keep the returned reference and inject it into consumers. Constructor configuration, dependency graphs, async installation and scene service registries are deferred.

A service may implement synchronous `start(activeScenes)`, `stop()`, `beforeUpdate(frame, activeScenes)`, optional `beforeFixedUpdate(tick, fixedScenes)` and `dispose()` hooks. Service start follows scene preparation. Hooks run in installation order before scene updates; services stop/dispose in reverse installation order. A failed start rolls back started services. Stop during startup cancels activation. No separate service loop exists.

Frame order is service snapshots → scene hook → tree behaviors → all view draws. Rendering sees the same input snapshot through both views. Frame snapshots run before optional fixed steps; fixed-domain input and ordering are described in [FIXED-TIMING.md](FIXED-TIMING.md). Service work is included in the performance monitor's update CPU cost.

## Keyboard defaults

`input.scope(scene, bindings)` creates one shared action state for that scene. Bindings use physical KeyboardEvent.code strings, individually or as aliases. `down(action)`, `pressed(action)` and `released(action)` are typed by action name.

`controls.bind(view)` requires a live view of that scene and makes its canvas keyboard-focusable if it had no tabindex. Click/tap focuses that canvas; Tab is also supported. Keys are listened for on canvases, not globally on the document. Unbound keys, browser modifier shortcuts and composing keydowns keep their defaults. Bound plain keys prevent default scrolling only while input is running for a live scope. Existing canvas tabindex is respected.

Listeners record state; the service publishes snapshots before updates. Repeat keydown does not repeat a pressed edge. Releasing one alias while another is held does not release the action. A press/release between frames publishes both edges, even though down is false. Multiple presses of the same action within one frame coalesce into one pressed flag; this is not an ordered event log. Multiple consumers may read a flag during that frame; reading does not consume it.

Switching focus, blur, visibility changes, application stop/resume or disposal clear held keys and pending edges, avoiding stuck movement and delayed actions. A held physical key must be released and freshly pressed after losing focus. Inactive scenes discard pending input and cannot capture keys; a view belonging to another application does not enable this service scope. Install one shared scope for a scene's actions; routing/priority among overlapping scopes is deferred.

## Pointer defaults

Each returned ViewInput has a read-only `pointer` snapshot: `{world, down, pressed, released}`. `world` is null until a primary pointer has a usable position, then converted from client coordinates through that binding's view, including CSS scaling and its camera. Coordinates are calculated at snapshot time using the current camera. This is pointer state, not automatic object hit testing.

Only primary, left-button presses begin gestures. A press focuses the canvas and captures the pointer, so moving outside the canvas still delivers the drag. Release ends capture. Cancellation, lost capture, blur, stop, hiding and disposal cancel the gesture and clear flags/position. Secondary pointer cancellation cannot cancel the primary gesture. A short click publishes both pressed and released. Each bound canvas temporarily uses touch-action: none for gestures; disposal restores its previous value.

The arm demo performs hit testing on base positions itself, preserves the grab offset, and sends world-space movement commands to the selected arm. Keyboard movement uses seconds-based speed and normalized diagonals. Space toggles animation, rather than stopping the application; toolbar Pause still pauses the complete runtime. Dragging changes the arm in the tree update, never in a DOM callback or draw callback.

## Ownership and cleanup

- Application owns installed services. Its final cleanup removes views, disposes scenes, then disposes services.
- Scene2D.own(resource) accepts a synchronous cleanup function or object with dispose(). Scene cleanup destroys its tree, runs its custom disposal hook, then releases owned resources in reverse order.
- View.own(resource) releases resources before removing/releasing its canvas. controls.bind(view) automatically owns its binding through that view.
- The scene owns the input scope; the service retains a registry until the scope closes. Closing the scope unbinds all remaining views; closing one view removes only that binding.

Cleanup is idempotent and continues after failures with aggregated errors. Identical resources registered twice within one ownership scope clean up once. Native async cleanup is rejected; node/scene resource cleanup cannot suspend. Application-level scene disposal remains the existing asynchronous boundary.

DOM listeners and pointer capture are explicitly released. Tabindex and touch-action changes are restored. Application restart installs a fresh input service and bindings without retaining the previous handlers. Plain scenes can dispose their scope in their existing dispose hook instead of using Scene2D.own().

## Verification and limits

The input slice passed 44 contract tests at delivery; the asset slice raised the complete suite to 51. New tests cover shared keyboard actions through two views, aliases, short taps, repeat suppression, focus transfer, hidden/pause resets, modifier/composition defaults, view-specific camera/CSS conversion, capture/cancellation, secondary pointer handling, listener cleanup, ownership ordering, cleanup errors and startup cancellation. Browser checks cover focus, shared Space actions from both canvases, dragging through both cameras, selection, replacement/restart and pause/resume.

Deferred: wheel input, key chords, pointer event histories, multitouch gestures, gamepads, drag/drop controllers, focus routing across overlapping scopes, async service lifecycle. Fixed-domain snapshots are now described in [FIXED-TIMING.md](FIXED-TIMING.md). Image leases are now implemented separately in [ASSETS.md](ASSETS.md). This slice is not a cross-browser, mobile-device or accessibility certification.
