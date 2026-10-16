# Classic terrain tiles and vegetation

`terrain-tiles.html` is a separate demo. Existing field and streaming previews remain available. The original `procedural-terrain-js` PNG data was decoded into local images without changing that project. `LegacyAtlas.ts` adapts its terrain frame coordinates and palette; the copied MIT notice is in `examples/terrain/assets/LEGACY-LICENSE.txt`. This recreates the old visual vocabulary with the new seeded height field, not the exact old noise algorithm or seed-to-map correspondence.

## Resolving corners

The old resolver assigned one image repeatedly while checking edges and corners. Later matches overwrote earlier ones. A single tile could need several inner corners or opposite edges simultaneously.

The first v2 attempt split those frames into four quarters. That was incorrect for this atlas: a north cliff occupies nearly the entire tile height, and its lower half must remain visible. Treating it as an independent 8 × 8 boundary truncated the artwork. Painting the interior sprite beneath transitions also differed from the original flat-color background.

The corrected adapter uses full 16 × 16 transparent overlays. `Autotile.ts` reads an eight-bit mask of higher neighbors, clockwise from north. Two adjacent higher neighbors select their authored corner instead of two separate edges. Remaining disconnected edges are retained, and an isolated higher diagonal adds its inner-corner frame. The selected full images composite over the original flat base color, in deterministic order. No sprite is cut into quarters. The inspector shows cardinal and diagonal cases, including opposite edges and simultaneous inner corners.

This is an adapter for this atlas, not a universal tileset format. The atlas has a specific transition for each height tier; it cannot express every arbitrary material pair or height jump. Complex overlapping boundaries compose the supplied art rather than selecting a specially drawn complete pattern. A complete blob atlas could instead map normalized neighbor masks to explicitly authored full frames.

All neighbors are sampled from the seeded world, including a one-cell halo outside each cached region. Visibility and region arrival order do not change the selection. An editable version would invalidate the changed tile and all eight neighbors, including across region boundaries; editing is not added here.

Tests cover all 256 masks for available full-frame references, known authored edge/corner cases, signed-coordinate lookup, and the painter's exact full-frame draw calls. They do not substitute for visual inspection of the atlas.

## Tile-friendly terrain pass

The classic demo enables `TileFriendlyTerrain` by default. The source still produces the original 0–11 height tiers from the untouched seeded height field. The pass derives tile tiers; the continuous field, biome classification and other demos are unaffected. The checkbox compares processed and raw tiers at the same camera position and rebuilds only the presentation caches.

A radius-one grayscale opening removes thin peaks, followed by a radius-one closing to fill thin pits/channels. These four neighborhood stages reduce small spikes and notches without promising that every topology fits the atlas. A final slope envelope takes the minimum cleaned tier plus Chebyshev distance from each surrounding cell. It limits the difference between any of the eight neighboring cells to one tier. This envelope lowers abrupt high terrain into a slope; it is not an erosion simulation and does not preserve every small land feature.

Each independently derived region reads a 15-cell halo: four cells for opening/closing, plus eleven for the slope envelope. Because source tiers are bounded to 0–11, farther cells cannot lower that envelope. Thus crop results do not depend on region size, generation order, neighboring cache residency or signed boundaries. The input must be a stable world-coordinate function; live editable inputs would require halo-aware invalidation, which is not part of this demo.

The data cache retains at most 64 regions of 16 × 16 byte-sized tiers (16 KiB of tile buffers, excluding map overhead and temporary processing arrays). It is separate from the bounded ground raster cache, and scene disposal clears it. Stats show retained data bytes, builds and cumulative adjusted cells across those builds; the latter is not a count of unique edits or visible changes. Source validation fails before publishing a partial region.

Trees and image resolution both read the selected tier field, so they agree on the shaped terrain. Feet markers start disabled. Tests cover synthetic narrow peaks/pits and wide plateaus, an eleven-tier discontinuity, all eight neighbor directions, partition-size independence, signed seams, eviction/rebuild equivalence, raw-field preservation and cleanup.

## Ground cache and depth ordering

The ground uses 16 × 16 tile regions, each rasterized once while retained. The fixed 640 × 480 camera retains at most 12 regions. Exiting regions release their canvas pixels. Two atlas leases are scene owned; the application asset service handles decode failures and final release. Loading completes before the runtime starts drawing, and page teardown disposes the scene resources.

Trees have deterministic positions and variants derived from signed world coordinates. They are separate render objects anchored at their feet. The visible set includes trees whose feet are below the viewport but whose tall canopies still overlap it.

Trees and the walker are sorted together by world feet Y, then X and stable ID. Sprite height and camera position have no authority over depth. The walker draws before a tree while behind it, and after it while in front. A cached vegetation image composited after the actor would prevent that interleaving, so only ground is cached here. Debug marks show the foot anchors. The inspector reads the same queue without advancing it.

WASD moves the walker and follows it; arrow keys pan independently. Behind/in-front buttons demonstrate occlusion at a reference tree. Movement is normalized and time based. Collision, editable tiles, persistence and live terrain edits remain separate slices. This demo uses native 16-pixel tiles and the original tree sprites, including their baked grass bases.

## Validation

TypeScript, type-aware lint, formatting and emitted-JavaScript tests are checked. Browser checks verify both sides of the reference tree, walking across cache boundaries and the shared diagnostic queue. FPS is illustrative, not a benchmark guarantee.

## Cached decoration generation

`DecorationCatalog.ts` adapts the original terrain-specific, height-band palettes: water details, grass flecks, plants, mushrooms, bushes, stones and trees. The new height field's fractional `height * 16` selects the band (including the original reverse-band settings), while the selected shaped/raw tier and resolved border mask determine eligibility. This is a rebuild of the old ideas, not pixel-identical old noise placement. The duplicate `water-plant-on-grass-2` name in the source metadata is disambiguated to its grass frame at `[96, 64, 32, 32]`.

`Decorations` generates immutable records per signed 16 × 16 tile region. A single smooth value field at 24-tile spacing supplies clustering; a seeded placement hash tests the configured density multiplied by a bounded cluster factor. A separate hash selects a variant, allowing every palette entry. There is no mutable random sequence or shared noise state. A one-cell terrain halo determines border exclusion before publication.

Camera demand includes the sprite overhang: 40 pixels horizontally and 112 pixels below the viewport. Retention is capped at 32 regions; unused regions are evicted and regenerate deterministically on return. Visibility queries only inspect record bounds. They never sample noise or generate records. Standing still therefore freezes generation and placement counters. Terrain-mode changes invalidate both decoration records and ground images; scene disposal clears them.

The 16 × 16 atlas details are painted into their owning ground raster once. Larger decorations remain individual records, culled by their actual sprite rectangle and sorted with the actor by feet. Records use a bottom-center anchor; the original baked ground patches remain part of their art. Trees and rocks currently have no collision. The initial reference-tree search is a startup-only probe, separate from region generation counters.

The statometer separates average frame update/render work from last and peak decoration-region generation time, retained records, builds and cumulative region placement evaluations. Region times include terrain sampling; multiple new regions can still cause a synchronous frame spike, and a region's peak is not a worst-frame metric. This slice does not add workers, asynchronous jobs or persistence.

Tests cover palette reachability, density and bands, resolved-border exclusion, atlas bounds, unchanged source-call counts over repeated retention/culling, overlapping canopy culling, signed coordinates, demand order, eviction/regeneration, invalidation, capacity rejection and final cleanup.
