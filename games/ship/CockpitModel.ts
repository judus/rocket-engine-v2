import { Node3D } from '../../src/3d/index.js';

/** Asset-specific cockpit calibration. Preserve the full imported hierarchy beneath it. */
export function mountCockpitModel(modelRoot: Node3D) {
  const assembly = new Node3D('source coordinates'),
    fit = new Node3D('pilot fit'),
    placement = new Node3D('cockpit model');
  assembly.add(fit);
  fit.add(placement);
  assembly.transform = {
    ...assembly.transform,
    scale: { x: 1, y: 1, z: -1 },
  };
  fit.transform = {
    position: { x: 0, y: 1.53, z: 0.44 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.9, y: 0.93, z: 1 },
  };
  placement.transform = {
    position: { x: 0, y: -0.8191118254985987 - 1.5, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: 94.70412249158481,
      y: 94.70412249158481,
      z: 94.70412249158481,
    },
  };
  placement.add(modelRoot);
  return { assembly, fit };
}
