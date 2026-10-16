import test from 'node:test';
import assert from 'node:assert/strict';
import { boxAssembly } from '../examples/3d/BoxAssembly.js';
import { cockpitParts, seatView } from '../examples/3d/CockpitModel.js';

const zero = { x: 0, y: 0, z: 0 },
  one = { x: 1, y: 1, z: 1 };
void test('child-local scale and translation precede shared parent rotation/translation', () => {
  const part = {
    id: 'part',
    color: '#ffffff',
    transform: {
      position: { x: 2, y: 0, z: 0 },
      scale: { x: 2, y: 1, z: 1 },
      rotation: zero,
    },
  };
  const result = boxAssembly([part], {
    position: { x: 10, y: 0, z: 0 },
    scale: one,
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
  });
  assert.equal(result.length, 6);
  const first = result.find((f) => f.id === 'part/front')!.vertices[0]!;
  // (-1,-1,-1) -> child (0,-1,-1) -> parent (9,-1,0).
  assert.ok(Math.abs(first.x - 9) < 1e-9);
  assert.ok(Math.abs(first.y + 1) < 1e-9);
  assert.ok(Math.abs(first.z) < 1e-9);
  assert.deepEqual(part.transform.position, { x: 2, y: 0, z: 0 });
});
void test('cockpit has stable unique parts/faces and the seated camera is outside every box', () => {
  assert.equal(
    new Set(cockpitParts.map((p) => p.id)).size,
    cockpitParts.length,
  );
  const result = boxAssembly(cockpitParts, {
    position: zero,
    rotation: zero,
    scale: one,
  });
  assert.equal(result.length, cockpitParts.length * 6);
  assert.equal(new Set(result.map((f) => f.id)).size, result.length);
  for (const part of cockpitParts) {
    // Only roof rails rotate; the seat lies well below those rails.
    const p = part.transform.position,
      s = part.transform.scale;
    assert.ok(
      Math.abs(seatView.x - p.x) > s.x ||
        Math.abs(seatView.y - p.y) > s.y ||
        Math.abs(seatView.z - p.z) > s.z,
      part.id,
    );
  }
});
