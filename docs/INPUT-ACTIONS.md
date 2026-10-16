# Input actions and control presets

The Input service owns physical events, frame snapshots, capture, focus loss and
cleanup. `ActionContext` adds named actions and handlers over that same service;
it does not create another event loop or keyboard implementation. The spaceship
is unchanged; these basics have independent first-person, top-down and side-view platformer demos.

## Small API

```ts
const input = app.use(Input);
const controls = input.actions(scene);
controls.register('reload', 'press', () => {
  weapon.reload();
});
controls.map('reload', 'KeyR');
controls.register('fire', 'hold', ({ value, cancelled }) => {
  weapon.setFiring(value !== 0); // cancelled release is also value zero
});
controls.map('fire', 'Mouse0');
controls.register('move', 'axis');
controls.map('move', { negative: 'KeyS', positive: 'KeyW' });
controls.bind(view); // focus by default; engine supplies activation feedback
// scene.update: controls.value('move') * speed * dt
```

Handlers are synchronous, dispatched once per application update before scene
update. A handler may start game-owned async work without returning its Promise.
Press fires once per transition, not key repeat. Hold emits start/end (1/0),
including a tap entirely between frames. Axis emits a value every frame; opposing
buttons cancel to zero. Snapshots remain available through `value(name)` for a
host's fixed simulation; callback dispatch is not repeated per fixed step.

## Presets are ordinary action definitions and mappings

```ts
const controls = app.use(Input).actions(scene).use(firstPersonInput);
controls.on('reload', () => {
  weapon.reload();
});
controls.bind(view); // Pointer Lock and default feedback, no browser glue
controls.map('reload', 'KeyF'); // change binding without changing the function
```

`firstPersonInput` defines forward/right axes, mouse look X/Y (radians per frame,
0.003 rad/pixel), keyboard turn/tilt, sprint, crouch, jump, reload, fire and reset.
W/S means facing-relative forward/backward; the game applies the camera/actor basis.
Shift sprints, Ctrl crouches, Space jumps, R reloads, Mouse0 fires, Ctrl+R resets.
Arrow keys allow keyboard turning. Movement, physics, jumping and weapons are
implemented by the demo/game, never the preset.

`topDownInput` defines north/east axes (W/D positive, S/A negative, arrow aliases),
sprint, interact (E), fire (Mouse0) and reset (Ctrl+R), with focus activation and a
visible cursor. Positive north is an intention; in the demo's Y-down canvas it
subtracts from Y. The presets include no combat or collision domain systems.

`platformerInput` defines a horizontal axis (A/D and left/right arrows), sprint
(Shift), jump (Space or Up) and reset (Ctrl+R). It uses focus activation with a
visible cursor. There is no north/south axis. Jump is a press action: holding it
or browser key repeat cannot repeatedly jump. A game may remap it normally.
The demo consumes jump requests in Rocket's fixed update and owns gravity,
solid ledges, grounded checks and camera scrolling. Midair presses are ignored;
a fresh press after landing is required. These are demo rules, not preset policy.

## Bindings and combos

- A string is a physical `KeyboardEvent.code` or `Mouse0`/`Mouse1`/`Mouse2`.
- An array is alternatives: `['ShiftLeft', 'ShiftRight']`.
- A chord is `{ code: 'KeyR', modifiers: ['Control'] }`. Available modifiers:
  Control, Shift, Alt, Meta. Modifier state is resolved at event time, so short
  taps do not rely on guessing which keys overlapped during a frame.
- Among matching bindings for one physical button, the most specific chord wins.
  Ctrl+R therefore runs reset without also invoking ordinary reload. Releasing
  the modifier while R stays down does not create a fresh reload press.
- Equal-specificity mappings multicast deliberately; choose distinct bindings if
  that is not intended. Browser/OS-reserved shortcuts cannot all be overridden.
- Pointer axes use `{ pointer: 'x', scale: 0.003 }` (or y). Values are accumulated
  relative mouse deltas, not rates: apply them once without multiplying by dt.
- `map()` validates before changing a binding and cancels active actions/held
  physical state. The next press uses the new mapping; no stale hold survives.

## Context and capture lifecycle

An action registry is one application-owned, scene-scoped input context and supports one viewport.
Use `setEnabled(false)` when opening an interactive UI: active hold/axis handlers
receive zero with `cancelled: true`; capture releases. Typing into HTML fields
cannot activate the disabled context. Enable it and call `activate()` in a user
click handler to return. Whether the world pauses is entirely game-owned.

`bind(view)` supplies a small `.rocket-input-activation` status/button alongside
the canvas and wires click/Space activation. Preset choice selects capture mode.
`bind(view, { capture: 'focus' })` is an explicit keyboard-only override; it is not
a silent fallback from failed Pointer Lock. Capture errors remain visible.
Escape, window blur, hidden tabs, inactive scenes, stopping the app and disposal
clear held input. No held state is restored automatically when returning.

Dispose the context to retire its bindings and feedback. The application Input
service also owns all contexts and disposes them on app cleanup. Views own their
DOM binding/feedback, so independent view disposal remains safe. Handlers are
cancelled on context exit and handler failures do not prevent other cancellations
or cleanup. The existing `Input.scope()` API remains available for lower-level
snapshot consumers; existing demos keep their previous capture policy.

## Demos

- `/input-first-person.html`: simple 3D landmarks, frame-relative movement,
  crouch/jump visualization, reload/fire counters and action log. Mouse capture is
  the default. Uncheck Mouse capture for deliberate keyboard-only inspection in
  browsers which reject Pointer Lock (including the tested Codex embedded browser).
- `/input-top-down.html`: north/east movement, visible directional labels, hold
  and press actions. Both demos normalize diagonal movement, expose live remapping,
  an HTML text-entry context, a continuing world clock and recreation cleanup.

- `/input-platformer.html`: a side-view scrolling level with walk/run, jumping,
  solid ledges and a finish flag. Includes the same action inspector, UI context,
  recreation and live remapping (jump to F and back). The UI disables controls
  while gravity and world time continue. Belt-scrolling ground depth is a separate
  planned preset, followed by flight and virtual controllers.

This slice does not implement a key-recording/rebinding editor, persisted player
profiles, touch/gamepad mappings, context priority stacks or the spaceship UI.
Those can build on the same action/mapping contract after the basic API is tested.

## Verification for this slice

`npm run check`: strict TypeScript, lint, formatting, full tests and coverage gate.
Browser checks: north/east motion, first-person forward movement before/after
turning, reload and interact callbacks, short mouse clicks and hold release, remapping, Ctrl+R priority without reload,
HTML text-entry isolation with continuing world time, and recreation with exactly
one canvas and one activation bar. Successful Pointer Lock still needs native
Chrome verification; the embedded-browser refusal path was checked explicitly.
