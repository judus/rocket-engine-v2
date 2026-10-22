import { Mesh3D, MeshGeometry, Node3D } from '../../../src/3d/index.js';
import type { Vec3 } from '../../../src/3d/index.js';
import type { GunfireReading } from '../ShipGunfire.js';

/** Retained shared geometry for bolts/flashes/sparks; no canvas uploads or simulation. */
export function gunfireView() {
  const root = new Node3D('gunfire effects');
  const geometry = new MeshGeometry(
    [
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
    ],
    [
      [0, 2, 4],
      [0, 4, 3],
      [0, 3, 5],
      [0, 5, 2],
      [1, 4, 2],
      [1, 3, 4],
      [1, 5, 3],
      [1, 2, 5],
    ].map((indices, i) => ({
      id: String(i),
      indices: [...indices].reverse(),
      material: 0,
    })),
  );
  const boltMesh = new Mesh3D(geometry, [{ color: '#ffe5ab', unlit: true }]);
  const flashMesh = new Mesh3D(geometry, [
    { color: '#ffd18a', unlit: true, opacity: 0.8 },
  ]);
  const impactMesh = new Mesh3D(geometry, [
    { color: '#ffb969', unlit: true, opacity: 0.85 },
  ]);
  const debrisMesh = new Mesh3D(geometry, [{ color: '#756d63' }]);
  const nodes = new Map<string, Node3D>();
  return {
    root,
    update(reading: GunfireReading) {
      const live = new Set<string>();
      const get = (key: string, mesh: Mesh3D) => {
        live.add(key);
        let node = nodes.get(key);
        if (!node) {
          node = new Node3D(key);
          node.mesh = mesh;
          node.castsShadow = node.receivesShadow = false;
          nodes.set(key, node);
          root.add(node);
        }
        return node;
      };
      for (const bolt of reading.bolts) {
        const n = get(`bolt-${bolt.id}`, boltMesh),
          v = bolt.velocity,
          length = Math.hypot(v.x, v.y, v.z);
        const f = { x: v.x / length, y: v.y / length, z: v.z / length };
        let r: Vec3 = { x: f.z, y: 0, z: -f.x };
        const rl = Math.hypot(r.x, r.z);
        r =
          rl > 1e-8 ? { x: r.x / rl, y: 0, z: r.z / rl } : { x: 1, y: 0, z: 0 };
        const u = {
          x: f.y * r.z - f.z * r.y,
          y: f.z * r.x - f.x * r.z,
          z: f.x * r.y - f.y * r.x,
        };
        const p = bolt.position;
        n.matrix = [
          r.x * 0.4,
          r.y * 0.4,
          r.z * 0.4,
          0,
          u.x * 0.4,
          u.y * 0.4,
          u.z * 0.4,
          0,
          f.x * 22,
          f.y * 22,
          f.z * 22,
          0,
          p.x - f.x * 22,
          p.y - f.y * 22,
          p.z - f.z * 22,
          1,
        ];
      }
      for (const [kind, effects, mesh] of [
        ['flash', reading.flashes, flashMesh],
        ['impact', reading.impacts, impactMesh],
      ] as const)
        for (const effect of effects) {
          const n = get(`${kind}-${effect.id}`, mesh),
            progress = 1 - effect.life / effect.duration;
          const scale = kind === 'flash' ? 0.25 : 1.5 + progress * 7;
          n.transform = {
            position: effect.position,
            rotation: { x: progress * 4, y: progress * 3, z: 0 },
            scale: { x: scale, y: scale, z: scale },
          };
          n.opacity = 1 - progress;
        }
      for (const effect of reading.destructions) {
        const progress = 1 - effect.life / effect.duration;
        for (let i = 0; i < 12; i++) {
          const n = get(`debris-${effect.id}-${i}`, debrisMesh);
          const angle = i * 2.399963229728653;
          const y = 1 - (2 * (i + 0.5)) / 12;
          const horizontal = Math.sqrt(1 - y * y);
          const distance = effect.radiusM * (0.4 + progress * 1.4);
          const size = Math.max(0.5, effect.radiusM * 0.13) * (1 - progress);
          n.transform = {
            position: {
              x: effect.position.x + Math.cos(angle) * horizontal * distance,
              y: effect.position.y + y * distance,
              z: effect.position.z + Math.sin(angle) * horizontal * distance,
            },
            rotation: { x: angle + progress * 3, y: progress * 4, z: angle },
            scale: { x: size, y: size * 0.65, z: size * 0.8 },
          };
          n.opacity = 1 - progress;
        }
      }
      for (const [key, node] of nodes)
        if (!live.has(key)) {
          root.remove(node);
          nodes.delete(key);
        }
    },
  };
}
