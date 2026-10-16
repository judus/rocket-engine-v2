import { Node2D } from '../src/index.js';
import type { Point } from '../src/index.js';
import { TileBoard } from './TileBoard.js';
import type { TileRegionCache } from './TileRegionCache.js';
import type { Cell } from './TileBoard.js';

const colors = ['#253b50', '#80dbbd', '#f1b973'] as const;

/** The factory receives data explicitly; it never looks up an engine service. */
export function createTileBoard(
  board: TileBoard,
  onCleanup: () => void = () => {},
  cache?: TileRegionCache,
) {
  let selected: Cell | null = null;
  const node = new Node2D({
    draw(ctx) {
      const size = board.tileSize;
      if (cache) cache.draw(ctx);
      else
        for (let y = board.minY; y < board.minY + board.height; y++) {
          for (let x = board.minX; x < board.minX + board.width; x++) {
            const terrain = board.get({ x, y });
            if (terrain === null) continue;
            ctx.fillStyle = colors[terrain];
            ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
          }
        }
      // World axes make the signed coordinate origin visible through both cameras.
      ctx.strokeStyle = '#eb8fba';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(board.minX * size, 0);
      ctx.lineTo((board.minX + board.width) * size, 0);
      ctx.moveTo(0, board.minY * size);
      ctx.lineTo(0, (board.minY + board.height) * size);
      ctx.stroke();
      if (selected) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(
          selected.x * size + 2,
          selected.y * size + 2,
          size - 4,
          size - 4,
        );
      }
    },
  });
  node.attach({
    dispose() {
      onCleanup();
    },
  });
  return {
    node,
    get selected(): Readonly<Cell> | null {
      return selected ? { ...selected } : null;
    },
    edit(world: Point): boolean {
      if (node.disposed) throw new Error('Board presentation is disposed');
      const cell = board.cellAt(node.worldToLocal(world));
      if (!cell) return false;
      selected = cell;
      return board.cycle(cell);
    },
  };
}
