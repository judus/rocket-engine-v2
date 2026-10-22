# Surface renderer comparison

Open <http://localhost:8092/demos/tools/flight-foundry/surface-benchmark.html> after the
normal build/server command. This experiment uses `games/farwake/CockpitScene.ts`,
the same assembly/draw path as the game, with the original cockpit and 72 seeded
asteroids. It does not introduce a second flight model or expose detail settings.

Each pass creates a matching renderer/material pair on the same WebGL2 context:

- Full: metallic/roughness, occlusion and normal maps, GGX response.
- No normal: remove normal bindings and tangent shader/vertex attributes.
- Scalar PBR: also remove metallic/roughness and occlusion bindings, retaining
  scalar factors and GGX response. The scalar factors multiply the original factors
  by the mean linear green/blue map channels, calculated once before timing; merely
  retaining a factor of 1 would incorrectly turn nonmetallic rocks into metal.
- Diffuse: base-color textures, normals and emissive values, with Lambert lighting.

Base-color/emissive artwork, opaque/transparent and unlit flags, geometry,
transforms, field of view, sun/ambient lights and scene contents stay unchanged.
Source assets/materials remain immutable; renderer material variants share geometry.
This experiment does not skip CPU image loading or lower texture resolution.

The drawing buffer is fixed at 1920×1080 with native antialiasing. The frozen ship
commits one initial tick and instrument image before measurement. No live movement,
heat evolution, blinking alerts or instrument uploads disturb later windows.
Every pass warms for 60 animation frames, then issues exactly 32 asynchronous GPU
timer queries; CPU submission time is sampled for those same frames. Pending
queries drain without blocking, and all renderer creation/upload/compilation work
is excluded from the measured windows. The retained sky texture is accounted for
separately from material textures. Memory counters are buffer/texture estimates,
not driver-reported process VRAM.

The order is Full / no-normal / scalar / diffuse, the reverse order, then
Full / scalar / diffuse / no-normal / Full. This gives three windows per reduced
variant and four baseline windows. The summary reports medians across windows.
Raw JSON includes each window, timing support, fixed dimensions and the browser's
reported renderer. Scene draw/triangle changes, context loss, disjoint timing and
query timeouts invalidate the comparison rather than producing a success result.
Unsupported GPU queries are labelled unsupported, never inferred from CPU timing.

Use Inspect variant after a completed run for visual checks. Changing that view
does not change saved results. Reload before an independent repeat. Compare on
actual target hardware; these results cannot establish mobile FPS, loading savings,
simulation cost or thermal/battery behaviour. Static pose measurements need later
camera-path and dynamic-instrument checks before selecting player presets.

## Recorded RTX 5080 results

The browser reported `ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5080/PCIe/SSE2,
OpenGL 4.5.0)` on Linux / Chromium 155. Both final runs use map-averaged scalar
factors and the exact fixed scene above. Each entry is a median of measured
windows (Full: four; each reduced variant: three), not a single frame.

| Variant    | GPU ms, run 1 / 2 | CPU submission ms, run 1 / 2 | Geometry MiB | Material textures MiB |
| ---------- | ----------------- | ---------------------------- | ------------ | --------------------- |
| full       | 0.439 / 0.453     | 1.011 / 1.155                | 82.58        | 212.82                |
| no-normal  | 0.296 / 0.327     | 0.803 / 0.897                | 66.06        | 142.82                |
| scalar-pbr | 0.291 / 0.323     | 0.822 / 0.772                | 66.06        | 72.82                 |
| diffuse    | 0.341 / 0.362     | 0.688 / 0.838                | 57.80        | 72.82                 |

All windows retained **103 draws and 547,987 triangles**. The sky retained
**254.31 MiB** in every variant and is additional to the material numbers above.
Memory estimates include mip levels; CPU decoded images are retained throughout.

No-normal reduced the GPU-window median by about 28–33%, and scalar PBR by
about 29–34%, against each run's Full median. These are roughly 0.13–0.15 ms
absolute savings, not those percentages of total game frame time. Scalar PBR
removed 140 MiB of material texture allocations plus about 16.52 MiB of vertex
buffers relative to Full. No-normal removed 70 MiB of textures and the same
16.52 MiB of vertex buffers. Diffuse additionally saved about 8.26 MiB of vertex
buffers but was slower than scalar PBR on the GPU in both final runs.

Visual inspection: no-normal smooths rocky relief and cockpit surface detail while
preserving mapped material response. Scalar PBR also removes spatial roughness,
metalness and occlusion variation; map-mean factors preserve the broad rock/metal
classification rather than turning rocks into polished metal. Diffuse substantially
brightens/flattens metal shading. Displays, reticle, lenses and alpha coverage
remain present in all variants.

**Decision:** Full remains the default. Following this comparison, Video settings
now offer Full, No normal maps and Scalar PBR. Diffuse remains comparison-only;
it is not the preferred low-detail choice on this evidence. Further evaluation
needs actual mobile hardware,
a repeatable moving view and normal live instrument traffic. The large sky texture
is an obvious later memory investigation; it was deliberately held constant here.

Raw windows and environment metadata:
[run 1](./benchmarks/surface-rtx5080-run-1.json),
[run 2](./benchmarks/surface-rtx5080-run-2.json).
