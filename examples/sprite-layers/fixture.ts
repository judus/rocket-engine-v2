import { createAtlas, createLayerSet } from 'sprite-animation';
import type { LayerSet } from 'sprite-animation';

export const timeline = createAtlas({
  width: 64,
  height: 32,
  frames: {
    a: { source: { x: 0, y: 0, width: 32, height: 32 } },
    b: { source: { x: 32, y: 0, width: 32, height: 32 } },
  },
  clips: {
    walk: [
      { frame: 'a', duration: 0.25 },
      { frame: 'b', duration: 0.5 },
    ],
  },
});
// Weapon cells have different geometry and names from the body/clothing sheets.
export const weaponAtlas = createAtlas({
  width: 48,
  height: 40,
  frames: {
    low: {
      source: { x: 0, y: 0, width: 24, height: 40 },
      pivot: { x: 12, y: 36 },
    },
    high: {
      source: { x: 24, y: 0, width: 24, height: 40 },
      pivot: { x: 12, y: 36 },
    },
  },
  clips: { unused: [{ frame: 'low', duration: 10 }] },
});
export function appearance(hidden = false): LayerSet {
  return createLayerSet({
    timeline,
    layers: [
      { id: 'body', atlas: timeline },
      { id: 'shirt', atlas: timeline },
      {
        id: 'weapon',
        atlas: weaponAtlas,
        frames: { walk: ['low', hidden ? null : 'high'] },
      },
    ],
    order: {
      walk: [
        ['weapon', 'body', 'shirt'],
        ['body', 'shirt', 'weapon'],
      ],
    },
  });
}
