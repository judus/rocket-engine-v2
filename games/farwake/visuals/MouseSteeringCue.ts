import { cockpitReticleHalfStroke } from './CockpitReticle.js';
import { Mesh3D, MeshGeometry, Node3D } from '../../../src/3d/index.js';
import { instrumentPalette } from '../InstrumentPalette.js';

/** Command marker on the stabilized aiming plane; not a weapon/target aim solution. */
export function mouseSteeringCue() {
  const root = new Node3D('mouse steering command');
  const line = new Node3D('steering displacement'),
    dot = new Node3D('steering cursor');
  line.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: 0, y: -cockpitReticleHalfStroke, z: 0 },
        { x: 1, y: -cockpitReticleHalfStroke, z: 0 },
        { x: 1, y: cockpitReticleHalfStroke, z: 0 },
        { x: 0, y: cockpitReticleHalfStroke, z: 0 },
      ],
      [{ id: 'line', indices: [0, 1, 2, 3], material: 0 }],
    ),
    [{ color: instrumentPalette.primary, unlit: true, opacity: 0.35 }],
  );
  const vertices = [{ x: 0, y: 0, z: 0 }],
    faces = [];
  for (let i = 0; i <= 24; i++) {
    const angle = (i * Math.PI) / 12;
    vertices.push({
      x: Math.cos(angle) * 0.011,
      y: Math.sin(angle) * 0.011,
      z: 0,
    });
    if (i) faces.push({ id: String(i), indices: [0, i, i + 1], material: 0 });
  }
  dot.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
    { color: instrumentPalette.primary, unlit: true, opacity: 0.35 },
  ]);
  root.add(line).add(dot);
  root.traverse((node) => {
    node.castsShadow = node.receivesShadow = false;
  });
  root.visible = false;
  return {
    root,
    update(yaw: number, pitch: number, active: boolean) {
      root.visible = active && Math.hypot(yaw, pitch) > 1e-6;
      const x = yaw * 0.3,
        y = pitch * 0.3;
      dot.transform = { ...dot.transform, position: { x, y, z: 0 } };
      line.transform = {
        ...line.transform,
        rotation: { x: 0, y: 0, z: Math.atan2(y, x) },
        scale: { x: Math.hypot(x, y), y: 1, z: 1 },
      };
    },
  };
}
