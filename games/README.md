# Game examples

Rendering and feature probes stay in `examples/` and the existing root pages. Small assembled games live here. Build with `npm run build`, serve the repository on port 8092, then open `/games/`.

## First slice: attached capabilities

The platformer uses the existing Rocket facades and entity tree:

```ts
class Runner extends Node2D {
  readonly movement = this.attach(new PlatformerMovement());
  readonly travel = this.attach(new TravelLog(this.movement));
}

const app = createApp({ runtime: { fixed: {} } });
const hero = app.stage.entity(() => new Runner(80, '#8ce4cf'));
hero.movement.move(1);
hero.movement.jump();
```

`attach<T>()` returns the same concrete instance: TypeScript infers `PlatformerMovement` without casts or string lookup. `stage.entity()` preserves the concrete entity type and shares the existing stage's layer, ID, query and lifetime machinery. Simple drawn entities still use `stage.add()`.

Input and AI supply intent through the same movement methods. Rocket runs the attached fixed work; the game does not manually step each character. `main.ts` connects player input through `app.input()`. The courier instead attaches `Patrol`.

The movement capability intentionally reuses the small static-platform solver from the input demo. This is a game example, not a universal physics controller: fixed platforms, axis-aligned boxes, local pixel coordinates, no slopes or moving platforms. Existing physics services remain independent. Building further games will show which movement implementations deserve a shared catalogue.

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
