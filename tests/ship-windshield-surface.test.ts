import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WindshieldSurface,
  windshieldCorners,
} from '../games/ship/WindshieldSurface.js';
import {
  WindshieldHud,
  hudGlyphGeometry,
} from '../games/ship/WindshieldHud.js';
import { surfaceVariantSwitcher } from '../games/ship/SurfaceVariants.js';

void test('Clear and display modes reuse the same fitted 3D plane and HUD parent', () => {
  const hud = new WindshieldHud(() =>
    hudGlyphGeometry(1, 1, new Uint8ClampedArray(4)),
  );
  const glass = new WindshieldSurface(hud);
  assert.equal(glass.pane.parent, hud.root);
  assert.equal(glass.rim.parent, hud.root);
  assert.equal(glass.mode, 'clear');
  assert.equal(hud.reticle.visible, true);
  assert.equal(glass.geometry.vertices.length, 4);
  assert.equal(glass.geometry.texCoords.length, 4);
  assert.ok(windshieldCorners.every((v) => v.z === 0.02));
  assert.equal(glass.pane.mesh!.materials[0]!.opacity, 0.025);
  assert.equal(glass.pane.castsShadow, false);
  const select = surfaceVariantSwitcher(hud.root);
  glass.setMode('display');
  const displayMesh = glass.pane.mesh;
  assert.equal(glass.mode, 'display');
  assert.equal(displayMesh!.geometry, glass.geometry);
  assert.equal(displayMesh!.materials[0]!.opacity, 0.94);
  assert.equal(hud.reticle.visible, false);
  select('scalar-pbr');
  select('full');
  assert.equal(glass.pane.mesh, displayMesh);
  glass.setMode('display');
  assert.equal(glass.pane.mesh, displayMesh, 'no rebuild for unchanged mode');
  assert.throws(() => glass.setMode('invalid' as 'clear'), /mode/);
  assert.equal(glass.mode, 'display');
  glass.setMode('clear');
  assert.equal(glass.pane.mesh!.geometry, glass.geometry);
  assert.equal(hud.reticle.visible, true);
});
