# Nodes and behaviors — implemented slice

Optional composition for Canvas 2D. Plain-object update/draw scenes still need no tree. Import `Rocket`, `Scene2D` and `Node2D` from `src/index.ts` in TypeScript source, or `dist/src/index.js` in browser JavaScript after building.

```js
const app = new Rocket();
const scene = app.scene(new Scene2D());
const pivot = scene.root.add(new Node2D({ x: 100, y: 150 }));
pivot.add(
  new Node2D({
    x: 60,
    draw(ctx) {
      ctx.fillRect(-8, -8, 16, 16);
    },
  }),
);
pivot.attach({
  update(dt, frame, node) {
    node.rotation += dt;
  },
  dispose(node) {
    /* release this behavior's subscriptions/resources */
  },
});
app.view({ target: '#main', scene });
app.view({ target: '#detail', scene });
await app.start();
```

## Small API

- `new Scene2D({prepare?, fixedUpdate?, update?, draw?, dispose?})`: owns one read-only `root` reference. Optional update runs before tree update; optional draw paints the background before the tree; optional dispose runs after tree cleanup. Update, draw and disposal hooks are synchronous. Optional async preparation is awaited before activation; see [assets](ASSETS.md) for cancellation and ownership.
- `new Node2D({x?, y?, rotation?, scaleX?, scaleY?, draw?})`: mutable local transform and optional local-coordinate drawing callback. Translation defaults to zero, rotation to zero radians, scale to one.
- `parent.add(child)`: transfers an unowned child into the parent's lifetime and returns it. An already-parented child must first be detached. Cycles and scene-root adoption are rejected.
- `child.detach()`: returns the retained subtree to caller ownership, preserving local transform. Its world pose can change. Detached objects do not update/draw with the old scene and must be reattached or disposed by the caller.
- `node.attach(behavior)`: owns a plain object with optional `update(dt, frame, node)` and `dispose(node)` hooks; returns it. Hooks run with the behavior as `this`. Each behavior instance has one lifetime owner; use a fresh instance for another attachment.
- `node.remove(behavior)`: ends that behavior's lifetime immediately and invokes its cleanup once. It does not return a reusable behavior lease.
- `node.dispose()`: final, idempotent subtree destruction. `disposed`, `parent` and a copied `children` array expose state without allowing direct structural edits.
- `node.localToWorld(point)` / `node.worldToLocal(point)`: compose the current ancestor transforms without a transform cache. Zero scale can render flattened geometry, but inverse conversion rejects a singular transform. Nonfinite transforms fail clearly.

`update`, `draw` and `dispose` also make a detached node usable through explicit host calls. Do not manually advance or draw a tree already being traversed by its scene.

## Ordering and mutation

The runtime updates a Scene2D once, independent of view count. The scene update callback runs first, then the tree takes one snapshot of nodes and behaviors. Traversal is parent before child, siblings in insertion order, behaviors in attachment order. Parent changes therefore reach children before their update. All updates finish before either view renders.

Behavior-time additions begin next tree update. Removals/disposal suppress later hooks immediately. Detach/reparent changes invalidate the moved subtree's entries for the current traversal, so it cannot update twice or accidentally run at its old position. A scene update callback can assemble objects before that frame's tree snapshot.

Structural changes are immediate rather than queued; traversal uses snapshot membership and revision checks. Drawing rejects structural mutation, including from the scene background hook, to keep both views on the same composition. Draw callbacks must still avoid mutating transform/simulation properties; arbitrary user callback purity is not enforced.

A node's matrix is translation × rotation × scale, multiplied onto its parent's matrix and then the view's camera/DPR projection. Draw callbacks receive node-local coordinates. Callback styles and paths are isolated from children/siblings; inherited transforms remain intact. User Canvas save/restore calls must stay balanced.

## Cleanup and dependencies

Scene owns root, node owns children and behaviors. Views own presentation, never nodes. Removing one view does not destroy or duplicate tree execution. Removing the last view stops scene activity while retaining its tree; application disposal destroys it once.

Disposal marks the node unavailable immediately, then cleans children in reverse insertion order, then behaviors in reverse attachment order. The scene cleanup hook follows the tree. Errors are aggregated while remaining cleanup continues; disposal is not retried after failure. Behavior cleanup may use its supplied node and injected collaborators, but cannot add resources to an already disposed host.

Factories and behaviors accept explicit collaborators through ordinary arguments/closures. No service locator, membership hooks, priorities, fixed node behaviors or asynchronous node cleanup is introduced yet. Optional scene fixed updates are described in [FIXED-TIMING.md](FIXED-TIMING.md). Scene/view resource ownership and application services are now described in [SERVICES-INPUT.md](SERVICES-INPUT.md). A behavior that subscribes to a collaborator releases its subscription in dispose(). Detach currently changes update membership only; scene-specific service leases require a later explicit entry/exit contract.

## Concrete reusable object

[createArm.ts](../examples/createArm.ts) builds a base → shoulder → elbow → tool subtree. Its factory exposes `{node, pause, resume, moveBy, moveTo, updates}`; callers need no knowledge of internal children. Behaviors share factory-local motion state rather than querying the engine.

The demo creates two independent instances and shows the same tree through two cameras. Scene and per-arm update counters agree until an arm is replaced. **Replace first arm** destroys one subtree, increments the cleanup counter once, and adds a new instance. **Restart example** destroys both remaining arms before creating a new application. The plain wave scene remains an example without nodes.

## Verification

The complete suite now has 51 passing tests after the asset slice across runtime, composition and input. They cover nested rotation/nonuniform scale and inverse conversion, actual composed camera/DPR matrices in two views, stable ordering, additions/removals/reparenting during update, synchronous hook enforcement, exclusive ownership, draw isolation, render-time structural mutation rejection, detached lifetimes and cleanup after errors. Browser checks cover visible articulation, matching counters in both views, replacement/restart cleanup and pause/resume.

These focused checks do not establish deep-tree capacity, cross-browser compatibility or physics scheduling. Traversal snapshots and transform recursion favor clarity over large-scene optimization; profile before adding caching or pooling.
