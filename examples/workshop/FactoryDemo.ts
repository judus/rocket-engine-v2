import {
  Simulation,
  type Configuration,
  type SimulationEvent,
  type SimulationSave,
  type DeliverySnapshot,
} from 'production-workshop';
const basicConfiguration = {
  resources: [
    { id: 'ore', label: 'Ore', kind: 'material' },
    { id: 'alloy', label: 'Alloy', kind: 'material' },
    { id: 'parts', label: 'Parts', kind: 'material' },
  ],
  recipes: [
    {
      id: 'mine',
      label: 'Extract ore',
      durationSeconds: 1,
      inputs: {},
      outputs: { ore: 2 },
    },
    {
      id: 'smelt',
      label: 'Smelt alloy',
      durationSeconds: 1.5,
      inputs: { ore: 2 },
      outputs: { alloy: 1 },
    },
    {
      id: 'press',
      label: 'Press parts',
      durationSeconds: 2,
      inputs: { alloy: 1 },
      outputs: { parts: 1 },
    },
  ],
  facilities: [
    {
      id: 'mine',
      label: 'Ore source',
      category: 'extraction',
      recipes: ['mine'],
      constructionCost: {},
    },
    {
      id: 'smelter',
      label: 'Smelter',
      category: 'production',
      recipes: ['smelt'],
      constructionCost: {},
    },
    {
      id: 'press',
      label: 'Press',
      category: 'production',
      recipes: ['press'],
      constructionCost: {},
    },
  ],
  tickMilliseconds: 50,
  seed: 42,
} satisfies Configuration;
export const buildingWork = {
  mine: { ore: 2, seconds: 6 },
  smelter: { ore: 4, seconds: 10 },
  press: { ore: 6, seconds: 12 },
} as const;
function configuration(workshop: boolean): Configuration {
  return workshop
    ? {
        ...basicConfiguration,
        facilities: basicConfiguration.facilities.map((f) => ({
          ...f,
          constructionCost: {
            ore: buildingWork[f.id as keyof typeof buildingWork].ore,
          },
          ...(f.id === 'mine'
            ? {}
            : {
                workersRequired: { operator: 1 },
                workersProvided: { operator: 1 },
              }),
        })),
      }
    : basicConfiguration;
}
export interface CompletedSite {
  readonly orderId: string;
  readonly facilityId: string;
  readonly kind: 'mine' | 'smelter' | 'press';
}
/** Demo coordinator. Workshop owns stock and jobs; Rocket only supplies elapsed time. */
export class FactoryDemo {
  #simulation = new Simulation(configuration(false));
  #unsubscribe: () => void = () => {};
  #disposed = false;
  #advances = 0;
  #completed = 0;
  #collected = 0;
  #events: SimulationEvent[] = [];
  #stockId = 'stock';
  #ids: readonly string[] = [];
  #presses = new Set<string>();
  #construction = false;
  #transport = false;
  #routes: TransportRoute[] = [];
  #nextBuffer = 0;
  #workshop = false;
  #completedSites: CompletedSite[] = [];
  get workshop() {
    return this.#workshop;
  }
  get transport() {
    return this.#transport;
  }
  get ids() {
    return this.#ids;
  }
  constructor(chains = 1, transport = false, workshop = false) {
    const version: unknown = this.#simulation.save().version;
    if (version !== 7)
      throw new Error('Workshop 2.4.0 save format 7 is required');
    if (!Number.isInteger(chains) || chains < 1 || chains > 2000)
      throw new RangeError('Invalid chain count');
    if (transport && chains !== 1)
      throw new Error('Transport mode requires one initial chain');
    if (workshop && (!transport || chains !== 1))
      throw new Error('Workshop demo requires one transport chain');
    this.#workshop = workshop;
    this.#simulation = new Simulation(configuration(workshop));
    this.#transport = transport;
    const ids: string[] = [];
    this.#construction = chains === 1;
    for (let chain = 0; chain < chains; chain++) {
      const raw = chain === 0 ? 'stock' : `raw-${chain}`;
      const refined = `refined-${chain}`,
        finished = `finished-${chain}`;
      this.#simulation.createInventory({
        id: raw,
        capacityPerMaterial: chains === 1 ? (workshop ? 40 : 20) : 1000000,
        ...(workshop
          ? { initial: { ore: 24 } }
          : chains === 1
            ? {}
            : { initial: { ore: 4 } }),
      });
      if (chains > 1) {
        this.#simulation.createInventory({
          id: refined,
          capacityPerMaterial: 1000000,
          initial: { alloy: 2 },
        });
        this.#simulation.createInventory({
          id: finished,
          capacityPerMaterial: 1000000,
        });
      }
      for (const id of ['mine', 'smelter', 'press']) {
        const input = chains > 1 && id === 'press' ? refined : raw;
        const output =
          chains === 1 || id === 'mine'
            ? raw
            : id === 'smelter'
              ? refined
              : finished;
        const local = transport ? this.#buffers() : null;
        const result = this.#simulation.addFacility(id, input, {
          inputInventoryId: local?.input ?? input,
          outputInventoryId: local?.output ?? output,
        });
        if (!result.ok) throw new Error(result.reason);
        ids.push(result.facilityId);
        if (id === 'press') this.#presses.add(result.facilityId);
      }
    }
    this.#ids = Object.freeze(ids);
    this.#stockId = chains === 1 ? 'stock' : 'finished-0';
    this.#listen();
    if (transport) {
      this.connect(ids[0]!, ids[1]!, 2);
      this.connect(ids[1]!, ids[2]!, 2);
    }
  }
  #buffers() {
    if (this.#nextBuffer >= Number.MAX_SAFE_INTEGER)
      throw new Error('Buffer ID exhausted');
    const index = this.#nextBuffer++;
    const input = `input-${index}`,
      output = `output-${index}`;
    this.#simulation.createInventory({ id: input, capacityPerMaterial: 20 });
    this.#simulation.createInventory({ id: output, capacityPerMaterial: 20 });
    return { input, output };
  }
  #listen() {
    this.#unsubscribe = this.#simulation.onEvent((event) => {
      this.#events.push(event);
      if (this.#events.length > 8) this.#events.shift();
      if (
        event.type === 'batch-completed' &&
        this.#presses.has(event.facilityId)
      )
        this.#completed++;
    });
  }
  save(): FactorySave {
    this.#live();
    if (!this.#construction)
      throw new Error('Stress mode checkpoints are disabled');
    if (this.#completedSites.length)
      throw new Error('Publish completed sites before saving');
    return {
      simulation: this.#simulation.save(),
      advances: this.#advances,
      completed: this.#completed,
      collected: this.#collected,
      mode: this.#transport ? 'transport' : 'shared',
      routes: this.#routes.map((r) => ({ ...r })),
      nextBuffer: this.#nextBuffer,
      workshop: this.#workshop,
    };
  }
  static restore(value: unknown): FactoryDemo {
    if (
      !value ||
      typeof value !== 'object' ||
      !('simulation' in value) ||
      !('advances' in value) ||
      !('completed' in value) ||
      !('collected' in value) ||
      !('nextBuffer' in value) ||
      typeof value.nextBuffer !== 'number' ||
      !Number.isSafeInteger(value.nextBuffer) ||
      value.nextBuffer < 0 ||
      !('mode' in value) ||
      !('workshop' in value) ||
      typeof value.workshop !== 'boolean' ||
      !('routes' in value) ||
      !Array.isArray(value.routes)
    )
      throw new Error('Invalid factory state');
    const counters = [value.advances, value.completed, value.collected];
    if (
      !counters.every(
        (v) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0,
      )
    )
      throw new Error('Invalid factory counters');
    const simulation = Simulation.restore(value.simulation);
    if (
      JSON.stringify(simulation.save().configuration) !==
      JSON.stringify(
        new Simulation(configuration(value.workshop)).save().configuration,
      )
    )
      throw new Error('Incompatible Workshop configuration');
    const transport = value.mode === 'transport';
    if (value.mode !== 'shared' && value.mode !== 'transport')
      throw new Error('Invalid factory mode');
    const ids = simulation.facilityIds();
    if (
      simulation.summary().inventoryCount !==
        (transport
          ? 1 + (ids.length + simulation.constructionOrderIds().length) * 2
          : 1) ||
      (!transport && simulation.summary().deliveryCount !== 0) ||
      simulation.inventory('stock').capacityPerMaterial !==
        (value.workshop ? 40 : 20) ||
      (value.workshop && !transport) ||
      (!value.workshop && simulation.constructionOrderIds().length !== 0) ||
      (!transport && (value.routes.length !== 0 || value.nextBuffer !== 0))
    )
      throw new Error('Incompatible factory inventories');
    const presses = new Set<string>();
    const saved = simulation.save();
    let completed = saved.retiredFacilities
      .filter((f) => f.definitionId === 'press')
      .reduce((sum, f) => sum + f.jobs.reduce((n, j) => n + j.completed, 0), 0);
    for (const id of ids) {
      const f = simulation.facilitySnapshot(id);
      if (
        !['mine', 'smelter', 'press'].includes(f.definitionId) ||
        (!transport &&
          (f.inputInventoryId !== 'stock' ||
            f.outputInventoryId !== 'stock')) ||
        (transport &&
          (!/^input-\d+$/.test(f.inputInventoryId) ||
            f.outputInventoryId !==
              f.inputInventoryId.replace('input-', 'output-')))
      )
        throw new Error('Incompatible facility');
      if (f.definitionId === 'press') {
        presses.add(id);
        completed += f.jobs.reduce((sum, job) => sum + job.batchesCompleted, 0);
      }
    }
    if (
      value.completed !== completed ||
      (value.collected as number) > completed ||
      (transport
        ? simulation.inventory('stock').quantity('parts') +
          ids.reduce(
            (sum, id) =>
              sum +
              simulation
                .inventory(simulation.facilitySnapshot(id).outputInventoryId)
                .quantity('parts'),
            0,
          )
        : simulation.inventory('stock').quantity('parts')) +
        (value.collected as number) !==
        completed
    )
      throw new Error('Inconsistent production counters');
    if (transport) {
      const used = new Set(
        ids.flatMap((id) => {
          const f = simulation.facilitySnapshot(id);
          return [f.inputInventoryId, f.outputInventoryId];
        }),
      );
      for (const id of simulation.constructionOrderIds()) {
        const o = simulation.constructionOrderSnapshot(id);
        if (
          !['mine', 'smelter', 'press'].includes(o.definitionId) ||
          ['completed', 'cancelled'].includes(o.state) ||
          o.inventoryId !== 'stock' ||
          o.outputInventoryId !==
            o.inputInventoryId.replace('input-', 'output-') ||
          !/^input-\d+$/.test(o.inputInventoryId) ||
          o.durationMicroseconds !==
            buildingWork[o.definitionId as keyof typeof buildingWork].seconds *
              1000000
        )
          throw new Error('Invalid construction site');
        if (used.has(o.inputInventoryId) || used.has(o.outputInventoryId))
          throw new Error('Shared site buffers');
        used.add(o.inputInventoryId);
        used.add(o.outputInventoryId);
      }
      if (
        used.size !==
        (ids.length + simulation.constructionOrderIds().length) * 2
      )
        throw new Error('Shared private buffers');
      for (const name of used) {
        const row = simulation.inventory(name).summary();
        const index = Number(name.slice(name.indexOf('-') + 1));
        if (
          row.capacityPerMaterial !== 20 ||
          !Number.isSafeInteger(index) ||
          index >= value.nextBuffer
        )
          throw new Error('Invalid private buffer');
      }
    }
    const result = new FactoryDemo(1, transport, value.workshop);
    result.#unsubscribe();
    result.#simulation = simulation;
    result.#transport = transport;
    result.#workshop = value.workshop;
    result.#nextBuffer = value.nextBuffer;
    result.#routes = transport ? decodeRoutes(value, simulation) : [];
    result.#ids = Object.freeze(ids);
    result.#presses = presses;
    result.#advances = value.advances as number;
    result.#completed = value.completed as number;
    result.#collected = value.collected as number;
    result.#events = [];
    result.#listen();
    return result;
  }
  #live() {
    if (this.#disposed) throw new Error('Factory demo disposed');
  }
  advance(seconds: number): void {
    this.#live();
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError('Invalid elapsed time');
    if (!this.#transport || seconds === 0) this.#simulation.advance(seconds);
    else {
      let remaining = seconds;
      while (remaining > 0) {
        const step = Math.min(
          remaining,
          Math.max(0.000001, 0.05 - this.#simulation.summary().pendingSeconds),
        );
        const ticks = this.#simulation.advance(step);
        remaining -= step;
        if (ticks) this.#logisticsTick();
      }
    }
    if (this.#workshop) this.#finishSites();
    if (seconds > 0) this.#advances++;
  }
  addFacility(kind: 'mine' | 'smelter' | 'press'): string {
    this.#live();
    if (!this.#construction)
      throw new Error('Construction is disabled in stress mode');
    if (this.#workshop) throw new Error('Use timed construction orders');
    if (!['mine', 'smelter', 'press'].includes(kind))
      throw new RangeError('Unknown facility kind');
    const local = this.#transport ? this.#buffers() : null;
    const result = this.#simulation.addFacility(
      kind,
      'stock',
      local
        ? { inputInventoryId: local.input, outputInventoryId: local.output }
        : {},
    );
    if (!result.ok) throw new Error(result.reason);
    this.#ids = Object.freeze([...this.#ids, result.facilityId]);
    if (kind === 'press') this.#presses.add(result.facilityId);
    return result.facilityId;
  }
  orderFacility(kind: 'mine' | 'smelter' | 'press'): string {
    this.#live();
    if (!this.#workshop) throw new Error('Timed construction demo is disabled');
    if (!Object.hasOwn(buildingWork, kind))
      throw new Error('Unknown building kind');
    const local = this.#buffers();
    return this.#simulation.createConstructionOrder(kind, 'stock', {
      durationSeconds: buildingWork[kind].seconds,
      inputInventoryId: local.input,
      outputInventoryId: local.output,
    });
  }
  #finishSites() {
    for (const id of this.#simulation.constructionOrderIds()) {
      const o = this.#simulation.constructionOrderSnapshot(id);
      if (o.state === 'completed' && o.facilityId) {
        this.#ids = Object.freeze([...this.#ids, o.facilityId]);
        if (o.definitionId === 'press') this.#presses.add(o.facilityId);
        this.#completedSites.push({
          orderId: o.id,
          facilityId: o.facilityId,
          kind: o.definitionId as CompletedSite['kind'],
        });
      }
    }
    this.#simulation.pruneConstructionOrders();
  }
  takeCompletedSites(): readonly CompletedSite[] {
    this.#live();
    const result = this.#completedSites;
    this.#completedSites = [];
    return result;
  }
  cancelSite(id: string): void {
    this.#live();
    if (!this.#workshop) throw new Error('Timed construction demo is disabled');
    const o = this.#simulation.constructionOrderSnapshot(id);
    const receipt = this.#simulation.cancelConstructionOrder(id);
    if (!receipt.ok) throw new Error('Cannot cancel a completed site');
    this.#simulation.pruneConstructionOrders();
    for (const buffer of [o.inputInventoryId, o.outputInventoryId])
      if (!this.#simulation.removeInventory(buffer).ok)
        throw new Error('Site buffer retirement refused');
  }
  pauseFacility(id: string, paused: boolean): void {
    this.#live();
    this.#simulation.setFacilityEnabled(id, !paused);
  }
  operatorOnSite(id: string, present: boolean): void {
    this.operatorAttendance(id, present ? 1 : 0);
  }
  operatorAttendance(id: string, count: number): void {
    this.#live();
    if (!Number.isInteger(count) || count < 0 || count > 1)
      throw new Error('Attendance exceeds this demo facility capacity');
    if (
      !this.#workshop ||
      this.#simulation.facilitySnapshot(id).definitionId === 'mine'
    )
      throw new Error('No operator slot');
    this.#simulation.setFacilityAttendance(
      id,
      count ? { operator: count } : {},
    );
  }
  supplyDepot(): number {
    this.#live();
    if (!this.#workshop) throw new Error('Construction depot is disabled');
    let delivered = 0;
    for (const id of this.#ids) {
      const f = this.#simulation.facilitySnapshot(id);
      if (f.definitionId !== 'mine') continue;
      const row = this.#simulation.inventory(f.outputInventoryId).summary();
      const stock = this.#simulation.inventory('stock');
      const amount = Math.min(
        4 - delivered,
        (row.quantities.ore ?? 0) - (row.reserved.ore ?? 0),
        stock.capacityPerMaterial - stock.quantity('ore'),
      );
      if (
        amount > 0 &&
        this.#simulation.transfer(f.outputInventoryId, 'stock', { ore: amount })
      )
        delivered += amount;
      if (delivered === 4) break;
    }
    return delivered;
  }
  connect(source: string, destination: string, seconds = 2): void {
    this.#live();
    if (!this.#transport) throw new Error('Transport mode is disabled');
    if (!Number.isFinite(seconds) || seconds < 0.05 || seconds > 100000)
      throw new RangeError('Invalid travel time');
    const a = this.#simulation.facilitySnapshot(source),
      b = this.#simulation.facilitySnapshot(destination);
    const resource =
      a.definitionId === 'mine' && b.definitionId === 'smelter'
        ? 'ore'
        : a.definitionId === 'smelter' && b.definitionId === 'press'
          ? 'alloy'
          : null;
    if (!resource) throw new Error('Connect Mine → Smelter or Smelter → Press');
    if (this.#routes.some((r) => r.destination === destination))
      throw new Error('Destination already has a supply route');
    this.#routes.push({
      source,
      destination,
      resource,
      amount: resource === 'ore' ? 2 : 1,
      travelTicks: Math.ceil(seconds / 0.05),
      deliveryId: null,
      departureTick: null,
      arrivalTick: null,
      completed: 0,
      lastDispatchTick: -1,
      draining: false,
    });
  }
  #logisticsTick() {
    const tick = this.#simulation.summary().tick;
    for (const route of this.#routes) {
      if (
        route.deliveryId &&
        route.arrivalTick !== null &&
        tick >= route.arrivalTick
      ) {
        if (this.#simulation.arriveDelivery(route.deliveryId)) {
          route.deliveryId = null;
          route.departureTick = route.arrivalTick = null;
          route.completed++;
        }
      }
    }
    this.#routes = this.#routes.filter(
      (r) => !r.draining || r.deliveryId !== null,
    );
    const demands = this.#simulation.materialDemands();
    for (const route of [...this.#routes].sort(
      (a, b) => a.lastDispatchTick - b.lastDispatchTick,
    )) {
      if (route.deliveryId || route.draining) continue;
      const amount = Math.min(
        route.amount,
        demands.find((d) => d.facilityId === route.destination)?.quantities[
          route.resource
        ] ?? 0,
      );
      if (!amount) continue;
      const a = this.#simulation.facilitySnapshot(route.source),
        b = this.#simulation.facilitySnapshot(route.destination);
      const result = this.#simulation.reserveDelivery(
        a.outputInventoryId,
        b.inputInventoryId,
        { [route.resource]: amount },
      );
      if (!result.ok) continue;
      this.#simulation.pickupDelivery(result.deliveryId);
      route.deliveryId = result.deliveryId;
      route.departureTick = tick;
      route.lastDispatchTick = tick;
      route.arrivalTick = tick + route.travelTicks;
    }
    this.#simulation.pruneDeliveries();
  }
  disconnect(destination: string): void {
    this.#live();
    const route = this.#routes.find((r) => r.destination === destination);
    if (!route) throw new Error('No supply route');
    route.draining = true;
    if (!route.deliveryId)
      this.#routes = this.#routes.filter((r) => r !== route);
  }
  draining(id: string, draining: boolean): void {
    this.#live();
    this.#simulation.setFacilityDraining(id, draining);
  }
  removalReason(id: string): string | null {
    this.#live();
    if (!this.#construction) return 'Removal disabled in stress mode';
    const f = this.#simulation.facilitySnapshot(id);
    if (
      this.#routes.some(
        (r) => r.deliveryId && (r.source === id || r.destination === id),
      )
    )
      return 'Cargo still uses this building. Disconnect its routes and let cargo finish.';
    if (this.#simulation.removalBlockers(id).length)
      return 'A batch is still active. Drain the building and let work finish; collect output if blocked.';
    if (this.#transport) {
      const stock = this.#simulation.inventory('stock');
      for (const resource of ['ore', 'alloy', 'parts']) {
        const amount =
          this.#simulation.inventory(f.inputInventoryId).quantity(resource) +
          this.#simulation.inventory(f.outputInventoryId).quantity(resource);
        if (stock.quantity(resource) + amount > stock.capacityPerMaterial)
          return `Shared stockpile lacks room for ${resource}. Collect parts or keep the building.`;
      }
    }
    return null;
  }
  removeFacility(id: string): void {
    this.#live();
    const reason = this.removalReason(id);
    if (reason) throw new Error(reason);
    const f = this.#simulation.facilitySnapshot(id);
    // Preflight above guarantees both transfers fit; Workshop remains the stock authority.
    if (this.#transport)
      for (const buffer of [f.inputInventoryId, f.outputInventoryId]) {
        const quantities = this.#simulation
          .inventory(buffer)
          .summary().quantities;
        if (!this.#simulation.transfer(buffer, 'stock', quantities))
          throw new Error('Salvage transfer refused');
      }
    const result = this.#simulation.removeFacility(id);
    if (!result.ok) throw new Error('Workshop refused removal');
    this.#routes = this.#routes.filter(
      (r) => r.source !== id && r.destination !== id,
    );
    this.#ids = Object.freeze(this.#ids.filter((other) => other !== id));
    this.#presses.delete(id);
    if (this.#transport)
      for (const buffer of [f.inputInventoryId, f.outputInventoryId]) {
        const retired = this.#simulation.removeInventory(buffer);
        if (!retired.ok) throw new Error('Workshop refused buffer retirement');
      }
  }
  enabled(index: number, enabled: boolean): void {
    this.#live();
    const id = this.ids[index];
    if (!id) throw new RangeError('Unknown facility');
    this.#simulation.setFacilityEnabled(id, enabled);
  }
  collect(): number {
    this.#live();
    const inventories = this.#transport
      ? [
          this.#stockId,
          ...[...this.#presses].map(
            (id) => this.#simulation.facilitySnapshot(id).outputInventoryId,
          ),
        ]
      : [this.#stockId];
    let count = 0;
    for (const id of inventories) {
      const amount = this.#simulation.inventory(id).quantity('parts');
      if (amount && !this.#simulation.withdraw(id, { parts: amount }))
        throw new Error('Collection refused');
      count += amount;
    }
    this.#collected += count;
    return count;
  }
  read(ids: readonly string[] = this.ids) {
    this.#live();
    const stock = this.#simulation.inventory(this.#stockId).summary();
    if (this.#transport) {
      stock.quantities = { ...stock.quantities };
      stock.reserved = { ...stock.reserved };
      for (const id of this.#ids) {
        const facility = this.#simulation.facilitySnapshot(id);
        for (const buffer of [
          facility.inputInventoryId,
          facility.outputInventoryId,
        ]) {
          const row = this.#simulation.inventory(buffer).summary();
          for (const [resource, amount] of Object.entries(row.quantities))
            stock.quantities[resource] =
              (stock.quantities[resource] ?? 0) + amount;
          for (const [resource, amount] of Object.entries(row.reserved))
            stock.reserved[resource] = (stock.reserved[resource] ?? 0) + amount;
        }
      }
    }
    return {
      workshop: this.#workshop,
      depot: this.#simulation.inventory(this.#stockId).summary(),
      orders: this.#simulation
        .constructionOrderIds()
        .map((id) => this.#simulation.constructionOrderSnapshot(id)),
      summary: this.#simulation.summary(),
      stock,
      transports: this.#routes.map((r) => ({
        ...r,
        cargo: r.deliveryId
          ? this.#simulation.deliverySnapshot(r.deliveryId)
          : null,
      })),
      buffers: this.#transport
        ? ids.map((id) => {
            const f = this.#simulation.facilitySnapshot(id);
            return {
              facilityId: id,
              input: this.#simulation.inventory(f.inputInventoryId).summary(),
              output: this.#simulation.inventory(f.outputInventoryId).summary(),
            };
          })
        : [],
      facilities: ids.map((id) => this.#simulation.facilitySnapshot(id)),
      advances: this.#advances,
      completed: this.#completed,
      collected: this.#collected,
      events: [...this.#events],
    };
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribe();
    this.#events = [];
    this.#completedSites = [];
  }
}
export type FactoryState = ReturnType<FactoryDemo['read']>;

export interface FactorySave {
  readonly simulation: SimulationSave;
  readonly advances: number;
  readonly completed: number;
  readonly collected: number;
  readonly mode: 'shared' | 'transport';
  readonly routes: readonly TransportRoute[];
  readonly nextBuffer: number;
  readonly workshop: boolean;
}

export interface TransportRoute {
  source: string;
  destination: string;
  resource: 'ore' | 'alloy';
  amount: number;
  travelTicks: number;
  deliveryId: string | null;
  departureTick: number | null;
  arrivalTick: number | null;
  completed: number;
  lastDispatchTick: number;
  draining: boolean;
}
function decodeRoutes(value: object, simulation: Simulation): TransportRoute[] {
  if (!('routes' in value) || !Array.isArray(value.routes))
    throw new Error('Missing transport schedule');
  const routes: TransportRoute[] = [],
    destinations = new Set<string>(),
    deliveries = new Set<string>();
  for (const raw of value.routes as unknown[]) {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('source' in raw) ||
      typeof raw.source !== 'string' ||
      !('destination' in raw) ||
      typeof raw.destination !== 'string' ||
      !('resource' in raw) ||
      !('amount' in raw) ||
      !('travelTicks' in raw) ||
      !('deliveryId' in raw) ||
      !('departureTick' in raw) ||
      !('arrivalTick' in raw) ||
      !('completed' in raw) ||
      !('lastDispatchTick' in raw)
    )
      throw new Error('Invalid transport route');
    if (!('draining' in raw) || typeof raw.draining !== 'boolean')
      throw new Error('Invalid route draining state');
    const a = simulation.facilitySnapshot(raw.source),
      b = simulation.facilitySnapshot(raw.destination);
    const resource =
      a.definitionId === 'mine' && b.definitionId === 'smelter'
        ? 'ore'
        : a.definitionId === 'smelter' && b.definitionId === 'press'
          ? 'alloy'
          : null;
    if (
      !resource ||
      typeof raw.amount !== 'number' ||
      raw.resource !== resource ||
      raw.amount !== (resource === 'ore' ? 2 : 1) ||
      destinations.has(raw.destination) ||
      typeof raw.travelTicks !== 'number' ||
      !Number.isSafeInteger(raw.travelTicks) ||
      raw.travelTicks < 1 ||
      raw.travelTicks > 2000000 ||
      typeof raw.completed !== 'number' ||
      !Number.isSafeInteger(raw.completed) ||
      raw.completed < 0 ||
      typeof raw.lastDispatchTick !== 'number' ||
      !Number.isSafeInteger(raw.lastDispatchTick) ||
      raw.lastDispatchTick < -1 ||
      raw.lastDispatchTick > simulation.summary().tick
    )
      throw new Error('Incompatible transport route');
    destinations.add(raw.destination);
    let cargo: DeliverySnapshot | null = null;
    if (raw.deliveryId !== null) {
      if (
        typeof raw.deliveryId !== 'string' ||
        deliveries.has(raw.deliveryId) ||
        typeof raw.departureTick !== 'number' ||
        !Number.isSafeInteger(raw.departureTick) ||
        raw.departureTick < 0 ||
        raw.departureTick > simulation.summary().tick ||
        typeof raw.arrivalTick !== 'number' ||
        raw.arrivalTick !== raw.departureTick + raw.travelTicks ||
        raw.lastDispatchTick !== raw.departureTick
      )
        throw new Error('Invalid cargo deadline');
      cargo = simulation.deliverySnapshot(raw.deliveryId);
      if (
        !['in-transit', 'arrival-blocked'].includes(cargo.state) ||
        cargo.sourceInventoryId !== a.outputInventoryId ||
        cargo.destinationInventoryId !== b.inputInventoryId ||
        Object.keys(cargo.quantities).length !== 1 ||
        !(
          cargo.quantities[resource]! > 0 &&
          cargo.quantities[resource]! <= raw.amount
        ) ||
        cargo.itemIds.length
      )
        throw new Error('Incompatible route cargo');
      deliveries.add(raw.deliveryId);
    } else if (raw.departureTick !== null || raw.arrivalTick !== null)
      throw new Error('Idle route has a cargo deadline');
    routes.push({
      source: raw.source,
      destination: raw.destination,
      resource,
      amount: raw.amount,
      travelTicks: raw.travelTicks,
      deliveryId: raw.deliveryId as string | null,
      departureTick: raw.departureTick as number | null,
      arrivalTick: raw.arrivalTick as number | null,
      completed: raw.completed,
      lastDispatchTick: raw.lastDispatchTick,
      draining: raw.draining,
    });
  }
  if (deliveries.size !== simulation.summary().deliveryCount)
    throw new Error('Orphaned Workshop cargo');
  return routes;
}
