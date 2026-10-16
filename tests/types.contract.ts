import { Rocket, Node2D, Scene2D, Input } from '../src/index.js';

// Compile-only consumer examples: never run the intentionally invalid calls.
// Expected-error directives fail the check if these contracts become permissive.
export function publicTypes(app: Rocket): void {
  const scene = app.scene({
    distance: 0,
    update(dt) {
      this.distance += dt * 10;
    },
    draw(ctx) {
      ctx.fillRect(this.distance, 0, 10, 10);
    },
  });
  const distance: number = scene.distance;
  const tree = app.scene(new Scene2D());
  const node = tree.root.add(new Node2D({ x: distance }));
  const motor = node.attach({
    speed: 2,
    update(dt, _frame, host) {
      host.rotation += this.speed * dt;
    },
    pause() {
      this.speed = 0;
    },
  });
  motor.pause();
  app.view({ target: '#main', scene });
  // @ts-expect-error Scene state remains precise rather than becoming any.
  scene.distance = 'far';
  // @ts-expect-error Child coordinates are numeric.
  node.x = 'left';
  // @ts-expect-error Draw hooks cannot suspend between views.
  app.scene({ async draw() {} });
  node.attach({
    // @ts-expect-error Ordinary Promise-returning hooks are rejected too.
    update() {
      return Promise.resolve();
    },
  });
  // @ts-expect-error Camera zoom has a numeric contract.
  app.view({ target: '#main', scene }).camera.zoom = 'close';
}

export function inputTypes(app: Rocket, scene: Scene2D): void {
  const input = app.use(Input);
  const controls = scene.own(input.scope(scene, { jump: 'Space' }));
  controls.down('jump');
  // @ts-expect-error Only declared action names are accepted.
  controls.pressed('missing');
  // @ts-expect-error Owned cleanup must not return a Promise.
  scene.own(async () => {});
}

export function fixedTypes(): void {
  const app = new Rocket({ fixed: { step: 1 / 60, maxSteps: 5 } });
  const scene = app.scene(
    new Scene2D({
      fixedUpdate(dt, tick) {
        const value: number = tick.tick + dt;
        void value;
      },
    }),
  );
  const controls = scene.own(app.use(Input).scope(scene, { jump: 'Space' }));
  controls.fixed.pressed('jump');
  // @ts-expect-error Fixed actions keep their declared names.
  controls.fixed.pressed('missing');
  // @ts-expect-error Fixed updates cannot suspend.
  app.scene({ async fixedUpdate() {} });
  app.scene({
    // @ts-expect-error Ordinary Promise-returning functions are rejected too.
    fixedUpdate() {
      return Promise.resolve();
    },
  });
}
