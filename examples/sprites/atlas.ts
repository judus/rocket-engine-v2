import { createAtlas } from 'sprite-animation';
export const atlas = createAtlas({
  width: 96,
  height: 32,
  frames: Object.fromEntries(
    [0, 1, 2].map((i) => [
      `f${i}`,
      {
        source: { x: i * 32, y: 0, width: 32, height: 32 },
        pivot: { x: 10, y: 28 },
      },
    ]),
  ),
  clips: {
    walk: [0, 1, 2, 1].map((i) => ({ frame: `f${i}`, duration: 0.15 })),
    blink: [
      { frame: 'f0', duration: 0.8 },
      { frame: 'f2', duration: 0.15 },
    ],
  },
});
