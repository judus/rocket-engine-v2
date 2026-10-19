# Video settings and surface-detail evaluation

## Implemented resolution controls

Settings → Video exposes render scale (50–100%) and a device-pixel-density ceiling
(1×, 1.5×, 2× or Native). Defaults are 100% and a 2× ceiling. The ceiling is a
maximum, never an instruction to supersample a lower-density display.

Effective render density is `min(device DPR, ceiling) × render scale`. Native
omits the ceiling. `videoSurfaceScale` converts that density into the relative
multiplier expected by `WebGLSurface.resize`, which already multiplies by DPR.
The canvas keeps its CSS dimensions, field of view and logical input coordinates;
HTML stays at browser resolution. Existing GPU dimension limits still apply.

Preferences live separately from control bindings in `rocket.first-flight.video`.
They apply on the next flight render without rebuilding the ship or GL context,
including after a context restoration. Resolution changes resize framebuffers;
that transition is not a steady-state performance sample. Back discards the draft;
Apply validates/saves it before activating it. Neither control changes geometry,
texture allocations, physics frequency or the native antialiasing configuration.

Browser verification: with a 1× ceiling and 50% render scale, a 1868 × 1623 CSS
viewport produced a 934 × 812 canvas. This demonstrates reduced raster dimensions,
not a claim of a proportional FPS gain. Automated tests also cover high DPR,
no supersampling below the ceiling, Native, storage and validation boundaries.

## Surface detail: source evidence

The game currently builds a renderer with material response, material maps and
normal mapping enabled. It uses ambient plus one distant directional light, and
no shadow-map, environment-reflection or bloom pass.

| Candidate                             | Work it can remove                                                                 | Work retained / implementation requirement                                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime normal mapping off            | Normal-map sampling and tangent-space normal reconstruction in the fragment shader | Texture bindings/uploads, geometry tangents, triangles and draw calls remain.                                                                                                                                                      |
| Runtime material response off         | Selects Lambert diffuse instead of the GGX BRDF                                    | The material shader still samples metallic/roughness and occlusion maps; it is not a complete low-detail pipeline.                                                                                                                 |
| Renderer built without normal mapping | Omits the normal-map shader path and tangent attributes                            | Current mesh contract rejects bound normal textures without that pipeline. Build explicit material variants without normal maps; do not suppress the validation. CPU asset loading remains unchanged unless separately redesigned. |
| Renderer built without material maps  | Omits two material-map samples/bindings and their GPU uploads                      | Retains scalar metallic/roughness response. Requires renderer recreation and explicit asset/material policy.                                                                                                                       |
| Textured diffuse renderer             | Omits the GGX shader, material maps and normal-map pipeline                        | Changes metal appearance noticeably. Keep base color, lighting, emissive instruments and reticle; evaluate readability visually.                                                                                                   |

Relevant owning code: `src/webgl/MaterialShader.ts`, `ColorRenderer.ts`,
`MeshRenderer3D.ts`, and the renderer configuration in `CockpitView.ts`.

## Bounded runtime reconnaissance

Used the existing Hi3D rendering testbed at a fixed pilot-seat pose, 96 asteroids,
with shadow maps, bloom, screen-light spill and cockpit motion disabled. This is
not the game scene (72 asteroids) and is not a mobile benchmark. GPU timing used
the existing asynchronous query panel; each reading reported 32 valid samples.

| Runtime shader state         | Rolling GPU average | Geometry / material resources                                                                              |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Normal maps and GGX enabled  | 0.481 ms            | 127 draws; 663,187 triangles; 88,892,640 geometry bytes; 26 textures; 212.81 MiB estimated texture storage |
| Normal maps disabled         | 1.823 ms            | Unchanged                                                                                                  |
| Normal maps and GGX disabled | 1.305 ms            | Unchanged                                                                                                  |

These short windows are noisy and do not establish a speed ranking; disabling
features did not demonstrate a benefit in this run. A baseline return and further
readings must not be interpreted as a controlled device benchmark either. The
resource counters do confirm the important limitation of runtime switches:
**they do not free the retained textures or geometry**. Do not expose surface-detail
quality presets on the strength of these timings.

Next evaluation: explicit Full / no-normal-map / textured-diffuse material and
renderer variants, identical game camera path and render resolution, warmed
interleaved measurements, and GPU time plus upload/texture counters. Check visual
readability and test at least one actual mobile GPU before selecting presets.
Texture resolution, decorative density, shadows and other options remain separate
later evaluations. No reduction of gameplay objects is authorized by a quality preset.

## Explicit renderer variants: completed first comparison

The next experiment now lives in
[Flight Foundry](../../apps/flight-foundry/surface-benchmark.html), sharing the
actual game cockpit assembly rather than the earlier 96-asteroid testbed.
[Method and recorded results](../../apps/flight-foundry/SURFACE-BENCHMARK.md)
include two warmed, interleaved RTX 5080 runs at 1920×1080. Proper no-normal and
map-averaged scalar-PBR variants reduced both GPU time and retained GPU allocations;
plain diffuse was slower than scalar PBR in both runs. This supersedes the short
runtime-toggle reconnaissance as evidence for these explicit variants. Full remains
the default. Video settings now expose Full, No normal maps and Scalar PBR;
diffuse remains comparison-only. Switching rebuilds the renderer on resume and
releases the previous GPU resources without recreating the ship. Preferences
persist, with an explicit one-time migration of resolution-only records to Full.

## Sky texture compatibility

The ship fits its standalone sky texture to the context's `MAX_TEXTURE_SIZE`
at decode time, keeping the panorama's aspect ratio. Devices that support the
10,000 × 5,000 source retain full resolution; smaller GPU limits receive a
smaller CPU image and upload. This is automatic hardware compatibility, independent
of material quality and render scale. The original artwork stays unchanged.
Source decoding still obeys the explicit pixel budget and briefly holds the source
bitmap; this does not reduce download size or guarantee mobile memory availability.
