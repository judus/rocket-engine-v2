import { createAtlas } from 'sprite-animation';
import type { Assets, Scene2D } from '../../src/index.js';
import { createSprite } from '../sprites/createSprite.js';
import { metadata } from './metadata.js';

export const characterNames = [
  'Female1',
  'Female2',
  'Male1',
  'Male2',
  'Male3',
  'Male4',
] as const;
export type Direction = 'front' | 'back' | 'left' | 'right';
export const characterAtlas = createAtlas({
  width: 256,
  height: 576,
  frames: Object.fromEntries(
    metadata.tiles.map((tile) => [
      tile.name,
      {
        source: {
          x: tile.index[0] * metadata.tileW,
          y: tile.index[1] * metadata.tileH,
          width: metadata.tileW,
          height: metadata.tileH,
        },
        pivot: { x: 16, y: 41 },
      },
    ]),
  ),
  clips: Object.fromEntries(
    metadata.animations.map((clip) => [
      clip.name,
      clip.frames.map((frame) => ({ frame, duration: clip.frameLen })),
    ]),
  ),
});
export function setCharacterClip(
  sprite: ReturnType<typeof createSprite>,
  activity: 'idle' | 'walk',
  direction: Direction,
) {
  if (sprite.node.disposed) return;
  sprite.flips.flipX = direction === 'right';
  sprite.player.play(
    `${activity}-${direction === 'left' || direction === 'right' ? 'side' : direction}`,
  );
}
export interface CharacterSprite {
  readonly name: string;
  readonly sprite: ReturnType<typeof createSprite>;
}
/** Scene owns each image lease; two players share it and advance only through their nodes. */
export async function prepareCharacters(
  scene: Scene2D,
  assets: Pick<Assets, 'acquireImage'>,
  signal: AbortSignal,
  released: () => void,
  fail = false,
): Promise<CharacterSprite[]> {
  const result: CharacterSprite[] = [];
  for (const [index, name] of characterNames.entries()) {
    const lease = await assets.acquireImage(
      fail && index === 5
        ? new URL(
            '../../../examples/character-sprites/missing.png',
            import.meta.url,
          ).href
        : new URL(
            `../../../examples/character-sprites/${name}.png`,
            import.meta.url,
          ).href,
      { signal },
    );
    if (signal.aborted) {
      lease.dispose();
      signal.throwIfAborted();
    }
    scene.own(() => {
      lease.dispose();
      released();
      return;
    });
    if (lease.image.width !== 256 || lease.image.height !== 576)
      throw new Error(`Unexpected ${name} sheet dimensions`);
    for (let twin = 0; twin < 2; twin++) {
      const sprite = createSprite(
        characterAtlas,
        lease.image,
        twin ? 'walk-side' : 'idle-front',
      );
      sprite.flips.flipX = twin === 1;
      sprite.node.x = 30 + (index % 3) * 205 + (twin ? 125 : 65);
      sprite.node.y = 145 + Math.floor(index / 3) * 185;
      sprite.node.scaleX = sprite.node.scaleY = 2;
      scene.root.add(sprite.node);
      result.push({ name: `${name} ${twin ? 'B' : 'A'}`, sprite });
    }
  }
  return result;
}
