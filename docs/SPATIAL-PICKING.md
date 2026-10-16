# Spatial index and picking

`SpatialIndex<T>` is a caller-owned optional utility, not an entity store, simulation service or physics broad phase. Values remain caller-owned. IDs and copied world-space AABBs describe explicit membership. Querying or picking never updates the world.

```ts
const index = view.own(new SpatialIndex<Drawable>(128));
index.insert(object.id, object.bounds, object);
index.update(object.id, movedBounds);
const nearby = index.query(worldBounds);
const hit = index.pick(worldPoint, compareDrawOrder, containsGeometry);
index.remove(object.id);
```

`query(bounds)` and `at(point)` return detached, deterministic ID-ordered arrays of immutable entries. Objects spanning several buckets appear once. Bounds use inclusive minima and exclusive maxima; rectangle queries require nonempty finite extents. Signed bucket coordinates use Map keys, not array indices. Movement replaces membership after validating the complete new bounds, so failed updates preserve the old location. Empty buckets are released on removal. Disposal releases index references, not the indexed objects; repeat disposal is harmless and later operations fail.

The default per-operation budget is 4,096 cells. Oversized or unsafe-address operations fail before mutation; there is no silent full-world scan or alternative index implementation. This is a uniform grid with caller-selected cell size, not a quadtree, pathfinder or nearest-route estimator. Callers must update membership when geometry moves. Total indexed population is caller-bounded.

`pickTop(candidates, point, compare, hit?)` supports combining candidate sets from multiple indexes. The ascending comparator must match rendering: the last/frontmost hit wins. Exact ties resolve by ID. Comparators and hit tests must be synchronous and read-only. Optional narrow geometry tests run after AABB containment and can skip an upper object to expose a lower one. The engine does not hard-code feet ordering, selection state, permissions, clickable categories or game actions. Different layers must express their draw ordering in the supplied comparator.

## Factory proof

Factory presentation now uses this index for placement candidates and sprite bounds rather than its private spatial bucket implementation. Only ready retained building visuals are pickable. Clicking a roof or body selects the building; the narrow test follows its rectangular body and triangular roof instead of selecting the blank corners of its bounding box. Construction occupancy still belongs to the game and remains distinct from clickable sprite geometry.

The terrain cache indexes object-layer decoration records once when a region is built. Region invalidation/eviction removes its memberships; view/cache disposal clears the index. Ground details are not pick targets. Tree/detail sprites currently use rectangular sprite bounds, including transparent pixels. Alpha/silhouette picking is deferred; consumers can supply narrower geometry later.

`FactoryPicking` combines local building/decoration candidates with the exact `compareDepth` used for their render order (world feet, x, stable ID). Cargo is presentation-only and intentionally noninteractive. A tree in front can win over a building; a tree behind cannot. Yellow bounds and a separate pick status show the result. Building hits select the game inspector; decoration/empty hits clear building selection. Inspector dropdown choices remain direct game UI commands. Picking performs no inventory, construction or production mutations.

The world point is repicked after camera motion through the rendered View inverse, including zoom, CSS scaling, DPR and pixel translation snapping. Rendering retains its one depth sort; picking chooses the frontmost local candidate without another scene sort. Existing stress mode uses the shared index for candidate queries but keeps interaction disabled.

Selection is view presentation state. Removal, eviction and closure release pick records without removing domain facilities; recreated views rebuild them from current data. Indexed decorations inherit the existing bounded region cache, and building index membership inherits the placement registry's lifetime.

Validation: 172 tests pass, covering signed/exclusive boundaries, multi-cell deduplication, copied bounds, movement/removal cleanup, failure atomicity, draw-order/geometry selection, roof clicks under every supported zoom with snapping/CSS scaling, tree occlusion, and decoration membership eviction/disposal.
