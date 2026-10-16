# WebGL material opacity

`Material3D.opacity` is a finite scalar in 0..1, default 1. Existing materials
remain opaque. Example: `{ color: '#86ead6', unlit: true, opacity: 0.75 }`.
Mesh data is immutable; replace the Mesh3D with the same geometry when changing
opacity. Node movement/scaling does not re-upload the mesh.

WebGLMeshRenderer3D renders opaque primitives first, then translucent primitives
back to front using transformed geometry-bounds centres and camera-forward
depth. Mixed opacities within one primitive must be split, just as differing
texture bindings must be split. Fully transparent primitives are skipped.
Cached material validation avoids a per-frame scan through asteroid faces.
The lower-level WebGLColorRenderer preserves supplied translucent order; its
caller supplies back-to-front ordering.

Translucent draws keep depth testing, disable depth writes and use straight-alpha
source-over blending. Blend/depth-write state is restored after the pass,
including on draw failure. Translucent geometry is excluded from the opaque
shadow caster pass; partial transmission shadows are not implemented.
Compositing uses the existing LDR output; bloom processes the composited scene.

This is scalar coverage support. Texture alpha, alpha-test cutouts, imported
glTF alpha modes, physically based transmission/refraction and order-independent
transparency are not included. Intersecting transparent primitives or complex
self-overlapping meshes can require splitting because sorting is per primitive,
not per triangle. Canvas/software renderers do not consume this WebGL field.

## Reticle

The Hi3D reticle is 10% smaller and uses 25% opacity in the displays' turquoise.
Lines and the round dot are roughly 3 CSS pixels at the default 60-degree FOV
and 750px canvas height. Joined annular segments close the outer ring cleanly.
Three faint, wider geometry fringes give each part a soft glow without changing
the global instrument bloom. The HUD is centered on the pilot sightline. Its plane sits behind the dashboard, with proportional scale preserving angular
size; ordinary depth testing lets the cockpit hide overlapping lines and glow.
Its four child nodes separate the outer reference ring, projectile-direction
ring, context/range ring, and fixed cross/dot. The latter stays fixed while
future game data can independently move or scale the other rings. Desired
range behaviour: expand for an out-of-range target and contract into a focused
mark in range. These states are specified, not driven by invented target or
weapon data. Projectile prediction, range calculation and tracking remain
application logic; rendering only consumes the resulting presentation state.

The current demo offers a Transparency diagnostic below the reticle toggle.
It uses real GPU pixel readback to verify two 50% layers compose in sorted order
(RGBA approximately 64/64/128/255), then checks an opaque foreground surface
occludes both (0/255/0/255). This diagnostic interrupts GPU timing; run it
separately from performance comparisons. Temporary programs and buffers retire
in finally. Automated tests cover validation, ordering with a rotated camera,
shared uploads, zero-opacity skipping and restored depth/blend state.
