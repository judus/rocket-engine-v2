# Original asteroid family trial

Run the existing static demo server and open `/webgl-asteroid-family.html`.
Select a shape and any of the three materials. The 10 m and 100 m bodies
are entries 1 and 12. Distance and sun-angle sliders, normal-map toggle and
rotation provide inspection controls. The gallery uses actual relative sizes.

`examples/space/asteroid-family.ts` uses Rocket's GLB parser, texture loader,
WebGL surface, material renderer, GPU timer and application lifecycle. It is
an example-owned adapter for this particular catalog, not a generic glTF loader.
The inspection page remains separate; the Hi3D cockpit now reuses the same loader. No engine core was changed.

Assets were copied unchanged from the supplied asteroid-family-v1 package.
`examples/assets/asteroid-family-v1/IMPORT.json` records their SHA256 digests.
Geometry, 2048-square PNGs, material indices and baked UV repetition are retained.
Three material descriptors reference nine shared TextureImage objects; ORM
occlusion and roughness/metallic bindings share the same image. Geometry is
shared when changing materials. No per-frame material selection or texture upload.

Lighting is one warm-neutral directional source, 0.015 neutral ambient fill,
and black background. No environment reflections, cast-shadow pass, collision
proxies or LODs. CPU/GPU timing and callback FPS are diagnostics for this trial,
not a cockpit field benchmark or confirmed screen-presentation rate.
Recreate disposes the application, listeners, surface and GPU resources; context
restoration rebuilds renderer resources using retained CPU assets.

Validation: TypeScript, ESLint, Prettier, build and existing full test suite.
Browser checks cover material switching on 10 m and 100 m bodies, gallery,
normal toggle and recreate with one surviving canvas. Physical performance
on Julien's Chrome session remains for him to measure.

## Spaceship field

Open `/webgl-cockpit-hi3d.html`. The default is 96 original asteroids;
Outside world offers 32 / 96 / 256 and a seed. Shape, material and longest
dimension (uniform random 10–1,000 metres) are selected independently once per
object from the seed. Regenerating or increasing count preserves earlier choices.
All 12 source geometries and nine images remain shared, without compression.
The three material variants per shape are shared too (at most 36 mesh variants).
Node scale changes physical size; existing UVs are retained, so texture features
grow with the body. Constant physical texture density is not implemented.

The existing placement sequence is spread 64 times wider for these larger rocks.
Far plane is 16,000 units, scanner range 7,680. Controls, sun, cabin fit, bloom
and shadow settings are retained. The single shadow volume now spans kilometres,
so cabin shadow detail can be coarser. No new collisions or streaming.

Browser verification: original textures, radar, 96 and 256 regeneration; default
96 submits 660,339 triangles including the cockpit (460,800 asteroid triangles).
256 submits 1,428,339 total. Both report 25 material textures / 212.81 MiB,
excluding separately reported sky, shadow and render targets. This confirms
texture memory does not multiply with rock count. Measurements in the embedded
browser are not Julien's Chrome/144 Hz benchmark. Use the existing CPU, GPU and
frame-pacing readouts after initial upload settles.

Regression test: seeded choices, actual source geometry identity, uniform scale,
10–1,000 metre bounds, preserved choices across counts, and shadow flags.

## Shadow sampling correction

The kilometre-scale field exposed striped self-shadowing in the visibility mask.
The old PCF path compared every neighbouring depth sample with the centre
fragment's depth. On a sloped triangle those points have different depths.
`src/webgl/ShadowShader.ts` now derives the receiver triangle's depth gradient
and evaluates each comparison at the actual nearest texel centre. This also
corrects hard-shadow sampling within a texel. Existing constant/slope bias,
cast shadows, filter settings and map resolution remain available.

Browser comparison: visibility-mask stripes on illuminated asteroid surfaces
were removed/reduced with identical camera/light settings; repeated at camera
X=80. Dark self-occluded regions remain. Normal shaded view restored; no shader
compile/browser errors. The single map still covers kilometres, so small cabin
shadow detail remains coarse and silhouettes can alias. No resolution increase
or cascaded shadow implementation was added.

## Open issue — movement-dependent asteroid shading flicker

2026-10-17: Julien confirms the strange shadow-like pattern is still visible
and changes as the ship/camera moves, after correction commit `8482c4c`.
The receiver-plane comparison improved the checked shadow-mask views but did
not resolve the reported issue. Root cause remains unconfirmed; do not mark
this fixed based on those static comparisons or the passing test suite.

Investigation deferred at Julien's request. Resume with a reproducible moving
viewpoint and isolate shadows, normal mapping and material response separately;
check filtering, depth precision and shadow-volume stability as hypotheses.
Keep the current rendering settings until that investigation is resumed.

## Turquoise flight reticle

The Hi3D cockpit uses Julien's sketch, now reduced by 10%: a closed outer circle, four interrupted
inner arcs without radial horns, a small centre ring/cross and round dot. Colour
is the same `#86ead6` as the instruments. The reticle is ordinary unlit geometry
under the rigid pilot rig, independent of nonuniform model fitting and cosmetic
cockpit sway. It neither casts nor receives shadows; existing bloom can glow
around it. The turquoise flight-reticle checkbox controls visibility. This is
a visual flight reference only; target selection/locking is not implemented.
The reticle now uses 25% material opacity and separate fixed/aim/range parts;
see [WebGL transparency](./WEBGL-TRANSPARENCY.md).

## Right-hand systems console

The right fitted display now replaces duplicate speed/heading text with a
ship-systems console. Its first page retains the original six modules: reactor,
cooling, inertia dampers, engine, cargo bay and shields. The auxiliary page lists
weapons, scanner, life support and instruments. Header slots reserve energy (J),
load (W), temperature (°C) and crew acceleration (G). The reactor and engine-row test load now read the live ECS power trial described
in [Ship power ECS](./SHIP-POWER-ECS.md). Other modules and thermal/G readouts
remain unavailable. Their ON/OFF controls record requests only. The power trial
does not yet drive flight, lighting or radar. Requests survive page changes and preview recreation;
a page reload starts a new trial and set of requests.

Press I or Use systems display to release the pointer and disable flight actions
while using the in-texture buttons. Click a request button or the page footer;
1–6 and Page Up/Down are keyboard alternatives. I/Esc returns to flight and
requests capture in that user gesture. The world keeps updating. Picking uses
perspective-correct UVs from the fitted quad and follows model fitting, roll and
cosmetic sway. Listeners retire with the existing presentation lifecycle.
