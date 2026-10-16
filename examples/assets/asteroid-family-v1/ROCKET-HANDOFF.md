# Asteroid family file contract

- Units: metres. Node transforms identity. Bounds centre at local origin.
- `catalog.json`: twelve mesh entries, geometry file paths, library mesh indices,
  dimensions, seeds, triangle counts and already-applied UV repeat metadata.
- `meshes/*.glb`: standard glTF 2.0 triangle primitives without materials or images.
  Each includes POSITION, NORMAL, TEXCOORD_0 and TANGENT. Assign material in game.
- `asteroid-family.gltf`: same twelve meshes, shared external binary and images.
  Twelve independent scenes, default first scene. All nodes are locally centred;
  loading every node into one scene unchanged would overlap them.
- `material-library.json`: shared glTF material, image, texture and sampler
  sections. Same indices as the family glTF. Paths relative to package root.
- Exactly three selectable materials: indices 0=Rock035, 1=Rock031, 2=Rock033.
- Base colour sRGB; ORM and NormalGL linear. ORM R=AO, G=roughness, B=metallic=0.
- Image identity must be shared/cached by material, not re-uploaded per asteroid.
- Choose mesh and material independently; retain chosen material for that object.
- Initial UV multiplier is [1,1]. Catalog repeats are ALREADY included in UVs.
- Rescaling mesh instances later needs texture-repeat compensation separately.
  Prefer per-instance uniforms; do not mutate a globally shared material repeat.
- Texture density is approximate with ordinary spherical UVs; exact metre-based
  projection and pole-free mapping require a further renderer/unwrap change.
- One LOD only, no collision proxy, no spawn simulation or engine-specific API.

Suggested first verification: load one geometry GLB, attach Rock035 through the
shared descriptors, render at its supplied size, then switch to Rock031 without
replacing geometry. Repeat with the 10m and 100m bodies. Compare against viewer.

No Rocket source has been modified, and no other chat was messaged.
