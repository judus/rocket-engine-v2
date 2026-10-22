import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  shipCompartments,
  installedCompartments,
  roomCrop,
  compartmentScene,
} from '../games/farwake/ShipInteriors.js';
import { Ship } from '../games/farwake/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';

void test('Seven installed internals have distinct inspection images, alongside the two core-system views', async () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  try {
    const rooms = installedCompartments(ship.telemetry.internals);
    assert.equal(rooms.length, 9);
    assert.equal(
      rooms.filter((r) => r.internal !== null).length,
      ship.telemetry.internals.installations.length,
    );
    assert.equal(new Set(rooms.map((r) => r.id)).size, 9);
    const empty = installedCompartments({
      ...ship.telemetry.internals,
      installations: [],
    });
    assert.deepEqual(
      empty.map((r) => r.id),
      ['engine-room', 'cargo-link'],
    );
    for (const room of rooms) {
      const image = await readFile(
        new URL(
          `../../games/farwake/assets/rooms/${room.id}.png`,
          import.meta.url,
        ),
      );
      assert.deepEqual(
        [...image.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
      );
      assert.equal(image.readUInt32BE(16), 1672);
      assert.equal(image.readUInt32BE(20), 941);
    }
  } finally {
    ship.dispose();
  }
});

void test('Room backgrounds center-crop at 16:9, 16:10 and 4:3 without stretching', () => {
  for (const [width, height] of [
    [1600, 900],
    [1600, 1000],
    [1200, 900],
  ]) {
    const crop = roomCrop(1672, 941, width!, height!);
    assert.ok(crop.x >= 0 && crop.y >= 0);
    assert.ok(Math.abs(crop.width / crop.height - width! / height!) < 1e-12);
    assert.ok(Math.abs(crop.x * 2 + crop.width - 1672) < 1e-9);
    assert.ok(Math.abs(crop.y * 2 + crop.height - 941) < 1e-9);
  }
  assert.throws(() => roomCrop(1672, 941, 0, 10), /dimensions/);
  assert.throws(() => roomCrop(NaN, 941, 100, 100), /dimensions/);
});

void test('Each room scene acquires on entry and releases its background on disposal; aborted preparation releases late images', async () => {
  let acquired = 0,
    released = 0;
  const assets = {
    async acquireImage() {
      acquired++;
      return {
        image: { width: 1672, height: 941 } as ImageBitmap,
        dispose(): undefined {
          released++;
          return undefined;
        },
      };
    },
  };
  const room = compartmentScene(shipCompartments[0], assets, () => ({
    width: 1600,
    height: 900,
  }));
  assert.equal(acquired, 0, 'backgrounds load lazily');
  assert.equal(
    room.fixedUpdate,
    undefined,
    'inspection scene does not own a second ship simulation',
  );
  await room.prepare({ signal: new AbortController().signal });
  assert.equal(acquired, 1);
  assert.equal(released, 0);
  room.dispose();
  assert.equal(released, 1);
  room.dispose();
  assert.equal(released, 1);
  const aborted = compartmentScene(shipCompartments[1]!, assets, () => ({
    width: 1600,
    height: 900,
  }));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    async () => {
      await aborted.prepare({ signal: controller.signal });
    },
    {
      name: 'AbortError',
    },
  );
  assert.equal(released, 2);
  aborted.dispose();
  assert.equal(released, 2);
});
