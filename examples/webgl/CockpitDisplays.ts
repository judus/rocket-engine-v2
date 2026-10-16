import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { TextureBinding3D } from '../../src/3d/index.js';

/** Asset-specific adapter: replace only authored, pilot-facing glass faces.
 * The original immutable model, sides, backs and source UVs remain intact.
 */
export function attachCockpitDisplays(
  root: Node3D,
  radar: TextureBinding3D,
  telemetry: TextureBinding3D,
  overhead?: readonly [TextureBinding3D, TextureBinding3D, TextureBinding3D],
): void {
  const targets = new Map([
    ['display-left__screen-black', radar],
    ['display-right__screen-black', telemetry],
  ]);
  if (overhead)
    overhead.forEach((binding, i) =>
      targets.set(`overhead-display-${i + 1}__screen-black`, binding),
    );
  const matches: { node: Node3D; binding: TextureBinding3D }[] = [];
  root.traverse((node) => {
    const binding = targets.get(node.name);
    if (binding) matches.push({ node, binding });
  });
  if (
    matches.length !== targets.size ||
    new Set(matches.map((m) => m.node.name)).size !== targets.size
  )
    throw new Error(
      'Cockpit requires exactly one of each requested authored display',
    );
  const replacements = matches.map(({ node, binding }) => {
    if (!node.mesh) throw new Error(`Missing display geometry: ${node.name}`);
    const { geometry: g, materials } = node.mesh;
    // v4/v5 glass front points +Z in source coordinates. Other faces stay black.
    const front = g.faces.filter((f) =>
      f.indices.every((i) => (g.normals[i]?.z ?? 0) > 0.999),
    );
    if (front.length !== 2)
      throw new Error(`Expected two front triangles: ${node.name}`);
    const make = (faces: typeof g.faces) =>
      new MeshGeometry(g.vertices, faces, [], {
        normals: g.normals,
        tangents: g.tangents,
        texCoords: g.texCoords,
      });
    const surface = new Node3D(`${node.name}/instrument`);
    surface.mesh = new Mesh3D(make(front.map((f) => ({ ...f, material: 0 }))), [
      {
        color: '#ffffff',
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: binding,
        unlit: true,
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    ]);
    surface.castsShadow = false;
    surface.receivesShadow = false;
    const rest = new Mesh3D(
      make(g.faces.filter((f) => !front.includes(f))),
      materials,
    );
    return { node, surface, rest };
  });
  for (const { node, surface, rest } of replacements) {
    node.mesh = rest;
    node.add(surface);
  }
}
