# Original asteroid family trial

Run the existing static demo server and open `/webgl-asteroid-family.html`.
Select a shape and any of the three materials. The 10 m and 100 m bodies
are entries 1 and 12. Distance and sun-angle sliders, normal-map toggle and
rotation provide inspection controls. The gallery uses actual relative sizes.

`examples/space/asteroid-family.ts` uses Rocket's GLB parser, texture loader,
WebGL surface, material renderer, GPU timer and application lifecycle. It is
an example-owned adapter for this particular catalog, not a generic glTF loader.
No engine core or cockpit scene was changed.

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
