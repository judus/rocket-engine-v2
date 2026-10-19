import { Mesh3D, TextureImage } from '../../src/3d/index.js';
import type { Node3D } from '../../src/3d/index.js';

/** Renderer/material pairs. Diffuse remains restricted to the comparison tool. */
export const surfaceVariants = {
  full: {
    label: 'Full PBR + maps + normals',
    materialResponse: true,
    materialMaps: true,
    normalMapping: true,
  },
  'no-normal': {
    label: 'PBR + maps, no normals',
    materialResponse: true,
    materialMaps: true,
    normalMapping: false,
  },
  'scalar-pbr': {
    label: 'PBR with scalar materials',
    materialResponse: true,
    materialMaps: false,
    normalMapping: false,
  },
  diffuse: {
    label: 'Textured diffuse',
    materialResponse: false,
    materialMaps: false,
    normalMapping: false,
  },
} as const;
export type SurfaceVariant = keyof typeof surfaceVariants;

const mapMeans = new WeakMap<
  TextureImage,
  { metallic: number; roughness: number }
>();
/** Precompute representative linear factors once, outside render/measurement work. */
function materialMapMean(image: TextureImage) {
  let result = mapMeans.get(image);
  if (!result) {
    const pixels = image.copyPixels();
    let metallic = 0,
      roughness = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      roughness += pixels[i + 1]!;
      metallic += pixels[i + 2]!;
    }
    const denominator = (pixels.length / 4) * 255;
    result = {
      metallic: metallic / denominator,
      roughness: roughness / denominator,
    };
    mapMeans.set(image, result);
  }
  return result;
}

/** Share immutable geometry and base/emissive textures. Never mutate source materials. */
export function surfaceMesh(mesh: Mesh3D, variant: SurfaceVariant): Mesh3D {
  const profile = surfaceVariants[variant];
  if (!profile) throw new Error(`Unknown surface variant: ${String(variant)}`);
  if (variant === 'full') return mesh;
  return new Mesh3D(
    mesh.geometry,
    mesh.materials.map((source) => {
      const material = { ...source };
      if (!profile.normalMapping) {
        delete material.normalTexture;
        delete material.normalScale;
      }
      if (!profile.materialMaps) {
        if (material.metallicRoughnessTexture) {
          const image = material.metallicRoughnessTexture.image;
          if (!(image instanceof TextureImage))
            throw new Error(
              'Scalar surface variants require immutable material maps',
            );
          const mean = materialMapMean(image);
          material.metallicFactor =
            (material.metallicFactor ?? 0) * mean.metallic;
          material.roughnessFactor =
            (material.roughnessFactor ?? 1) * mean.roughness;
        }
        delete material.metallicRoughnessTexture;
        delete material.occlusionTexture;
        delete material.occlusionStrength;
      }
      return material;
    }),
  );
}
export function surfaceVariantSwitcher(root: Node3D) {
  const original: { node: Node3D; mesh: Mesh3D }[] = [];
  root.traverse((node) => {
    if (
      node.mesh &&
      !node.mesh.materials.every(
        (m) =>
          m.unlit &&
          !m.normalTexture &&
          !m.metallicRoughnessTexture &&
          !m.occlusionTexture,
      )
    )
      original.push({ node, mesh: node.mesh });
  });
  const cache = new Map<SurfaceVariant, Map<Mesh3D, Mesh3D>>();
  return (variant: SurfaceVariant) => {
    if (!surfaceVariants[variant])
      throw new Error(`Unknown surface variant: ${String(variant)}`);
    let meshes = cache.get(variant);
    if (!meshes) {
      meshes = new Map();
      cache.set(variant, meshes);
    }
    for (const { node, mesh } of original) {
      let selected = meshes.get(mesh);
      if (!selected) {
        selected = surfaceMesh(mesh, variant);
        meshes.set(mesh, selected);
      }
      node.mesh = selected;
    }
  };
}
