import type { FactoryState } from './FactoryDemo.js';
export function drawFloor(ctx: CanvasRenderingContext2D, state: FactoryState) {
  ctx.fillStyle = '#101b29';
  ctx.fillRect(0, 0, 640, 360);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#d5e6ef';
  ctx.fillText('ORE → ALLOY → PARTS', 24, 30);
  const colors = ['#8aa8bb', '#ffba70', '#82d9b6'];
  for (const [index, facility] of state.facilities.entries()) {
    const x = 24 + index * 208,
      job = facility.jobs[0];
    ctx.fillStyle = colors[index] ?? '#fff';
    ctx.fillRect(x, 66, 176, 116);
    ctx.fillStyle = '#12202f';
    ctx.fillText(['Ore source', 'Smelter', 'Press'][index] ?? '', x + 10, 92);
    ctx.fillText(job?.state ?? 'idle', x + 10, 120);
    ctx.fillText(`${job?.batchesCompleted ?? 0} batches`, x + 10, 148);
    ctx.fillStyle = '#263746';
    ctx.fillRect(x, 166, 176, 10);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, 166, 176 * (job?.progress ?? 0), 10);
  }
  ctx.fillStyle = '#d5e6ef';
  ctx.fillText('Shared stockpile · capacity 20 per material', 24, 222);
  for (const [index, id] of ['ore', 'alloy', 'parts'].entries())
    ctx.fillText(
      `${id.padEnd(5)} ${String(state.stock.quantities[id] ?? 0).padStart(2)} stored / ${state.stock.reserved[id] ?? 0} reserved`,
      24,
      252 + index * 28,
    );
  ctx.fillStyle = '#87a4b8';
  ctx.fillText('Arrows describe recipes; stock has one owner.', 24, 344);
}
export function drawDiagnostics(
  ctx: CanvasRenderingContext2D,
  state: FactoryState,
) {
  ctx.fillStyle = '#101b29';
  ctx.fillRect(0, 0, 640, 360);
  ctx.font = '16px monospace';
  ctx.fillStyle = '#d5e6ef';
  ctx.fillText(
    `Workshop tick ${state.summary.tick} · ${state.summary.timeSeconds.toFixed(2)}s`,
    20,
    30,
  );
  const rate = state.summary.timeSeconds
    ? (state.completed / state.summary.timeSeconds) * 60
    : 0;
  ctx.fillText(
    `${state.completed} parts completed · ${rate.toFixed(1)} parts/min since start`,
    20,
    60,
  );
  ctx.fillText(
    `${state.collected} collected · ${state.stock.quantities.parts ?? 0} stored`,
    20,
    90,
  );
  ctx.fillText(
    `One clock owner · ${state.advances} calls · 50 ms production ticks`,
    20,
    120,
  );
  ctx.fillStyle = '#84d9b6';
  ctx.fillText('Recent Workshop events (bounded to eight):', 20, 156);
  for (const [index, event] of state.events.entries())
    ctx.fillText(
      `${String(event.tick).padStart(4)}  ${event.type}  ${'orderId' in event ? event.orderId : event.facilityId}`,
      20,
      182 + index * 21,
    );
}
