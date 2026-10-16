import { Mesh3D } from '../../src/3d/index.js';
import { asteroidField } from './AsteroidField.js';

/** Demo composition: world-owned rocks, independent of the moving pilot rig.
 * The existing shadow map is fitted to the cabin, not the whole field.
 */
export function cockpitAsteroidField(seed: number, count: number) {
  const field = asteroidField(seed, count);
  field.transform = {
    ...field.transform,
    position: { x: 0, y: 1.5, z: 18 },
  };
  const materials = new Map<Mesh3D, Mesh3D>();
  for (const node of field.children) {
    const source = node.mesh!;
    let mesh = materials.get(source);
    if (!mesh) {
      mesh = new Mesh3D(
        source.geometry,
        source.materials.map((material) => ({
          ...material,
          metallicFactor: 0,
          roughnessFactor: 1,
        })),
      );
      materials.set(source, mesh);
    }
    node.mesh = mesh;
    node.castsShadow = false;
    node.receivesShadow = false;
  }
  return field;
}
