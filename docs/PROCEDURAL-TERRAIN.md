# Procedural terrain generator: first rebuild step

The new module is `examples/terrain/TerrainGenerator.ts`; `/terrain.html` is a separate demonstration. It is example-owned domain code with no Rocket, DOM, canvas, input, timer or package dependency. Existing demos, their three-state streaming world and its IndexedDB record remain unchanged. Production Workshop is a separate later integration.

The older project remains read-only. Its useful ideas were layered noise, height bands and terrain classification. The rebuilt generator avoids the old module-scoped mutable noise state, settings changed while sampling, negative-coordinate mirroring and viewport-dimension normalization.

## Consumer API

```ts
const world = new TerrainGenerator({ seed: 42, scale: 96 });
const sample = world.sample(-17.5, 32); // height, moisture, biome
const chunk = world.chunk(-1, 0); // 32 × 32, origin (-32, 0)
// chunk.heights: Float32Array
// chunk.moisture: Float32Array
// chunk.biomes: Uint8Array
```

Seed is an unsigned 32-bit integer, including zero. Scale is 1–8192 world units per base noise cell. Configuration is frozen and exposed through a getter, preventing both TypeScript and ordinary JavaScript callers from replacing or mutating it. A new generator creates a different world/configuration; there is no reseeding a shared singleton.

sample() accepts finite continuous signed world coordinates within ±1,000,000. chunk() accepts integer chunk coordinates and a size from 1 to 64. Chunk origin is coordinate × size; its complete sample extent must fit the same address domain. Output is row-major, with independent caller-owned buffers. The descriptor is frozen but its arrays are deliberately writable; mutating them cannot affect future generation.

## Fields and biome interpretation

Each noise sample hashes the seeded signed lattice coordinates into one of eight normalized 2D gradients. Quintic interpolation produces a continuous field. Four octaves, frequency doubling and amplitude halving create normalized height and moisture in [0, 1]. Moisture uses a separate seed channel and sampling scale. No random calls, permutation mutation or shared module state are involved.

Classification is intentionally small and fixed for this version: height below 0.4 is water; below 0.435 is shore; above 0.8 is snow; above 0.68 is rock; other land is forest when moisture exceeds 0.53, otherwise grassland. These are content rules, not physics/walkability declarations or an erosion/climate model. Sea level is a fixed normalized band in this slice. Landlocked lakes and irregular elevation bands are expected; snow depends on altitude rather than temperature.

World-coordinate sampling is authoritative. Canvas pixel size, camera, generation order and chunk boundaries never enter the field calculation. Adjacent edge cells need not have equal heights: they are different world positions. The seam contract is that the same world position has the same sample, independent of partition, and continuous sampling does not jump across a partition boundary. Chunk float fields store Math.fround(sample field), while biome classification uses the unrounded field.

## Identity and future persistence

Generator version is `gradient-terrain-v1`. identity includes version, seed and scale. A future checkpoint/terrain store must bind saved overrides to this full identity; changing the algorithm, thresholds or interpretation requires a version change or explicit migration.

The existing streaming demo accepts only three terrain values and has a different base generator/store identity. This six-biome generator is not silently substituted into that saved world. That integration is now delivered separately in [streamed procedural terrain](STREAMED-PROCEDURAL-TERRAIN.md), with six-value palettes, bounded shared artwork and separate versioned world namespaces preserving existing saves. It should also preserve the existing bounded async jobs, multiple demand owners and edit-before-ready publication contract.

## Demonstration and checks

The finite preview covers 128 × 96 world samples, assembled from twelve independently generated 32 × 32 chunks. Both canvases are cached presentations of that one dataset: colors show biomes; grayscale shows elevation. Rebuilds generate new data before publishing either presentation. Region travel advances the origin by one chunk; returning regenerates the same data. Reverse chunk order changes evaluation order without changing the row-major dataset/checksum. The checksum includes float height/moisture bits and biomes; it is a reproducibility aid, not a cryptographic hash.

The demo retains only its current preview and two small raster caches. It generates synchronously on explicit actions rather than per frame, and disposes both caches with the application. Rebuild times are displayed but are not a throughput benchmark. Terrain remains world-coordinate data even though the preview is finite and there is no streaming/persistence adapter in this page yet.

All 107 emitted-JavaScript tests, strict TypeScript, type-aware lint and formatting checks pass. Four terrain tests cover reproducibility across independent instances and query order, seed/config separation, immutability, signed chunk samples, differently sized partitions, seam continuity, field ranges, classification coverage, owned output buffers and validation of domain/size limits.

Browser checks verify checksum `3c7f5f4a` for seed 42 at origin (-64, -64), unchanged after reversed generation and regeneration. West changes the region; east restores the same checksum. Seed 777 changes the checksum to `398357d0` and includes all six biomes in that preview.

Erosion, rivers, physically calibrated altitude, temperature, autotile sprites, decorations, terrain editing, workers, LOD and large-coordinate origin shifting are future terrain decisions. This first step establishes the generator's data and reproducibility contracts before adding those consumers.

## Camera and statometer

In `terrain.html`, click either canvas and use WASD or arrow keys. Both views share one update and camera position; movement is 32 tiles per second, with normalized diagonal speed. Tiles remain 5 screen pixels. Direction buttons move 32 tiles. Input bindings and retained data are scene/view owned and released on disposal.

The preview retains only chunks intersecting the viewport: 12 when aligned, up to 20 with partial edge chunks. Overlapping chunks are reused. Generation and the two shared raster buffers rebuild synchronously when the chunk coverage changes; ordinary frames only move the camera and draw those buffers. Regenerate and reverse-order controls explicitly generate again. The checksum describes the retained patch, which can be larger than the visible rectangle.

The statometer reports rolling FPS and frame/update/render timings, camera coordinates, retained chunks, cumulative generation and raster rebuild counts, last rebuild duration, and an estimate of raster RGBA bytes. These timings measure CPU work and frame cadence, not GPU completion or total browser memory. Boundary rebuilds can cause short stalls even when averaged FPS looks healthy; the separate streamed demo remains the place to exercise bounded asynchronous loading.
