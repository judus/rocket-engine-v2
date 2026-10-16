# Optional fixed-step timing

Enable the fixed lane explicitly. Ordinary scenes and demos retain their existing frame-domain timing and need no configuration.

```ts
const app = new Rocket({ fixed: { step: 1 / 60, maxSteps: 5 } });
const input = app.use(Input);
let controls: InputScope<'jump'>;
const scene = app.scene(
  new Scene2D({
    fixedUpdate(dt, tick) {
      if (controls.fixed.pressed('jump')) actor.jump();
      actor.advance(dt); // one owner advances the simulation
    },
    update(dt, frame) {
      // Presentation behaviors and synchronization run once per browser frame.
    },
  }),
);
controls = scene.own(input.scope(scene, { jump: 'Space' }));
const view = app.view({ target: '#world', scene });
controls.bind(view);
await app.start();
```

Plain scenes can implement `fixedUpdate(dt, tick)` too. Registering a fixed scene without enabling fixed timing throws. `fixed: {}` defaults to 60 Hz and five steps per frame. `step` is seconds, finite and at least one microsecond; `maxSteps` is an integer from 1 to 1000. Configuration is application-wide in this slice.

## Frame order

1. Services publish frame input with `beforeUpdate(frame, activeScenes)`.
2. For each due fixed step: services run `beforeFixedUpdate(tick, fixedScenes)`, then each still-active fixed scene runs `fixedUpdate(dt, tick)` in registration order.
3. Each active scene runs its ordinary update once; Scene2D then runs its existing tree behaviors once.
4. When the independent presentation cap admits a draw, all views render, including independent draw-only presentations of the same simulation data.

Fixed hooks are synchronous, enforced by TypeScript and runtime checks. Two views of one scene do not duplicate fixed steps. Activity is rechecked during catch-up; stop, disposal and errors suppress later work. Fixed-step CPU work is included in the optional performance monitor's update cost.

Node behaviors remain frame-domain. No fixed behavior hooks, physics solver, priorities or automatic interpolation are added. A host can advance its simulation in the scene fixed hook and synchronize presentation nodes in the ordinary update. Never advance the same state in both hooks.

## Catch-up and overload

The first frame after start/resume has zero elapsed time and no fixed step. Visible elapsed time feeds an accumulator. Run up to `maxSteps` whole steps; discard remaining overdue whole steps immediately, retaining only the fractional remainder. This prevents an ever-growing catch-up backlog. Under overload simulation time deliberately falls behind elapsed time: discarded time is not simulated later.

`tick` is a frozen `FixedFrame`: constant dt, integer tick number starting at one, and time equal to tick × step. `app.fixed` returns a frozen snapshot (or null when disabled): step, steps executed this browser frame, totalSteps, simulation time, fractional alpha and cumulative droppedTime in seconds. Alpha is available for consumer interpolation; the engine never interpolates transforms itself.

Stop and visibility changes clear the remainder and current-frame step count. Simulated time, total steps and overload totals remain until the app is replaced. Paused/hidden time is excluded. With no viewed fixed scenes, the accumulator is cleared and fixed time does not advance. All fixed scenes share one clock; separate scene clocks and catch-up of inactive scenes are deferred. The ordinary frame dt/time still include full visible delays, preserving existing animation semantics.

## Input domains

The existing `controls.down/pressed/released` and `binding.pointer` remain frame snapshots. Fixed consumers use `controls.fixed.down/pressed/released` and `binding.fixedPointer`.

Frame snapshots collect fixed edges into a bounded pending set. If a browser frame has no fixed step, the edges wait. The next fixed step publishes them once and clears the pending set; subsequent catch-up steps have no repeated pressed/released flags. Held state and pointer coordinates use the latest frame sample throughout catch-up. A short tap publishes pressed and released together even when down is false. Multiple taps before a step coalesce; this is not an ordered or timestamped event log.

Frame and fixed snapshots are independent: a frame consumer can observe an edge even when the fixed lane has not consumed it yet. Choose one domain to own a simulation action to avoid applying it twice. Repeated reads within one fixed step do not consume an edge. Pointer positions come from the originating view's last frame conversion and are not reconstructed historically for overdue steps.

Blur/focus transfer, pause, visibility changes, inactive scenes, scope disposal and view cleanup discard held/queued state. Cancelled pointer gestures discard pending fixed pointer edges. Dropped overload steps do not replay input later.

## Demo and checks

`/fixed.html` shows a fixed-step dot and an independent diagnostics canvas. Click its motion canvas or focus it and press Space to reverse direction. “Test 250 ms stall” deliberately blocks one browser task to exercise overload dropping; Pause/Resume excludes suspended time. Arm and tile demos remain available and keep frame-domain updates.

Strict TypeScript, lint, format, build and all 68 tests pass. Controlled clocks cover 60/144 Hz parity, service/fixed/frame/render ordering, catch-up limits/remainders, dropped time, pause/visibility baselines and stop/error guards. Input tests cover zero-step retention, keyboard/pointer short taps, held state, catch-up edge suppression, overload and blur/view/pause cleanup. These are timing contracts, not physics accuracy or cross-browser certification.

The fixed demo now exposes render caps down to 1 FPS alongside callback/render cadence and fixed-tick counters. Simulation is admitted per RAF, so a low render cap does not manufacture simulation overload. Actual RAF stalls still invoke the bounded catch-up/drop policy.
