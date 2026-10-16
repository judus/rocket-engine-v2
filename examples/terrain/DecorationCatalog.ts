import type { Rect } from './LegacyAtlas.js';
export interface DecorationSprite {
  readonly id: string;
  readonly sheet: 'terrain' | 'decorations';
  readonly rect: Rect;
  readonly layer: 'ground' | 'object';
  readonly kind: 'tree' | 'detail';
}
export interface DecorationRule {
  readonly reverse: boolean;
  readonly bands: readonly {
    readonly density: number;
    readonly sprites: readonly string[];
  }[];
}
// Adapted from the original atlas rules. Ground detail is cached; overlapping sprites sort with actors.
export const decorationSprites: Readonly<Record<string, DecorationSprite>> = {
  'terrain:deco-water-7-13': {
    id: 'terrain:deco-water-7-13',
    sheet: 'terrain',
    rect: [112, 208, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'terrain:deco-water-6-13': {
    id: 'terrain:deco-water-6-13',
    sheet: 'terrain',
    rect: [96, 208, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'terrain:deco-water-7-14': {
    id: 'terrain:deco-water-7-14',
    sheet: 'terrain',
    rect: [112, 224, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'terrain:deco-water-6-14': {
    id: 'terrain:deco-water-6-14',
    sheet: 'terrain',
    rect: [96, 224, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'decorations:water-plant-on-grass-1': {
    id: 'decorations:water-plant-on-grass-1',
    sheet: 'decorations',
    rect: [64, 64, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:water-plant-on-grass-2': {
    id: 'decorations:water-plant-on-grass-2',
    sheet: 'decorations',
    rect: [96, 64, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:small-stone': {
    id: 'decorations:small-stone',
    sheet: 'decorations',
    rect: [128, 96, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'terrain:deco-grass-5-2': {
    id: 'terrain:deco-grass-5-2',
    sheet: 'terrain',
    rect: [80, 32, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'terrain:deco-grass-5-1': {
    id: 'terrain:deco-grass-5-1',
    sheet: 'terrain',
    rect: [80, 16, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'terrain:deco-grass-5-0': {
    id: 'terrain:deco-grass-5-0',
    sheet: 'terrain',
    rect: [80, 0, 16, 16],
    layer: 'ground',
    kind: 'detail',
  },
  'decorations:small-tree-on-grass': {
    id: 'decorations:small-tree-on-grass',
    sheet: 'decorations',
    rect: [160, 160, 48, 80],
    layer: 'object',
    kind: 'tree',
  },
  'decorations:tree-on-grass': {
    id: 'decorations:tree-on-grass',
    sheet: 'decorations',
    rect: [0, 128, 80, 112],
    layer: 'object',
    kind: 'tree',
  },
  'decorations:stone-on-grass': {
    id: 'decorations:stone-on-grass',
    sheet: 'decorations',
    rect: [160, 96, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:mushroom-1': {
    id: 'decorations:mushroom-1',
    sheet: 'decorations',
    rect: [160, 32, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:small-bush': {
    id: 'decorations:small-bush',
    sheet: 'decorations',
    rect: [128, 32, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:plant-on-dirt-1': {
    id: 'decorations:plant-on-dirt-1',
    sheet: 'decorations',
    rect: [0, 96, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:mushroom-on-grass-1': {
    id: 'decorations:mushroom-on-grass-1',
    sheet: 'decorations',
    rect: [160, 0, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:mushroom-on-grass-2': {
    id: 'decorations:mushroom-on-grass-2',
    sheet: 'decorations',
    rect: [192, 0, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:plant-on-grass-1': {
    id: 'decorations:plant-on-grass-1',
    sheet: 'decorations',
    rect: [0, 64, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:mushroom-on-grass-3': {
    id: 'decorations:mushroom-on-grass-3',
    sheet: 'decorations',
    rect: [224, 0, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:small-bush-on-grass': {
    id: 'decorations:small-bush-on-grass',
    sheet: 'decorations',
    rect: [128, 0, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:trunc': {
    id: 'decorations:trunc',
    sheet: 'decorations',
    rect: [64, 32, 64, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:bush': {
    id: 'decorations:bush',
    sheet: 'decorations',
    rect: [0, 32, 48, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:stone': {
    id: 'decorations:stone',
    sheet: 'decorations',
    rect: [224, 96, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:rock-on-grass': {
    id: 'decorations:rock-on-grass',
    sheet: 'decorations',
    rect: [160, 128, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:bush-on-grass': {
    id: 'decorations:bush-on-grass',
    sheet: 'decorations',
    rect: [0, 0, 48, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:stone-on-dirt': {
    id: 'decorations:stone-on-dirt',
    sheet: 'decorations',
    rect: [192, 96, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
  'decorations:rock-on-dirt': {
    id: 'decorations:rock-on-dirt',
    sheet: 'decorations',
    rect: [192, 128, 32, 32],
    layer: 'object',
    kind: 'detail',
  },
};
export const decorationRules: readonly DecorationRule[] = [
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: ['terrain:deco-water-7-13', 'terrain:deco-water-6-13'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-7-14', 'terrain:deco-water-6-13'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-6-14', 'terrain:deco-water-6-13'],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: ['terrain:deco-water-7-13', 'terrain:deco-water-6-13'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-7-14', 'terrain:deco-water-6-13'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-6-14', 'terrain:deco-water-6-13'],
      },
    ],
  },
  {
    reverse: true,
    bands: [
      {
        density: 0.1,
        sprites: ['terrain:deco-water-7-13', 'terrain:deco-water-6-13'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-7-14'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-6-14'],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-water-6-13'],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: [
          'decorations:water-plant-on-grass-1',
          'decorations:water-plant-on-grass-2',
          'decorations:small-stone',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-1',
          'terrain:deco-grass-5-0',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:small-tree-on-grass',
          'decorations:tree-on-grass',
          'decorations:stone-on-grass',
          'decorations:mushroom-1',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-1',
          'terrain:deco-grass-5-0',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: ['decorations:small-stone', 'decorations:small-bush'],
      },
      {
        density: 0.1,
        sprites: ['decorations:small-stone', 'decorations:plant-on-dirt-1'],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: [
          'decorations:small-tree-on-grass',
          'decorations:mushroom-on-grass-1',
          'decorations:tree-on-grass',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-1',
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-0',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:mushroom-on-grass-2',
          'decorations:plant-on-grass-1',
        ],
      },
      {
        density: 0.1,
        sprites: ['terrain:deco-grass-5-0', 'terrain:deco-grass-5-1'],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:water-plant-on-grass-1',
          'decorations:mushroom-on-grass-3',
          'decorations:water-plant-on-grass-2',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: [
          'decorations:small-tree-on-grass',
          'decorations:stone-on-grass',
          'decorations:small-stone',
          'decorations:mushroom-on-grass-2',
          'decorations:small-bush-on-grass',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:small-tree-on-grass',
          'decorations:small-stone',
          'decorations:stone-on-grass',
          'decorations:mushroom-on-grass-2',
          'decorations:trunc',
          'decorations:tree-on-grass',
          'decorations:bush',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:mushroom-on-grass-3',
          'decorations:tree-on-grass',
          'decorations:stone-on-grass',
          'decorations:small-tree-on-grass',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: ['decorations:small-stone', 'decorations:plant-on-dirt-1'],
      },
      {
        density: 0.1,
        sprites: ['decorations:small-stone', 'decorations:plant-on-dirt-1'],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:small-bush-on-grass',
          'decorations:plant-on-dirt-1',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-1',
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-0',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-0',
          'terrain:deco-grass-5-1',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:small-tree-on-grass',
          'decorations:small-stone',
          'decorations:small-bush',
          'decorations:stone',
          'decorations:small-tree-on-grass',
          'decorations:tree-on-grass',
          'decorations:rock-on-grass',
          'decorations:bush-on-grass',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-1',
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-0',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'terrain:deco-grass-5-2',
          'terrain:deco-grass-5-0',
          'terrain:deco-grass-5-1',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:small-stone',
          'decorations:small-bush',
          'decorations:stone',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [
      {
        density: 0.1,
        sprites: [
          'decorations:small-stone',
          'decorations:small-bush',
          'decorations:stone',
        ],
      },
      {
        density: 0.1,
        sprites: [
          'decorations:small-stone',
          'decorations:stone-on-dirt',
          'decorations:rock-on-dirt',
        ],
      },
    ],
  },
  {
    reverse: false,
    bands: [],
  },
];
