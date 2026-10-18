# Game examples

Rendering and feature probes stay in `examples/` and the existing root pages. Small assembled games live here. Build with `npm run build`, serve the repository on port 8092, then open `/games/`.

The current games are [platformer](platformer/index.html) and [top-down salvage](top-down/index.html).

## First slice: attached capabilities

The platformer uses the existing Rocket facades and entity tree:

```ts
const app = createApp({ runtime: { fixed: {} } });
const solver = app.stage.layer('world').attach(
  new PlatformerSolver({
    platforms: [{ x: 0, y: 480, width: 2400, height: 60 }],
    gravity: 1400,
    bounds: { left: 0, right: 2400 },
  }),
);

class Fighter extends Node2D {
  readonly body = this.attach(
    new PlatformerBody({
      width: 24,
      height: 32,
      solver,
    }),
  );
  readonly movement = this.attach(
    new PlatformerMovement({
      body: this.body,
      speed: 180,
      runSpeed: 300,
      jumpSpeed: 600,
    }),
  );
}

const hero = app.stage.entity(() => new Fighter({ x: 80, y: 480 }));
hero.movement.move(1);
hero.movement.jump();
```

`attach<T>()` returns the same concrete instance: TypeScript infers `PlatformerMovement` without casts or string lookup. `stage.entity()` preserves the concrete entity type and shares the existing stage's layer, ID, query and lifetime machinery. Simple drawn entities still use `stage.add()`.

Input and AI supply intent through the same movement methods. Rocket runs the attached fixed work; the game does not manually step each character. `main.ts` connects player input through `app.input()`. The courier instead attaches `Patrol`.

## Configurable platformer pieces

- `PlatformerBody({ width, height, solver })` owns shape, velocity, grounded state and fixed-step count. Its position is the centre of the character's feet, with positive Y down. It claims the entity's position writer and registers/unregisters with its solver on attachment/disposal.
- `PlatformerMovement({ body, speed = 180, runSpeed = 300, jumpSpeed = 600 })` only maps intent to horizontal velocity and jump requests. It has a same-entity body dependency, no platform list, dimensions, collision checks or position writes. Airborne jump presses are not buffered. Removing movement stops horizontal drive; a retained body still falls.
- `PlatformerSolver({ platforms, gravity, bounds: { left, right } })` is attached once to the common world layer. It applies gravity and resolves collisions for that layer's bodies using their configured dimensions. Geometry is validated and copied at construction. Physics settings use local pixels and seconds.

The player is 24×32 with speed/run/jump settings 180/300/600; the courier is 40×48 with settings 150/240/650. Both use the same capability classes and one solver. `main.ts` configures them through `stage.entity()`. Their visuals use the same dimensions as their collision boxes for this example; sprites need not match collision bounds in a game.

Fixed work runs in this order: input hook → AI intent (-20) → movement (-10) → shared solver (0) → travel observation (10). No additional clock or per-character manual stepping is needed.

This is a deliberately small game-level solver, not a universal physics controller. Bodies must be direct children of their untransformed solver layer; platforms are static axis-aligned boxes. There are no body/body collisions, slopes, moving platforms or rotation. Detached bodies stop simulating; moving a body into another world does not silently rebind its solver. Recreate it with the new solver. Disposing a body unregisters it, and disposing the solver invalidates retained body/movement commands. Configuration is supplied at construction; recreate components to change their configuration.

The existing input platformer and this game now share the same pure collision calculation in `solvePlatformer.ts`; the old input demo keeps its input-testing interface. Existing engine physics services remain independent. Further game examples will show which modules deserve an engine catalogue.

## Engine contract

- `onAttach(node)` initializes synchronously. The handle is published only after success. Failed setup invokes cleanup and retires that instance. Structural mutation of the mounting subtree is forbidden during setup.
- `fixedUpdate(dt, frame, node)` runs on Rocket's existing fixed clock. The facade enables this path with `runtime.fixed`; it creates no second clock. Direct `Stage2D` users opt in with `fixed: true`; direct `Scene2D` users use `fixedBehaviors: true`. Newly routed stages must opt in too.
- Lower `fixedOrder` values run first across the **entire world tree**. Equal values retain tree traversal and attachment order. The scene's fixed hook runs first, allowing input intent to reach this tick's movement. Screen layers remain presentation only.
- `requires: [otherCapability]` is an explicit same-entity lifetime dependency, validated before setup. It prevents removing a dependency while dependents remain. It does not infer execution order: choose `fixedOrder` when ordered work is needed.
- `writes: [position2DWriter]` claims exclusive ownership of an entity's position calculations among cooperating capabilities. Conflicts fail before setup. This is a contract, not a proxy preventing arbitrary writes to public transforms.
- `remove(capability)` disposes that capability and releases its claims. `entity.dispose()` removes its tree membership and disposes capabilities in reverse attachment order. A capability instance cannot be reused. Built-in example movement commands reject detached/retired handles; custom capabilities must enforce their own command lifetime.
- Fixed work snapshots registrations at pass start. Work added during a pass starts next tick. Removed, detached, reparented or disposed entries from that snapshot are skipped. Exceptions stop the pass with owner context and propagate to Rocket's existing error handling.

`TravelLog` demonstrates an observer with a movement dependency and a later fixed order. The courier button demonstrates whole-entity removal and recreation. Tests cover both, shared ordering, registration changes, conflicts, setup failures and stale handles.

This slice adds no generic command bus, multirate scheduler, dependency graph, serialization format or alternative ECS store. Render-rate behavior hooks and the existing ECS remain available for their respective jobs.

## Second game: top-down salvage

Open `/games/top-down/index.html`. WASD/arrows move north/south/east/west; Shift runs; F or **Collect nearby** collects the nearest reachable supply. Mouse buttons are not bound to gameplay actions. The scout patrols and collects on its own. Bag capacity counts item units. A full bag leaves the entire pickup in place; there are no partial transfers. Reset courtyard starts a fresh run.

The same Rocket facades and typed property pattern assemble the game:

```ts
const app = createApp({ runtime: { fixed: {} } });
const world = new TopDownWorld({
  bounds: { x: 24, y: 76, width: 912, height: 440 },
  obstacles: [{ x: 396, y: 200, width: 168, height: 140 }],
});
const player = app.stage.entity(
  () =>
    new Explorer({
      x: 80,
      y: 420,
      color: '#8ce4cf',
      world,
      pickups: () => pickups,
      width: 24,
      height: 24,
      speed: 180,
      runSpeed: 280,
      capacity: 6,
    }),
);
player.movement.move(1, 0);
player.interaction.request();
player.inventory.count('cell');
```

`Explorer` attaches four independently configured capabilities:

- `TopDownBody({ world, width, height })` owns centre-origin position integration and collision dimensions. It uses the shared `TopDownWorld` calculation; there is no gravity, world registry or extra clock. The world contains copied, validated static rectangles and bounds. Swept X-then-Y resolution blocks walls and allows sliding.
- `TopDownMovement({ body, speed, runSpeed })` translates directional intent to body velocity. It preserves analog magnitude and normalizes diagonal input to avoid extra speed. It depends on its body, not inventory or pickups. Removing movement stops drive without removing the body or bag.
- `Inventory({ capacity })` holds item-unit counts. It depends only on the entity lifetime, has no fixed work, and knows nothing about movement, physics or item locations. Add/remove operations validate quantities and either complete the entire request or leave the bag unchanged. This small game-example capability lives in `games/shared/`; it is also tested on the platformer Runner. It is not a production, crafting or equipment system.
- `PickupInteraction({ body, inventory, pickups, canReach, radius })` is the game rule combining spatial access and storage. A request is processed after movement and physics. It picks the nearest reachable supply in the same layer, checks capacity and disposes the collected entity. Rocket's existing `sweepPointAabb` helper checks that no wall blocks the reach. Two characters cannot collect the same entity.

The player is 24×24, moves at 180/280 px/s and carries 6 units. The scout is 34×30, moves at 110 px/s and carries 3. `SupplyPatrol` supplies the scout's intent at order -20, movement runs at -10, bodies at 0, and interaction at 10. Player intent comes from `app.input()` in the stage fixed hook. No per-character stepping is wired by the game.

Removing the scout disposes its capabilities; recreating it creates a new empty bag. Already collected supplies remain collected. Inventory observations remain readable after retirement, but all mutations and movement/interaction commands reject retired handles. Detached entities receive no fixed work from their old tree. The game owns its current supply list; disposed entries are ignored during searches.

This example uses untransformed coordinates in one common world layer, static axis-aligned obstacles and no character/character collisions. Its waypoint route is explicitly clear of obstacles; it is not a pathfinding implementation. The dashed circle shows interaction range, not a physical collider. Configuration is supplied at construction.

What is actually shared so far: Rocket's entity/fixed-order/lifetime machinery, a tested inventory capability and the existing segment intersection helper. The two games retain different movement and collision semantics. This is evidence for a small capability catalogue, not a reason to introduce a universal body/controller hierarchy yet.
