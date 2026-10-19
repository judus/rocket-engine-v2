import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WindshieldHud,
  hudGlyphGeometry,
} from '../games/ship/WindshieldHud.js';
import { cockpitReadings } from '../games/ship/CockpitReadings.js';
import { surfaceVariantSwitcher } from '../games/ship/SurfaceVariants.js';
import { Ship } from '../games/ship/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';

void test('HUD raster emits only glyph coverage with empty background and rejects broken rasters', () => {
  const raster = new Uint8ClampedArray(4 * 2 * 4);
  raster[3] = raster[7] = raster[15] = 255;
  const geometry = hudGlyphGeometry(4, 2, raster);
  assert.equal(
    geometry.faces.length,
    2,
    'adjacent covered pixels merge into one strip',
  );
  assert.equal(geometry.vertices.length, 8);
  assert.equal(
    hudGlyphGeometry(1, 1, new Uint8ClampedArray(4)).faces.length,
    0,
  );
  assert.throws(() => hudGlyphGeometry(0, 1, raster), /raster/);
  assert.throws(
    () => hudGlyphGeometry(4, 2, new Uint8ClampedArray(1)),
    /raster/,
  );
});

void test('Reticle and changing text share one 3D tilt and opacity without material presets restoring stale HUDs', () => {
  let rasterizations = 0;
  const hud = new WindshieldHud(() => {
    rasterizations++;
    return hudGlyphGeometry(1, 1, new Uint8ClampedArray([255, 255, 255, 255]));
  });
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  try {
    const reading = cockpitReadings(ship.telemetry, ship.computer.telemetry);
    hud.update(reading);
    const count = rasterizations;
    hud.update(reading);
    assert.equal(
      rasterizations,
      count,
      'unchanged text does not rebuild glyph geometry',
    );
    assert.equal(hud.reticle.parent, hud.root);
    assert.equal(hud.reticle.transform.position.y, 0);
    assert.equal(
      hud.root.transform.rotation.x,
      0,
      'tilt is inherited from the authored pane',
    );
    const speed = hud.root.children.find((n) => n.name === 'HUD speed')!;
    const before = speed.mesh!;
    const core = hud.reticle.children[0]!;
    const originalAlpha = core.mesh!.materials[0]!.opacity!;
    hud.setOpacity(0.275);
    assert.equal(speed.mesh!.materials[0]!.opacity, 0.275);
    assert.equal(speed.mesh!.geometry, before.geometry);
    assert.equal(core.mesh!.materials[0]!.opacity, originalAlpha / 2);
    assert.equal(rasterizations, count);
    const select = surfaceVariantSwitcher(hud.root);
    hud.update({ ...reading, speed: '100.0 m/s' });
    const changed = speed.mesh;
    for (const variant of ['scalar-pbr', 'no-normal', 'full'] as const) {
      select(variant);
      assert.equal(speed.mesh, changed);
      assert.equal(core.mesh!.materials[0]!.opacity, originalAlpha / 2);
    }
    assert.throws(() => hud.setOpacity(2), /projection/);
    assert.throws(() => hud.setOpacity(NaN), /projection/);
    assert.equal(
      speed.mesh,
      changed,
      'invalid appearance has no partial effects',
    );
  } finally {
    ship.dispose();
  }
});
