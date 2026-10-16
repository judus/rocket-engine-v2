# Optional 3D foundation

Import from `rocket-engine-v2/3d` (repository examples use `src/3d/index.js`). Importing the main Rocket entry point does not load 3D. No third-party renderer, global registry, automatic frame loop or mandatory service is introduced.

## Ownership and use

`MeshGeometry` is an immutable copy of indexed vertices, convex planar faces and optional wireframe edges. Faces reference material slots. Geometry rejects non-finite positions, invalid indices, duplicate face IDs and invalid material slots; planarity/convexity and outward winding are caller responsibilities. Triangles are supported. `Mesh3D` binds geometry to immutable color materials and rejects missing slots. Several nodes or meshes can share the same geometry. To change surfaces, assign a new mesh with the same geometry and different materials.

`Node3D` holds a mesh (or null for a group), visibility and local transform. `add` reparents with local pose preserved; `remove` detaches without disposing the asset. Cycles reject before mutation. Names are labels, not globally unique IDs. `children` returns a snapshot. Hidden nodes hide their subtree when traversed. `worldMatrix()` returns a fresh current matrix; `traverse` visits visible nodes with their current world matrix. Do not mutate the hierarchy from a traversal callback. Traversing an attached subtree includes its ancestor transforms; traversal visibility starts at the supplied root.

Nodes and meshes hold ordinary JavaScript data only: dropping the scene's references releases them for garbage collection. They do not require dummy `dispose` methods. Rocket scenes own any input scopes, DOM listeners, views and other external resources through their existing resource scopes. A future model loader must define its own resource leases when actual external resources are introduced.

```ts
import {
  CanvasRenderer3D,
  MeshGeometry,
  Mesh3D,
  Node3D,
  PerspectiveCamera,
} from 'rocket-engine-v2/3d';

const geometry = new MeshGeometry(
  [
    { x: -1, y: -1, z: 0 },
    { x: -1, y: 1, z: 0 },
    { x: 1, y: 1, z: 0 },
  ],
  [{ id: 'front', indices: [0, 1, 2], material: 0 }],
);
const root = new Node3D('root');
const object = new Node3D('triangle');
object.mesh = new Mesh3D(geometry, [{ color: '#80dbbd' }]);
object.transform = { ...object.transform, position: { x: 0, y: 0, z: 4 } };
root.add(object);
const camera = new PerspectiveCamera();
const renderer = new CanvasRenderer3D();
// Inside an existing Rocket scene draw callback, using logical view dimensions:
// renderer.render(ctx, root, camera, width, height);
```

No DOM or Rocket application is needed to create/traverse nodes, transform geometry, collect world faces or project them. The Canvas backend accepts a caller-owned 2D context. `render` returns submitted/back-facing/outside counts and projected visible faces, suitable for caller-owned performance presentation. It neither clears nor resizes the canvas. Its drawing state is saved/restored, including when drawing throws; as with ordinary Canvas paths, the current path is replaced. `line` projects, clips and strokes one world segment, returning whether it survived. `collectFaces` creates a world-space snapshot; `drawFaces` can render that snapshot for static assemblies without rebuilding transforms each frame. Recollect after changing transforms, mesh bindings, visibility or hierarchy.

## Coordinates and transforms

Right-handed +Y up, camera looks along +Z at zero yaw/pitch. Angles are radians, vertical FOV is in radians, near/far are currently 0.1/160. Positive yaw looks toward +X; positive pitch looks up. Width/height must be positive finite logical pixels. FOV must be finite and strictly between zero and pi. This camera convention is explicit; it is not a claim of glTF camera compatibility.

Local transforms apply component-wise scale, then Euler X, Y, Z rotations, then translation. Column-major matrices act on column vectors. World matrix is parent * local. Matrix composition retains shear introduced by nested rotations and nonuniform scales; it does not decompose world transforms back into Euler/scale fields. Mirrored transforms reverse winding during face collection so outward surfaces remain outward. Zero scale can produce degenerate faces, which are culled. No quaternion API is claimed yet.

## Backend limits

The current renderer clips convex faces against all six frustum planes, culls back faces and sorts by average camera-space depth. This is still approximate painter ordering, not a depth buffer or general intersection solution. Materials are unlit CSS colors; no normals, textures, PBR, lights, transparency ordering or model loading. Grid lines remain a separate reference pass without depth testing. No spatial acceleration, bounds culling, instancing or LOD has been added.

## Demonstration and verification

`/3d-foundation.html` shows shared geometry with two material bindings, child-local transforms, a controllable common parent and detach/reattach. Recreate returns to two children and one canvas using Rocket's existing lifecycle. Pages 01–05 also consume the extracted camera/line or mesh renderer; the cockpit layout, fixed tints, artwork grading and controls remain example-owned.

Existing camera, transform, culling and assembly checks now exercise the public module. `tests/3d-foundation.test.ts` covers nested nonuniform transforms, reparenting/cycle rejection, independent shared assets, mirrored winding, world snapshots, visibility/detach, invalid geometry and renderer behavior without a DOM. These numerical checks complement browser checks; they do not prove general occlusion or model compatibility.

## Optional CPU depth renderer (milestone 07)

`SoftwareDepthRenderer3D` is an additional backend; `CanvasRenderer3D` remains the inexpensive painter path. Both consume the same `Node3D`/`MeshGeometry`/`Mesh3D` scene or cached `Face[]`, camera and six-plane polygon clipper. `collectFaces` now resides in a backend-independent module. `PerspectiveCamera.polygon` includes `reciprocalDepth` for each clipped/projected vertex. `projectFaces` accepts an optional final `sortByDepth` argument, true by default; the depth renderer passes false and preserves submission order.

```ts
import { SoftwareDepthRenderer3D } from 'rocket-engine-v2/3d';
const depth = new SoftwareDepthRenderer3D();
// In the existing draw callback, with an explicit raster resolution:
// const stats = depth.render(root, camera, 320, 180);
// Canvas presentation is caller-owned:
// ctx.putImageData(new ImageData(depth.pixels, depth.width, depth.height), 0, 0);
```

`render(root, camera, width, height)` or `drawFaces(faces, camera, width, height)` returns submitted/visible/back-facing/outside face counts, triangle count, covered samples tested, successful depth writes and buffer bytes. Convex clipped faces are triangulated as a fan. Pixel centers use edge functions with a top-left shared-edge rule. Reciprocal camera depth is barycentrically interpolated in screen space; larger 1/Z wins. This is an independent implementation of the standard depth-buffer method, not copied rendering code. [Depth interpolation explanation](https://www.scratchapixel.com/lessons/3d-basic-rendering/rasterization-practical-implementation/visibility-problem-depth-buffer-depth-interpolation.html).

Storage is one Float64 reciprocal-depth value and four RGBA bytes per raster pixel (12 bytes/pixel total). Buffers are cleared each draw and reused at unchanged dimensions, replaced on resize. `pixels` is a borrowed mutable typed array for presentation: callers must treat it as read-only, consume it before the next draw and recreate any ImageData wrapper after dimensions change. `depthAt(x,y)` returns camera-space Z, Infinity for untouched background, and rejects out-of-range/fractional coordinates. Dimensions must be positive integers, limited to 4,194,304 pixels per buffer pair (48 MiB). This is an allocation bound, not a claim about usable frame rates. Dropping the renderer releases ordinary memory for garbage collection; no DOM/GPU resources or separate clock exist in the backend.

This bounded backend accepts opaque `#rrggbb` materials only; unsupported visible surface colors throw. It performs single-sample rasterization without anti-aliasing, textures or blending. Equal-depth/coplanar surfaces use first-writer-wins and can still exhibit order dependence or precision artifacts; no polygon offset or GPU precision parity is claimed. Coverage uses floating-point edge equations rather than a GPU's fixed subpixel rasterization, so bit-for-bit hardware coverage is not promised. Reference grid lines in earlier demos do not enter this depth buffer. This backend does not silently replace their painter renderer.

`/3d-visibility.html` compares intersecting panels using one Rocket view and clock, one scene snapshot/camera and matched raster dimensions. It offers reverse submission, depth-map display, panel yaw/animation, free camera and three raster widths. Single-renderer modes isolate workload; compare mode's overall Render CPU/FPS includes both paths. Per-renderer CPU averages include projection/draw/image submission and optional depth-map conversion but omit common world-face collection; Canvas presentation may be deferred by the browser. Canvas painter edges are antialiased, software edges are not. This is a learning/performance probe, not a controlled Canvas-versus-WebGL benchmark. Recreate disposes old listeners, view and input scope, resets options and zeroes both private presentation canvases.

Focused depth tests use independent analytic ray-plane intersections to verify per-pixel depths/colors, order independence for crossing opaque surfaces, eye/near clipping, full-viewport coverage without fan holes, nearest-surface selection, buffer reuse/resize/clear and explicit unsupported-input errors. The demo model is shared with the crossing-panel regression so tests exercise the displayed geometry.

## GLB assets (milestone 08)

`parseGlb(arrayBuffer)` is a synchronous, DOM-free decoder; `loadGlb(url,
{ signal })` adds fetch/HTTP handling and caller-owned cancellation. Neither
registers a service, starts a clock, caches globally or allocates GPU resources.
The application chooses its own asset cache/lifetime. Parse once, then call
`model.instantiate()` for independently mutable node trees sharing immutable
meshes, normals, UV0 and materials. Release references when the scene retires.
Cancellation stops fetching, not synchronous parsing already in progress.

The bounded GLB 2.0 subset supports one embedded BIN, triangle primitives,
indexed (unsigned byte/short/int) or unindexed FLOAT positions, optional FLOAT
normals/UV0, interleaved attributes, multiple primitives, hierarchy, affine
matrices or quaternion TRS, opaque single-sided materials, and finite perspective
cameras. Vertex/accessor ranges, component alignment, hierarchy and container
lengths are checked. Extensions, compression, textures, extra attributes, skins,
animations, morphs, sparse accessors, transparency, double-sided materials,
orthographic and infinite cameras reject explicitly. This is not a general
Khronos validator or a complete glTF importer.

Imported nodes retain source coordinates and names. `Node3D.matrix` is an exact,
cloned, frozen affine matrix and overrides `transform` until set to `null`.
This avoids lossy quaternion-to-Euler conversion and preserves nested nonuniform
transforms. `MeshGeometry` optionally retains immutable per-vertex `normals` and
`texCoords`. Materials retain linear `baseColorFactor`, `metallicFactor`,
`roughnessFactor`, `emissiveFactor` and names. Current Canvas backends use only
the sRGB-converted base color; there is no lighting, texture sampling or emission.

`GlbInstance.cameras` exposes the active scene's camera nodes and perspective
metadata. Rocket cameras now have configurable positive `near` and `far > near`;
all previous defaults remain 0.1 and 160. glTF cameras look down local -Z whereas
Rocket looks +Z. The example mounts the imported asset under a Z reflection
and derives the upright v3 pilot preset from its camera node's world matrix.
The core importer does not rewrite coordinates or impose camera controls. A
future general camera adapter must handle roll and aspect-ratio policy; this
example uses v3's upright preset and the demo viewport aspect ratio.

`3d-model.html` loads cockpit v3, offers a local-file replacement through the
same parser, depth/painter/wireframe inspection, exterior and pilot presets,
cancel/retry, and recreate cleanup. Scene teardown cancels pending requests,
prevents stale installs, removes control listeners, releases model references
and retires its presentation canvas. It uses the existing Rocket clock/input/
performance shell, and caches transformed faces while the model is static.

Format reference: [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

## Independent flat lighting (milestone 09)

`shadeFaces(worldFaces, lights)` is an optional pure pass shared by renderers.
Scene code owns the light array and its lifetime. Meshes have no references to
lights; lights have no references to meshes, cameras, clocks or renderers.
`Light3D` is an ambient/directional data union. Linear RGB components are 0..1,
intensity is finite/nonnegative and unitless. Directional `direction` points
**from the surface toward the light**, in world coordinates, and is normalized
on evaluation. Directional light has no position or distance attenuation.

`collectFaces` retains the immutable source `material` alongside its existing
unlit `color`. The lighting pass returns new face records without modifying
geometry or materials. It uses geometric world-space face normals, preserving
correct orientation under nonuniform scale and mirrored transforms. This is
flat shading; imported per-vertex normals remain stored for a later smooth
shading pipeline. Degenerate faces receive ambient/emission only.

The preview equation is:
`linear output = base * (ambient + sum(lightColor * intensity * max(0, N·L))) + emission`.
Source glTF linear factors are used when present; otherwise `#rrggbb` is decoded
from sRGB. Accumulation is linear and clamped to 0..1 before sRGB encoding for
the existing Canvas backends. This is a Lambert-style diffuse preview, **not**
glTF PBR: metallic/roughness and specular response are not evaluated. No cast
shadows, per-pixel lighting, normal maps, tone mapping, bloom or reflected light.
Emission makes a surface visible; it does not illuminate its neighbors.

```ts
const worldFaces = collectFaces(sceneRoot);
const lit = shadeFaces(worldFaces, [
  { kind: 'ambient', color: [0.7, 0.82, 1], intensity: 0.12 },
  {
    kind: 'directional',
    color: [1, 0.8, 0.55],
    intensity: 0.9,
    direction: { x: -1, y: 1, z: -1 },
  },
]);
// Pass lit to either existing renderer's drawFaces method.
```

Recollect after object transforms change; reshade after materials or lighting
change (camera movement alone does not change shading). The small demonstration
recomputes per frame for clarity, using the existing Rocket update/draw loop.
There is no light singleton/service registration or second engine clock.
Node-attached lights and point/spot lights remain later extensions.

The isolated `3d-lighting.html` demo has identical unlit/lit views, independent
light and object controls, orbit/pause, zero-light inspection and reset/recreate.
Earlier pages keep their unlit output. The cockpit is deliberately unchanged.

References: [Khronos lighting models](https://github.khronos.org/Vulkan-Site/tutorial/latest/Building_a_Simple_Engine/Lighting_Materials/02_lighting_models.html)
and [glTF linear material factors](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html).

## Point lights (milestone 10)

`PointLight3D` extends the same `Light3D` union with `kind: 'point'`, a world-space
`position`, linear `color`, nonnegative `intensity` and optional positive
`minimumDistance` (default 0.1 world units). No mesh, camera or service reference
is required. The app owns movement and lifetime; a lamp marker is presentation.

The same `shadeFaces` pass evaluates point direction and distance separately for
each face, at the arithmetic mean of its world-space vertices. Its contribution
is `color * intensity * max(0, N·L) / max(distance, minimumDistance)^2`.
At an exactly coincident sample the direction is undefined and the point
contributes zero. Nonzero distances below the minimum use the clamped denominator.
This avoids a singularity without pretending to simulate a finite area emitter.

Away from the clamp, doubling distance quarters direct illumination when the
surface angle stays the same. This follows the inverse-square approach used by
[Khronos punctual lights](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_lights_punctual/README.md).
Rocket's current preview strength is unitless at one world unit: it is not a
calibrated candela/exposure pipeline and does not implement that glTF extension.
There is no finite range cutoff, shadow occlusion or per-pixel interpolation.

```ts
const lit = shadeFaces(collectFaces(root), [
  { kind: 'ambient', color: [0.7, 0.82, 1], intensity: 0.06 },
  {
    kind: 'point',
    position: { x: -1, y: 3, z: -1.5 },
    color: [1, 0.8, 0.55],
    intensity: 8,
  },
]);
```

`3d-point-light.html` uses the same reference shape factory as milestone 09,
with a 16×16 floor by default. Choosing 1/8/16/32 subdivisions demonstrates
sampling granularity: one large face receives one color, small faces reveal the
falloff spatially. It does not add a special lighting path or CPU optimization.
Position, strength, tint, ambient fill, object yaw and lamp orbit are independent
controls. Pause retains the orbit phase; reset/recreate restores the initial pose
and existing Scene2D ownership retires listeners and ordinary geometry references.
The unchanged directional demo still defaults to one floor face; cockpit pages
remain unlit. A GPU/per-pixel milestone can later evaluate the same light equation
at each fragment rather than requiring floor tessellation for illumination.

## Optional first WebGL pipeline (milestone 11)

`rocket-engine-v2/webgl` exports `WebGLColorRenderer` and the `ColorVertex` /
`ColorMesh` types. The root and 3D entry points do not import this backend. It
requires a caller-provided WebGL2 context and exclusive GL state ownership.
`upload(vertices)` creates a context-local immutable triangle list (position XYZ
and linear RGB) in one static interleaved buffer plus a vertex-array object.
`draw(mesh, matrix?)` clears the full default framebuffer and transforms positions
into homogeneous clip space with the supplied column-major Matrix4. The fragment
shader interpolates linear color and encodes to sRGB. No model/camera adapter,
indices, depth test, lighting, textures, batching or shadow work is included.

The renderer owns program/buffer/VAO allocations. Shader compilation and program
linking report diagnostics; intermediate resources roll back on failure. Uploaded
meshes have idempotent `dispose`; renderer disposal retires all remaining meshes
and the program. Meshes cannot be used by another renderer or after disposal.
`readPixel(x,y)` is an explicit synchronous diagnostic, with bottom-left origin,
and must be called immediately after drawing. It is not used in normal frames.

Rocket now offers a backend-neutral presentation seam:

```ts
const scene = app.scene({
  update(dt) {
    /* shared simulation */
  },
});
const presentation = app.presentation({
  scene,
  render(frame) {
    /* submit to an optional backend */
  },
  dispose() {
    /* release its surface/resources */
  },
});
```

`Presentation` slots activate registered scenes just like Canvas views, draw
in the same render phase after the single scene update, and count toward Rocket's
existing Render CPU monitor. Render/dispose hooks are synchronous. Disposal is
idempotent, unregisters even after a cleanup exception, and app cleanup retires
presentations before scenes/services. The existing Canvas View API is unchanged.
No hidden Canvas view, render-in-update workaround or second frame clock is used.
This seam carries lifecycle only: it deliberately does not impose a rendering
context on the scene's existing Canvas draw hook.

`webgl-triangle.html` owns its actual WebGL canvas, resize observer and context
listeners through its presentation. It uploads once, uses uniforms for aspect /
rotation / scale, and recreates GPU resources after context restoration. Loss
suspends draws while the shared simulation continues. Recreate deletes previous
resources, removes listeners and canvas, and explicitly releases its retired
context when the browser exposes WEBGL_lose_context. Unsupported WebGL2 reports
an error rather than substituting another backend.

Render CPU is JavaScript submission time, not GPU execution. FPS is callback
cadence; a browser may use a software WebGL implementation. One triangle proves
API/lifecycle correctness, not a performance crossover. Context-loss testing and
pixel readback are diagnostics to run separately from timing comparisons.

References: [WebGL2 VAOs](https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/createVertexArray)
and [WebGL context lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context).

### Optional GPU timing

`WebGLGpuTimer` from `rocket-engine-v2/webgl` owns a bounded queue of
`EXT_disjoint_timer_query_webgl2` queries, separate from the renderer and Rocket's
CPU monitor. Call `poll()` at the start of a later frame, then `begin()` before
GPU commands and `end()` in a `finally` block only if begin returned true.
It exclusively owns the context's elapsed-time query target; do not nest it with
other query profilers. It never waits for a result. Four pending queries cap the
queue; additional measurements are skipped. Stats expose the average/maximum of
the last 32 valid samples in milliseconds, sample count, pending count and status.
Disjoint and lost-context results are discarded. Dispose with the presentation;
construct a fresh timer after context restoration. Unsupported is explicit,
never a CPU-derived estimate. CPU submission, GPU execution and callback cadence
are separate measurements; they overlap and cannot be added to predict latency.
The triangle's explicit pixel-readback frames are not timed.

Reference: [Khronos timer-query specification](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/).

### Milestone 12: WebGL mesh/depth adapter

`PerspectiveCamera.clipMatrix(width, height)` returns the existing +Z-forward
camera's world-to-clip matrix, using vertical FOV and WebGL NDC depth -1..1.
`multiplyMatrices(clip, world)` transforms local geometry directly on the GPU.
CPU camera clipping/projection remains available for Canvas consumers.

`WebGLMeshRenderer3D(gl).render(root, camera, width, height)` consumes existing
`Node3D`, `Mesh3D` and immutable geometry. It expands each convex face as a triangle
fan once, retaining an interleaved position/color GPU buffer per Mesh3D identity.
Nodes sharing the same Mesh3D share that allocation; different surface bindings
have separate buffers in this initial color pipeline. It traverses current world
transforms without CPU vertex projection, clipping or face sorting. Hardware clips
triangles and tests/writes depth using LESS with a fresh depth buffer each frame.
The pass is opaque, two-sided and unlit, accepting #rrggbb surface colors decoded
to linear and encoded back to sRGB in the fragment shader. No textures, alpha/PBR,
backface/frustum culling, instancing or lighting are implemented in this slice.

The renderer exclusively owns context state, and requires a context with depth.
It owns GPU allocations only, and retires cached meshes absent from the current
render traversal. Hidden/removed meshes therefore release their cache entry;
showing them again uploads again. `dispose()` releases all allocations idempotently.
The host owns canvas sizing, listeners, lifecycle and context restoration: create a
new renderer and GPU timer after restoration. Width/height must match the drawing
buffer aspect; the host sets backing dimensions before rendering. Optional
`depthTest: false` and `reverseOrder: true` are diagnostics, not transparency support.
The returned counters describe submitted triangles/draws and resident mesh bytes,
not visible fragment count or total driver memory. Empty scenes still clear.
`WebGLColorRenderer.drawFrame(draws, depthTest)` provides the shared lower-level
multi-draw pass; existing single-triangle `draw()` behavior remains available.

### Milestone 13: optional per-fragment GPU lighting

Construct `new WebGLMeshRenderer3D(gl, { lighting: true })` to select the lit
shader/layout; the default remains the milestone-12 unlit pipeline. Pass independent
`Light3D[]` through `render(..., { lights, lightingEnabled: true })`. Empty lights
produce black diffuse surfaces plus emission. `lightingEnabled: false` displays
base colors. Moving a light updates uniforms only, without uploading mesh data.
There is no second light registry or engine clock. Both CPU and GPU adapters use
`prepareLights` for light validation and normalized directional vectors.

The vertex shader passes world position and the inverse-transpose transformed
normal; the fragment shader normalizes the interpolated normal, evaluates Lambert
diffuse and point-light inverse-square attenuation, adds material emission, clamps
to 0..1, then encodes sRGB. `normalMatrix(world)` handles nonuniform scale, shear
and reflection; singular/non-affine or non-Float32-finite matrices reject before
draw submission. Imported per-vertex normals are normalized and retained; absent
normals are derived per convex face using Newell's method. Degenerate zero normals
receive ambient/emissive contributions only. Two-sided geometry retains its authored
outward normal; there is no automatic backface normal flip.

The initial bounded forward pass accepts up to 8 lights total (including ambient),
intensity 0..1,000,000, point positions within +/-1,000,000 world units and minimum
distance 0.0001..1,000,000 (default 0.1). Limits reject explicitly; lights are never
silently truncated. The minimum-distance clamp prevents the inverse-square
singularity; at the light's exact position directional contribution is zero.
These are preview units matching the existing CPU light contract, not calibrated
photometric units. Normal scenes should use modest world coordinates/scales.

Lit mesh buffers contain position, linear base color, normal and emission (48 bytes
per expanded vertex). Opaque linear `baseColorFactor` overrides decoded #rrggbb;
`emissiveFactor` is retained. Factors require finite 0..1 values and alpha 1.
Metallic/roughness and UV data remain untouched in source meshes, but are not
consumed yet. There are no shadows, specular/PBR, textures, HDR/tone mapping or light
transport. Bright contributions clip to white, and occluders do not block lights.
CPU flat lighting and GPU per-fragment lighting intentionally differ on point-lit
faces; the comparison is not an image equality claim.

Technique references: [WebGL2 directional lighting and inverse-transpose normals](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-lighting-directional.html),
[WebGL2 point lighting](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-lighting-point.html).

### Milestone 14: opaque base-color textures

The optional texture pipeline uses the same mesh, node, camera, lighting and
presentation contracts. It has no model-specific behavior or additional clock.

```ts
import { TextureImage, Mesh3D } from 'rocket-engine-v2/3d';
import { loadTextureImage, WebGLMeshRenderer3D } from 'rocket-engine-v2/webgl';

const image = await loadTextureImage('./surface.png', { signal });
const mesh = new Mesh3D(geometryWithUVs, [
  {
    color: '#ffffff',
    baseColorTexture: {
      image,
      wrapS: 'repeat',
      wrapT: 'repeat',
      filter: 'trilinear',
    },
  },
]);
const renderer = new WebGLMeshRenderer3D(gl, {
  lighting: true,
  textures: true,
});
// Attach mesh to a Node3D, then render with existing Light3D[] and camera.
```

`TextureImage(width, height, rgba8)` is DOM-free, opaque, immutable CPU data. It
copies incoming pixels and `copyPixels()` returns a fresh copy. Maximum image
size is 16,777,216 pixels, additionally bounded by each context's MAX_TEXTURE_SIZE.
The browser loader fetches with cancellation, decodes once, closes the bitmap and
retains pixels for other contexts/restoration. Failures reject; the host owns
loading/error UI and retry. There is no global URL cache or hidden background task.

`Material3D.baseColorTexture` copies/freezes its binding. Defaults are repeat on
both axes and trilinear filtering. Wrap modes: repeat, clamp, mirror. Filters:
nearest, linear without mipmaps, trilinear with linear magnification and mipmapped
minification. UV0 is required for textured meshes; coordinates outside 0..1 are
valid. This first adapter supports one texture binding per Mesh3D primitive;
different image/sampler bindings require separate mesh nodes. It rejects mixed
bindings or disabled texture support explicitly. Scalar base-color factors and
vertex normals continue to work independently of sampling.

RGBA8 images upload once per context/image identity to SRGB8_ALPHA8, with a full
mipmap chain. GPU filtering operates on decoded linear samples; those multiply
linear base color before lighting. Final sRGB encoding happens once. Row zero and
UV (0,0) are top-left, matching glTF: uploads do not flip Y or premultiply alpha.
Separate WebGL sampler objects allow one image to use different sampling states.
A neutral white 1×1 image keeps active samplers complete for untextured draws.
Unused image/sampler allocations retire after each render; disposal is idempotent.
The host retires resources while lost and constructs a new renderer on restoration;
retained CPU images reupload without refetching. GPU buffers use 56 bytes per
expanded vertex in the textured variant; old layouts remain unchanged.

`renderer.textureStats` reports resident texture/sampler counts and RGBA8 bytes
including mip levels (not driver padding or total GPU memory). Three 1024² maps
occupy about 16 MiB together. Loading/decode time and diagnostic readback are not
steady-frame GPU timing. The sample lab's UV changes replace immutable meshes;
filter changes reuse resident images rather than uploading them again.

Scope: base color plus existing Lambert illumination. No alpha blending, normal
mapping, metallic/roughness, specular, AO, displacement, HDR or shadows. The strict
GLB loader remains geometry/scalar-only and still rejects embedded textured models;
it does not pretend to support the new material package yet. Earlier CPU demos
retain their documented color-only behavior.

References: [glTF image/texture/sampler and color-space contracts](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc),
[WebGL texture sampling and mipmaps](https://webglfundamentals.org/webgl/lessons/webgl-3d-textures.html).

### Milestone 15: direct-light material response

Opt in with `new WebGLMeshRenderer3D(gl, { lighting: true, textures: true,
materialResponse: true })`; omit textures for an image-free material scene.
Existing pipelines and prior demo behavior remain unchanged. The adapter consumes
existing `Material3D.metallicFactor` and `roughnessFactor` per face, validates both
as finite 0..1 values, and defaults both to 1 as in glTF. No new material registry.
The optional vertex layout appends two scalar values (64 bytes with textures,
56 without). Different faces can use different factors without a new draw call;
image bindings retain the milestone-14 primitive boundary. Mesh identity controls
cache lifetime; immutable material edits create a new Mesh3D and retire its buffer.

This direct-light BRDF combines Trowbridge-Reitz/GGX distribution, height-correlated
Smith visibility and Schlick Fresnel. Perceptual roughness squares to microfacet
alpha; perceptual roughness is clamped to at least 0.045 for numerical stability.
Dielectrics mix base-color/PI diffuse with 0.04-normal-incidence specular. Metals
have base-color-tinted specular and no diffuse contribution. Metallic blends these
responses. The world-space view direction comes from the existing camera position;
lights and camera motion update uniforms without rebuilding mesh buffers.
`render(..., { materialResponseEnabled: false })` compares earlier Lambert shading
in the same scene. `lightingEnabled: false` still displays unlit base color.

The lower-level `WebGLColorRenderer.drawFrame` material variant requires a finite
`cameraPosition` in its lighting options, within +/-1,000,000 world units. The
high-level renderer supplies it automatically. Existing normal transforms, light
limits, point attenuation, emission, sRGB texture decode and output encoding apply.
Zero normals or undefined view/light direction receive no direct response. Meshes
remain two-sided with authored normals; back-facing surfaces receive no specular
response. No automatic backface normal flip is introduced.

Ambient is explicitly a diffuse fill approximation, multiplied by (1-metallic).
There is no environment lighting, multiple-scattering compensation, reflection map,
normal map, packed ORM sampling, shadows or HDR/tone mapping. Metal can therefore
be dark away from direct highlights, and bright highlights clip. This is a bounded
material-response milestone, not a complete glTF/PBR renderer. The v4 textured GLB
still waits for the loader/material-map milestone.

Technique reference: [glTF Appendix B: metallic/roughness BRDF equations](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#appendix-b-brdf-implementation).

### Milestone 16: linear material maps

`TextureImage` now has an immutable `colorSpace` (`srgb` by default, or `linear`).
The browser loader accepts the same option: `loadTextureImage(url, {signal,
colorSpace: 'linear'})`. Color images use SRGB8_ALPHA8; data images use RGBA8.
Data samples and mipmaps stay linear: 128/255 remains about 0.5. Image transfer
function is part of the asset identity, not a per-draw switch. Mesh materials reject
linear images as base color and sRGB images as material data. Existing image budgets,
opaque-only input, top-left origin, cancellation and bitmap cleanup still apply.

```ts
const data = await loadTextureImage('./surface-orm.png', {
  signal,
  colorSpace: 'linear',
});
const binding = { image: data, filter: 'trilinear' } as const;
const mesh = new Mesh3D(geometryWithUVs, [
  {
    color: '#ffffff',
    metallicFactor: 1,
    roughnessFactor: 1,
    metallicRoughnessTexture: binding, // G roughness, B metallic
    occlusionTexture: binding, // R occlusion; may be a separate image
    occlusionStrength: 1,
  },
]);
const renderer = new WebGLMeshRenderer3D(gl, {
  lighting: true,
  textures: true,
  materialResponse: true,
  materialMaps: true,
});
```

These are separate material slots following glTF channel semantics, not a second
material/domain system. A shared ORM image uploads once, even when bound to both
slots. Separate sampler states are allowed. UV0 is shared by all slots in this
slice; different image/sampler bindings or occlusion strengths require separate
mesh primitives. Bindings are copied/frozen. Static primitive checks run at upload;
changing node placement or channel inspection does not upload again. Absent slots
bind neutral white linear data. Unsupported pipeline combinations reject explicitly.

Final roughness is `roughnessFactor * G`, final metallic is `metallicFactor * B`;
existing GGX numerical roughness flooring remains. Occlusion strength must be 0..1
(default 1) and computes `mix(1, R, strength)`. Occlusion modulates only the ambient
fill approximation, not direct diffuse/specular light or emission. This renderer
still has no environment-light contribution to occlude. Uniform white R correctly
has no occlusion effect; it is not replaced with invented cavity shading.

`render(..., {materialDebug: 'occlusion' | 'roughness' | 'metallic' | 'none'})`
selects effective channel views. They bypass lighting and output the scalar as raw
grayscale without an sRGB curve, so a 128 data value reads back as 128. This is an
inspection mode, not a shaded material. Normal output retains linear lighting and
one final sRGB encoding. Debug changes affect uniforms only.

The texture store owns units 0 (base), 1 (metallic/roughness), 2 (occlusion), tracks
all allocations/samplers across each frame, unbinds each used unit and retires
unused images. Shared images retain one allocation; re-enabling retired images
uploads again. Six 1024² images plus mipmaps occupy about 32 MiB, excluding retained
CPU pixels and driver overhead. Context restoration reuploads retained pixels;
it does not refetch source maps. No normal maps or textured GLB import in this slice.

References: [glTF metallic/roughness channel and factor contract](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.pbrMetallicRoughness.schema.json),
[glTF occlusion slot and strength](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.schema.json).

### Milestone 17: tangent-space normal maps

`MeshGeometry` retains immutable `tangents: [x,y,z,w][]` alongside normals and UV0.
XYZ must be a finite nonzero direction; W must be +1 or -1. Attribute counts match
vertices. The normal-mapped adapter requires authored vertex normals, tangents and
UVs; it never invents a tangent basis. Geometry without a map remains usable.
Normal-mapped tangents must be orthogonal to normals (normalized dot tolerance
0.001). Uploaded directions normalize; missing tangents reject when a normal map
is bound. Automatic MikkTSpace tangent generation is outside this slice.

```ts
const normal = await loadTextureImage('./normal.png', {
  signal,
  colorSpace: 'linear',
});
const mesh = new Mesh3D(geometryWithNormalsTangentsUVs, [
  {
    color: '#ffffff',
    metallicFactor: 0,
    roughnessFactor: 0.6,
    normalTexture: { image: normal, filter: 'trilinear' },
    normalScale: 1,
  },
]);
const renderer = new WebGLMeshRenderer3D(gl, {
  lighting: true,
  textures: true,
  materialResponse: true,
  normalMapping: true,
  // materialMaps: true is independent, if using packed material slots too.
});
```

RGB is linear tangent-space data, decoded to [-1,1] with glTF/OpenGL +Y convention.
Normal scale multiplies X/Y, then the resulting world normal normalizes. Scale must
be finite within +/-1,000,000 (default 1); negative values invert X/Y slopes. The UI
uses 0..4. Valid forward-facing maps flatten at zero. Base normal transforms by the
inverse-transpose; tangent transforms by the world linear matrix, then reorthogonalizes
against the interpolated normal. B = cross(N,T) × tangent.w × world orientation.
Orientation sign is evaluated on the CPU in double precision, handling reflections
without a GPU determinant underflow. Degenerate interpolated bases retain the base
normal; no arbitrary axes or fabricated detail are substituted.

`normalMappingEnabled: false` bypasses mapping exactly, including 8-bit flat-map
quantization. `normalDebug: true` displays resulting world XYZ as raw 0..1 RGB,
without lighting/sRGB encoding. Unlit base-color mode still ignores lighting;
normal inspection explicitly takes precedence over material-channel inspection.
These toggles update uniforms, not mesh uploads. Absent normal maps bypass the TBN
calculation; a complete neutral linear sampler remains bound on unit 3. Each mesh
primitive has one normal image/sampler and scale. The normal variant adds a vec4
attribute: 80 bytes per expanded vertex with material/UV data. Earlier layouts stay
unchanged. The same context-local texture cache owns all four units and disposal.

This affects diffuse/specular lighting only. No displacement, parallax, silhouette
change, self-shadowing, environment reflections or new geometry. Original maps are
copied unchanged; the ripples are a separate analytic height-gradient demonstration.
The GLB loader still waits for the next integration slice to consume textured models.

References: [glTF tangent-space definition](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#meshes),
[normal texture decoding and scale](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/schema/material.normalTextureInfo.schema.json).

### Milestone 18: embedded textured GLB scenes

`loadTexturedGlb(url, {signal})` and `decodeTexturedGlb(arrayBuffer, {signal})` are
optional browser adapters in `rocket-engine-v2/webgl`. They decode embedded images
into immutable CPU TextureImages, then delegate hierarchy/geometry/material parsing
to the existing GLB parser. They do not create a canvas, context, renderer or clock.
A model can instantiate multiple independent node trees sharing immutable meshes.

The DOM-free `parseGlb(buffer, {resolveImage(index, colorSpace)})` contract permits
host-supplied decoded image data. Default `parseGlb`/`loadGlb` still reject textured
files; no silent color-only approximation is introduced. `embeddedGlbImages(buffer)`
returns validated PNG/JPEG BIN descriptors; descriptors reference caller-owned bytes.
The shared GLB envelope validator is used for both descriptors and model parsing.
TANGENT VEC4 now retains authored XYZ/W. Normal-textured primitives require normals,
tangents and UV0; no guessed tangent generation or name-based material remapping.

Bindings consume standard base-color, metallic/roughness, occlusion and normal
texture references, scalar factors and samplers. One shared ORM image can feed both
slots without duplicate GPU uploads. CPU image resolutions/bytes are preserved.
Each image is decoded once; transfer-function-specific wrappers cache by image index
and use, so an unusual image reused for both color/data remains distinct. Temporary
decoded pixels do not become a global cache. Source camera, model placement and
hierarchy remain data; the host chooses how to present them.

Explicit subset: embedded PNG/JPEG, UV0, opaque single-sided triangle materials,
existing scalar factors, no extensions/animation/skins/emissive textures. Supported
filter pairs are nearest/nearest, linear/linear, linear/trilinear; other glTF sampler
combinations reject. Missing sampler fields default to repeat and trilinear with
linear magnification. Wrap supports repeat/clamp/mirror. URI images, transformed UVs,
other UV sets, unsupported compression/features and invalid ranges reject. Browser
load budget: 64 MiB encoded GLB, 32 images, 64 megapixels total decoded, plus existing
16-megapixel per-image cap. Abort checks occur through fetching/decoding/parsing;
bitmaps close in finally. Failure does not install a partial model.

The cockpit host loads the unchanged v4 GLB and mounts its -Z-forward glTF world
through a Z reflection into Rocket's +Z-forward convention. Existing normal/tangent
transform rules account for that reflection. Embedded pilot camera data initializes
position, direction, FOV and clip planes. The example owns pilot/exterior presets,
pose controls and inspection lights; it does not constrain camera movement to the
production pilot envelope. Renderer caches/disposal/context restoration stay the
same as milestones 11–17. No cockpit-specific core or separate simulation system.

### Optional environment lighting (milestone 19)

`EnvironmentMap` is immutable CPU data, separate from meshes, camera, direct
lights and the GL context. It contains six linear RGBA8 faces per complete
specular mip level (+X, -X, +Y, -Y, +Z, -Z), six diffuse faces storing irradiance
**divided by pi**, and a linear RG BRDF lookup. Specular level `i` represents
perceptual roughness `i / (levelCount - 1)`; it is GGX convolution, not ordinary
image downsampling. Rows follow cubemap t without upload flipping. The lookup's
U is N·V and V is perceptual roughness, with texel-center integration.

`bakeEnvironment(sampleDirection, options)` provides bounded synchronous
preprocessing of a procedural linear RGB radiance function in 0..1. It uses
Hammersley GGX importance sampling, cosine-weighted diffuse convolution and a
correlated Smith/Schlick split-sum lookup. Defaults: 32² specular faces, 8² diffuse,
32² LUT, 128 samples. Limits: power-of-two specular 2..128, diffuse 1..32,
LUT 2..128, samples 16..512. Bake once outside the frame loop; larger offline or
worker processing is future work. Imported prefiltered assets may use specular
faces up to 256², diffuse up to 64² and LUT up to 256². No HDR decoder or tone
mapper is implied by this RGBA8 slice.

Opt in with `new WebGLMeshRenderer3D(gl, { lighting: true, materialResponse: true,
environment: true })`, then pass `environment: { map, intensity, rotation }` to
`render`. Intensity defaults to 1 (0..100); rotation is world-to-environment yaw in
radians. The same contract is available to `WebGLColorRenderer.drawFrame`.
Materials continue to provide existing base color, metallic, roughness and
optional normal maps. Environment lighting contributes diffuse and specular;
AO affects indirect diffuse only. Direct lights remain independent. Disabling
material response also disables environment contribution for the Lambert
comparison, and disabling lighting returns unlit base color as before.

The context-local environment store binds specular cube, diffuse cube and lookup
to texture units 4..6. It retains exactly one environment, replaces its three
textures transactionally, and unbinds all used units after the pass. No ordinary
`generateMipmap` is applied to prefiltered levels. `environmentStats` reports the
three allocations and their RGBA8 byte count separately from material textures.
A complete black environment backs an unassigned enabled pipeline. Dispose and
recreate the renderer after context loss; retained CPU data can be reused.

This is single-scattering distant IBL: no scene capture, local/parallax-corrected
probes, specular occlusion, multiple-scattering compensation, HDR/tone mapping,
cast shadows or skybox. Reflections represent the provided environment, not other
scene meshes. Low resolutions/sample counts and 8-bit data trade quality for a
small, inspectable foundation. Near-zero roughness is clamped to 0.045 for BRDF
integration, consistent with the direct material pipeline.

Technique reference: [Khronos glTF Sample Renderer IBL](https://github.com/KhronosGroup/glTF-Sample-Renderer/blob/main/source/Renderer/shaders/ibl.glsl).
Rocket's bounded CPU preprocessing and resource contracts are independent code;
the reference renderer supports additional features beyond this slice.

### Optional directional shadow map (milestone 21)

Opt in with `shadows: true` on `WebGLMeshRenderer3D` / `WebGLColorRenderer`.
Lighting must also be enabled. `render` accepts `shadow: DirectionalShadow3D`:
`lightIndex` selects exactly one directional light in the supplied light array;
`matrix` is an explicit nonsingular affine orthographic world-to-clip matrix.
`directionalShadowMatrix(direction, center, extent, depth)` builds one using the
existing direction-toward-light convention. The volume spans ±extent on two axes
and ±depth/2 along the light. Keep the matrix aligned with the selected light;
fitting/camera coverage are caller-owned, not inferred from the scene.

Resolution defaults to 512, power of two 64..2048 within the context limit.
Receiver `bias` defaults to 0.001 and `slopeBias` to 0.002, each in normalized
shadow-depth units (0..0.05). Applied bias is `bias + slopeBias * (1 - N·L)`;
N is the geometric normal, so normal-map detail does not move shadow boundaries.
`filter` is `hard` or `pcf` (default): one nearest comparison or nine equally
weighted comparisons one texel apart. This smooths raster edges; it is not an
area-light penumbra model. `enabled: false` skips the depth pass and preserves its
allocation. Omitting the shadow config disables contribution; an opted-in but
unassigned pipeline retains a complete 1² fallback target for sampler validity.

`Node3D.castsShadow` / `receivesShadow` default true, independently of shared mesh
and material identity. The lower-level `ColorDraw` supports the same flags.
Invisible nodes retain their existing traversal behavior. All submitted opaque
caster triangles, including those outside the main camera, use retained geometry
VAOs in the depth pass. No second geometry upload/cache or clock is introduced.

The internal pass owns a depth-only framebuffer, DEPTH_COMPONENT24 texture and
depth program. It checks framebuffer completeness, uses texture unit 7, replaces
its target transactionally on resize, and retires resources on disposal. Renderer
ownership and context-loss recreation remain explicit. `shadowStats` reports
resolution, depth draw calls/triangles, and an estimated four bytes per texel;
actual driver allocation can differ. Color render stats continue reporting the
color pass. Timer boundaries around `render` include depth and color work.

The shader attenuates only the selected direct light; ambient, emissive and
image-based lighting are unaffected. Out-of-volume points and PCF taps are lit.
`shadowDebug: true` shows a raw visibility mask (white lit, black occluded).
Material/normal channel inspection and unlit comparison keep their existing
semantics when the shadow mask is off. Both Lambert and metallic/roughness shader
paths support the optional shadow feature.

Boundaries: one directional map, opaque two-sided geometry, fixed fitted volume,
no alpha testing/translucency, cascades, auto fitting, texel snapping, point-light
cube shadows, contact shadows, environment occlusion or cached static shadow
updates. Zero bias can expose acne; excessive bias detaches contact shadows.

Technique reference: [WebGL2 Fundamentals: shadows](https://webgl2fundamentals.org/webgl/lessons/webgl-shadows.html).

### Dynamic texture sources (milestone 23)

`TextureImage` remains immutable. `TextureBinding3D.image` now accepts the explicit
`TextureSource3D` union: `TextureImage | DynamicTextureImage`. Imported GLB images
and environment-map assets retain their immutable contracts. Dynamic image
identity is stable; the material binding and mesh remain frozen while the
application deliberately changes the source pixels.

`new DynamicTextureImage(width, height, rgba8, { colorSpace })` has the same fixed
opaque RGBA8 storage limits and top-left row/UV convention as `TextureImage`.
Color space defaults to sRGB; linear data sources are also supported by the core.
Dimensions/color space cannot change. `update(rgba8)` validates/copies a complete
snapshot and increments `revision` (initially zero). Invalid updates leave both
pixels and revision intact. `copyPixels()` returns a defensive copy. There is no
DOM, GPU resource, renderer registration, clock, event loop or domain state in
the source. CPU storage retires with normal reference lifetime. For resizing or
format changes, replace the source with a new explicit instance.

The context-local `WebGLTextureStore` caches source identity **and** last uploaded
revision. First use allocates with `texImage2D`; a later unseen revision replaces
base-level pixels with `texSubImage2D` in the existing handle. Multiple unseen
updates coalesce to the latest snapshot. Multiple draws/units sharing that source
upload it once per revision per context. Each context catches up independently.
Unchanged sources do not upload. Failed submissions do not advance successful
revision/counter state. Unused resources still retire at the normal frame
boundary; a later return or restored renderer uploads the latest retained pixels.

The current store regenerates the complete mip chain after each successful
initial/update submission, including when the current sampler does not need
mips, preserving existing independent sampler-switch behavior. This has a cost;
there is no partial update, lazy-mip or direct DOM/GPU fast path in this slice.
`textureUploadStats` on either renderer reports context-lifetime `allocations`,
`updates`, `sourceBytes` and `mipmapBuilds`, separately from existing resource
`textureStats`. Source bytes count submitted base pixels, not generated mip
storage, driver bandwidth, or CPU canvas readback/copy costs. Counters include
static/fallback textures when used and restart with the renderer.

`updateTextureFromCanvas(image, context2d)` in `./webgl` is a browser adapter for
explicit sRGB snapshots from a `CanvasRenderingContext2D` or
`OffscreenCanvasRenderingContext2D`. Canvas/source dimensions must match and the
source must be sRGB. It reads sRGB ImageData and publishes a revision; unreadable,
tainted or transparent output throws without publishing. The caller chooses
when the canvas is dirty and schedules work using its existing update system.
No implicit polling, redraw, change detection, DOM source capture or extra clock
is introduced. Reading a canvas and then uploading pixels is intentionally a
simple CPU-backed foundation with retained restoration data.

Reference: [WebGL texSubImage2D](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texSubImage2D).

### Unlit GPU surfaces

`Material3D.unlit: true` displays base color (including its sRGB texture) independently
of lights, environment and emission factors in the optional WebGL lighting pipelines.
Depth testing and perspective still apply. Use separate mesh primitives for lit and
unlit materials. This does not produce bloom, cast light onto nearby geometry or
change the existing CPU renderer. Material and normal diagnostic views leave unlit
surfaces readable; the explicit shadow visibility mask remains a scene diagnostic.

### Optional offscreen targets and bloom (WebGL2)

```ts
const target = new WebGLRenderTarget(gl, width, height); // RGBA8 + depth16
const bloom = new WebGLBloomPass(gl);
renderer.render(root, camera, width, height, { target });
bloom.render(target, { threshold: 0.6, strength: 0.65, radius: 2 });
// On size change: target.resize(width, height). Bloom catches up automatically.
// Teardown/context loss: dispose both; recreate both after context restoration.
```

Both classes export from `./webgl`. A target has explicit `hasDepth` (constructor
fourth argument, default true), `width`, `height`, `estimatedBytes`, `texture`,
`resize`, `bind`, `assertContext` and idempotent `dispose`. Size replacement checks
framebuffer completeness before retiring old storage. Integer positive sizes must
fit texture/renderbuffer hardware limits. The mesh renderer's camera viewport must
match target dimensions; depth testing requires a depth attachment. Targets belong
to one context and cannot be used after disposal/context loss. Renderer frame
completion returns framebuffer binding to the default framebuffer; diagnostic
`readPixel` continues to read that default drawing buffer.

The target stores producer-selected bytes; this renderer writes sRGB-encoded RGBA8.
Bloom requires that encoding. It decodes scene samples, extracts peak-channel
brightness using a fixed 0.08-wide soft transition, blurs linear RGB in half-size
RGBA8 surfaces, adds glow in linear RGB, clamps and encodes sRGB to the default
framebuffer. It owns GL state during its passes, not scene rendering or the input
target. `BloomOptions` exposes finite `threshold` 0..1, `strength` 0..4, `radius`
0..8 and `view`: `composite`, `scene`, `bright`, `bloom`. Radius is Gaussian sample
spacing in half-resolution texels, with two fixed horizontal/vertical pairs.
Strength zero in composite mode and scene view bypass extraction/blur while
retaining existing scratch storage. Debug bright/glow show unscaled intermediate
values. `stats` reports fullscreen draws, scratch width/height and estimated bytes;
add the caller-owned target bytes separately. Recreate after context restoration.
