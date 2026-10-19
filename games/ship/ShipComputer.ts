import type { Behavior } from '../../src/index.js';
import type { HealthReading } from './ModuleHealth.js';
import type { ThermalReading } from './ModuleThermal.js';
import type { ShipMovement, ShipTelemetry } from './ShipMovement.js';
import type { ShipPowerPlant } from './ShipPowerPlant.js';
import type { ShipEngine } from './ShipEngine.js';
import type { ShipDampers } from './ShipDampers.js';
import type { ShipCooling } from './ShipCooling.js';
import type { ShipShields } from './ShipShields.js';
import type { ShipCargo } from './ShipCargo.js';
import type { ShipMounts } from './ShipMounts.js';
import type { ShipInternals } from './ShipInternals.js';

export interface ComputerControls {
  readonly reactor: ShipPowerPlant;
  readonly engine: ShipEngine;
  readonly dampers: ShipDampers;
  readonly cooling: ShipCooling;
  readonly shields: ShipShields;
  readonly cargo: ShipCargo;
  readonly mounts: ShipMounts;
  readonly internals: ShipInternals;
}
export interface ComputerJob {
  readonly recipeId: string;
  readonly state: string;
  readonly progress: number;
  readonly batchesCompleted: number;
}
export interface ComputerModule {
  readonly id: string;
  readonly label: string;
  readonly state: string;
  readonly requested: boolean | null;
  readonly healthFraction: number;
  readonly temperatureK: number | null;
  readonly demandW: number;
  readonly suppliedW: number;
  readonly jobs: readonly Readonly<ComputerJob>[];
}
export interface ComputerAlert {
  readonly id: string;
  readonly moduleId: string | null;
  readonly severity: 'critical' | 'warning';
  readonly message: string;
}
export interface ComputerReading {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly reserveFraction: number;
  readonly generationW: number;
  readonly consumptionW: number;
  readonly modules: readonly Readonly<ComputerModule>[];
  readonly alerts: readonly Readonly<ComputerAlert>[];
}
interface ModuleState {
  readonly state: string;
  readonly requested: boolean;
  readonly health: Readonly<HealthReading>;
  readonly thermal?: Readonly<ThermalReading>;
}
/** Instruments and command routing over the committed ship frame. No second simulation. */
export class ShipComputer implements Behavior {
  readonly requires: readonly Behavior[];
  readonly fixedOrder = 1;
  #reading: Readonly<ComputerReading>;
  #switches = new Map<string, (enabled: boolean) => void>();
  #disposed = false;
  constructor(
    private readonly movement: ShipMovement,
    private readonly controls: ComputerControls,
  ) {
    this.requires = [movement];
    this.#reading = this.calculate(movement.telemetry);
  }
  setEnabled(moduleId: string, enabled: boolean): void {
    if (this.#disposed) throw new Error('Computer disposed');
    if (typeof enabled !== 'boolean')
      throw new TypeError('Module switch must be boolean');
    const command = this.#switches.get(moduleId);
    if (!command) throw new Error('Unknown or non-switchable computer module');
    command(enabled);
  }
  private calculate(t: Readonly<ShipTelemetry>): Readonly<ComputerReading> {
    const modules: Readonly<ComputerModule>[] = [],
      alerts: Readonly<ComputerAlert>[] = [];
    this.#switches.clear();
    const warn = (
      id: string,
      moduleId: string | null,
      severity: ComputerAlert['severity'],
      message: string,
    ) => alerts.push(Object.freeze({ id, moduleId, severity, message }));
    const add = (
      id: string,
      label: string,
      reading: ModuleState,
      demandW: number,
      suppliedW: number,
      command: (enabled: boolean) => void,
      jobs: readonly ComputerJob[] = [],
    ) => {
      this.#switches.set(id, command);
      modules.push(
        Object.freeze({
          id,
          label,
          state: reading.state,
          requested: reading.requested,
          healthFraction: reading.health.fraction,
          temperatureK: reading.thermal?.temperatureK ?? null,
          demandW,
          suppliedW,
          jobs: Object.freeze(jobs.map((j) => Object.freeze({ ...j }))),
        }),
      );
      if (reading.health.failed)
        warn(`${id}/failed`, id, 'critical', `${label}: module failed`);
      else if (reading.health.fraction < 1)
        warn(`${id}/damaged`, id, 'warning', `${label}: damaged`);
      if (reading.thermal?.tripped)
        warn(`${id}/thermal`, id, 'critical', `${label}: thermal shutdown`);
      if (reading.requested && demandW > suppliedW)
        warn(`${id}/power`, id, 'warning', `${label}: insufficient power`);
    };
    add(
      'core:reactor',
      'Reactor',
      t.power,
      t.power.startupDemandW,
      t.power.startupSuppliedW,
      (enabled) => this.controls.reactor.requestEnabled(enabled),
    );
    for (const key of [
      'engine',
      'dampers',
      'cooling',
      'shields',
      'cargo',
    ] as const) {
      const reading = t[key];
      add(
        `core:${key}`,
        {
          engine: 'Engine',
          dampers: 'Inertia dampers',
          cooling: 'Cooling',
          shields: 'Shields',
          cargo: 'Cargo link',
        }[key],
        reading,
        reading.demandW,
        reading.suppliedW,
        (enabled) => this.controls[key].requestEnabled(enabled),
      );
    }
    for (const i of t.mounts.installations) {
      const equipment = this.controls.mounts.profile.equipment.find(
        (e) => e.id === i.equipmentId,
      )!;
      add(
        `mount:${i.installationId}`,
        `${equipment.label} · ${i.slotId}`,
        i.operation,
        i.operation.demandW,
        i.operation.suppliedW,
        (enabled) =>
          this.controls.mounts.requestEnabled(
            i.slotId,
            enabled,
            i.installationId,
          ),
      );
    }
    for (const i of t.internals.installations) {
      const id = `internal:${i.installationId}`;
      add(
        id,
        `${i.label} · ${i.slotId}`,
        i.operation,
        i.operation.demandW,
        i.operation.suppliedW,
        (enabled) =>
          this.controls.internals.requestEnabled(
            i.slotId,
            enabled,
            i.installationId,
          ),
        i.facility?.jobs.map((j) => ({
          recipeId: j.recipeId,
          state: j.state,
          progress: j.progress,
          batchesCompleted: j.batchesCompleted,
        })),
      );
      if (
        i.operation.requested &&
        i.facility &&
        !i.facility.workerSlots.some(Boolean)
      )
        warn(`${id}/staff`, id, 'warning', `${i.label}: operator required`);
    }
    const hullFraction = t.hull.remainingJ / t.hull.capacityJ;
    modules.push(
      Object.freeze({
        id: 'core:hull',
        label: 'Hull',
        state: t.hull.breached
          ? 'breached'
          : hullFraction < 1
            ? 'damaged'
            : 'intact',
        requested: null,
        healthFraction: hullFraction,
        temperatureK: null,
        demandW: 0,
        suppliedW: 0,
        jobs: Object.freeze([]),
      }),
    );
    if (t.hull.breached)
      warn('hull/breach', 'core:hull', 'critical', 'Hull breached');
    else if (hullFraction < 1)
      warn('hull/damaged', 'core:hull', 'warning', 'Hull damaged');
    const reserveFraction = t.power.energyJ / t.power.capacityJ;
    if (reserveFraction <= 0.1)
      warn(
        'reserve/low',
        'core:reactor',
        reserveFraction === 0 ? 'critical' : 'warning',
        'Energy reserve at or below 10%',
      );
    if (t.cargo.link.state !== 'connected')
      warn(
        'cargo/link',
        'core:cargo',
        t.cargo.link.state === 'lost' ? 'critical' : 'warning',
        t.cargo.link.state === 'lost'
          ? 'Cargo pocket link lost'
          : `Cargo link interrupted: ${t.cargo.link.remainingSeconds.toFixed(1)} s recovery window`,
      );
    if (t.power.emergency)
      warn(
        'reactor/emergency',
        'core:reactor',
        'warning',
        'Reactor emergency recovery active',
      );
    alerts.sort(
      (a, b) =>
        Number(b.severity === 'critical') - Number(a.severity === 'critical') ||
        a.id.localeCompare(b.id),
    );
    return Object.freeze({
      tick: t.tick,
      timeSeconds: t.timeSeconds,
      reserveFraction,
      generationW: t.power.generationW,
      consumptionW: t.power.consumptionW,
      modules: Object.freeze(modules),
      alerts: Object.freeze(alerts),
    });
  }
  fixedUpdate(): undefined {
    if (this.#disposed) throw new Error('Computer disposed');
    this.#reading = this.calculate(this.movement.telemetry);
  }
  get telemetry(): Readonly<ComputerReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#disposed = true;
    this.#switches.clear();
  }
}
