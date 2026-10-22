import {
  EnergyReserve,
  ShipModule,
  Reactor,
  PowerLoad,
} from '../../games/farwake/PowerLedger.js';
import type { PowerTrial } from '../ship/PowerTrial.js';
/** Display state only. Requested switches are not claims of powered simulation. */
export const cockpitSystemPages = [
  [
    ['reactor', 'REACTOR'],
    ['cooling', 'COOLING'],
    ['dampers', 'DAMPERS'],
    ['propulsion', 'ENGINE'],
    ['cargo', 'CARGO BAY'],
    ['shields', 'SHIELDS'],
  ],
  [
    ['weapons', 'WEAPONS'],
    ['scanner', 'SCANNER'],
    ['lifeSupport', 'LIFE SUPPORT'],
    ['instruments', 'INSTRUMENTS'],
  ],
] as const;
export type CockpitSystemId = (typeof cockpitSystemPages)[number][number][0];

/** Host-owned requested state, retained independently of future power availability. */
export class CockpitSystemsPanel {
  page = 0;
  constructor(readonly power?: PowerTrial) {}
  private powerModule(id: CockpitSystemId) {
    const trial = this.power;
    if (!trial) return undefined;
    const entity =
      id === 'reactor'
        ? trial.reactor
        : id === 'propulsion'
          ? trial.load
          : undefined;
    return entity ? trial.world.get(entity, ShipModule) : undefined;
  }
  readonly #requested = new Map<CockpitSystemId, boolean>(
    cockpitSystemPages.flatMap((page) =>
      page.map(([id]) => [id, true] as const),
    ),
  );
  requested(id: CockpitSystemId): boolean {
    return this.powerModule(id)?.requested ?? this.#requested.get(id)!;
  }
  toggleRow(row: number): boolean {
    const entry = cockpitSystemPages[this.page]?.[row];
    if (!entry) return false;
    const module = this.powerModule(entry[0]);
    if (module) module.requested = !module.requested;
    else this.#requested.set(entry[0], !this.requested(entry[0]));
    return true;
  }
  turnPage(): void {
    this.page = (this.page + 1) % cockpitSystemPages.length;
  }
  click(x: number, y: number): boolean {
    if (x >= 24 && x <= 488 && y >= 357 && y <= 389) {
      this.turnPage();
      return true;
    }
    if (x < 386 || x > 488) return false;
    for (let row = 0; row < cockpitSystemPages[this.page]!.length; row++) {
      const top = 122 + row * 36;
      if (y >= top && y <= top + 28) return this.toggleRow(row);
    }
    return false;
  }
  draw(ctx: CanvasRenderingContext2D): void {
    const cyan = '#86ead6',
      amber = '#efc37e',
      muted = '#799f9b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#21423e';
    ctx.strokeRect(8, 8, 496, 384);
    ctx.fillStyle = cyan;
    ctx.font = 'bold 23px monospace';
    ctx.fillText('SHIP SYSTEMS', 24, 37);
    ctx.font = '16px monospace';
    ctx.fillStyle = amber;
    ctx.fillText(
      this.power ? 'ECS POWER TRIAL' : 'SIMULATION PENDING',
      280,
      37,
    );
    ctx.fillStyle = muted;
    ctx.font = '17px monospace';
    const reserve = this.power?.world.get(this.power.ship, EnergyReserve);
    ctx.fillText(
      reserve
        ? `ENERGY ${(reserve.energyJ / 1e6).toFixed(1)} / ${(reserve.capacityJ / 1e6).toFixed(0)} MJ (${((100 * reserve.energyJ) / reserve.capacityJ).toFixed(0)}%)`
        : 'ENERGY -- / -- J    LOAD -- W',
      24,
      69,
    );
    ctx.fillText(
      reserve
        ? `GEN ${(reserve.generationW / 1e6).toFixed(1)} MW   LOAD ${(reserve.consumptionW / 1e6).toFixed(1)} MW`
        : 'HEAT -- °C    CREW -- G',
      24,
      94,
    );
    ctx.strokeRect(24, 103, 464, 1);
    ctx.font = '14px monospace';
    ctx.fillText(
      this.power ? 'MODULE / POWER / STATE' : 'MODULE / POWER / TEMP',
      24,
      119,
    );
    ctx.fillText('REQUEST', 399, 119);
    cockpitSystemPages[this.page]!.forEach(([id, label], row) => {
      const y = 122 + row * 36,
        requested = this.requested(id);
      ctx.fillStyle = cyan;
      ctx.font = 'bold 19px monospace';
      ctx.fillText(
        `${row + 1} ${this.power && id === 'propulsion' ? 'ENGINE (TEST)' : label}`,
        24,
        y + 17,
      );
      ctx.fillStyle = muted;
      ctx.font = '14px monospace';
      const module = this.powerModule(id);
      let detail = '-- W / -- °C / UNAVAILABLE';
      if (module && this.power) {
        const watts =
          id === 'reactor'
            ? module.state === 'online'
              ? this.power.world.get(this.power.reactor, Reactor)!.outputW
              : 0
            : this.power.world.get(this.power.load, PowerLoad)!.suppliedW;
        detail = `${(watts / 1e6).toFixed(1)} MW / ${module.state === 'waiting-for-charge' ? 'WAIT CHARGE' : module.state.toUpperCase()}`;
      }
      ctx.fillText(detail, 46, y + 32);
      ctx.fillStyle = requested ? '#153a35' : '#101c20';
      ctx.fillRect(386, y, 102, 28);
      ctx.strokeStyle = requested ? '#4c9b8b' : '#35504e';
      ctx.strokeRect(386, y, 102, 28);
      ctx.fillStyle = requested ? cyan : muted;
      ctx.font = 'bold 18px monospace';
      ctx.fillText(requested ? 'ON' : 'OFF', 419, y + 21);
    });
    ctx.strokeStyle = '#3b786c';
    ctx.strokeRect(24, 357, 464, 32);
    ctx.fillStyle = cyan;
    ctx.font = '16px monospace';
    ctx.fillText(
      `< ${this.page === 0 ? 'DRIVE & DEFENCE' : 'AUXILIARY'} ${this.page + 1}/2   NEXT >`,
      44,
      379,
    );
  }
}
