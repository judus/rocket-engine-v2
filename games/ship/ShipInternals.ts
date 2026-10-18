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
export interface InternalDefinition extends PoweredModuleProfile {
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
    ['id', 'slots', 'definitions', 'loadout'],
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
    return Object.freeze({
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
  return Object.freeze({
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
  #results: readonly Readonly<{ ok: boolean; message: string }>[] = [];
  #blocked = new Set<string>();
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
            'Initial onboard factories must be autonomous and free to install',
          );
        for (const gate of ['powered', 'temperature-safe', 'healthy'])
          if (!f.operatingConditions?.includes(gate))
            throw new Error(`Internal factory missing ${gate} gate`);
      }
    }
    for (const i of this.profile.loadout) {
      const result = this.installNow(i);
      if (!result.ok) throw new Error(result.message);
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
    if (inventoryId)
      this.production.createInventory({
        id: inventoryId,
        capacity: { kind: 'units', limit: d.inventoryCapacity! },
        attachment: { objectId: i.installationId, slot: 'buffer' },
        rules:
          d.inventoryAccepts === null ? {} : { accepts: d.inventoryAccepts },
      });
    let facilityId: string | null = null;
    if (d.facilityDefinitionId) {
      const result = this.production.addFacility(
        d.facilityDefinitionId,
        inventoryId!,
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
  remove(slotId: string): void {
    this.binding(slotId);
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b) return { ok: false, message: 'Internal slot is empty' };
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
        const removed = this.production.removeFacility(b.facilityId);
        if (!removed.ok)
          throw new Error('Internal removal preflight disagreed with Workshop');
      }
      if (b.inventoryId) {
        this.production.detachInventory(b.inventoryId);
        const removed = this.production.removeInventory(b.inventoryId);
        if (!removed.ok)
          throw new Error(
            'Internal inventory removal preflight disagreed with Workshop',
          );
      }
      b.device.dispose();
      this.#bindings.delete(slotId);
      this.#blocked.delete(slotId);
      return { ok: true, message: `Removed ${b.installationId}` };
    });
  }
  requestEnabled(slotId: string, value: boolean): void {
    this.binding(slotId);
    if (typeof value !== 'boolean')
      throw new TypeError('Internal request must be boolean');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b) return { ok: false, message: 'Internal slot is empty' };
      b.device.requestEnabled(value);
      return { ok: true, message: 'Internal switch applied' };
    });
  }
  damage(slotId: string, points: number): void {
    this.binding(slotId).device.damage(points);
  }
  repair(slotId: string, points: number): void {
    this.binding(slotId).device.repair(points);
  }
  setDraining(slotId: string, value: boolean): void {
    this.binding(slotId);
    if (typeof value !== 'boolean')
      throw new TypeError('Draining must be boolean');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b) return { ok: false, message: 'Internal slot is empty' };
      if (!b.facilityId)
        return {
          ok: false,
          message: 'Installation has no production facility',
        };
      this.production.setFacilityDraining(b.facilityId, value);
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
    this.binding(slotId);
    this.production.registry.resource(resourceId);
    numberIn('Internal stock quantity', quantity, 1, Number.MAX_SAFE_INTEGER);
    if (!Number.isSafeInteger(quantity))
      throw new Error('Stock quantity must be an integer');
    this.#commands.push(() => {
      const b = this.#bindings.get(slotId);
      if (!b) return { ok: false, message: 'Internal slot is empty' };
      if (!b.inventoryId)
        return { ok: false, message: 'Installation has no inventory' };
      const ok = deposit
        ? this.production.deposit(b.inventoryId, { [resourceId]: quantity })
        : this.production.withdraw(b.inventoryId, { [resourceId]: quantity });
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
    this.binding(fromSlot);
    this.binding(toSlot);
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
      if (!from?.inventoryId || !to?.inventoryId)
        return { ok: false, message: 'Both installations need an inventory' };
      const ok = this.production.transfer(from.inventoryId, to.inventoryId, {
        [resourceId]: quantity,
      });
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
    const commands = this.#commands;
    this.#commands = [];
    if (commands.length)
      this.#results = Object.freeze(
        commands.map((command) => Object.freeze(command())),
      );
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
      const healthy = !o.health.failed,
        cool = !o.thermal.tripped;
      const powered = o.state === 'operating' || o.state === 'limited';
      if (!healthy || !cool || !powered || o.suppliedW < o.demandW)
        this.#blocked.add(b.slotId);
      const allowed = !this.#blocked.has(b.slotId);
      const facility = this.production.facilitySnapshot(b.facilityId);
      for (const [key, value] of [
        ['powered', allowed],
        ['temperature-safe', cool],
        ['healthy', healthy],
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
    if (this.production.advance(dt) > 0) this.#blocked.clear();
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
    for (const b of this.#bindings.values()) {
      if (b.facilityId)
        this.production.setFacilityCondition(b.facilityId, 'powered', false);
      b.device.dispose();
    }
    this.#commands = [];
    this.#disposed = true;
  }
}
