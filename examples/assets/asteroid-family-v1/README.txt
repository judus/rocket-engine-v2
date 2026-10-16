ASTEROID FAMILY V1 — 12 MESHES / 3 SHARED MATERIALS

Open viewer.html via a local HTTP server. Choose a shape or All twelve,
then switch Material. The gallery fits every shape separately; equal on-screen
size does not mean equal world size. Actual dimensions are labelled.

CONTENTS
meshes/*.glb: twelve GEOMETRY-ONLY assets, with positions, geometric normals,
UVs and tangents. No images and no material attached. The game assigns one.
asteroid-family.gltf + asteroid-family.bin: same geometry plus three shared
PBR materials and external images; ONE SCENE PER ASTEROID. Default scene shows
only the first. Select another scene or mesh by name/index from catalog.json.
material-library.json: the shared glTF material/image/texture/sampler sections.
materials/: one copy of each 2K runtime set, with original/derived provenance.
catalog.json: names, exact dimensions, UV repeat metadata and file paths.

SIZES (largest extent is the advertised 10–100m; thinner axes may be smaller)
01. chipped-round: 10.0 x 9.0 x 9.6 m
02. long-boulder: 16.0 x 7.1 x 8.1 m
03. flat-slab: 22.0 x 7.4 x 18.9 m
04. wedge: 28.0 x 18.7 x 19.3 m
05. double-lobe: 35.0 x 14.1 x 13.9 m
06. impact-basin: 42.0 x 34.5 x 41.9 m
07. splinter: 50.0 x 14.0 x 17.3 m
08. weathered-boulder: 60.0 x 46.3 x 53.4 m
09. scarred: 70.0 x 46.2 x 52.3 m
10. ridged: 80.0 x 55.0 x 62.8 m
11. broad-plate: 90.0 x 38.9 x 75.2 m
12. broken-mass: 100.0 x 95.7 x 93.7 m

4,800 triangles each; 57,600 for all twelve. Identity node transforms, metre
units, Y up, each asteroid centred on its bounds centre. Shapes vary rather
than being resized copies. No collision proxies, no distant LODs yet.

MATERIALS
Rock035 dark grey; Rock031 layered grey; Rock033 warm mottled rock.
Three shared full-resolution sets; no whole-object atlas bake. Colour is
unchanged source PNG; normals converted to RGB8; AO/roughness packed losslessly.
One material/mesh draw per asteroid. Loading the whole library uses nine maps,
approximately 192 MiB as RGBA8 with full mip chains. This preview loads all
three sets for comparison. Runtime can load only the material(s) it needs.

TEXTURE SCALE
TEXCOORD_0 already includes each asteroid's size-aware repetition. Initial
runtime multiplier is [1,1] — do not apply catalog uvRepeats a second time.
Catalog uvRepeats describes what is already baked into the UVs. Integer
longitude repeats keep the wrap continuous; physical detail size is only
approximate, especially for the 10m body, and spherical UVs compress at poles.
If node scale changes later, ordinary UVs DO stretch the texture. Compensate
in per-instance UV settings or use a future object-space renderer mapping.
Editing a shared material's UV repeat globally would affect every user of it;
use per-instance uniforms or material instances sharing the same images.

ROCKET HANDOFF
The game may choose any mesh and any of the three materials independently.
Pick material once at spawn, optionally seeded; not anew each frame. The
provided default assignments simply cycle through the three for convenience.
The viewer proves local material switching, not a Rocket loader integration.
See ROCKET-HANDOFF.md for the explicit file contract.

CHECKS
Independent exported-file readback: all sizes, finite attributes, normals and
tangents, nondegenerate outward faces, closed two-triangle edge incidence,
Euler=2 after welding, twelve distinct normalised position hashes, geometry
GLBs equal library geometry, and original/runtime texture channel consistency.
Browser: all 9 maps loaded; all three materials on all twelve in gallery;
individual shape selection and close-up. No displacement or cast shadows.

REBUILD
Python3 + NumPy + Pillow: build_family.py, validate_family.py, build_viewer.py.
Requires three original source sets in ../asteroid-materials/ in the workspace.
The generated deliverables and shared runtime images are portable together.
