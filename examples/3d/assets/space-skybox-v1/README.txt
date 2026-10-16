SPACE SKYBOX V1

space-equirectangular.png: original generated 2:1 latitude/longitude panorama.
faces/: six 512-square cubemap images in +X,-X,+Y,-Y,+Z,-Z order.
Opaque sRGB PNG, LDR artwork, not a calibrated astronomical catalogue or HDR lighting environment.

Faces are derived from a single panorama, not generated independently.
Row zero is the top of each PNG. Directions for horizontal coordinate s and
vertical coordinate t, both -1 to +1:
px=(1,-t,-s), nx=(-1,-t,s), py=(s,1,t), ny=(s,-1,-t),
pz=(s,-t,1), nz=(-s,-t,-1).
Engine upload conventions may require vertical image flipping. The front
centre of the panorama corresponds to +Z; its seam corresponds to -Z.
Use clamp-to-edge cube sampling and seamless filtering where available.

Render unlit at infinity: camera rotation changes the view, translation does
not. Stars painted into this background cannot individually move or serve
as navigable destinations. Layer navigable stars as separate game objects.

Built-in image_gen was used. Exact generation prompt is in prompt.txt.
Image is intentionally very dark with quiet black polar and wrap regions.
