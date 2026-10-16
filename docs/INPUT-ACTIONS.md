# Input actions and control presets

The Input service owns physical events, frame snapshots, capture, focus loss and
cleanup. `ActionContext` adds named actions and handlers over that same service;
it does not create another event loop or keyboard implementation. The spaceship
is unchanged; these basics have independent first-person, top-down, side-view platformer, belt-scroller and free-flight demos.

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
controls.map('reload', 'KeyG'); // change binding without changing the function
```

`firstPersonInput` defines forward/right axes, mouse look X/Y (radians per frame,
0.003 rad/pixel), keyboard turn/tilt, sprint, crouch, jump, reload, fire and reset.
W/S means facing-relative forward/backward; the game applies the camera/actor basis.
Shift sprints, Ctrl crouches, Space jumps, R reloads, Mouse0 fires, Ctrl+R resets.
Arrow keys allow keyboard turning. Movement, physics, jumping and weapons are
implemented by the demo/game, never the preset.

`topDownInput` defines north/east axes (W/D positive, S/A negative, arrow aliases),
sprint, interact (F), fire (Space) and reset (Ctrl+R), with focus activation and a
visible cursor. Positive north is an intention; in the demo's Y-down canvas it
subtracts from Y. The presets include no combat or collision domain systems.

`platformerInput` defines a horizontal axis (A/D and left/right arrows), sprint
(Shift), jump (Space or Up) and reset (Ctrl+R). It uses focus activation with a
visible cursor. There is no north/south axis. Jump is a press action: holding it
or browser key repeat cannot repeatedly jump. A game may remap it normally.
The demo consumes jump requests in Rocket's fixed update and owns gravity,
solid ledges, grounded checks and camera scrolling. Midair presses are ignored;
a fresh press after landing is required. These are demo rules, not preset policy.

`beltScrollerInput` adds independent horizontal (A/D, left/right) and depth
(W/S, up/down, positive toward the far edge) axes, sprint (Shift), jump (Space),
attack (Right Ctrl or Mouse0) and reset (Ctrl+R). Up means ground movement, not jump. Jump and attack
are press actions. It uses the same focus activation, remapping and UI isolation.

The Golden Axe-style demo owns a bounded ground plane, normalized diagonal
movement, separate jump height/gravity, eastward scrolling and ground-depth draw
order. The shadow stays at ground position when airborne; movement can continue
in the air. Decorative actors demonstrate occlusion rather than collision. Attack
is a brief visual preview with an event counter; no damage or combat is implied.
The preset owns none of those game rules. Virtual controllers use the same named actions.

`flightInput` defines forward (W/S), right (D/A), local up (Left Alt/Ctrl), yaw
(left/right arrows), pitch (up/down arrows), roll (E/Q), boost (Shift), reset
(Ctrl+R), and relative mouse look X/Y (0.003 rad/pixel). It defaults to focus
activation for complete keyboard-only flight. The demo offers an explicit mouse
capture checkbox; arrows still work with capture on. Mouse capture is optional,
and a refusal is shown rather than silently changing modes.

The flight demo owns its local right/up/forward frame and speed policy. Translation
follows all three craft-local axes, including after rolling or flying upside down.
Rotations use the current local axes with no pitch clamp or angular inertia.
Translation approaches 7 units/s (18 boosted) with exponential acceleration/braking;
diagonal intent is normalized. Pointer angles apply once per update without dt.
Rendering converts landmarks into that same local frame, then uses the existing
perspective/clipping/Canvas renderer. There is no new engine camera or clock.
The floor grid and gates are visual references, not collisions or world bounds.
Opening the HTML UI clears game actions while braking and world time continue.
This is an assisted free-flight example, not aerodynamic or Newtonian simulation.

## Shared game actions and keyboard defaults

All presets expose `interact` (press F) and `health` (press Tab). These are named
intents: the demo logs/counts them; the game decides whether to open a panel,
consume an item, talk, dock, etc. No health/inventory domain is implemented here.
Tab is prevented while game input is connected, preserving canvas focus. A disabled
game context leaves normal HTML Tab navigation alone.

| Preset        | Attack/fire                           | Jump       | Local thrust up/down |
| ------------- | ------------------------------------- | ---------- | -------------------- |
| First-person  | Mouse0 (`fire`, hold)                 | Space      | —                    |
| Top-down      | Space (`fire`, hold)                  | —          | —                    |
| Platformer    | Right Ctrl / Mouse0 (`attack`, press) | Space / Up | —                    |
| Belt-scroller | Right Ctrl / Mouse0 (`attack`, press) | Space      | —                    |
| Flight        | Space / Mouse0 (`fire`, hold)         | —          | Left Alt / Ctrl      |

Both Shift keys still run/boost. Physical `ControlRight` is distinct from
`ControlLeft`; attacking in the two jumping 2D presets neither jumps nor sprints.
Their Ctrl+R reset chord remains available (pressing Right Ctrl itself still means
attack). Mouse bindings are alternatives, not a requirement. All mappings remain
replaceable. The demo remapping example uses G, leaving F for interaction.

Top-down deliberately leaves the left mouse button unbound for future area
selection/marking. No selection action or behaviour is installed yet. Space is
its sole default fire binding; other presets retain their mouse alternatives.

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
  recreation and live remapping (jump to G and back). The UI disables controls
  while gravity and world time continue.

- `/input-belt-scroller.html`: Golden Axe-style ground depth plus independent
  jumping, shadow, depth-sorted decorative actors, attack preview and eastward
  scrolling. Includes remapping jump to G, a UI context and recreation cleanup.

- `/input-flight.html`: keyboard-first six-axis free flight, full pitch/yaw/roll,
  optional mouse look, gates and a world-axis orientation guide. Includes boost
  remapping, HTML UI isolation and recreation cleanup. The existing spaceship
  demo remains separate. Virtual controls can be enabled alongside keyboard controls.

This slice does not implement a key-recording/rebinding editor, persisted player
profiles, gamepad mappings, context priority stacks or the spaceship UI.
Those can build on the same action/mapping contract after the basic API is tested.

## Verification for this slice

`npm run check`: strict TypeScript, lint, formatting, full tests and coverage gate.
Browser checks: north/east motion, first-person forward movement before/after
turning, reload and interact callbacks, short mouse clicks and hold release, remapping, Ctrl+R priority without reload,
HTML text-entry isolation with continuing world time, and recreation with exactly
one canvas and one activation bar. Successful Pointer Lock still needs native
Chrome verification; the embedded-browser refusal path was checked explicitly.

Flight verification includes normalized translation, 30/144 Hz acceleration and
braking agreement, local movement after yaw/roll, full loops, 5000 combined
rotation updates, pointer delta timing, and context/remapping/reset cleanup.
Browser checks cover forward motion, roll/local-up, keyboard yaw/pitch, boost
remapping, UI isolation and recreation. Captured mouse deltas plus keyboard axes
are checked with the deterministic capture host. The embedded browser refuses
native Pointer Lock; successful mouse-flight interaction still needs Chrome.

## Virtual sticks and button containers

Import `rocket-engine-v2/input/style.css` (the demos use `src/virtual-controls.css`).
The game owns placement: each mount targets an ordinary HTML container. Combine
one/two sticks with any number of button groups, or mount everything together.
Bind the viewport first. Touch does not require Pointer Lock; use focus capture.

```ts
const controls = app.use(Input).actions(scene).use(platformerInput);
controls.bind(view, { capture: 'focus' });
const move = controls.virtual({
  target: leftContainer,
  sticks: [{ label: 'Move', x: 'horizontal' }],
});
const actions = controls.virtual({
  target: rightContainer,
  buttons: [
    { label: 'Jump', action: 'jump' },
    { label: 'Attack', action: 'attack' },
    { label: 'Run', action: 'sprint' },
  ],
});
// Flight: mount a second stick in rightContainer with x:'yaw', y:'pitch'.
// Mount Up/Down, Roll, Fire, etc. into other containers wherever the game needs.
```

`virtualInputLayouts` supplies templates for all five existing presets. The demos
show a Virtual controls checkbox, enabled initially for coarse-pointer devices.
Each stick has positive X right, positive Y up, normalized radial travel and a
configurable dead zone (default 0.15). Stick values are continuous action axes,
not mouse delta angles: first-person look maps to turn/tilt; flight to yaw/pitch.
Buttons hold an action until released; press actions fire once per gesture and
retain short taps between frames. Axis buttons can set a signed value, e.g.
`{ label: 'Down', action: 'up', value: -1 }`.

Independent pointer IDs let movement, rotation and buttons operate together.
Each control captures its pointer; pointerup releases its own contribution,
pointercancel/lost capture clears it. Page blur, visibility changes, UI disable,
scene exit, stop, remap and disposal reset sources and visible controls. After
cancellation the old pointer cannot resume a hold: a new gesture is required.
Only the controls disable browser touch scrolling; the rest of the page scrolls.
Buttons also accept Space/Enter when focused. Dispose any returned controller to
remove its DOM and listeners; context/view/application cleanup also owns it.

For a custom device adapter, `controls.source()` returns an independent source:
`source.set('horizontal', 0.5)` or `source.set('jump', 1)`. `release()` releases its
values while retaining short press edges, `clear()` cancels them, and `dispose()`
retires the source. Axis contributions add and clamp to [-1,1]; button contributions
combine as held-or. Physical keys/mouse and virtual sources share the existing
frame dispatch and handlers. No synthetic keyboard/mouse events, new clock or
movement system is introduced. Remapping a physical key does not remap a virtual
control's named action; customize the virtual layout separately.

Automated verification uses simultaneous pointer IDs, dead zones, diagonal
normalization, held-source composition, short taps and cancellation/cleanup tests.
Desktop browser checks cover actual drag/button routing and responsive layouts;
physical multi-touch phone/tablet testing remains separate from those checks.

### Analog, digital and corner presets

A pad's `mode` is `'analog'` by default or `'digital'` for a D-pad. Both use the
same X/Y action names. Digital directions emit exactly -1, 0 or +1; diagonals
may emit both axes, like keyboard arrows, and the game's movement controller
normalizes them. Analog travel retains proportional magnitude. Unmapped D-pad
axes are dimmed and emit no action (e.g. vertical directions in a platformer).

`virtualCornerLayouts` provides mirrored presets for the five input examples.
Single-pad games start with a D-pad on the left and a primary button block on the
right. First-person/flight start with two analog pads and button groups above and
on their inner edges. The game can copy/change those data objects, or use
`createVirtualCornerPreset(virtualInputLayouts.flight, 'digital')` as a starting point.

```ts
const preset = virtualCornerLayouts.platformer;
const left = controls.virtual({
  target: leftContainer,
  corner: preset.left,
  theme: { color: '#ffffff', opacity: 0.75, size: 128 },
});
const right = controls.virtual({
  target: rightContainer,
  corner: preset.right,
});
left.setTheme({ color: '#a4e6db', opacity: 0.5 }); // partial, live update
```

A `corner` has `side: 'left' | 'right'`, and exactly one central `pad` or `face`
button group. `above` and `inside` accept arrays of button groups: add more groups
to stack them. Each group has `buttons`, an optional accessible `label`, and
`columns` (1–4). `inside` defaults to one column, `above`/`face` to two. Mirroring
moves the inner column, while the upper groups remain over the main pad/block.
Plain mounts can also use `groups` without any corner layout. Every region still
uses independent action sources, so one release/disposal cannot steal another's
held action.

The default appearance is neutral translucent white. `theme.color`,
`theme.opacity` (0–1) and `theme.size` (64–256 CSS pixels) provide simple changes.
The equivalent CSS variables are `--virtual-color`, `--virtual-opacity`,
`--virtual-size` and `--virtual-button-size`. Opacity applies to the whole control;
pad/button surfaces also have a faint translucent fill. CSS classes are public
styling hooks: replace the stylesheet or compose your own DOM/device adapter with
`controls.source()` when a preset is insufficient.

The input demos offer Pad (Preset/Analog/D-pad), Tint and Opacity controls. Pad
changes recreate the demo to cancel old gestures; tint/opacity update in place.
Tests cover analog/digital distinction, direction changes/dead zone, multiple
stacked groups, mirror metadata, live theme updates and all preset/action pairs.
