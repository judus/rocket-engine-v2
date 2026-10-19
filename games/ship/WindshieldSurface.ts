import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import type { WindshieldHud } from './WindshieldHud.js';

/** Pilot-rig plane coordinates, visually fitted inside the front frame.
 * HUD and pane share the same tilted parent; pane is just behind its projection.
 */
export const windshieldCorners: readonly Vec3[] = [
  { x: -1.75, y: -1.25, z: 0.02 },
  { x: 1.75, y: -1.25, z: 0.02 },
  { x: 2.35, y: 1.51, z: 0.02 },
  { x: -2.35, y: 1.51, z: 0.02 },
];
export type WindshieldMode = 'clear' | 'display';

/** Shared glass/display surface, independent of simulation and input policy. */
export class WindshieldSurface {
  readonly pane = new Node3D('switchable windshield pane');
  readonly rim = new Node3D('windshield edge glint');
  readonly geometry = new MeshGeometry(
    windshieldCorners,
    [{ id: 'windshield', indices: [0, 1, 2, 3], material: 0 }],
    [],
    {
      texCoords: [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    },
  );
  #mode: WindshieldMode = 'clear';
  constructor(private readonly hud: WindshieldHud) {
    this.pane.castsShadow = this.pane.receivesShadow = false;
    this.rim.castsShadow = this.rim.receivesShadow = false;
    const vertices: Vec3[] = [],
      faces = [];
    for (let i = 0; i < 4; i++) {
      const a = windshieldCorners[i]!,
        b = windshieldCorners[(i + 1) % 4]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      const dx = (-(b.y - a.y) / length) * 0.006;
      const dy = ((b.x - a.x) / length) * 0.006;
      const n = vertices.length;
      vertices.push(
        { x: a.x + dx, y: a.y + dy, z: a.z - 0.001 },
        { x: b.x + dx, y: b.y + dy, z: b.z - 0.001 },
        { x: b.x - dx, y: b.y - dy, z: b.z - 0.001 },
        { x: a.x - dx, y: a.y - dy, z: a.z - 0.001 },
      );
      faces.push({
        id: String(i),
        indices: [n, n + 1, n + 2, n + 3],
        material: 0,
      });
    }
    this.rim.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
      { color: '#86ead6', opacity: 0.12, unlit: true },
    ]);
    hud.root.add(this.pane).add(this.rim);
    this.apply();
  }
  get mode(): WindshieldMode {
    return this.#mode;
  }
  setMode(mode: WindshieldMode): void {
    if (mode !== 'clear' && mode !== 'display')
      throw new Error('Invalid windshield mode');
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.apply();
  }
  private apply(): void {
    const display = this.#mode === 'display';
    this.pane.mesh = new Mesh3D(this.geometry, [
      {
        color: display ? '#031016' : '#86b9bd',
        opacity: display ? 0.94 : 0.025,
        unlit: true,
      },
    ]);
    this.hud.setDisplayMode(display);
  }
}
