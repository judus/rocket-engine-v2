# 3D, one small demo at a time

Rocket remains a multipurpose canvas renderer. These experiments use existing scene ownership, frame timing, input and Canvas 2D views. No third-party 3D renderer or separate animation loop.

## 01 — Grid and camera (implemented)

Open `/3d-grid.html`. Source: `examples/3d/grid.ts`, shared `LineDemo.ts`, and `src/3d/PerspectiveCamera.ts`.

A finite 60 × 60 ground grid, three colored axes, perspective projection, movable camera, adjustable vertical field of view, and clipping against all six frustum planes before perspective division. Right-handed camera basis with +Y up and +Z forward. Positive yaw turns toward +X; positive pitch looks up. Movement uses world-horizontal forward/right; Q/E change world height. Diagonal movement is normalized. Dragging and keys use Rocket's focused input scope. Recreating the demo disposes the old view, input scope, resize observer and DOM listeners.

Projection math was initially example-local and is now supplied by the optional 3d module extracted in milestone 06. This is line drawing: no meshes, depth buffer, occlusion, lighting, physics, chunks or streaming. It is not a GPU renderer. Canvas resize updates the aspect ratio; the grid itself does not change.

Validation: focused numerical tests cover perspective/aspect, translated/rotated camera basis, near-plane crossing, behind-camera rejection, viewport crossing and far clipping. Browser checks cover input, FOV, reset, resize, and recreation. No graphics-library compatibility paths.

## Performance baseline

Milestone 01 enables Rocket's existing `PerformanceMonitor`. The same readout should accompany subsequent 3D milestones: render callback FPS, average/peak/minimum frame interval, frame jitter (interval standard deviation), update/render CPU milliseconds, current drawn/submitted geometry, and backing/logical canvas dimensions. Measurements refresh on the monitor's half-second windows; line counts describe the current frame. Recreating the application resets the monitor. There is no second clock or benchmark loop.

Compare with the same foreground tab, camera pose, FOV, viewport size and display scale. FPS measures callback cadence and may stay refresh-capped while CPU cost grows. CPU render time is JavaScript time, not GPU/browser compositing time. These metrics alone do not establish a WebGL crossover; later backends need matched workloads and conditions.

## 02 — Wireframe cube (implemented)

Open `/3d-cube.html`. Adds `cube.ts` and `Transform3D.ts`. The shared line-demo shell supplies the exact same grid, camera, performance monitor, focus routing and lifecycle as milestone 01.

Eight local vertices, twelve edges, and three local axes. Transform order: component-wise local scale, right-handed rotations around X then Y then Z (radians), then translation into world space. World points go through the existing camera and frustum clipping. The demo exposes uniform scale, independent base rotation and position. Optional Y animation adds 35° per simulation second to base rotation, retains its offset on pause, and resets with Reset cube. Recreate resets camera/object and retires all previous listeners. The grid/axes submit 125 lines; the cube and its local axes add 15.

This milestone still draws lines through one another; no depth buffer, hidden edges, faces, lighting or collision. The transform helper now comes from the optional 3d module. Numerical tests use known quarter turns and ordered, nonuniform scale/rotation/translation examples; browser checks exercise controls, animation/pause, camera and recreation.

## 03 — Solid cube (implemented)

Open `/3d-solid.html`. `solid.ts` uses shared `CubeControls.ts` and `CubeGeometry.ts`; the earlier wireframe page uses the same geometry and controls. `src/3d/SolidFaces.ts` rejects back-facing faces by their outward normal and camera position. The camera clips convex polygons against all six frustum planes in camera space, then projects. Surviving faces are drawn far to near, using fixed per-face colors. Outlines are optional. The performance panel adds drawn/submitted face counts; face outlines are canvas polygon strokes, not counted as independently projected line segments.

The single convex cube is the deliberately bounded case: this is not a general painter-order solution for intersecting or cyclically overlapping polygons, and there is no depth buffer. Grid/world axes remain a reference layer drawn first, without depth testing. No collision, interior surfaces, near-plane caps, textures, lighting or WebGL. A camera inside sees no outward-facing surfaces. Numeric tests cover winding/culling from multiple viewpoints, inside-camera behavior, eye-plane crossing, all-vertices-outside viewport clipping, far rejection and far-to-near ordering. Earlier line projection remains unchanged.

## 04 — Cockpit frame (implemented)

Open `/3d-cockpit.html`. `CockpitModel.ts` defines thirteen box parts (78 submitted faces): floor, dashboard, a simple display, side consoles and an open canopy frame. `BoxAssembly.ts` applies each part transform before the shared parent transform. `cockpit.ts` rebuilds world vertices only when assembly yaw changes, then projects and globally orders faces with the existing solid-face pipeline each frame.

The camera starts at seated eye height with a 50-degree vertical FOV. Seat view resets the camera; Inspect assembly supplies an exterior pose. Free movement and drag look remain available. Recreate retires the old listeners and view, resets assembly yaw and returns to the seat. Earlier pages retain their original camera defaults. The existing performance panel includes all 78 submitted faces and current surviving faces.

This is composition, not a flight simulator. No collision, glass, functioning instruments, lighting or textures. Face tints are fixed. Average-depth painter ordering remains an approximation: intersections and joins can show artifacts. Grid lines are still drawn first without depth testing. Focused numeric checks cover child-before-parent transform order and unique assembly geometry; browser inspection covers both presets, rotation, camera reset and lifecycle.

Each completed milestone remains independently runnable. Later rendering backends or advanced systems need a demonstrated consumer requirement; they do not become mandatory for basic canvas scenes.

The readout labels the rate **Render FPS** because callback frequency does not prove the compositor/display presented every render. Frame jitter and minimum/peak intervals expose uneven pacing that the mean hides. This monitor does not measure presentation or input-to-display latency.

## 05 — Cockpit overlay (implemented)

Open `/3d-overlay.html`. `overlay.ts` loads `assets/cockpit-2126-v14-relic.png` once before starting the shared demo. v14-relic is the selected artwork after comparing v3, v4, v5, v7 and v9-dark. Superseded comparison canvases, frame-copy code and copied PNGs have been removed; originals remain in the artwork project.

The outside remains the existing reference grid and camera, starting at the same seated pose as 04. One PNG is drawn last in screen space on one canvas, preserving its original alpha. A visibility checkbox compares the overlay against the grid alone. Resize scales the image to the 16:9 view; recreation reuses the decoded image and resets the view/checkbox. The shared grid caption is drawn before content so it cannot paint over the cockpit.

No cockpit mesh, parallax, instrument logic or separate loop. CPU timing includes drawImage submission, not final compositing. Line counts represent grid projection before image occlusion; comparing FPS to 04 is not a controlled benchmark. Artwork source: `/home/maduser/Documents/Codex/2026-10-15/you/outputs/cockpit-2126-v14-relic.png`, copied unchanged. The 3D frame remains independently runnable on 04.

### Cached cockpit color grade

`CockpitGrade.ts` applies a display-referred luminance curve (0→0, .18→.07, .45→.21, .75→.43, 1→.72 at full strength), scaling RGB together before subtle blue shadows/low mids and yellow-orange highlights. Controls adjust darkness and both tint strengths; an original/graded toggle enables comparison. The decoded original stays unchanged, with exact alpha preservation. Grading affects baked-in lamps too; this is art direction, not reconstructed physical lighting or an emission mask.

The original pixel buffer is read once. Source-resolution graded pixels are cached and rebuilt only for slider changes or reset/recreation, never during the frame draw. The status reports grade-build count to verify this. Regular rendering still draws one cached image per frame on the existing scene canvas; grade preparation is outside the per-frame render CPU metric. No extra animation clock or dependency.

## 06 — Reusable foundation (implemented)

Open `/3d-foundation.html`. The optional `rocket-engine-v2/3d` entry point now owns camera projection/clipping, transforms and affine matrices, immutable indexed `MeshGeometry`, material-bound `Mesh3D`, `Node3D` hierarchy and the stateless `CanvasRenderer3D`. Two mesh nodes share one geometry with independent materials/local poses. Parent controls transform both children; detach/reattach removes/restores the amber child. Recreate resets hierarchy, controls and performance monitoring.

Pages 01–05 migrate to the public module. The line-demo shell delegates line rendering; the wireframe uses indexed geometry and a node matrix; the solid cube delegates mesh rendering; cockpit parts become child mesh nodes sharing one geometry. The cockpit caches its world faces on yaw changes, preserving its static-assembly behavior. Demo-specific layout, fixed tints, controls and image grading stay outside the engine. No new clock, service container or dependency. The overlay image loader and grading cache remain as previously documented.

[API, usage, ownership and limitations](./3D-API.md) describe the actual boundaries. Nested scale/rotation uses parent * local matrices without discarding shear. Geometry is safe to share, tree cycles reject before mutation, and mirrored transforms preserve outward face winding. The Canvas backend retains six-plane clipping/back-face culling and approximate depth sorting. This slice adds no lighting or general occlusion solution. The new GLB cockpit is reserved for the model-loading milestone and has not been imported.

## 07 — Visibility and a depth buffer (implemented)

Open `/3d-visibility.html`. Two intersecting opaque panels use the public geometry/node/material/camera foundation. At the reset view, coral is nearer on the left and teal on the right. Painter ordering must place one whole face last, so it cannot resolve that overlap. The optional `SoftwareDepthRenderer3D` rasterizes pixels using interpolated reciprocal depth and resolves the crossing. Reverse submission order exposes the painter limitation while the depth image remains unchanged away from equal-depth ties.

Compare both paths, switch to either alone, choose 160/320/640 raster width, show the depth map, rotate/animate the panels and move the shared camera. A fixed 2–12 unit camera-Z range makes near samples bright and far samples dark in the depth preview. Both paths render at matching internal dimensions before presentation; the painter retains Canvas edge antialiasing while software rasterization uses one sample per pixel. This is intentionally an isolated visibility scene without the reference grid.

Rocket's existing performance monitor still measures the single application loop. Additional half-second CPU averages separate painter/depth projection and presentation work; common scene collection remains in total Render CPU. Compare mode runs both paths. Depth preview adds a full pixel conversion pass. Buffer dimensions, memory and sample/depth-write counts expose CPU raster cost; this does not establish a WebGL crossover or measure compositor/GPU time. Earlier demos and both cockpit concepts remain intact.

See [the optional depth API and boundaries](./3D-API.md#optional-cpu-depth-renderer-milestone-07). This slice does not import the waiting GLB, add lighting or migrate to WebGL.

## 08 · Model loading — complete

[GLB cockpit inspection](../3d-model.html): optional GLB 2.0 decoder, reusable
mesh data and fresh instance hierarchies, exact imported transforms, material
metadata and camera presets. Cockpit v3 is copied unchanged, replacing no older
demo. Local GLB file replacement exercises the same reusable loader path.
Free camera and pilot reset are demonstration/controller choices; no model
movement restrictions. Depth rendering remains the CPU reference, with painter
and wireframe inspection. Flat colors only. Lighting and an optional GPU backend
remain subsequent work; no software-renderer optimization added.

## 09 — Independent lighting (implemented)

Open `/3d-lighting.html`. A neutral cube, warm octahedron and floor share
scene-owned ambient and directional lights through `shadeFaces`. Compare the
same camera and geometry lit/unlit, change light direction/color/strength,
rotate the objects independently, orbit/pause the light and reset/recreate.
Linear diffuse accumulation and flat geometric normals isolate the technique
from textures, model loading and backend choice. Existing clock/input/performance
ownership remains unchanged. Zero ambient demonstrates unlit back-facing
surfaces; the floor receives light but no object casts a shadow.

This is a diffuse preview, not metallic/roughness PBR or smooth shading. Lighting
tests verify N·L, linear/sRGB conversion, emission, mirrored/nonuniform transforms,
input immutability, invalid inputs and the existing depth renderer seam. The
cockpit pages remain unlit until a separately agreed application step.

## 10 — Point lights (implemented)

Open `/3d-point-light.html`. A scene-owned positional light illuminates the
shared reference shapes with flat diffuse incidence and inverse-square falloff.
Move the lamp in XYZ, set strength/color/fill, orbit/pause it and rotate the
objects independently. A small unlit marker visualizes the light's position.

Floor subdivisions deliberately expose one-sample-per-face shading. Close
light distances use a documented 0.1-unit denominator clamp; exactly coincident
samples receive no point contribution because their direction is undefined.
No shadows, specular/PBR, range culling, per-pixel lighting or cockpit migration.
The existing Rocket clock, input, performance monitor and scene cleanup remain
the only runtime owners. Tests cover falloff ratios, incidence, zero/near distance,
invalid data, composition, transformed geometry and the depth backend seam.

## 11 — First WebGL triangle (implemented)

Open `/webgl-triangle.html`. Optional WebGL2 pipeline, one immutable vertex buffer,
one VAO/program and one draw call. Linear vertex colors interpolate on the GPU;
the fragment shader encodes sRGB. Rotation/scale/aspect use a matrix uniform.
No third-party renderer, CPU rasterization, hidden Canvas 2D view or extra clock.

The small core `app.presentation` seam lets non-Canvas backends share Rocket's
scene activation, preparation, single update, render metrics and disposal order.
Tests exercise mixed Canvas/custom presentations, no-view activation, detach,
render failure and cleanup failure. GPU resource tests cover reuse, rollback,
invalid data and context ownership; browser diagnostics check native shader
compilation, pixel output, context loss/restoration, controls and recreation.

This remains a clip-space triangle baseline. Mesh/depth integration comes next,
then per-fragment lighting and later shadow maps. Existing CPU demos are intact.
GPU execution time and hardware acceleration are not inferred from submission
CPU times or the WebGL2 API being available.

## 12 · Existing meshes and GPU depth

`webgl-meshes.html` reuses Node3D, Mesh3D, cube geometry and PerspectiveCamera.
Two overlapping cubes demonstrate hardware depth testing, draw-order reversal,
rotation, orbit-camera controls and zoom. A selector renders the same scene with
our CPU depth rasterizer at the same 960×540 backing resolution; only one backend
renders at a time. Allow a second after switching for the CPU timing window to settle.
GPU antialiasing versus CPU point sampling remains an intentional visual difference.
The explicit depth-order diagnostic reads the center pixel with depth on/off in
both orders; it stalls and must be excluded from performance comparisons.
Mesh upload is cached; transforms are uniforms. GPU timing, context loss/restore
and presentation recreation follow milestone 11. No materials/textures or lighting
expansion yet. CPU/GPU timings are not additive; this small scene is not a stress test.

## 13 · Per-pixel GPU lighting

`webgl-lighting.html` demonstrates the existing ambient, directional and point lights
on two neutral cubes and a floor, with an emissive marker at the point light.
Separate controls move/animate the light or rotate the objects, and one cube uses
nonuniform scale. GPU mode shades fragments; CPU comparison retains flat per-face
lighting. Both use the same scene/light data and 960×540 raster dimensions.

The explicit “Check lighting math” diagnostic renders a white reference plane and
compares actual GPU pixel values against known sRGB results for dark, unlit,
ambient, directional front/back and point-light distance/off-center cases. It runs
outside GPU timing, stalls on readback and replaces the ordinary scene temporarily;
normal rendering is restored immediately afterward. Context restoration rebuilds
shader resources and cached meshes. Materials/textures, reflections and shadows
remain later milestones; apparent light through objects is expected without shadows.

## 14 · Base-color textures

`webgl-textures.html` is a material lab with three UV-mapped cubes using the
unchanged 1024² coating, steel and rubber base-color maps from the v4 cockpit
package. A high-contrast test pattern makes filtering/repetition easier to see.
Compare nearest, linear and trilinear sampling, repeat/clamp/mirror wrapping,
independent lights, camera poses and rotation. Image data, material binding,
sampler state and context-local GPU ownership are separate reusable pieces.
The original cockpit demos and material source package remain intact.

The explicit “Check UV + color” diagnostic verifies top/bottom image orientation,
repeat/clamp/mirror, linear-light sRGB filtering and textured lighting using actual
GPU readback. It temporarily replaces the scene, retires unused caches and restores
normal rendering afterward, outside GPU timer samples. Context loss/restoration
and recreation rebuild image and sampler resources from retained CPU pixels.
The resource panel reports current resident maps, sampler count and mip memory.

This slice deliberately stops at base color: it does not load the v4 textured GLB
or claim metallic steel, rubber roughness or tangent-space normal mapping. Next
comes material response and the model-loader texture binding, in bounded slices.

## 15 · Metallic and roughness

`webgl-materials.html` demonstrates direct-light GGX material response on three
smooth UV spheres. Default swatches use the same neutral base color and different
scalar coating/steel/rubber presets; these are illustrative presets, not a claim
that the complete v4 material maps have been imported. Adjust metallic/roughness
independently, enable source base-color textures, move the camera/light and compare
with Lambert. Performance remains above the canvas and settings below it.

The explicit material-math diagnostic checks closed-form normal-incidence GPU
samples for rough dielectric/metal, a narrower metal highlight, Lambert comparison,
metal diffuse ambient exclusion, unlit and back illumination. Moving the camera
must change the specular result. Readback temporarily replaces the normal scene,
retires unused caches, and stays outside timer samples. Lifecycle/context
restoration follows the earlier GPU milestones.

The optional reusable renderer consumes existing material factors and camera/light
data. The example owns its sphere geometry and UI. No new clock, game-specific
system or rendering dependency. Direct lighting only: packed maps, normal mapping,
environment reflections, shadows and cockpit integration remain separate slices.

## 16 · Packed material maps

`webgl-material-maps.html` uses the unchanged v4 cockpit ORM maps alongside the
existing base-color images. Separate green roughness, blue metallic and red
occlusion slots consume linear data. Source occlusion is neutral white, as authored.
The optional high-contrast pattern demonstrates spatial variation and occlusion;
it is explicitly diagnostic and never overwrites a source image.

Inspect each effective channel, multiply material factors, adjust occlusion strength,
compare maps on/off, switch base-color maps, move lights/camera and inspect sampling.
All factors start at 1 to preserve the original maps. Shaded output reuses milestone
15's direct-light GGX response. AO affects ambient fill only. Readback verifies raw
linear mid-values, channel packing/factors, neutral absent maps, and AO's exclusion
from direct light and emission. Performance and lifecycle follow previous milestones.

The engine adds explicit image transfer-function metadata and standard material
texture slots, with independent sampler state and one GPU allocation per shared
image. No packed-map-specific terrain/game system, new clock or dependency. Earlier
milestones remain runnable. Normal mapping is next; full textured cockpit loading
follows once that material path has been demonstrated.

## 17 · Normal mapping

`webgl-normals.html` demonstrates explicit tangent-space normals on unchanged sphere
geometry. Compare on/off, inspect world normals, vary strength, move the light and
switch between analytic demonstration ripples, an 8-bit flat reference and the
original cockpit maps. Existing base-color and packed maps combine independently.
Performance remains above the canvas; all controls follow it.

Actual GPU readback checks tangent X/Y directions, W handedness, reflected world
transforms, rotation, nonuniform scale, shear, strength zero, exact disabled bypass
and Lambert response. The host retains the existing Rocket clock, resource cleanup,
context restoration and recreation. No automatic tangent generation or displacement.
The optional engine pipeline consumes normal bindings and authored tangent data;
example geometry/pattern generation remain outside the engine. Cockpit import is
now the next integration slice, with its source geometry and all material channels.

## 18 · Textured cockpit

`webgl-cockpit.html` loads the original v4 GLB through the reusable browser image
adapter and existing CPU model parser. It retains 17 meshes, 2,072 triangles,
6,216 source vertices, all nine embedded maps and the pilot camera. GPU materials
consume base-color, ORM and tangent-space normal slots with original UV tiling.
No material-name shortcuts or copied cockpit renderer.

Start in the embedded pilot pose, choose exterior inspection, or adjust independent
XYZ/yaw/pitch/FOV controls. Compare normal mapping, inspect world normals/material
channels, change lights and test resource loss/restoration or recreation. The cabin
is intentionally open and exterior poses can expose its boundaries. Lighting is an
adjustable material-inspection setup; instruments, flight and environment lighting
are not implemented. The source asset and earlier v3/overlay demos remain intact.

Tests verify actual source geometry/camera/tangent counts, image identity/transfer
functions, sharing across slots/instances and explicit rejection of bad descriptors,
unsupported filters/UVs and missing tangent bases. Browser inspection verifies actual
PNG decoding, pilot/exterior presentation and the GPU/lifecycle seam. Performance
monitoring remains above the canvas and controls below it.

Milestone 18 navigation follow-up: the textured cockpit demo includes a finite
60 × 60 world-space reference grid (one square per unit), focus-scoped WASD/QE
movement, Shift speed, drag/arrow turning and R seat reset. A demo-owned pilot rig
moves the imported cockpit with the camera; exterior inspection detaches the
camera and resets the rig at the origin. Grid geometry uses the existing mesh
renderer and participates in depth testing and performance statistics. Controls
advance from Rocket's scene update, release on blur/visibility change and retire
with the presentation. This is direct exploration, without flight physics,
collision or camera movement limits appropriate to a finished cockpit scene.

## 19 · Environment reflections

`webgl-environment.html` demonstrates image-based lighting independently of the
cockpit and direct lights. Three shared-geometry spheres (silver, gold and blue
dielectric) expose roughness, environment intensity/yaw, optional rotation and a
direct-light comparison. Performance stays above the viewport, settings below.
Six source-face previews show what the materials reflect.

The reusable foundation is `EnvironmentMap` + `bakeEnvironment` in `src/3d`, an
optional shader path and a context-local three-texture store. The demo bakes a
64² procedural studio once, using 128 samples, seven GGX levels, 12² diffuse and
a 64² split-sum lookup. At roughly 147 KiB, its resources are retained across
frames. It neither imports a rendering framework nor changes prior demo options.

Acceptance checks cover constant radiance preservation, cube edge orientation,
directional-panel broadening, immutable linear assets, invalid budgets, retained
uploads, replacement/disposal and pipeline opt-in. The browser's explicit GPU
readback compares constant environment RGB and zero intensity with tolerance;
context-loss/restore and recreation exercise ownership cleanup.

Current boundaries: linear RGBA8, synchronous bounded preprocessing outside the
frame loop, single scattering, distant environment without local scene
reflections, HDR/tone mapping, skybox or shadows. The cockpit application follows
after this standalone slice is reviewed.

## 20 · Cockpit environment

`webgl-cockpit-environment.html` applies milestone 19's environment pipeline to
the original textured cockpit. Milestone 18 remains the direct-light baseline;
both pages share the same cockpit host, model, reference grid and navigation.
The host opts into the environment pipeline only when the new page supplies its
explicit environment controls. No renderer/core/model changes are needed.

A shared example-owned `StudioEnvironment` constructs and previews the exact
same studio as milestone 19; it is baked once per page and survives presentation
recreation/context restoration as immutable CPU data. The reflection toggle,
strength and world yaw are independent of direct lights. Default strength is
65%, with reduced direct ambient/directional/point illumination (0.02/0.35/6).
Environment resource counts/bytes are reported separately from material maps.

The preview explains the artificial studio source. This is inspection lighting,
not a skybox or scene capture: cabin walls do not occlude the environment, and
cockpit/grid do not reflect each other. Existing single-scattering RGBA8 and
no-shadow limitations remain. User-facing checks include the combined normal /
material / environment shader, environment toggle and yaw, navigation, context
restoration, recreation and the existing normal readback diagnostic.

## 21 · Directional shadows

`webgl-shadows.html` is a separate shadow-map lab: one directional lamp, two boxes,
a hovering sphere and a receiver floor. Shadows affect the directional lamp;
ambient fill remains in occluded regions. Controls expose resolution, constant /
slope bias, coverage, hard vs nine-tap PCF, light rotation and independent caster /
receiver flags. A visibility mask makes comparisons visible without material
color. Performance remains above the canvas, settings below it.

Reusable implementation: the DOM-free `DirectionalShadow3D` contract and
orthographic matrix helper; an optional depth shader/framebuffer pass reusing
existing GPU geometry; selected-light comparison in both material and Lambert
shaders. The backend owns its depth resources, never a clock or domain model.
Nodes hold independent casting/receiving flags; shared assets remain unchanged.
Color/depth draw counts and estimated depth bytes are visible separately.

Verification covers volume orientation/validation, retained VAOs and depth targets,
resize/disposal, framebuffer/compile/link rollback and independent flags. The
browser readback compares shaded vs unshadowed RGB plus visibility with caster /
receiver disabled, using existing render handlers. Resolution/filter controls,
context loss/restoration and recreation are integration gates.

Boundaries: one directional light, opaque geometry, explicit fitted volume,
receiver bias, hard or 3 × 3 PCF. No point-light/cascaded/contact shadows or cockpit
integration yet. Sampling beyond the fitted volume is lit. The demo intentionally
lets low resolution and extreme bias reveal aliasing, acne and detached shadows.

## 22 · Cockpit shadows

`webgl-cockpit-shadows.html` combines the existing textured cockpit, environment
lighting and directional-shadow backend. It shares the cockpit host with 18/20;
those pages do not opt into shadows. The source GLB, material maps and reusable
renderer remain unchanged.

The example computes a conservative model bound once, after the GLB coordinate
conversion, then fits a spherical orthographic shadow volume around that bound.
Its center follows the inspection rig and model yaw; its radius stays constant
under those rigid movements. World-space directional yaw/elevation are independent
of ship motion. The reference grid neither casts nor receives shadows. Fitting
belongs to the example (`CockpitShadowFit`), not the backend or imported model.

Controls expose shadow enable, PCF, visibility mask, 256..2048 resolution,
constant/slope bias and incoming light yaw/elevation. Default: 1024², bias 0.0005,
slope 0.001, light yaw -25°, elevation 25°, directional strength 1.4. Environment
strength is 35%, ambient 0.02, point lamp 0 so the shadowed directional contribution
is easier to see. Environment and point-light controls remain independent. The
status reports actual caster draws, triangles, fitted coverage and estimated
depth allocation; performance above the canvas includes depth/color passes.

Focused tests cover nested converted geometry, meshless cameras, immutable bounds
and enclosure under rigid movement with independent light directions. Browser
checks cover the complete material/normal/environment/shadow shader, light and
shadow toggles, resolution replacement, GPU normal readback, navigation, context
loss/restoration and recreation.

Limits: original forward cockpit is open; external views expose its boundaries.
Only the directional lamp is shadowed. Environment fill, ambient, emissive
surfaces and the point lamp remain unoccluded. Thin trim can expose the normal
shadow-map bias/aliasing tradeoff; no model repair, point shadows, environment
occlusion or flight physics is added.

## 23 · Dynamic textures

`webgl-dynamic-textures.html` proves dynamic pixel transport independently of the
cockpit. A 512 × 320 opaque canvas draws simulated radar/ship readouts. Two angled
3D surfaces share one immutable mesh binding and one `DynamicTextureImage`, with
exactly one GPU texture. Default display cadence is 10 Hz (1..30 selectable),
advanced by Rocket's existing scene update; 3D presentation follows the normal
render cadence. Only the example interprets the simulated instruments.

Pause stops canvas draws, source revisions, in-place updates and mip builds while
panel motion/rendering continue. Advance once or change color while paused to
publish one revision; changing texture filtering reuses pixel storage. The source
canvas is visible below the controls. Performance remains above the viewport,
settings below it. Resource and submission counters distinguish geometry,
allocated texture bytes, source revisions, successful uploads and mipmap builds.

The source owns fixed opaque CPU pixels/revision; the browser adapter owns canvas
readback; the renderer owns context-local upload/cache/disposal. It updates with
`texSubImage2D`, coalesces unseen revisions, shares across draws and catches up
independently per context. Restoration/recreation uses the latest retained source.
No new clock or instrument/domain model is introduced into the engine.

Tests cover atomic snapshot copying/validation, fixed descriptors, coalescing,
sharing across units/contexts, unused-source retirement, failed update retry,
restoration, sampler independence and unchanged geometry uploads. Browser
readback proves red → green and zero repeat updates; UI checks cover pause,
single advance, color/filter changes and lifecycle behavior.

Boundaries: full opaque RGBA8 snapshots, CPU canvas readback/copies and full mip
regeneration on updates. Unlit base color is used for legibility. No cockpit
attachment, per-material emission, bloom, nearby lighting, resizing, subregions,
video, direct DOM upload or automatic dirty detection in this slice.

## 24 · Cockpit instruments

`webgl-cockpit-displays.html` mounts two independent dynamic textures on the
model's authored left/right display fronts: radar left, simulated telemetry right.
An example-owned adapter selects the named meshes and separates their two front
triangles from their black sides/back, preserving source geometry, UVs, transforms,
all 2,072 model triangles and the original GLB. No floating overlay or duplicated
screen geometry is added. Earlier cockpit milestones retain their original materials.

The reusable GPU `Material3D.unlit` flag bypasses illumination per primitive while
retaining perspective, clipping and depth. Adjacent cabin materials keep their
lighting, normal maps, reflections and directional shadows. This is a luminous
appearance only: no bloom or illumination of nearby geometry. Lit/unlit faces
must be split into separate primitives, like differing texture bindings. Canvas
renderers retain their existing color-only behavior; automatic glTF unlit extension
loading is not added in this slice.

Each opaque 512 × 416 canvas publishes at 10 Hz by default, independently of render
cadence, using the existing Rocket scene update. Pause freezes both sources; advance
publishes exactly one revision each. Updates coalesce to one canvas draw per tick.
CPU sources survive GPU context restoration and renderer recreation. The host owns
all mock instrument meaning, drawing and update cadence; the renderer knows only
materials/textures. Settings stay below the canvas, performance above it.

Focused tests exercise the actual model's face isolation, source preservation,
triangle conservation and independent bindings, plus unlit-to-lit draw-state reset
and disposal. Browser checks cover placement/readability, pause/single-step, dark
cabin, camera movement and context loss/restoration/recreation.

### Cockpit viewport resolution

The WebGL cockpit pages (18, 20, 22 and 24) now size their drawing buffer to
viewport CSS dimensions × current device pixel ratio × render scale, rather than
the former fixed 960 × 540 comparison raster. Default scale is 100%; 50..200%
permits lower-resolution rendering and supersampling without changing layout,
camera FOV or texture sizes. DPR is sampled during rendering, including monitor
and browser zoom changes. Reported viewport/renderbuffer limits constrain both
axes proportionally when necessary. Performance shows actual raster dimensions,
CSS dimensions, DPR, scale and any hardware dimension limit. Shadow-map resolution
and dynamic source texture resolution remain separately controlled.

### V5 fitted-wear asset

Milestone 24 now selects `cockpit-forward-v5-wear.glb` through the host's
`data-model` and `data-model-label` attributes. Earlier cockpit milestones retain
v4. No renderer/loader change or display-adapter redesign was needed. V5 has
byte-identical positions, normals and indices, unchanged nodes/camera, and
unchanged live-display UVs/tangents. Its fitted atlas requires its own UVs; maps
are loaded from the complete GLB, never substituted onto v4 geometry.

The six embedded images are three 2048² wear maps and three 1024² rubber maps.
Base color is sRGB; ORM and normal data stay linear. Shared atlas image identities
retain one GPU allocation each; atlas clamp and rubber repeat use separate
samplers. The instruments page reports about 82.17 MiB RGBA8+mips including its
two display sources and neutral fallbacks, excluding environment/shadow resources.
The extra fixed-gauge material does not replace any of the five live displays.

Imported from the supplied `cockpit-3d-v5-wear` package, GLB SHA256:
`d37b9faaaf47c6d9a3fcbe1ff6109784eecde5a1b6043e5de36c488a18ed665a`.
Both v4 and v5 run through the same actual-asset display isolation test.

### Overhead navigation and forward reference

Milestone 24 fills all five authored display fronts through the same adapter.
The three overhead readouts show values only, left to right: local X/Y/Z,
heading/pitch (degrees), and navigation speed (grid units/second). These use the
existing camera/pilot controls; speed measures displacement during each navigation
update, excluding slider teleports. No flight physics or universal coordinates
are introduced. Labels live in the controls explanation, not on the mini screens.
All five textures follow the existing pause/advance/cadence controls; manual advance
uses the latest navigation sample even while paused.

An ordinary unlit mesh marks cockpit forward, eight source units ahead of the
pilot. It inherits the cockpit assembly transform, uses normal clipping/depth,
and casts/receives no shadows. It is a finite-distance direction reference, not a
collimated optical HUD or targeting system. Independent camera exploration can
move it offscreen or reveal parallax. The cockpit's fitted shadow volume excludes
this mark. Its toggle changes node visibility without rebuilding geometry.

The source GLB and all 2,072 model triangles remain unchanged. Actual-asset tests
now exercise all five display bindings on both v4/v5, plus reticle transform/resource
identity and shadow exclusion. Engine contracts remain unchanged.

## 25 · Standalone bloom

`webgl-bloom.html` isolates bloom before applying it to a cockpit. Three bright
colored bars and an instrument panel contrast with a dim tile and a foreground
occluder. Controls show the sharp scene, extracted bright pixels, blurred glow and
final composite, with threshold, strength, radius, animation and native render scale.
Performance is above the canvas; settings are below it. GPU timing wraps the scene
and complete effect. Diagnostics run outside timed draws.

The reusable `WebGLRenderTarget` owns RGBA8/depth16 framebuffer storage independently
of scene/camera/clock. The existing mesh backend accepts an optional target; ordinary
rendering still goes directly to the canvas. `WebGLBloomPass` accepts an already
rendered sRGB scene target, owns two half-resolution scratch surfaces and presents
to the canvas. It performs bright extraction (four source taps with a soft threshold
on peak linear RGB), two horizontal/vertical nine-tap Gaussian pairs, and additive
linear compositing followed by sRGB encoding. Six fullscreen draws when active;
zero strength/scene view uses one copy draw; extraction view uses two draws. Sampling
and writing alternate targets to avoid feedback. Both target size and scratch
allocation are retained until dimensions change. No new scene, clock or domain model.

This follows the established [bright-pass/separable-blur pipeline](https://learnopengl.com/Advanced-Lighting/Bloom)
and [framebuffer render-to-texture boundaries](https://wikis.khronos.org/opengl/Framebuffer).
This bounded first version uses LDR scene output, not that reference's HDR lighting.
Existing highlights are already clipped. Intermediate RGBA8 linear glow has finite
precision; deep halos can band. Offscreen scene rasterization is single-sample.
No exposure/tone mapping, emissive texture pipeline, bloom pyramid, lens dirt,
physical lens simulation, nearby illumination or cockpit integration is added.

Tests cover context ownership, target reuse, atomic resize rollback, limits,
disposal, framebuffer failure recovery, offscreen viewport/depth validation,
parameter validation, bypass/debug draw counts and retained scratch allocation.
Actual browser readback checks halo outside a bright source, preserved sharp center,
threshold cutoff and extraction isolation. UI checks cover controls, native sizing,
context loss/restoration and recreation. GPU metrics are observations of this scene,
not a hardware benchmark or promised display frame rate.

## 26 · Cockpit bloom

`webgl-cockpit-bloom.html` combines the existing v5 cockpit, five live displays,
reticle, materials, environment and directional shadows with milestone 25's
unchanged `WebGLRenderTarget`/`WebGLBloomPass`. Earlier cockpit milestones remain
separate and do not allocate offscreen or bloom resources. Default threshold 0.6,
strength 0.35, radius 1.5 keeps the effect restrained. Bloom is based on bright
visible scene pixels, including reflections; it is not limited to emissive materials.
There is no nearby light spill or new scene illumination.

Scene rendering and diagnostic redraws use the same submission callback. An
optional full-resolution RGBA8+depth16 target supplies two retained half-resolution
glow surfaces. Shadow depth rendering remains unchanged and precedes the color
pass. GPU timing covers shadow, scene and post-processing draws; readback probes
remain outside timed samples. Target estimates are shown separately from material,
environment and shadow allocations. Native DPR/render scale still apply, bounded
by texture/renderbuffer/viewport limits.

The bloom toggle in Composite mode compares strength zero with the effect while
keeping the same single-sample offscreen scene. Scene/extraction/glow views remain
available independently. World-normal, material-channel and shadow-mask inspection
bypass bloom automatically, avoiding diagnostic contamination. Existing normal-map
GPU readback returns to the same scene plus post-process afterwards.

Context loss retires both target and bloom handles; restoration rebuilds from the
retained model/display sources. Recreation/disposal releases the optional pipeline
along with existing resources. Browser checks cover the complete shadow + material

- environment + bloom combination, toggles/stage views, diagnostic bypass, navigation,
  resolution replacement, GPU normal readback and loss/restoration/recreation. Existing
  focused renderer/actual-model tests and static checks remain green.

Limits are those of milestone 25: 8-bit clipped scene and glow, no HDR/exposure or
multisample offscreen antialiasing. Bright labels may bloom alongside lamps; threshold,
strength and radius are independent controls. The original GLB is unchanged.

## 27 · Screen light spill

`webgl-cockpit-spill.html` uses existing `PointLight3D` data and the existing GPU
lighting backend to approximate LCD illumination on nearby cockpit geometry.
No engine/shader API changes. The example-owned `cockpitScreenLights` adapter
finds the five attached display fronts, computes each authored face area, and
places a point 0.075 local units in front of it. World positions are recomputed
through the existing node transforms, so movement, turning and model rotation
carry the sources with the cockpit. Green lower displays and amber overheads use
representative linear colors. Intensity is local face area × user strength;
minimum inverse-square distance is 0.12. These are artistic backlight approximations,
not photometric output or radiance sampled from the animated textures.

The five sources plus the original ambient/directional/point lights fill the
existing eight-light limit. Strength zero, spill disabled or display power off
omits the five sources. Display power also publishes dark pixels to all five
textures once; power-on redraws even when the update cadence is paused. Powered-off
sources stop periodic drawing. Pausing alone retains visible readouts and lighting.
The existing Rocket update owns these changes; there is no extra clock.

The isolation checkbox suppresses the original ambient, direct lamps and studio
environment contribution without overwriting their controls. Emissive lamps/grid
remain visible. Bloom stays independent; turn it off to inspect surface illumination
alone. Light spill changes material shading before bloom extraction. Scene/mask
inspection, native resolution, shadows and context restoration retain their earlier
contracts. Earlier milestones do not create these sources or power controls.

Actual-model tests on v4/v5 verify five sources, area weighting, representative
colors, power/zero-strength suppression, validation and attachment under translation,
rotation and mirrored coordinates. Browser checks cover isolation, bloom separation,
blackout/power-on while paused, light limits, GPU diagnostics and lifecycle cleanup.

Limits: five omnidirectional points, no area-light response, point-light shadows,
visibility or occlusion. Light can pass through the cabin walls. Existing eight-light
budget is fully used in the combined view. No new meshes/textures, HDR pipeline,
photon transport or nearby lamp illumination beyond the screen approximation.

## 28 · Finite asteroid field

`webgl-asteroids.html` starts a separate example-owned space scene. A deterministic
32-bit seed produces eight irregular rock meshes and 96 default placements. Two
midpoint subdivisions of an octahedron produce 128 outward-wound triangles per
shape. Shared vertices receive radial displacement; flat normals reveal facets.
Position, orientation and nonuniform scale vary independently. Increasing the
count preserves earlier placements; shape and placement random sequences are separate.

Existing `Node3D`, `Mesh3D`, camera, WebGL lighting/depth, GPU timer and Rocket scene
ownership are reused. Geometry uploads are shared by mesh identity; each rock is
still a separate draw. Native DPR resolution and explicit scale controls follow the
cockpit presentation. Performance stays above the canvas and controls below it.
The existing exploration input adapter drives movement from Rocket updates, with
optional forward cruise. Home resets the camera; generation preserves its pose.
Context restoration retains CPU content and rebuilds GPU resources. Recreate and
page exit retire events, renderer, timer and canvas.

Verification: generation tests cover deterministic seeds, stable count prefixes,
shared mesh identity, bounded placements and closed, nondegenerate outward-wound
geometry. Browser checks cover cruise/home, regeneration at 256 rocks, seed changes,
lighting, render scaling, context loss/restoration and recreation.

Limits: finite static content, no collisions, asteroid motion, textures, shadows,
GPU instancing, LOD, custom culling, streaming, wrapping or cockpit integration.
The field is an inspection scene, not an astronomical simulation or stress benchmark.

## 29 · Cockpit asteroid field

`webgl-cockpit-asteroids.html` composes the v5 cockpit and milestone 28 field in
one existing WebGL presentation. The field is a sibling of the pilot rig, so its
placement stays fixed while the cockpit follows camera translation and rotation.
The example-owned `cockpitAsteroidField` adapter positions the field 18 units
forward, retains eight shared meshes, and gives the rocks nonmetallic rough
materials. No renderer, loader or engine API changes.

The existing cockpit host opts in through `data-world="asteroids"`; earlier pages
retain their previous settings. Five displays, reticle, lighting, cabin shadows,
screen spill, native resolution and bloom use their existing paths. The optional
reference grid starts hidden. The far plane extends to 600 units; number inputs
allow navigation beyond the former camera slider bounds. Direct movement is
8 units/second or 30 with Shift, with optional forward cruise. Home and exterior
inspection stop cruise. Regeneration replaces only world content, retaining the
camera and cabin. The normal renderer cache retires unused rock meshes.

The directional shadow map remains fitted to the cabin; rocks neither cast nor
receive those shadows. Studio environment lighting remains an artistic source,
not a space environment or a reflection of the field. Radar contacts and lower
telemetry remain simulated. Upper navigation readouts use actual control movement.

Verification: focused tests cover fixed world placement under pilot-rig movement,
field replacement and shared diffuse meshes excluded from cabin shadows. Browser
checks cover translation/turning, cruise/home, travel beyond the old slider bounds,
visibility, regeneration at 256 rocks, restoration retaining the chosen seed/count,
normal-map GPU readback (GL error zero) and presentation recreation.

Limits: finite static field, no collisions, flight dynamics, streaming, wrapping,
LOD, GPU instancing, asteroid shadows, radar binding or new lighting techniques.

## Deferred ideas

Recorded at Julien’s request on 2026-10-16:

- HDR rendering, exposure and tone mapping.
- Area lights and local-light occlusion/shadows, including reducing cockpit light leaks.

These are future exploration topics, with no assigned milestone, schedule or
implementation approval.

### Hi3D v3 fitted instruments

The Hi3D preview uses unrestricted numeric camera-position fields. Range inputs
would clamp the flight state at their slider endpoints and create invisible
walls; cockpit fit sliders remain bounded independently.

`webgl-cockpit-hi3d.html` adds five unlit, depth-tested inserts without changing
its GLB or bezel artwork. `Hi3dCockpitDisplays.ts` fits the facade in preview
units before the shared width/height/Y/Z tuning, so the inserts inherit the
same fit, pilot rig and cosmetic motion as the model. This is an asset-specific
adapter for the v3 gap-filled mesh, not the older authored display-name adapter.

Overhead order follows the different glass sizes: heading/pitch on medium left,
speed on small center, local XYZ on large right. `Hi3dCockpitInstruments.ts`
paints new graphics at 10 Hz by default (1–30 Hz control, pause, single-step,
power). Lower left is heading-up, top-down radar of actual asteroid centers
within a spherical 120-unit range. Lower right shows current navigation speed,
heading/pitch and nearest in-range center distance. It does not invent hull,
shield or power state. Contact size, pitch projection, collision clearance and
occlusion are not modeled. Readouts describe the camera when inspecting freely.

These use the existing dynamic-texture transport and scene update; no new timer
or GPU ownership is introduced. Recreate/context restoration use the shared
renderer lifecycle. Screens are unlit; bloom and instrument light spill are not
enabled on this preview. The source GLB, baked texture lighting and accepted fit
remain unchanged. Tests cover radar translation/heading/range and fitted surface
sizes, bindings and inherited transforms; browser checks cover visual alignment,
updates, pause/step/power, field visibility and recreation.

Hi3D display fitting controls retain 0.001-unit X/Y steps, browser persistence,
and a DOM JSON readout (`display-tuning-values`). Julien's accepted offsets,
relative to the fitted insert geometry and before the shared cockpit fit, are
now the HTML defaults (also restored by Reset display offsets):

| Display                |      X |      Y |
| ---------------------- | -----: | -----: |
| Lower left radar       | -0.010 | +0.011 |
| Lower right flight     | -0.079 | +0.011 |
| Overhead heading/pitch |      0 | -0.030 |
| Overhead speed         |      0 | -0.030 |
| Overhead position      | -0.007 | -0.030 |

### Hi3D large lamp fit check

`Hi3dCockpitLamps.ts` adds four opaque beveled lenses over the large yellow
faces: overhead left/right, center console and right console. These are separate
nodes under asset placement, with the same inverse placement scale as the
instrument inserts, so the accepted cockpit fit and motion affect them together.
The GLB and its texture bytes are unchanged; smaller lamps and empty round
slots are untouched. Each checkbox in `lamp-controls` selects a cached on/off
mesh with shared geometry. Off keeps a dark lens in place to cover the baked
glow; it does not hide the overlay and reveal the old bright texture.

The two opaque procedural glass textures are shared across the four lenses.
There is no extra clock, alarm logic, bloom or light spill. Control listeners use
the existing application abort signal; recreation reuses checkbox state and
retires the old renderer/resources. Tests cover independent switching, opaque
dark coverage, retained geometry and cached meshes. Browser checks cover the
four on/off states and placement at the accepted pilot fit.

Lamp fitting uses the shared `Hi3dDisplayTuning` helper with a separate `lamp`
namespace/storage key. Each lens gets additive X/Y offsets in 0.001-unit steps;
its original depth and placement are preserved. The four rows, including on/off
controls, sit above the canvas. `lamp-tuning-values` exposes exact offsets for
capturing the accepted fit later; display offsets remain independent.
