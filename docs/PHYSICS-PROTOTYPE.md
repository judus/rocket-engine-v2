# Optional local physics service

Matter.js 0.20.0 is the first candidate, not a frozen core physics API. Its ordinary JavaScript implementation fits the native-module workflow without introducing a WASM loader. The optional service lives in `src/physics/matter.ts`, exported separately as `rocket-engine-v2/physics/matter`. Matter is a pinned optional peer dependency (and a local development dependency); `src/index.ts` imports neither. No Runner, Matter renderer or second loop is used.

The [Matter source](https://brm.io/matter-js/docs/files/src_core_Engine.js.html) shows collisionStart before position/velocity resolution. The prototype captures collisionStart/collisionActive pairs and derives semantic begin/end events only after Engine.update() returns. This is a concrete reason to keep backend event delivery behind a small adapter.

## Demo and flow

Open `/physics.html`: five falling boxes and one blue keyboard-controlled box, three static platforms and one nonblocking sensor, plus an independent diagnostics canvas. Spawn up to 40 active boxes, remove the oldest, remove the sensor, move the artwork camera offscreen, or reset the whole application.

Click or tab into the world canvas: A/D or Left/Right commands horizontal velocity; each Space press supplies one upward boost, including short taps buffered across zero-step frames. This is a thruster, not a grounded platformer jump. Blur clears held movement. The injected controller reads only fixed actions and a body, without an engine/service locator.

Rocket's fixed scene hook advances PhysicsWorld once at 1/60 seconds. The adapter converts seconds to Matter milliseconds and rejects larger steps in this prototype. Coordinates are canvas world units; gravity uses Matter's defaults, not a metres-based calibrated convention. Input commands run before the solver. Body velocities use world units per second; the adapter converts Matter's normalized base-tick velocities in both directions. Commands reject static/sensor bodies, nonfinite values and dead handles. Frozen velocity snapshots never mutate the body. Default air friction can damp commanded speed slightly. Contact callbacks run next; ordinary scene/node updates copy poses; both canvases then read state. Camera position never changes the set of physics bodies.

The demo's diagnostic scene has only draw(), so it advances no simulation. Hiding artwork moves the camera; it does not dispose the controller scene's last view. As elsewhere in Rocket, disposing the last controller view would suspend that scene. Keep simulation membership explicit when designing future cockpit/map presentations.

## Ownership and cleanup

Scene owns PhysicsWorld. Each presentation node owns one body handle through its behavior cleanup. The world also retains live handles and acts as final cleanup owner if a body has no node. PhysicsBody exposes identity, kind, dimensions and a frozen read-only pose; it exposes no native Matter object. Physics owns dynamic poses. Node transform edits cannot teleport bodies.

Node disposal removes its body and body-scoped subscriptions once. Sensors remain static and have no collision response. Removing a contacting body queues one end event with reason `removed` for surviving subscribers. Callbacks on a removed owner are suppressed. Subscriptions return synchronous idempotent disposal handles; a scene can own them separately. Removing a sensor releases its subscription even before final scene cleanup.

Application disposal removes views, cleans the scene subtree and subscriptions, then disposes the world. Final world disposal silently clears remaining bodies, semantic contacts, pending events, backend listeners, composites, native pairs and detector caches. Outstanding handles become disposed and release closures referencing native bodies. No teardown contact callbacks are emitted by final world disposal itself. Errors in node/contact cleanup are aggregated while other work continues.

## Contact contract and targeted removal

Callbacks run in the adapter's `contacts` phase after the solver. Reentrant stepping is rejected. Subscription order is preserved for each body; callback-time removals suppress stale begin delivery, and removal ends drain in the same post-solver queue. Listener failures do not abandon later listeners/events; an AggregateError reaches Rocket's normal frame-error handling after delivery.

The service tracks semantic contacts by stable body-pair IDs. Body removal now prunes only the native pair list/table, event lists and detector collisions involving that body, and updates the detector's body list immediately. Unrelated native pair identities, contacts and warm-start impulses remain intact. The cleanup helper uses Matter 0.20.0 runtime fields missing from its declarations; these are isolated in one file. Keep the backend pinned, and revalidate this contract before upgrades. Compound bodies and constraints would require additional ownership/cleanup rules and are not accepted through this rectangle-only API.

Contact order means post-solver delivery and subscriber attachment order per body; there is no promised sort order among different collision pairs. Final world disposal silently clears all native caches. `stats.cachedPairs` and `stats.cachedBodies` expose retained native counts for diagnostics, including after disposal.

No continuous collision detection, physics interpolation, forces, joints, collision filtering, metres convention, streamed terrain or backend-independent adapter interface is implemented. Fast small bodies can tunnel with a discrete solver. Backend selection remains provisional pending another use case.

## Consumer API

```ts
import { Rocket, Scene2D } from 'rocket-engine-v2';
import { PhysicsWorld } from 'rocket-engine-v2/physics/matter';

const app = new Rocket({ fixed: {} });
const world = new PhysicsWorld();
const scene = app.scene(
  new Scene2D({
    fixedUpdate(dt) {
      // Read fixed input and issue body commands here, before the solver.
      world.step(dt);
    },
  }),
);
scene.own(world);
const box = world.rectangle(100, 20, 28, 28);
box.setVelocity({ x: 120, y: 0 }); // world units / second
// Give the box to a presentation node that disposes it; world is final owner.
// Views draw scene state and never advance world themselves.
```

This is a scene-owned facility, not an app-wide `beforeFixedUpdate` service: it advances exactly when its controller scene does. Installation is explicit ownership plus an explicit fixed hook. The regular index remains free of the Matter import; plain animation consumers do not load physics. A backend-independent contract will follow demonstrated needs rather than a second abstraction around this single backend.

## Packaging and validation

The browser loads Matter's local packaged UMD build from node_modules; an import map maps the optional module's bare `matter-js` import to a tiny TypeScript browser bridge. Node tests resolve the same package through its CommonJS entry. There is no CDN dependency. Package consumers choosing this subpath must install `matter-js@0.20.0`; the optional peer does not force it onto core consumers. A production package/bundle is not defined yet.

All 78 emitted-JavaScript tests, strict TypeScript, type-aware lint and format checks pass. Physics tests cover resolved-pose contact ordering, node synchronization, sensor pass-through and platform rest without rendering, callback removal/end delivery, listener release, cleanup failures, surviving-contact deduplication, ownership guards and final disposal. Runtime integration proves one fixed solver step despite an independent diagnostic canvas, matching render state and camera-independent simulation.

New tests also cover seconds-based velocity at 60/120 Hz, native pair/impulse identity through removal, 240 unrelated removals against an unchanged settled-stack baseline, fixed input during bounded catch-up/overload, blur and native-cache cleanup.

Browser checks exercise falling/resting bodies, sensor counts, spawn/removal, sensor cleanup, offscreen artwork and reset with previous-world counts at zero. These checks do not establish production physics accuracy, stack capacity or cross-browser support.
