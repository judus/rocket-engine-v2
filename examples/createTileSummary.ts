import type { Scene } from '../src/index.js';
import type { TileBoard } from './TileBoard.js';

/** A separate read-only presentation of the same model, without a simulation update. */
export function createTileSummary(
  board: Pick<TileBoard, 'counts' | 'revision'>,
): Scene {
  return {
    draw(ctx) {
      const { active, empty, mint, sand, total } = board.counts;
      ctx.fillStyle = '#101b2b';
      ctx.fillRect(0, 0, 640, 220);
      ctx.fillStyle = '#e5edf6';
      ctx.font = 'bold 42px system-ui';
      ctx.fillText(`${active} / ${total}`, 24, 62);
      ctx.font = '16px system-ui';
      ctx.fillStyle = '#9caec2';
      ctx.fillText('Active tiles · mint + sand', 24, 90);
      let x = 24;
      for (const [count, color] of [
        [empty, '#253b50'],
        [mint, '#80dbbd'],
        [sand, '#f1b973'],
      ] as const) {
        const width = (count / total) * 592;
        ctx.fillStyle = color;
        ctx.fillRect(x, 112, width, 24);
        x += width;
      }
      ctx.fillStyle = '#c6d5e6';
      ctx.font = '15px monospace';
      ctx.fillText(`Slate ${empty}   Mint ${mint}   Sand ${sand}`, 24, 169);
      ctx.fillText(
        `Edits ${board.revision} · shared board, read-only display`,
        24,
        197,
      );
    },
  };
}
