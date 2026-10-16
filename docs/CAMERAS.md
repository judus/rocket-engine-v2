# Camera controls

The optional `Cameras` application service binds one view-owned controller per view. A view still works with its ordinary `camera.x`, `camera.y` and positive `camera.zoom` without installing the service. There is no additional clock or automatic scene update.

```ts
const cameras = app.use(Cameras);
const controller = cameras.bind(view, {
  speed: 320, // logical screen pixels / second, independent of zoom
  inertia: 12, // exponential velocity response; 0 for immediate movement
  minZoom: 0.5,
  maxZoom: 4,
});

// In scene.update, before rendering, picking and stream demand:
controller.update(dt, { x: right - left, y: down - up });

// Programmatic zoom about a logical canvas coordinate:
controller.zoomAt(2, { x: view.width / 2, y: view.height / 2 });
```

Pan input is caller-owned: the demo routes WASD only to the focused canvas. Each controller retains its independent velocity and coasts when direction returns to zero. Motion is integrated analytically, including normalized diagonal input; speed is measured in screen units and converted through the camera inverse. Camera controllers are not simulation objects and do not advance terrain or production.

Wheel listeners are view-owned, non-passive and restricted to the bound canvas while its scene is active and the application is running. Pixel/line/page wheel units are normalized into one bounded coalesced request, applied in `controller.update` before demand calculation. Stop resets pending wheel input and inertia; inactive scenes also reset motion. View or service disposal removes listeners and service membership. `wheel: false` supports externally supplied zoom controls. `resetMotion()` is useful before manual camera teleports.

## One transform for rendering and picking

`Camera2D` supplies a world-to-screen affine matrix. `View` applies DPR and optional translation snapping, and uses the same rendered transform for:

- `clientToScreen(point)`: browser client coordinates to logical canvas pixels, including CSS scaling;
- `screenToWorld(point)` / `worldToScreen(point)`: the actual presentation inverse and forward transform;
- `clientToWorld(point)`: combined client picking;
- `worldBounds`: conservative world AABB from all four viewport corners.

Fractional zoom preserves the world point under the zoom anchor to floating-point precision. With pixel snapping, positions remain precise but the final backing-pixel translation is quantized, so anchoring can shift by a subpixel amount (bounded by one backing pixel). Picking follows what was drawn. `pixelSnap` does not quantize camera state or zoom; stepped zoom and disabled image smoothing are useful for pixel art.

Input pointer snapshots are taken before scene camera motion. The demo preserves their logical screen coordinate before updating the controller and repicks through the new inverse afterward. Consumers must choose between input-time world positions and picking against the new camera deliberately.

Rotation is deferred. There is no public rotation property yet. Matrix-based render/picking, inverse-based motion and four-corner bounds leave room for it without teaching streaming about a specific camera implementation. Bounds are conservative; future rotated views may demand extra chunks.

## Two-view streamed proof

Open `camera-terrain.html`. Explorer (biomes, initially 2×) and overview (elevation, initially 0.5×) have separate controllers. The overview draws the explorer's viewport; shared tile selection and biome edits appear in both. Edits remain in memory for this demo.

Both views use a common world scale of 16 units per tile, even though their shared raster cache internally paints at 5 pixels per tile. Demand and drawing bounds derive from `view.worldBounds`, converted with floor for minima and ceil for exclusive maxima. Demand owners are updated together using `stream.setDemands` before streaming advances. Two 640 × 360 views at minimum 0.5×, even in separate areas with signed coordinates, fit the 256-record cap including retention margins. Zoom limits must be chosen against viewport dimensions and stream capacity; the core camera service does not silently constrain terrain demand.

Closing overview releases its camera controller, wheel listener, pointer binding and demand. Explorer and shared edits remain active. Recreating views releases the previous application, stream, raster caches and controllers, then binds fresh views without duplicating listeners. No existing demo's controls or default zoom were migrated in this slice.

Validation: 165 tests pass, including anchored zoom with CSS scaling/DPR/snapping, pan frame partitions, diagonal normalization, application stop, independent wheel/lifetime cleanup, and demand coverage at signed viewport boundaries across all supported zoom levels. Bounds and pixel-snap regression checks also cover the existing two-view renderer.
