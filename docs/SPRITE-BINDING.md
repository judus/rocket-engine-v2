# Optional Rocket sprite binding

Import `Sprite2D`, `loadSprite` and `bindSpriteIndex` from `rocket-engine-v2/sprites`. This optional Canvas2D entry uses the optional peer Sprite-Animation 0.2.1. The engine root does not import it. Exact archive SHA256: `493e67a4d2cd4312c83f14fc3677499972255e410b4d54473d3acbf14ad45f3b`.

```ts
const sprite = await loadSprite(assets, imageUrl, atlas, 'walk', {
  signal,
  onComplete: (completion) => {
    console.log(completion.clip);
  },
});
scene.root.add(sprite.node);
const membership = bindSpriteIndex(sprite, spatialIndex, 'actor');
// After transform/playback/flip changes and before a query:
membership.refresh();
```

`new Sprite2D(atlas, readyImage, clip, options)` borrows the image. Preparation checks the actual ready raster dimensions with the upstream validator; unsupported/not-ready sources, mismatched dimensions and invalid clips reject before attachment. `loadSprite` acquires its own Assets lease, releases it on cancellation or construction failure and transfers ownership to the node on success. Node disposal disposes the player before releasing that lease. Two bindings acquire two leases sharing one cached image; removing one cannot close the other's image. Keep borrowed images alive until all their consumers are disposed.

Default `clock:'scene'` advances once from Node2D update, regardless of view count. `clock:'manual'` disables node advancement; call `sprite.advance(seconds)` from exactly one existing fixed/update owner. Explicit advance on a scene-clocked binding rejects. Do not separately call `sprite.player.advance`. No frame loop or timer is introduced. `player` retains upstream play/pause/resume/rate controls. One-shot completions invoke a synchronous callback during advancement only; callbacks may select another clip or dispose the binding. Drawing never advances playback or calls completion hooks. `debugBounds:true` draws the visual rectangle and pivot in the proof; it defaults off.

`localBounds` follows frame pivots and flips. `worldBounds` computes the axis-aligned envelope of all four corners through the complete Node2D hierarchy; singular/disposed transforms return null. `contains(worldPoint)` performs exact inverse-transform visual picking. These are visual bounds, not collision geometry.

`bindSpriteIndex` owns one registration in a caller-owned `SpatialIndex<Sprite2D>`. Refresh it after relevant changes before querying; drawing never mutates membership. Refresh removes singular bounds and restores membership once invertible. Sprite disposal removes membership; explicit membership disposal is idempotent. The index must remain alive until its memberships are released. The sprite demo refreshes registrations at its input-query boundary; other consumers choose the equivalent boundary after their own movement/playback updates.

Run `npm start`, open `sprites.html`. Verify Play once, Flip, Remove, Close detail, Dispose, Recreate and Test preparation rollback. Completion/index/lease counters are visible. Invalid preparation releases the newly acquired lease; Recreate restores both players and views. Closing a view retains scene-owned bindings. Full Rocket checks cover rollback after cancellation, invalid clip/dimensions, cleanup order, clock ownership, one-shot completion, transformed/flipped index membership and singular recovery.

The older example factory remains intact for the existing character demos. Their exact 0.2.0 browser archive is retained through a separate dev alias; the new supported binding/demo uses 0.2.1. The quest baseline and its browser import map are unchanged. This slice does not migrate every character animation controller or add collision/3D behavior.

## Rocket verification, 2026-10-14

All 298 Rocket tests and strict static/format/build gates pass. In the browser, two views recorded 48 draws for 24 updates per player. Play once completed once during advancement; closing the detail view preserved players and leases. Removing A left one indexed, playing sprite and released one lease. Invalid-image preparation rejected and released its lease. Recreation restored both players and index memberships; final Dispose released both remaining leases (five total across the exercised lifecycle). Console warnings/errors were empty. A screenshot is retained in `docs/evidence/sprite-worker-2026-10-14/`.
