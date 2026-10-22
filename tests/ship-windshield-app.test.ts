import test from 'node:test';
import assert from 'node:assert/strict';
import { crewIds } from '../games/farwake/CrewProfiles.js';
import {
  WindshieldPages,
  windshieldPages,
} from '../games/farwake/WindshieldApp.js';

void test('Windshield navigation selects four pages and rejects invalid destinations', () => {
  const pages = new WindshieldPages();
  assert.equal(pages.selected, 0);
  assert.deepEqual(windshieldPages, ['Ship', 'Map', 'Crew', '...']);
  assert.equal(crewIds.length, 4);
  pages.select(2);
  assert.equal(pages.selected, 2);
  for (const invalid of [-1, 4, 0.5, NaN])
    assert.throws(() => pages.select(invalid));
  assert.equal(pages.selected, 2);
});

void test('Windshield tab picking uses authored glass UV and ignores gaps and page contents', () => {
  const pages = new WindshieldPages();
  for (let i = 0; i < 4; i++)
    assert.equal(pages.hit((319 + i * 360 + 165) / 2048, 1 - 145 / 1408), i);
  assert.equal(pages.hit(664 / 2048, 1 - 145 / 1408), null);
  assert.equal(pages.hit(0.5, 0.5), null);
  assert.equal(pages.hit(-1, 1), null);
});
