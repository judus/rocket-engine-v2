import type { BoxPart } from './BoxAssembly.js';
import type { Vec3 } from '../../src/3d/index.js';
import type { CameraHome } from './LineDemo.js';

export const seatView: CameraHome = {
  x: 0,
  y: 1.55,
  z: 0,
  yaw: 0,
  pitch: -0.04,
  verticalFov: (50 * Math.PI) / 180,
};
export const inspectionView: CameraHome = {
  x: 7,
  y: 5,
  z: -9,
  yaw: -0.59,
  pitch: -0.26,
  verticalFov: (50 * Math.PI) / 180,
};

const box = (
  id: string,
  position: Vec3,
  scale: Vec3,
  color: string,
  rotation: Vec3 = { x: 0, y: 0, z: 0 },
): BoxPart => ({ id, color, transform: { position, scale, rotation } });

/** Deliberately plain boxes: floor, consoles, display and canopy members. */
export const cockpitParts: readonly BoxPart[] = [
  box(
    'floor',
    { x: 0, y: -0.12, z: 1.3 },
    { x: 1.85, y: 0.1, z: 2.3 },
    '#3b4b60',
  ),
  box(
    'dashboard',
    { x: 0, y: 0.43, z: 2.65 },
    { x: 1.42, y: 0.45, z: 0.28 },
    '#74869b',
  ),
  box(
    'display',
    { x: 0, y: 0.72, z: 2.32 },
    { x: 0.68, y: 0.12, z: 0.035 },
    '#80dbbd',
  ),
  box(
    'left-console',
    { x: -1.5, y: 0.39, z: 0.9 },
    { x: 0.22, y: 0.41, z: 1.15 },
    '#617b92',
  ),
  box(
    'right-console',
    { x: 1.5, y: 0.39, z: 0.9 },
    { x: 0.22, y: 0.41, z: 1.15 },
    '#617b92',
  ),
  box(
    'left-front-post',
    { x: -1.55, y: 1.39, z: 3.1 },
    { x: 0.07, y: 1.41, z: 0.07 },
    '#a1b5c8',
  ),
  box(
    'right-front-post',
    { x: 1.55, y: 1.39, z: 3.1 },
    { x: 0.07, y: 1.41, z: 0.07 },
    '#a1b5c8',
  ),
  box(
    'front-crossbar',
    { x: 0, y: 2.85, z: 3.1 },
    { x: 1.64, y: 0.07, z: 0.07 },
    '#a1b5c8',
  ),
  box(
    'left-rear-post',
    { x: -1.75, y: 1.39, z: -0.7 },
    { x: 0.07, y: 1.41, z: 0.07 },
    '#8a9eb5',
  ),
  box(
    'right-rear-post',
    { x: 1.75, y: 1.39, z: -0.7 },
    { x: 0.07, y: 1.41, z: 0.07 },
    '#8a9eb5',
  ),
  box(
    'rear-crossbar',
    { x: 0, y: 2.85, z: -0.7 },
    { x: 1.84, y: 0.07, z: 0.07 },
    '#8a9eb5',
  ),
  box(
    'left-roof-rail',
    { x: -1.65, y: 2.85, z: 1.2 },
    { x: 0.06, y: 0.07, z: 1.76 },
    '#c59e75',
    { x: 0, y: 0.0526, z: 0 },
  ),
  box(
    'right-roof-rail',
    { x: 1.65, y: 2.85, z: 1.2 },
    { x: 0.06, y: 0.07, z: 1.76 },
    '#c59e75',
    { x: 0, y: -0.0526, z: 0 },
  ),
];
