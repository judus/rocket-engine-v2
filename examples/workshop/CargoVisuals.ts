import type { FactoryState } from './FactoryDemo.js';
import type { Placement } from './FacilityVisuals.js';
import type { ClassicObject } from '../terrain/StreamedClassicCache.js';
/** Draw-only interpolation between stable world anchors, never an owner of cargo. */
export function cargoObjects(
  state: FactoryState,
  placements: readonly Placement[],
): readonly ClassicObject[] {
  if (!state.transports.length) return [];
  const byId = new Map(placements.map((p) => [p.facilityId, p.cell]));
  return state.transports.flatMap((route) => {
    if (!route.cargo || route.departureTick === null) return [];
    const from = byId.get(route.source),
      to = byId.get(route.destination);
    if (!from || !to) return [];
    const tick = state.summary.tick + state.summary.pendingSeconds / 0.05;
    const progress = Math.min(
      1,
      Math.max(0, (tick - route.departureTick) / route.travelTicks),
    );
    const x = (from.x + 0.5 + (to.x - from.x) * progress) * 16;
    const y = (from.y + 1 + (to.y - from.y) * progress) * 16;
    return [
      {
        id: route.cargo.id,
        x,
        feetY: y,
        bounds: { minX: x - 5, maxX: x + 5, minY: y - 5, maxY: y + 5 },
        draw(ctx: CanvasRenderingContext2D) {
          ctx.fillStyle =
            route.cargo?.state === 'arrival-blocked'
              ? '#ff5050'
              : route.resource === 'ore'
                ? '#ffba70'
                : '#82d9ff';
          ctx.fillRect(x - 4, y - 4, 8, 8);
          ctx.strokeStyle = '#142533';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 4, y - 4, 8, 8);
        },
      },
    ];
  });
}
