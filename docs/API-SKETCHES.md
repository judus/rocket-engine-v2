# API sketches

Status: proposals, not executable examples or a frozen interface. The plain animation and core views are now implemented; [RUNTIME.md](RUNTIME.md) is the authoritative available API. The initial node/behavior subset is implemented in [NODES.md](NODES.md); the richer services, layers and simulation snippets below remain future designs.

## Plain animation

```js
const app = new Rocket();
let x = 0;
const scene = app.scene({
  update(dt) {
    x = (x + 100 * dt) % 600;
  },
  draw(ctx, frame) {
    ctx.fillStyle = 'royalblue';
    ctx.fillRect(x, 100, 50, 50);
  },
});
const main = app.view({ target: '#main', width: 600, height: 400, scene });
await app.start();
```

Default clearing, logical dimensions and pixel-ratio handling belong to the view. Frame context separates elapsed presentation time, frame dt and interpolation alpha.

## Optional facilities

```js
const assets = app.use(Assets);
const input = app.use(Input);
const lease = scene.own(await assets.acquireImage('/machine.png'));
const controls = main.own(
  input.scope(main, {
    actions: { start: 'KeyR' },
  }),
);
main.own(controls.onPressed('start', () => machine.start()));
```

`use` installs/retrieves; `services.get` retrieves only installed facilities; factories on those facilities create resources. This does not imply synchronous installation is always sufficient. Async readiness must complete before activation.

## Reusable objects

```js
function createMachine({ texture, powerSupply }) {
  const node = new Node2D({ name: 'machine' });
  node.add(new Sprite2D({ texture }));
  const pivot = node.add(new Node2D({ position: { x: 40, y: 0 } }));
  const motor = pivot.attach(new Motor({ powerSupply }));
  return {
    node,
    start: () => motor.start(),
    stop: () => motor.stop(),
    stalled: motor.stalled,
  };
}
const machine = createMachine({ texture: lease.value, powerSupply });
scene.root.add(machine.node);
scene.own(machine.stalled.subscribe(() => warning.flash()));
```

Public capabilities hide internal child names. Nodes own children; behaviors have one host. Signal subscriptions belong to their subscriber's lifetime.

## Scene dependencies

```js
class PhysicalBody {
  static requires = { world: PhysicsWorld };
  onEnterScene({ node, services, lifetime }) {
    this.body = lifetime.own(
      services.world.dynamicBody({
        node,
        shape: this.shape,
      }),
    );
  }
}
```

Requirements resolve on scene entry. Missing requirements fail before activation. The scene-membership lifetime ends on exit, while the attachment lifetime ends on detachment/destruction. Explicit constructor injection remains preferred for object-specific collaborators.

## Views and layers

```js
const overview = app.view({ target: '#overview', scene });
main.camera.follow(machine.node); // controller installation is optional
const hud = main.layer('hud', {
  space: 'screen',
  cache: 'view',
  draw: drawStatus,
});
hud.invalidate();
await main.show(menuScene);
```

Follow syntax may move to a camera-controls facility; creating a camera never installs input. Views share scene execution. `show` awaits readiness; switching/concurrent transition policy remains provisional.

## Maps and simulations

```js
const map = scene.own(maps.create({ source: finiteTiles(levelData) }));
const world = scene.own(physics.createWorld({ gravity: { x: 0, y: 9.81 } }));
scene.installSimulation(world);
world.addTileColliders(map, { solid: (tile) => tile.tags.includes('solid') });
```

Ownership does not install updates. Map rendering and collider generation are separate consumers of map revisions. No physics dependency exists for a map viewer.

## Shutdown

```js
app.stop(); // pause execution; retain state/resources
await app.dispose(); // cancel work and dispose owned resources
```

Persistent world close needs a separate save-aware contract. Disposal cannot promise durable saves unless that operation explicitly completed.
