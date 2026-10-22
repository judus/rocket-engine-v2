import { Simulation, Registry } from 'production-workshop';
import type {
  Configuration,
  FacilitySnapshot,
  InventorySummary,
} from 'production-workshop';
import type { Behavior } from '../../src/index.js';
import { PoweredModule } from './PoweredModule.js';
import type {
  PoweredModuleProfile,
  PoweredModuleReading,
} from './PoweredModule.js';
import { ShipPowerPlant } from './ShipPowerPlant.js';
import {
  numberIn,
  profileId,
  recordWithKeys,
  validateHealthProfile,
  validateThermalProfile,
} from './ShipProfiles.js';

function freezeView<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object')
    for (const child of Object.values(value)) freezeView(child);
  return Object.freeze(value);
}
export interface InternalWorker {
  readonly id: string;
  readonly label: string;
  readonly specialty: string | null;
}
export interface InternalDefinition extends PoweredModuleProfile {
  readonly staffing: Readonly<{
    specialty: string;
    specialistMultiplier: number;
  }> | null;
  readonly id: string;
  readonly label: string;
  readonly facilityDefinitionId: string | null;
  readonly inventoryCapacity: number | null;
  readonly inventoryAccepts: readonly string[] | null;
}
export interface InternalInstallation {
  readonly slotId: string;
  readonly definitionId: string;
  readonly installationId: string;
}
export interface InternalsProfile {
  readonly workers: readonly InternalWorker[];
  readonly id: string;
  readonly slots: readonly string[];
  readonly definitions: readonly InternalDefinition[];
  readonly loadout: readonly InternalInstallation[];
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Array.from(value as unknown[]);
}
function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`Duplicate ${label}`);
}
export function validateInternalsProfile(
  value: unknown,
): Readonly<InternalsProfile> {
  const p = recordWithKeys(
    value,
    ['id', 'slots', 'definitions', 'loadout', 'workers'],
    'Internals profile',
  );
  const slots = array(p.slots, 'Internal slots').map((v) =>
    profileId(v, 'Internal slot'),
  );
  if (!slots.length) throw new Error('Internal slots required');
  unique(slots, 'internal slots');
  const definitions = array(p.definitions, 'Internal definitions').map((v) => {
    const d = recordWithKeys(
      v,
      [
        'id',
        'label',
        'facilityDefinitionId',
        'inventoryCapacity',
        'inventoryAccepts',
        'staffing',
        'health',
        'thermal',
        'initialTemperatureK',
        'baselineW',
        'operatingW',
        'outputEfficiency',
        'restartEnergyJ',
      ],
      'Internal definition',
    );
    if (typeof d.label !== 'string' || !d.label.trim() || d.label.length > 120)
      throw new TypeError('Invalid internal label');
    const inventoryCapacity =
      d.inventoryCapacity === null
        ? null
        : numberIn(
            'Internal inventory capacity',
            d.inventoryCapacity as number,
            1,
            1e6,
          );
    if (inventoryCapacity !== null && !Number.isSafeInteger(inventoryCapacity))
      throw new Error('Internal inventory capacity must be an integer');
    const inventoryAccepts =
      d.inventoryAccepts === null
        ? null
        : array(d.inventoryAccepts, 'Inventory accepts').map((v) =>
            profileId(v, 'Accepted resource'),
          );
    if (inventoryAccepts) unique(inventoryAccepts, 'accepted resources');
    if (inventoryCapacity === null && inventoryAccepts !== null)
      throw new Error('Inventory rules require an inventory');
    const facilityDefinitionId =
      d.facilityDefinitionId === null
        ? null
        : profileId(d.facilityDefinitionId, 'Internal facility');
    if (facilityDefinitionId && inventoryCapacity === null)
      throw new Error('Factory requires an inventory');
    let staffing: InternalDefinition['staffing'] = null;
    if (d.staffing !== null) {
      const staff = recordWithKeys(
        d.staffing,
        ['specialty', 'specialistMultiplier'],
        'Internal staffing',
      );
      staffing = Object.freeze({
        specialty: profileId(staff.specialty, 'Worker specialty'),
        specialistMultiplier: numberIn(
          'Specialist multiplier',
          staff.specialistMultiplier as number,
          1,
          100,
        ),
      });
    }
    if (Boolean(facilityDefinitionId) !== Boolean(staffing))
      throw new Error(
        'Each factory requires staffing; non-factories cannot assign workers',
      );
    return Object.freeze({
      staffing,
      id: profileId(d.id, 'Internal definition id'),
      label: d.label,
      facilityDefinitionId,
      inventoryCapacity,
      inventoryAccepts:
        inventoryAccepts === null ? null : Object.freeze(inventoryAccepts),
      health: validateHealthProfile(d.health),
      thermal: validateThermalProfile(d.thermal),
      initialTemperatureK: numberIn(
        'Internal temperature',
        d.initialTemperatureK as number,
        0,
        1e6,
      ),
      baselineW: numberIn(
        'Internal baselineW',
        d.baselineW as number,
        Number.MIN_VALUE,
      ),
      operatingW: numberIn(
        'Internal operatingW',
        d.operatingW as number,
        Number.MIN_VALUE,
      ),
      outputEfficiency: numberIn(
        'Internal outputEfficiency',
        d.outputEfficiency as number,
        0,
        1,
      ),
      restartEnergyJ: numberIn(
        'Internal restartEnergyJ',
        d.restartEnergyJ as number,
        0,
      ),
    });
  });
  unique(
    definitions.map((d) => d.id),
    'internal definitions',
  );
  const loadout = array(p.loadout, 'Internal loadout').map((v) => {
    const i = recordWithKeys(
      v,
      ['slotId', 'definitionId', 'installationId'],
      'Internal installation',
    );
    return Object.freeze({
      slotId: profileId(i.slotId, 'Internal slot'),
      definitionId: profileId(i.definitionId, 'Internal definition'),
      installationId: profileId(i.installationId, 'Internal installation'),
    });
  });
  unique(
    loadout.map((i) => i.slotId),
    'internal occupied slots',
  );
  unique(
    loadout.map((i) => i.installationId),
    'internal installations',
  );
  for (const i of loadout)
    if (
      !slots.includes(i.slotId) ||
      !definitions.some((d) => d.id === i.definitionId)
    )
      throw new Error('Unknown internal slot or definition');
  const workers = array(p.workers, 'Internal workers').map((value) => {
    const w = recordWithKeys(
      value,
      ['id', 'label', 'specialty'],
      'Internal worker',
    );
    if (typeof w.label !== 'string' || !w.label.trim() || w.label.length > 120)
      throw new Error('Invalid worker label');
    return Object.freeze({
      id: profileId(w.id, 'Worker id'),
      label: w.label,
      specialty:
        w.specialty === null
          ? null
          : profileId(w.specialty, 'Worker specialty'),
    });
  });
  unique(
    workers.map((w) => w.id),
    'worker identities',
  );
  return Object.freeze({
    workers: Object.freeze(workers),
    id: profileId(p.id, 'Internals profile id'),
    slots: Object.freeze(slots),
    definitions: Object.freeze(definitions),
    loadout: Object.freeze(loadout),
  });
}
export function validateProductionConfiguration(
  value: unknown,
): Readonly<Configuration> {
  const p = recordWithKeys(
    value,
    ['resources', 'recipes', 'facilities', 'tickMilliseconds', 'seed'],
    'Onboard production',
  );
  const registry = new Registry(p as unknown as Configuration);
  const seed = numberIn(
    'Production seed',
    p.seed as number,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  if (!Number.isSafeInteger(seed))
    throw new Error('Production seed must be an integer');
  return Object.freeze({
    resources: registry.resources,
    recipes: registry.recipes,
    facilities: registry.facilities,
    tickMilliseconds: registry.tickMicroseconds / 1000,
    seed,
  });
}
interface Binding extends InternalInstallation {
  readonly device: PoweredModule;
  readonly inventoryId: string | null;
  readonly facilityId: string | null;
}
export interface InternalReading extends InternalInstallation {
  readonly label: string;
  readonly operation: Readonly<PoweredModuleReading>;
  readonly inventory: Readonly<InventorySummary> | null;
  readonly facility: Readonly<FacilitySnapshot> | null;
}
export interface InternalsReading {
  readonly slots: readonly string[];
  readonly installations: readonly InternalReading[];
  readonly demandW: number;
  readonly suppliedW: number;
  readonly productionTick: number;
  readonly commands: readonly Readonly<{ ok: boolean; message: string }>[];
}
type Command = () => Readonly<{ ok: boolean; message: string }>;
/** Host bindings and operating gates. Workshop alone owns stock, jobs and reservations. */
export class ShipInternals implements Behavior {
  readonly profile: Readonly<InternalsProfile>;
  readonly requires: readonly Behavior[];
  #bindings = new Map<string, Binding>();
  #used = new Set<string>();
  #commands: Command[] = [];
  #reportingErrors: unknown[] = [];
  #results: readonly Readonly<{ ok: boolean; message: string }>[] = [];
  #blocked = new Set<string>();
  #unstaffed = new Set<string>();
  #disposed = false;
  constructor(
    profile: InternalsProfile,
    private readonly power: ShipPowerPlant,
    readonly production: Simulation,
  ) {
    this.profile = validateInternalsProfile(profile);
    this.requires = [power];
    for (const d of this.profile.definitions) {
      numberIn(
        'Internal restartEnergyJ for reserve',
        d.restartEnergyJ,
        0,
        power.profile.capacityJ,
      );
      for (const resource of d.inventoryAccepts ?? [])
        production.registry.resource(resource);
      if (d.facilityDefinitionId) {
        const f = production.registry.facility(d.facilityDefinitionId);
        if (
          Object.keys(f.constructionCost).length ||
          Object.values(f.workersRequired ?? {}).some((n) => n > 0) ||
          Object.values(f.workersProvided ?? {}).some((n) => n > 0) ||
          (f.capacityProvided ?? 0) > 0
        )
          throw new Error(
            'Onboard factories must not claim population, storage capacity or construction costs',
          );
        if (f.workerSlots !== 1)
          throw new Error(
            'Onboard factories require exactly one operator slot',
          );
        for (const gate of [
          'powered',
          'temperature-safe',
          'healthy',
          'staffed',
        ])
          if (!f.operatingConditions?.includes(gate))
            throw new Error(`Internal factory missing ${gate} gate`);
      }
    }
    try {
      for (const i of this.profile.loadout) {
        const result = this.installNow(i);
        if (!result.ok) throw new Error(result.message);
      }
      if (this.#reportingErrors.length)
        throw new AggregateError(
          this.#reportingErrors,
          'Internal loadout committed; Workshop observer reporting failed',
        );
    } catch (error) {
      try {
        this.dispose();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          'Internal loadout and cleanup failed',
        );
      }
      throw error;
    }
  }
  private live(): void {
    if (this.#disposed) throw new Error('Internals disposed');
  }
  private binding(slotId: string): Binding {
    this.live();
    const b = this.#bindings.get(slotId);
    if (!b) throw new Error('Internal slot is empty');
    return b;
  }
  private definition(id: string): InternalDefinition {
    const d = this.profile.definitions.find((d) => d.id === id);
    if (!d) throw new Error('Unknown internal definition');
    return d;
  }
  private installNow(
    i: InternalInstallation,
  ): Readonly<{ ok: boolean; message: string }> {
    if (this.#bindings.has(i.slotId))
      return { ok: false, message: 'Internal slot occupied' };
    if (this.#used.has(i.installationId))
      return {
        ok: false,
        message: 'Internal installation identity already used',
      };
    const d = this.definition(i.definitionId);
    const inventoryId =
      d.inventoryCapacity === null ? null : `internal-${i.installationId}`;
    // Existence after a throw proves this invocation committed only when the
    // ID was absent before entry. Never adopt an existing inventory, even if
    // its configuration happens to match the requested installation.
    if (inventoryId && this.production.inventoryIds().includes(inventoryId))
      throw new Error(`Internal inventory already exists: ${inventoryId}`);
    if (inventoryId)
      this.mutation(
        () => {
          this.production.createInventory({
            id: inventoryId,
            capacity: { kind: 'units', limit: d.inventoryCapacity! },
            attachment: { objectId: i.installationId, slot: 'buffer' },
            rules:
              d.inventoryAccepts === null
                ? {}
                : { accepts: d.inventoryAccepts },
          });
          return true;
        },
        () => {
          if (!this.production.inventoryIds().includes(inventoryId))
            return undefined;
          const attachment = this.production.inventoryAttachment(inventoryId);
          const inventory = this.production.inventory(inventoryId).summary();
          const accepts = inventory.rules?.accepts;
          const acceptsMatch =
            d.inventoryAccepts === null
              ? accepts === undefined
              : accepts !== undefined &&
                accepts.length === d.inventoryAccepts.length &&
                d.inventoryAccepts.every((id) => accepts.includes(id));
          return attachment?.objectId === i.installationId &&
            attachment.slot === 'buffer' &&
            inventory.capacity?.kind === 'units' &&
            inventory.capacity.limit === d.inventoryCapacity &&
            inventory.capacity.used === 0 &&
            inventory.itemCount === 0 &&
            Object.values(inventory.quantities).every((q) => q === 0) &&
            inventory.rules?.maxWeight === undefined &&
            inventory.rules?.maxVolume === undefined &&
            acceptsMatch
            ? true
            : undefined;
        },
      );
    let facilityId: string | null = null;
    if (d.facilityDefinitionId) {
      const definitionId = d.facilityDefinitionId;
      const result = this.mutation(
        () => this.production.addFacility(definitionId, inventoryId!),
        () => {
          const facility = this.production
            .snapshot()
            .facilities.find(
              (f) =>
                f.inventoryId === inventoryId &&
                f.definitionId === definitionId,
            );
          return facility
            ? { ok: true as const, facilityId: facility.id }
            : undefined;
        },
      );
      if (!result.ok)
        throw new Error(
          `Authored internal installation failed: ${result.reason}`,
        );
      facilityId = result.facilityId;
    }
    const device = new PoweredModule(d, this.power);
    this.#bindings.set(i.slotId, { ...i, device, inventoryId, facilityId });
    this.#used.add(i.installationId);
    return { ok: true, message: `Installed ${i.installationId}` };
  }
  install(slotId: string, definitionId: string, installationId: string): void {
    this.live();
    if (!this.profile.slots.includes(slotId))
      throw new Error('Unknown internal slot');
    this.definition(definitionId);
    profileId(installationId, 'Internal installation');
    this.#commands.push(() =>
      this.installNow({ slotId, definitionId, installationId }),
    );
  }
  /** A reporting failure can follow a successful Workshop mutation. Reconcile
   * only a verified postcondition; never retry the operation or hide its error. */
  private mutation<T>(run: () => T, committed: () => T | undefined): T {
    try {
      return run();
    } catch (error) {
      const result = committed();
      if (result === undefined) throw error;
      this.#reportingErrors.push(error);
      return result;
    }
  }
  remove(slotId: string): void {
    const installationId = this.binding(slotId).installationId;
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b || b.installationId !== installationId)
        return { ok: false, message: 'Internal installation changed' };
      if (
        b.device.telemetry.requested ||
        b.device.temperatureK > b.device.profile.thermal.restartTemperatureK
      )
        return {
          ok: false,
          message: 'Disable and cool the internal installation before removal',
        };
      const facilityBlocks = b.facilityId
        ? this.production.removalBlockers(b.facilityId)
        : [];
      if (facilityBlocks.length)
        return {
          ok: false,
          message: `Removal blocked: ${facilityBlocks.map((v) => v.code).join(', ')}`,
        };
      const inventoryBlocks = b.inventoryId
        ? this.production
            .inventoryRemovalBlockers(b.inventoryId)
            .filter(
              (v) =>
                !(
                  v.code === 'object-attachment' &&
                  v.objectId === b.installationId
                ) &&
                !(
                  v.code === 'facility-reference' &&
                  v.facilityId === b.facilityId
                ),
            )
        : [];
      if (inventoryBlocks.length)
        return {
          ok: false,
          message: `Removal blocked: ${inventoryBlocks.map((v) => v.code).join(', ')}`,
        };
      if (b.facilityId) {
        const facilityId = b.facilityId;
        const removed = this.mutation(
          () => this.production.removeFacility(facilityId),
          () =>
            !this.production
              .snapshot()
              .facilities.some((f) => f.id === facilityId)
              ? { ok: true as const, facilityId }
              : undefined,
        );
        if (!removed.ok)
          throw new Error('Internal removal preflight disagreed with Workshop');
      }
      if (b.inventoryId) {
        const inventoryId = b.inventoryId;
        this.mutation(
          () => this.production.detachInventory(inventoryId),
          () =>
            this.production.inventoryAttachment(inventoryId) === null
              ? null
              : undefined,
        );
        const removed = this.mutation(
          () => this.production.removeInventory(inventoryId),
          () =>
            !this.production
              .snapshot()
              .inventories.some((i) => i.id === inventoryId)
              ? { ok: true as const, inventoryId, prunedDeliveryIds: [] }
              : undefined,
        );
        if (!removed.ok)
          throw new Error(
            'Internal inventory removal preflight disagreed with Workshop',
          );
      }
      b.device.dispose();
      this.#bindings.delete(slotId);
      this.#blocked.delete(slotId);
      this.#unstaffed.delete(slotId);
      return { ok: true, message: `Removed ${b.installationId}` };
    });
  }
  requestEnabled(
    slotId: string,
    value: boolean,
    expectedInstallationId?: string,
  ): void {
    const installationId = this.binding(slotId).installationId;
    if (
      expectedInstallationId !== undefined &&
      installationId !== expectedInstallationId
    )
      throw new Error('Internal installation changed');
    if (typeof value !== 'boolean')
      throw new TypeError('Internal request must be boolean');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b || b.installationId !== installationId)
        return { ok: false, message: 'Internal installation changed' };
      b.device.requestEnabled(value);
      return { ok: true, message: 'Internal switch applied' };
    });
  }
  assignWorker(slotId: string, workerId: string | null): void {
    const installationId = this.binding(slotId).installationId;
    const worker =
      workerId === null
        ? null
        : this.profile.workers.find((w) => w.id === workerId);
    if (workerId !== null && !worker)
      throw new Error('Unknown internal worker');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b || b.installationId !== installationId)
        return { ok: false, message: 'Internal installation changed' };
      if (!b?.facilityId)
        return { ok: false, message: 'Installation has no operator slot' };
      if (
        worker &&
        [...this.#bindings.values()].some(
          (other) =>
            other.facilityId &&
            other.facilityId !== b.facilityId &&
            this.production
              .facilitySnapshot(other.facilityId)
              .workerSlots.some((w) => w?.id === worker.id),
        )
      )
        return {
          ok: false,
          message: 'Worker is already operating another installation',
        };
      const staffing = this.definition(b.definitionId).staffing!;
      const facilityId = b.facilityId;
      this.mutation(
        () => {
          this.production.setWorkerSlot(
            facilityId,
            0,
            worker
              ? {
                  id: worker.id,
                  efficiency:
                    worker.specialty === staffing.specialty
                      ? staffing.specialistMultiplier
                      : 1,
                }
              : null,
          );
          return true;
        },
        () =>
          (this.production.facilitySnapshot(facilityId).workerSlots[0]?.id ??
            null) === workerId
            ? true
            : undefined,
      );
      this.mutation(
        () => {
          this.production.setFacilityCondition(
            facilityId,
            'staffed',
            Boolean(worker),
          );
          return true;
        },
        () =>
          this.production.facilitySnapshot(facilityId).conditions.staffed ===
          Boolean(worker)
            ? true
            : undefined,
      );
      return {
        ok: true,
        message: worker
          ? `Assigned ${worker.label}`
          : 'Operator unassigned; production paused',
      };
    });
  }
  damage(slotId: string, points: number): void {
    this.binding(slotId).device.damage(points);
  }
  repair(slotId: string, points: number): void {
    this.binding(slotId).device.repair(points);
  }
  setDraining(slotId: string, value: boolean): void {
    const installationId = this.binding(slotId).installationId;
    if (typeof value !== 'boolean')
      throw new TypeError('Draining must be boolean');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b || b.installationId !== installationId)
        return { ok: false, message: 'Internal installation changed' };
      if (!b.facilityId)
        return {
          ok: false,
          message: 'Installation has no production facility',
        };
      const facilityId = b.facilityId;
      this.mutation(
        () => {
          this.production.setFacilityDraining(facilityId, value);
          return true;
        },
        () =>
          this.production.facilitySnapshot(facilityId).draining === value
            ? true
            : undefined,
      );
      return {
        ok: true,
        message: value ? 'Draining enabled' : 'Production resumed',
      };
    });
  }
  private stockCommand(
    slotId: string,
    resourceId: string,
    quantity: number,
    deposit: boolean,
  ): void {
    const installationId = this.binding(slotId).installationId;
    this.production.registry.resource(resourceId);
    numberIn('Internal stock quantity', quantity, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(quantity))
      throw new Error('Stock quantity must be an integer');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b || b.installationId !== installationId)
        return { ok: false, message: 'Internal installation changed' };
      if (!b.inventoryId)
        return { ok: false, message: 'Installation has no inventory' };
      const inventoryId = b.inventoryId;
      const before = this.production.inventory(inventoryId).summary()
        .quantities[resourceId]!;
      const expected = before + (deposit ? quantity : -quantity);
      const ok = this.mutation(
        () =>
          deposit
            ? this.production.deposit(inventoryId, { [resourceId]: quantity })
            : this.production.withdraw(inventoryId, { [resourceId]: quantity }),
        () =>
          this.production.inventory(inventoryId).summary().quantities[
            resourceId
          ] === expected
            ? true
            : undefined,
      );
      return {
        ok,
        message: ok
          ? deposit
            ? 'Lab stock supplied'
            : 'Lab stock collected'
          : 'Stock unavailable or inventory full',
      };
    });
  }
  transfer(
    fromSlot: string,
    toSlot: string,
    resourceId: string,
    quantity: number,
  ): void {
    const fromId = this.binding(fromSlot).installationId;
    const toId = this.binding(toSlot).installationId;
    if (fromSlot === toSlot)
      throw new Error('Choose a different destination slot');
    this.production.registry.resource(resourceId);
    numberIn(
      'Internal transfer quantity',
      quantity,
      1,
      Number.MAX_SAFE_INTEGER,
    );
    if (!Number.isSafeInteger(quantity))
      throw new Error('Transfer quantity must be an integer');
    this.#commands.push(() => {
      const from = this.#bindings.get(fromSlot),
        to = this.#bindings.get(toSlot);
      if (from?.installationId !== fromId || to?.installationId !== toId)
        return { ok: false, message: 'Internal installation changed' };
      if (!from.inventoryId || !to.inventoryId)
        return { ok: false, message: 'Both installations need an inventory' };
      const source = from.inventoryId,
        destination = to.inventoryId;
      const beforeSource = this.production.inventory(source).summary()
        .quantities[resourceId]!;
      const beforeDestination = this.production.inventory(destination).summary()
        .quantities[resourceId]!;
      const ok = this.mutation(
        () =>
          this.production.transfer(source, destination, {
            [resourceId]: quantity,
          }),
        () =>
          this.production.inventory(source).summary().quantities[resourceId] ===
            beforeSource - quantity &&
          this.production.inventory(destination).summary().quantities[
            resourceId
          ] ===
            beforeDestination + quantity
            ? true
            : undefined,
      );
      return {
        ok,
        message: ok
          ? 'Internal stock transferred'
          : 'Transfer refused: stock unavailable or destination admission failed',
      };
    });
  }
  supply(slotId: string, resourceId: string, quantity: number): void {
    this.stockCommand(slotId, resourceId, quantity, true);
  }
  collect(slotId: string, resourceId: string, quantity: number): void {
    this.stockCommand(slotId, resourceId, quantity, false);
  }
  commit(): void {
    this.live();
    if (!this.#commands.length) return;
    this.#results = Object.freeze([]);
    while (this.#commands.length) {
      const command = this.#commands.shift()!;
      this.#reportingErrors = [];
      let result: ReturnType<Command>;
      try {
        result = command();
      } catch (error) {
        this.#results = Object.freeze([
          ...this.#results,
          Object.freeze({
            ok: false,
            message:
              'Command threw before a completed receipt; remaining commands retained',
          }),
        ]);
        throw error;
      }
      this.#results = Object.freeze([
        ...this.#results,
        Object.freeze({
          ...result,
          message:
            result.message +
            (this.#reportingErrors.length
              ? ' (committed; observer reporting failed)'
              : ''),
        }),
      ]);
      if (this.#reportingErrors.length)
        throw new AggregateError(
          this.#reportingErrors,
          'Internal command committed; Workshop observer reporting failed; remaining commands retained',
        );
    }
  }

  declare(): void {
    for (const b of this.#bindings.values()) {
      b.device.declare(true);
    }
  }
  deliver(dt: number): void {
    for (const b of this.#bindings.values()) b.device.deliver(dt);
  }
  finishStep(dt: number): void {
    for (const b of this.#bindings.values()) {
      b.device.finishStep(dt);
      if (!b.facilityId) continue;
      const o = b.device.telemetry;
      const facility = this.production.facilitySnapshot(b.facilityId);
      const healthy = !o.health.failed,
        cool = !o.thermal.tripped;
      const powered = o.state === 'operating' || o.state === 'limited';
      if (!healthy || !cool || !powered || o.suppliedW < o.demandW)
        this.#blocked.add(b.slotId);
      const allowed = !this.#blocked.has(b.slotId);
      if (!facility.workerSlots[0]) this.#unstaffed.add(b.slotId);
      for (const [key, value] of [
        ['powered', allowed],
        ['temperature-safe', cool],
        ['healthy', healthy],
        [
          'staffed',
          Boolean(facility.workerSlots[0]) && !this.#unstaffed.has(b.slotId),
        ],
      ] as const)
        if (facility.conditions[key] !== value)
          this.production.setFacilityCondition(b.facilityId, key, value);
      if (
        facility.modifiers['ship-condition']?.productivityMultiplier !==
        o.health.outputFraction
      )
        this.production.setProductionModifier(b.facilityId, 'ship-condition', {
          productivityMultiplier: o.health.outputFraction,
        });
    }
    // Conservative at Workshop's fractional-tick boundary: no recovered tick can
    // run if any contributing ship interval lacked service. No second clock.
    if (this.production.advance(dt) > 0) {
      this.#blocked.clear();
      this.#unstaffed.clear();
    }
  }
  get temperatureK(): number {
    return Math.max(
      0,
      ...[...this.#bindings.values()].map((b) => b.device.temperatureK),
    );
  }
  heatAbove(sinkK: number): number {
    return [...this.#bindings.values()].reduce(
      (n, b) => n + b.device.heatAbove(sinkK),
      0,
    );
  }
  removeHeat(energyJ: number, sinkK: number): number {
    numberIn('Internal cooling energy', energyJ, 0);
    let heat = this.heatAbove(sinkK),
      budget = Math.min(heat, energyJ),
      removed = 0;
    for (const b of this.#bindings.values()) {
      const h = b.device.heatAbove(sinkK);
      const q = b.device.removeHeat(
        heat > 0 ? Math.min(budget, (budget * h) / heat) : 0,
        sinkK,
      );
      heat -= h;
      budget -= q;
      removed += q;
    }
    return removed;
  }
  get telemetry(): Readonly<InternalsReading> {
    const installations = Object.freeze(
      [...this.#bindings.values()].map((b) =>
        Object.freeze({
          slotId: b.slotId,
          definitionId: b.definitionId,
          installationId: b.installationId,
          label: this.definition(b.definitionId).label,
          operation: b.device.telemetry,
          facility: b.facilityId
            ? freezeView(this.production.facilitySnapshot(b.facilityId))
            : null,
          inventory: b.inventoryId
            ? freezeView(this.production.inventory(b.inventoryId).summary())
            : null,
        }),
      ),
    );
    return Object.freeze({
      slots: this.profile.slots,
      installations,
      demandW: installations.reduce((n, i) => n + i.operation.demandW, 0),
      suppliedW: installations.reduce((n, i) => n + i.operation.suppliedW, 0),
      productionTick: this.production.summary().tick,
      commands: this.#results,
    });
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#commands = [];
    const errors: unknown[] = [];
    for (const b of this.#bindings.values()) {
      try {
        if (b.facilityId)
          this.production.setFacilityCondition(b.facilityId, 'powered', false);
      } catch (error) {
        errors.push(error);
      } finally {
        b.device.dispose();
      }
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        'Internals disposed; Workshop observer reporting failed',
      );
  }
}
