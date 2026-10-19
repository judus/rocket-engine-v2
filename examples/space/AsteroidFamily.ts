import { Mesh3D, parseGlb } from '../../src/3d/index.js';
import type {
  MeshGeometry,
  Material3D,
  TextureBinding3D,
} from '../../src/3d/index.js';
import { loadTextureImage } from '../../src/webgl/index.js';
const base = new URL(
  '../../../examples/assets/asteroid-family-v1/',
  import.meta.url,
).href;
interface CatalogEntry {
  name: string;
  geometryFile: string;
  longestDimensionMetres: number;
  triangles: number;
}
interface Library {
  images: { uri: string }[];
  textures: { source: number }[];
  materials: {
    name: string;
    pbrMetallicRoughness: {
      baseColorTexture: { index: number };
      metallicRoughnessTexture: { index: number };
      metallicFactor: number;
      roughnessFactor: number;
    };
    normalTexture: { index: number };
    occlusionTexture: { index: number };
  }[];
}
/** Shared example adapter. One decode per image; geometry/material choices share immutable data. */
export async function loadAsteroidFamily(signal: AbortSignal) {
  const json = async (name: string) => {
    const res = await fetch(base + name, { signal });
    if (!res.ok) throw Error(`${name}: HTTP ${res.status}`);
    return res.json() as Promise<unknown>;
  };
  const catalog = (await json('catalog.json')) as {
    asteroids: CatalogEntry[];
  };
  const library = (await json('material-library.json')) as Library;
  const geometries: MeshGeometry[] = await Promise.all(
    catalog.asteroids.map(async (entry) => {
      const res = await fetch(base + entry.geometryFile, { signal });
      if (!res.ok) throw Error(`Mesh HTTP ${res.status}`);
      const model = parseGlb(await res.arrayBuffer());
      if (model.triangles !== entry.triangles)
        throw Error('Catalog triangle mismatch');
      const mesh = model.instantiate().nodes.find((node) => node.mesh)?.mesh;
      if (!mesh) throw Error('Empty asteroid geometry');
      return mesh.geometry;
    }),
  );
  const images = await Promise.all(
    library.images.map((image) =>
      loadTextureImage(base + image.uri, {
        signal,
        colorSpace: image.uri.endsWith('basecolor.png') ? 'srgb' : 'linear',
      }),
    ),
  );
  signal.throwIfAborted();
  const binding = (index: number): TextureBinding3D => ({
    image: images[library.textures[index]!.source]!,
    wrapS: 'repeat',
    wrapT: 'repeat',
    filter: 'trilinear',
  });
  const materials: Material3D[] = library.materials.map((m) => ({
    name: m.name,
    color: '#ffffff',
    metallicFactor: m.pbrMetallicRoughness.metallicFactor,
    roughnessFactor: m.pbrMetallicRoughness.roughnessFactor,
    baseColorTexture: binding(m.pbrMetallicRoughness.baseColorTexture.index),
    metallicRoughnessTexture: binding(
      m.pbrMetallicRoughness.metallicRoughnessTexture.index,
    ),
    occlusionTexture: binding(m.occlusionTexture.index),
    normalTexture: binding(m.normalTexture.index),
  }));
  const variants = geometries.map((g) =>
    materials.map((m) => new Mesh3D(g, [m])),
  );
  return { catalog, materials, variants };
}
