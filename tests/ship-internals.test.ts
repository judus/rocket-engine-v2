import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from 'production-workshop';
import type { InventoryOptions } from 'production-workshop';
import { Ship } from '../games/farwake/Ship.js';
import {
  ShipInternals,
  validateInternalsProfile,
  validateProductionConfiguration,
} from '../games/farwake/ShipInternals.js';
import { starterSetup } from './helpers/shipSetup.js';
const profile = {
  ...starterSetup.profile,
  power: {
    ...starterSetup.profile.power,
    capacityJ: 1e6,
    reactorOutputW: 1000,
    thermal: {
      ...starterSetup.profile.power.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
  engine: { ...starterSetup.profile.engine, restartEnergyJ: 0 },
  dampers: { ...starterSetup.profile.dampers, restartEnergyJ: 0 },
  shields: { ...starterSetup.profile.shields, restartEnergyJ: 0 },
  cooling: {
    ...starterSetup.profile.cooling,
    restartEnergyJ: 0,
    sinkTemperatureK: 290,
    maxCoolingW: 20,
    baselineW: 1,
    fullPowerW: 1,
  },
  internals: {
    ...starterSetup.profile.internals,
    loadout: starterSetup.profile.internals.loadout.filter(
      (i) => i.slotId === 'internal-1',
    ),
    definitions: starterSetup.profile.internals.definitions.map((d) => ({
      ...d,
      staffing: d.staffing && { ...d.staffing, specialistMultiplier: 1 },
      baselineW: 2,
      operatingW: 20,
      thermal: {
        ...d.thermal,
        manualStartSeconds: 0,
        heatCapacityJPerK: 10,
        tripTemperatureK: 350,
        restartTemperatureK: 330,
        rebootSeconds: 3,
      },
    })),
  },
};
function make(p = profile, energyJ = 10000) {
  const ship = new Ship(p, {
    ...starterSetup.initialState,
    energyJ,
    engineTemperatureK: 290,
    damperTemperatureK: 290,
    reactorTemperatureK: 290,
    shieldTemperatureK: 290,
    cargoTemperatureK: 290,
  });
  ship.engine.requestEnabled(false);
  let worker = 0;
  for (const i of p.internals.loadout) {
    if (
      p.internals.definitions.find((d) => d.id === i.definitionId)!
        .facilityDefinitionId
    )
      ship.internals.assignWorker(i.slotId, p.internals.workers[worker++]!.id);
  }
  ship.internals.commit();
  return ship;
}
function step(ship: Ship, count = 1, dt = 1) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(dt, {
      dt,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + dt,
    });
}
function reading(ship: Ship) {
  const i = ship.telemetry.internals.installations[0];
  assert.ok(i);
  return i;
}
function job(ship: Ship) {
  const j = reading(ship).facility?.jobs[0];
  assert.ok(j);
  return j;
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
void test('One attached fabricator uses actual Workshop stock/jobs and the shared power ledger with immutable inspection', () => {
  const ship = make(),
    before = ship.telemetry;
  assert.equal(before.internals.slots.length, 7);
  assert.equal(before.internals.installations.length, 1);
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  assert.equal(ship.telemetry, before);
  step(ship);
  const i = reading(ship);
  close(i.operation.suppliedW, 22);
  close(i.operation.thermal.generatedHeatW, 10.2);
  close(ship.telemetry.power.energyJ, 10000 + 1000 - 22);
  assert.equal(i.inventory?.quantities.alloy ?? 0, 0);
  assert.ok(job(ship).progress > 0);
  assert.ok(Object.isFrozen(i.facility?.jobs));
  step(ship, 3);
  assert.equal(reading(ship).inventory?.quantities.part, 1);
  assert.equal(job(ship).batchesCompleted, 1);
  assert.deepEqual(
    ship.production.inventory(i.inventory!.id).summary().quantities,
    reading(ship).inventory?.quantities,
  );
  assert.ok(
    Object.values(
      before.internals.installations[0]!.inventory!.quantities,
    ).every((v) => v === 0),
  );
  ship.dispose();
});
void test('An outage freezes active work and consumed inputs; recovery finishes the same batch without a second debit', () => {
  const ship = make();
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship);
  const progress = job(ship).progress,
    facility = reading(ship).facility!.id;
  ship.internals.requestEnabled('internal-1', false);
  step(ship, 5);
  close(job(ship).progress, progress);
  assert.equal(reading(ship).inventory?.quantities.alloy ?? 0, 0);
  ship.internals.requestEnabled('internal-1', true);
  step(ship, 3);
  assert.equal(reading(ship).facility?.id, facility);
  assert.equal(reading(ship).inventory?.quantities.part, 1);
  assert.equal(job(ship).batchesCompleted, 1);
  ship.dispose();
});
void test('Health failure gates production; repairing to partial condition derates real Workshop progress', () => {
  const ship = make();
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship);
  ship.internals.damage('internal-1', 100);
  step(ship);
  const progress = job(ship).progress;
  assert.equal(reading(ship).operation.state, 'failed');
  close(reading(ship).operation.demandW, 0);
  step(ship, 2);
  close(job(ship).progress, progress);
  ship.internals.repair('internal-1', 50);
  step(ship);
  assert.ok(job(ship).progress > progress);
  assert.ok(job(ship).progress - progress < 0.2);
  assert.equal(
    reading(ship).facility?.modifiers['ship-condition']?.productivityMultiplier,
    0.5,
  );
  ship.dispose();
});
void test('Partial power and mixed fractional ticks cannot admit a free batch; restored funded service resumes production', () => {
  const ship = make(
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    12,
  );
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship);
  assert.equal(reading(ship).inventory?.quantities.alloy, 2);
  close(job(ship).progress, 0);
  assert.equal(reading(ship).facility?.conditions.powered, false);
  ship.power.receiveTransferredEnergy(1000);
  step(ship);
  assert.ok(job(ship).progress > 0);
  ship.dispose();
  const mixed = make();
  mixed.internals.supply('internal-1', 'alloy', 2);
  step(mixed, 1, 0.025);
  mixed.internals.requestEnabled('internal-1', true);
  step(mixed, 1, 0.025);
  assert.equal(reading(mixed).inventory?.quantities.alloy, 2);
  close(job(mixed).progress, 0);
  step(mixed, 2, 0.05);
  assert.ok(job(mixed).progress > 0);
  mixed.dispose();
});
void test('Thermal shutdown pauses production despite immediate cooling and preserves the powered reboot', () => {
  const hot = {
    ...profile,
    internals: {
      ...profile.internals,
      definitions: profile.internals.definitions.map((d) => ({
        ...d,
        thermal: {
          ...d.thermal,
          heatCapacityJPerK: 1,
          tripTemperatureK: 291.5,
          restartTemperatureK: 290.5,
        },
      })),
    },
  };
  const ship = make(hot);
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship, 3, 0.05);
  assert.equal(reading(ship).operation.state, 'overheated');
  const progress = job(ship).progress;
  ship.cooling.requestEnabled(true);
  step(ship, 1, 0.05);
  assert.ok(ship.telemetry.cooling.internalRemovedHeatW > 0);
  close(job(ship).progress, progress);
  ship.internals.requestEnabled('internal-1', false);
  step(ship, 1, 0.05);
  ship.internals.requestEnabled('internal-1', true);
  step(ship, 1, 0.05);
  assert.ok(reading(ship).operation.thermal.restartRemainingSeconds > 2.8);
  step(ship, 80, 0.05);
  assert.equal(reading(ship).operation.thermal.tripped, false);
  assert.ok(job(ship).progress > progress);
  ship.dispose();
});
void test('Drain, evacuation and safe removal preserve stock; a different installation can replace the fabricator', () => {
  const d = profile.internals.definitions[0]!;
  const ship = make({
    ...profile,
    internals: {
      ...profile.internals,
      definitions: [
        ...profile.internals.definitions,
        {
          ...d,
          id: 'recreation-room',
          label: 'Recreation room',
          staffing: null,
          facilityDefinitionId: null,
          inventoryCapacity: null,
          inventoryAccepts: null,
        },
      ],
    },
  });
  ship.internals.supply('internal-1', 'alloy', 4);
  ship.internals.requestEnabled('internal-1', true);
  step(ship);
  ship.internals.requestEnabled('internal-1', false);
  ship.internals.remove('internal-1');
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  assert.match(
    ship.telemetry.internals.commands.at(-1)!.message,
    /active-batch/,
  );
  ship.internals.setDraining('internal-1', true);
  ship.internals.requestEnabled('internal-1', true);
  step(ship, 3);
  assert.equal(reading(ship).inventory?.quantities.alloy, 2);
  assert.equal(reading(ship).inventory?.quantities.part, 1);
  ship.internals.requestEnabled('internal-1', false);
  ship.internals.remove('internal-1');
  step(ship);
  assert.match(ship.telemetry.internals.commands.at(-1)!.message, /goods/);
  ship.internals.collect('internal-1', 'alloy', 2);
  ship.internals.collect('internal-1', 'part', 1);
  ship.internals.remove('internal-1');
  step(ship);
  assert.equal(ship.telemetry.internals.installations.length, 0);
  assert.equal(ship.production.summary().inventoryCount, 0);
  assert.equal(ship.production.summary().facilityCount, 0);
  ship.internals.install('internal-1', 'recreation-room', 'rec-room');
  step(ship);
  assert.equal(reading(ship).label, 'Recreation room');
  assert.equal(reading(ship).facility, null);
  assert.equal(reading(ship).inventory, null);
  ship.dispose();
});
void test('Ordinary command refusals are atomic and visible; inspection/disposal never deletes Workshop goods', () => {
  const ship = make();
  ship.internals.supply('internal-1', 'alloy', 21);
  step(ship);
  assert.equal(ship.telemetry.internals.commands[0]?.ok, false);
  assert.ok(
    Object.values(reading(ship).inventory!.quantities).every((v) => v === 0),
  );
  step(ship);
  assert.equal(ship.telemetry.internals.commands[0]?.ok, false);
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship);
  const i = reading(ship),
    id = i.inventory!.id,
    facilityId = i.facility!.id,
    progress = job(ship).progress;
  const view = ship.internals.telemetry;
  assert.deepEqual(
    view.installations[0]?.inventory?.quantities,
    i.inventory?.quantities,
  );
  ship.dispose();
  ship.production.advance(10);
  close(
    ship.production.facilitySnapshot(facilityId).jobs[0]!.progress,
    progress,
  );
  assert.ok(ship.production.inventory(id));
  assert.throws(
    () => ship.internals.install('internal-2', 'fabricator-starter', 'new'),
    /disposed/,
  );
  assert.throws(
    () => ship.internals.supply('internal-1', 'alloy', 1),
    /disposed/,
  );
});
void test('Multiple installed factories share one Workshop advance per ship interval and keep separate identities and buffers', () => {
  const ship = make();
  ship.internals.install('internal-2', 'fabricator-starter', 'fabricator-two');
  step(ship);
  ship.internals.assignWorker('internal-2', 'engineer-b');
  const before = ship.production.summary().tick;
  for (const slot of ['internal-1', 'internal-2']) {
    ship.internals.supply(slot, 'alloy', 2);
    ship.internals.requestEnabled(slot, true);
  }
  step(ship);
  assert.equal(ship.production.summary().tick - before, 20);
  assert.equal(ship.telemetry.internals.installations.length, 2);
  assert.notEqual(
    ship.telemetry.internals.installations[0]?.inventory?.id,
    ship.telemetry.internals.installations[1]?.inventory?.id,
  );
  assert.equal(ship.telemetry.internals.suppliedW, 44);
  step(ship, 3);
  for (const i of ship.telemetry.internals.installations)
    assert.equal(i.inventory?.quantities.part, 1);
  ship.dispose();
});
void test('Profile, installation and stock boundaries fail early; duplicate/occupied requests do not alter domain state', () => {
  assert.throws(() =>
    validateInternalsProfile({ ...profile.internals, slots: [] }),
  );
  assert.throws(() =>
    validateInternalsProfile({ ...profile.internals, slots: ['a', 'a'] }),
  );
  assert.throws(() =>
    validateProductionConfiguration({
      ...profile.production,
      recipes: [{ id: 'bad' }],
    }),
  );
  const ship = make();
  assert.throws(() =>
    ship.internals.install('bad', 'fabricator-starter', 'new'),
  );
  assert.throws(() => ship.internals.install('internal-2', 'unknown', 'new'));
  assert.throws(() => ship.internals.supply('internal-1', 'unknown', 1));
  assert.throws(() => ship.internals.supply('internal-1', 'alloy', 0.5));
  ship.internals.install('internal-1', 'fabricator-starter', 'new');
  step(ship);
  assert.equal(ship.telemetry.internals.commands[0]?.ok, false);
  assert.equal(ship.production.summary().facilityCount, 1);
  ship.dispose();
});

function outfitted() {
  return make({
    ...profile,
    internals: {
      ...profile.internals,
      loadout: [...starterSetup.profile.internals.loadout],
    },
  });
}
function at(ship: Ship, slot: string) {
  const installed = ship.telemetry.internals.installations.find(
    (i) => i.slotId === slot,
  );
  assert.ok(installed);
  return installed;
}
void test('Refinery output transfers to the fabricator and becomes a part through real Workshop jobs', () => {
  const ship = outfitted();
  ship.internals.supply('internal-2', 'ore', 4);
  ship.internals.requestEnabled('internal-2', true);
  step(ship, 9);
  assert.equal(at(ship, 'internal-2').inventory?.quantities.alloy, 2);
  assert.equal(at(ship, 'internal-2').facility?.jobs[0]?.batchesCompleted, 2);
  ship.internals.transfer('internal-2', 'internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship, 4);
  assert.equal(at(ship, 'internal-2').inventory?.quantities.alloy, 0);
  assert.equal(at(ship, 'internal-1').inventory?.quantities.part, 1);
  assert.equal(ship.production.summary().inventoryCount, 6);
  assert.equal(ship.production.summary().facilityCount, 5);
  ship.dispose();
});
void test('Galley meals enter the fridge; storage retains goods across powered operation, outage and disposal', () => {
  const ship = outfitted();
  ship.internals.supply('internal-3', 'ingredients', 2);
  ship.internals.requestEnabled('internal-3', true);
  step(ship, 4);
  assert.equal(at(ship, 'internal-3').inventory?.quantities.meal, 1);
  ship.internals.transfer('internal-3', 'internal-4', 'meal', 1);
  ship.internals.requestEnabled('internal-4', true);
  step(ship);
  const fridge = at(ship, 'internal-4');
  assert.equal(fridge.facility, null);
  assert.equal(fridge.operation.state, 'operating');
  assert.equal(fridge.operation.suppliedW, 22);
  assert.ok(fridge.operation.thermal.generatedHeatW > 0);
  ship.internals.requestEnabled('internal-4', false);
  ship.power.requestEnabled(false);
  step(ship, 3);
  assert.equal(at(ship, 'internal-4').inventory?.quantities.meal, 1);
  ship.internals.remove('internal-4');
  step(ship);
  assert.match(ship.telemetry.internals.commands.at(-1)!.message, /goods/);
  ship.dispose();
  assert.equal(
    ship.production.inventory(fridge.inventory!.id).summary().quantities.meal,
    1,
  );
});
void test('Internal transfers enforce food admission and capacity atomically without losing source stock', () => {
  const ship = outfitted();
  ship.internals.supply('internal-2', 'alloy', 2);
  ship.internals.supply('internal-3', 'meal', 2);
  ship.internals.supply('internal-4', 'meal', 59);
  step(ship);
  ship.internals.transfer('internal-2', 'internal-4', 'alloy', 1);
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  assert.equal(at(ship, 'internal-2').inventory?.quantities.alloy, 2);
  assert.equal(at(ship, 'internal-4').inventory?.quantities.alloy, 0);
  ship.internals.transfer('internal-3', 'internal-4', 'meal', 2);
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  assert.equal(at(ship, 'internal-3').inventory?.quantities.meal, 2);
  assert.equal(at(ship, 'internal-4').inventory?.quantities.meal, 59);
  ship.internals.transfer('internal-3', 'internal-4', 'meal', 1);
  step(ship);
  assert.equal(at(ship, 'internal-4').inventory?.quantities.meal, 60);
  assert.equal(at(ship, 'internal-3').inventory?.quantities.meal, 1);
  ship.internals.transfer('internal-3', 'internal-4', 'meal', 2);
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  assert.throws(
    () => ship.internals.transfer('internal-3', 'internal-3', 'meal', 1),
    /different destination/,
  );
  assert.throws(
    () => ship.internals.transfer('internal-3', 'internal-4', 'meal', 1.5),
    /integer/,
  );
  assert.throws(() =>
    ship.internals.transfer('internal-3', 'internal-4', 'unknown', 1),
  );
  ship.dispose();
});

void test('Science lab converts real equipment into research currency; outage retains progress and never consumes twice', () => {
  const ship = outfitted();
  ship.internals.supply('internal-5', 'part', 1);
  ship.internals.requestEnabled('internal-5', true);
  step(ship, 2);
  const progress = at(ship, 'internal-5').facility!.jobs[0]!.progress;
  assert.ok(progress > 0);
  assert.equal(at(ship, 'internal-5').inventory?.quantities.part, 0);
  ship.internals.requestEnabled('internal-5', false);
  step(ship, 3);
  close(at(ship, 'internal-5').facility!.jobs[0]!.progress, progress);
  ship.internals.requestEnabled('internal-5', true);
  step(ship, 5);
  assert.equal(at(ship, 'internal-5').inventory?.quantities.science, 1);
  assert.equal(at(ship, 'internal-5').facility!.jobs[0]!.batchesCompleted, 1);
  assert.equal(ship.production.registry.resource('science').kind, 'currency');
  ship.dispose();
});
void test('Infirmary produces health packs and refuses unrelated food stock; health failure pauses its batch', () => {
  const ship = outfitted();
  ship.internals.supply('internal-6', 'ingredients', 2);
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  ship.internals.supply('internal-6', 'medical-supplies', 2);
  ship.internals.requestEnabled('internal-6', true);
  step(ship);
  ship.internals.damage('internal-6', 100);
  step(ship);
  const progress = at(ship, 'internal-6').facility!.jobs[0]!.progress;
  assert.equal(at(ship, 'internal-6').operation.state, 'failed');
  step(ship, 3);
  close(at(ship, 'internal-6').facility!.jobs[0]!.progress, progress);
  ship.internals.repair('internal-6', 100);
  step(ship, 4);
  assert.equal(at(ship, 'internal-6').inventory?.quantities['health-pack'], 1);
  assert.equal(
    at(ship, 'internal-6').inventory?.quantities['medical-supplies'],
    0,
  );
  ship.dispose();
});
void test('Quarters have powered health/heat lifecycle without an invented Workshop job or fatigue inventory', () => {
  const ship = outfitted();
  ship.internals.requestEnabled('internal-7', true);
  step(ship);
  const quarters = at(ship, 'internal-7');
  assert.equal(quarters.label, 'Quarters');
  assert.equal(quarters.inventory, null);
  assert.equal(quarters.facility, null);
  assert.equal(quarters.operation.suppliedW, 22);
  assert.ok(quarters.operation.thermal.generatedHeatW > 0);
  ship.internals.damage('internal-7', 100);
  step(ship);
  assert.equal(at(ship, 'internal-7').operation.state, 'failed');
  assert.equal(at(ship, 'internal-7').operation.demandW, 0);
  assert.equal(at(ship, 'internal-7').operation.requested, true);
  ship.internals.requestEnabled('internal-7', false);
  ship.internals.remove('internal-7');
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, true);
  assert.equal(ship.telemetry.internals.installations.length, 6);
  ship.dispose();
});

void test('All onboard factories require a worker; supplies and full power alone cannot consume ingredients', () => {
  const ship = outfitted();
  const inputs: Record<string, [string, number]> = {
    'internal-1': ['alloy', 2],
    'internal-2': ['ore', 2],
    'internal-3': ['ingredients', 2],
    'internal-5': ['part', 1],
    'internal-6': ['medical-supplies', 2],
  };
  for (const [slot, [resource, quantity]] of Object.entries(inputs)) {
    ship.internals.assignWorker(slot, null);
    ship.internals.supply(slot, resource, quantity);
    ship.internals.requestEnabled(slot, true);
  }
  step(ship, 8);
  for (const [slot, [resource, quantity]] of Object.entries(inputs)) {
    const i = at(ship, slot);
    assert.equal(i.inventory?.quantities[resource], quantity);
    assert.equal(i.facility?.conditions.staffed, false);
    assert.equal(i.facility?.conditions.powered, true);
    assert.equal(i.facility?.jobs[0]?.batchesCompleted, 0);
    assert.equal(i.facility?.jobs[0]?.progress, 0);
  }
  ship.dispose();
});
void test('Specialists accelerate active work, other professions run at baseline, and unassigning preserves the batch', () => {
  const tuned = {
    ...profile,
    internals: {
      ...profile.internals,
      definitions: profile.internals.definitions.map((d) => ({
        ...d,
        staffing: d.staffing && { ...d.staffing, specialistMultiplier: 1.5 },
      })),
    },
  };
  const ship = make(tuned);
  ship.internals.assignWorker('internal-1', 'generalist');
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship);
  assert.equal(reading(ship).facility!.workerSlots[0]!.efficiency, 1);
  const first = job(ship).progress;
  ship.internals.assignWorker('internal-1', 'engineer-a');
  step(ship, 1, 0.5);
  const specialistDelta = job(ship).progress - first;
  close(specialistDelta, 0.25);
  assert.equal(reading(ship).facility!.workerSlots[0]!.efficiency, 1.5);
  ship.internals.assignWorker('internal-1', null);
  step(ship, 2);
  close(job(ship).progress, first + specialistDelta);
  ship.internals.assignWorker('internal-1', 'scientist');
  step(ship, 1, 0.5);
  close(job(ship).progress - first - specialistDelta, 1 / 6);
  assert.equal(reading(ship).inventory?.quantities.alloy, 0);
  ship.dispose();
});
void test('Assignments cannot duplicate crew, cannot staff storage, and remain explicit through equipment failure', () => {
  const ship = outfitted();
  step(ship);
  const before = at(ship, 'internal-2').facility!.workerSlots[0]!.id;
  ship.internals.assignWorker('internal-2', 'engineer-a');
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  assert.equal(at(ship, 'internal-2').facility!.workerSlots[0]!.id, before);
  assert.throws(
    () => ship.internals.assignWorker('internal-2', 'missing'),
    /Unknown internal worker/,
  );
  ship.internals.assignWorker('internal-4', 'generalist');
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, false);
  ship.internals.damage('internal-1', 100);
  step(ship);
  assert.equal(
    at(ship, 'internal-1').facility!.workerSlots[0]!.id,
    'engineer-a',
  );
  ship.internals.assignWorker('internal-1', null);
  ship.internals.assignWorker('internal-2', 'engineer-a');
  step(ship);
  assert.equal(ship.telemetry.internals.commands.at(-1)?.ok, true);
  assert.equal(at(ship, 'internal-1').facility!.workerSlots[0], null);
  ship.dispose();
});

void test('Assigning halfway through a Workshop tick cannot backdate work over an unstaffed interval', () => {
  const ship = make();
  ship.internals.assignWorker('internal-1', null);
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.internals.requestEnabled('internal-1', true);
  step(ship, 1, 0.025);
  ship.internals.assignWorker('internal-1', 'generalist');
  step(ship, 1, 0.025);
  assert.equal(reading(ship).inventory?.quantities.alloy, 2);
  assert.equal(reading(ship).facility?.conditions.powered, true);
  close(job(ship).progress, 0);
  step(ship, 2, 0.05);
  assert.ok(job(ship).progress > 0);
  ship.dispose();
});

for (const command of [
  'remove',
  'switch',
  'worker',
  'drain',
  'supply',
  'collect',
] as const) {
  void test(`Queued ${command} refuses a replacement installation in the same slot`, () => {
    const ship = make();
    ship.internals.remove('internal-1');
    ship.internals.install('internal-1', 'fabricator-starter', 'replacement');
    switch (command) {
      case 'remove':
        ship.internals.remove('internal-1');
        break;
      case 'switch':
        ship.internals.requestEnabled('internal-1', true);
        break;
      case 'worker':
        ship.internals.assignWorker('internal-1', 'engineer-a');
        break;
      case 'drain':
        ship.internals.setDraining('internal-1', true);
        break;
      case 'supply':
        ship.internals.supply('internal-1', 'alloy', 1);
        break;
      case 'collect':
        ship.internals.collect('internal-1', 'alloy', 1);
        break;
    }
    step(ship);
    assert.equal(reading(ship).installationId, 'replacement');
    assert.equal(reading(ship).operation.requested, false);
    assert.equal(reading(ship).facility?.workerSlots[0], null);
    assert.equal(reading(ship).facility?.draining, false);
    assert.equal(reading(ship).inventory?.quantities.alloy, 0);
    assert.deepEqual(
      ship.telemetry.internals.commands.map((c) => c.ok),
      [true, true, false],
    );
    assert.equal(
      ship.telemetry.internals.commands.at(-1)?.message,
      'Internal installation changed',
    );
    ship.dispose();
  });
}
for (const replacedSlot of ['internal-3', 'internal-4']) {
  void test(`Queued transfer binds both endpoints when ${replacedSlot} is replaced`, () => {
    const ship = outfitted();
    const source = replacedSlot === 'internal-4' ? 'internal-3' : 'internal-4';
    ship.internals.supply(source, 'meal', 1);
    ship.internals.commit();
    ship.internals.remove(replacedSlot);
    const definition =
      replacedSlot === 'internal-3' ? 'galley-starter' : 'fridge-starter';
    ship.internals.install(replacedSlot, definition, 'replacement');
    ship.internals.transfer('internal-3', 'internal-4', 'meal', 1);
    step(ship);
    assert.equal(at(ship, replacedSlot).installationId, 'replacement');
    assert.equal(at(ship, source).inventory?.quantities.meal, 1);
    assert.equal(at(ship, replacedSlot).inventory?.quantities.meal, 0);
    assert.deepEqual(
      ship.telemetry.internals.commands.map((c) => c.ok),
      [true, true, false],
    );
    assert.equal(
      ship.telemetry.internals.commands.at(-1)?.message,
      'Internal installation changed',
    );
    ship.dispose();
  });
}

void test('A post-commit removal observer failure completes lifecycle cleanup before surfacing', () => {
  const ship = make();
  const unlisten = ship.production.onEvent((event) => {
    if (event.type === 'facility-removed')
      throw new Error('report sink failed');
  });
  ship.internals.remove('internal-1');
  ship.internals.install(
    'internal-1',
    'fabricator-starter',
    'replacement-after-fault',
  );
  assert.throws(() => ship.internals.commit(), /command committed.*observer/i);
  unlisten();
  assert.equal(ship.internals.telemetry.installations.length, 0);
  assert.equal(ship.production.summary().facilityCount, 0);
  assert.equal(ship.production.summary().inventoryCount, 0);
  assert.equal(ship.internals.telemetry.commands[0]?.ok, true);
  assert.match(
    ship.internals.telemetry.commands[0]!.message,
    /reporting failed/,
  );
  assert.doesNotThrow(() => ship.internals.finishStep(0.05));
  ship.internals.commit();
  step(ship);
  assert.equal(reading(ship).installationId, 'replacement-after-fault');
  ship.dispose();
});
void test('A committed deposit records its receipt and retains the unexecuted tail without replay', () => {
  const ship = make();
  const unlisten = ship.production.onInventoryEvent((event) => {
    if (event.type === 'inventory-committed' && event.command === 'deposit')
      throw new Error('stock observer failed');
  });
  ship.internals.supply('internal-1', 'alloy', 1);
  ship.internals.supply('internal-1', 'alloy', 2);
  assert.throws(() => ship.internals.commit(), /command committed.*observer/i);
  unlisten();
  assert.equal(
    ship.internals.telemetry.installations[0]?.inventory?.quantities.alloy,
    1,
  );
  assert.equal(ship.internals.telemetry.commands.length, 1);
  assert.equal(ship.internals.telemetry.commands[0]?.ok, true);
  ship.internals.commit();
  assert.equal(
    ship.internals.telemetry.installations[0]?.inventory?.quantities.alloy,
    3,
  );
  ship.internals.commit();
  assert.equal(
    ship.internals.telemetry.installations[0]?.inventory?.quantities.alloy,
    3,
  );
  ship.dispose();
});
void test('Post-commit installation and staffing observer faults leave readable bound facilities', () => {
  const ship = make();
  let unlisten = ship.production.onEvent((e) => {
    if (e.type === 'facility-built') throw Error('build observer');
  });
  ship.internals.install(
    'internal-2',
    'fabricator-starter',
    'observed-install',
  );
  assert.throws(() => ship.internals.commit(), /command committed.*observer/i);
  unlisten();
  assert.equal(
    ship.internals.telemetry.installations.find(
      (i) => i.slotId === 'internal-2',
    )?.installationId,
    'observed-install',
  );
  assert.equal(ship.internals.telemetry.commands[0]?.ok, true);
  unlisten = ship.production.onEvent((e) => {
    if (e.type === 'facility-condition') throw Error('staff observer');
  });
  ship.internals.assignWorker('internal-2', 'engineer-b');
  assert.throws(() => ship.internals.commit(), /command committed.*observer/i);
  unlisten();
  const facility = ship.internals.telemetry.installations.find(
    (i) => i.slotId === 'internal-2',
  )!.facility!;
  assert.equal(facility.workerSlots[0]?.id, 'engineer-b');
  assert.equal(facility.conditions.staffed, true);
  assert.equal(ship.internals.telemetry.commands[0]?.ok, true);
  ship.dispose();
});
void test('Committed withdrawal and transfer faults never replay inventory changes', () => {
  const ship = outfitted();
  ship.internals.supply('internal-3', 'meal', 4);
  ship.internals.commit();
  const unlisten = ship.production.onInventoryEvent((e) => {
    if (e.type === 'inventory-committed') throw Error('inventory observer');
  });
  ship.internals.collect('internal-3', 'meal', 1);
  ship.internals.transfer('internal-3', 'internal-4', 'meal', 2);
  assert.throws(() => ship.internals.commit(), /command committed.*observer/i);
  assert.equal(
    ship.internals.telemetry.installations.find(
      (i) => i.slotId === 'internal-3',
    )!.inventory!.quantities.meal,
    3,
  );
  assert.throws(() => ship.internals.commit(), /command committed.*observer/i);
  unlisten();
  ship.internals.commit();
  assert.equal(
    ship.internals.telemetry.installations.find(
      (i) => i.slotId === 'internal-3',
    )!.inventory!.quantities.meal,
    1,
  );
  assert.equal(
    ship.internals.telemetry.installations.find(
      (i) => i.slotId === 'internal-4',
    )!.inventory!.quantities.meal,
    2,
  );
  ship.dispose();
});

for (const matching of [false, true]) {
  void test(`Pre-existing inventory is never adopted even with ${matching ? 'matching' : 'foreign'} installation settings`, () => {
    const ship = make();
    ship.production.createInventory({
      id: 'internal-collision',
      capacity: { kind: 'units', limit: matching ? 20 : 999 },
      attachment: {
        objectId: matching ? 'collision' : 'unrelated-owner',
        slot: matching ? 'buffer' : 'storage',
      },
      ...(matching ? { rules: { accepts: ['alloy', 'part'] } } : {}),
    });
    if (!matching) ship.production.deposit('internal-collision', { alloy: 7 });
    const before = ship.production.snapshot();
    ship.internals.install('internal-2', 'fabricator-starter', 'collision');
    ship.internals.supply('internal-1', 'alloy', 2);
    assert.throws(() => ship.internals.commit(), /inventory already exists/);
    assert.deepEqual(ship.production.snapshot(), before);
    assert.equal(ship.internals.telemetry.installations.length, 1);
    assert.equal(ship.internals.telemetry.commands[0]?.ok, false);
    assert.doesNotMatch(
      ship.internals.telemetry.commands[0]!.message,
      /committed|reporting failed/,
    );
    ship.internals.commit();
    assert.equal(
      ship.internals.telemetry.installations[0]?.inventory?.quantities.alloy,
      2,
    );
    assert.equal(
      ship.production.inventory('internal-collision').quantity('alloy'),
      matching ? 0 : 7,
    );
    assert.deepEqual(
      ship.production.inventoryAttachment('internal-collision'),
      before.inventoryAttachments!.find(
        (a) => a.inventoryId === 'internal-collision',
      ),
    );
    ship.dispose();
  });
}
void test('A newly committed owned inventory remains reconcilable after a reporting throw', () => {
  // The pinned package emits no event for an empty creation. Inject its documented
  // after-commit failure boundary using the real owner mutation, not a fake ledger.
  class ReportingSimulation extends Simulation {
    override createInventory(options: InventoryOptions) {
      const view = super.createInventory(options);
      if (options.id === 'internal-created')
        throw new Error('creation reporting failed');
      return view;
    }
  }
  const ship = make();
  const production = new ReportingSimulation(profile.production);
  const internals = new ShipInternals(
    { ...profile.internals, loadout: [] },
    ship.power,
    production,
  );
  internals.install('internal-2', 'fabricator-starter', 'created');
  assert.throws(() => internals.commit(), /command committed.*observer/i);
  const installed = internals.telemetry.installations[0]!;
  assert.equal(installed.installationId, 'created');
  assert.equal(installed.inventory?.capacity?.limit, 20);
  assert.equal(installed.inventory?.quantities.alloy, 0);
  assert.deepEqual(production.inventoryAttachment('internal-created'), {
    inventoryId: 'internal-created',
    objectId: 'created',
    slot: 'buffer',
  });
  assert.equal(internals.telemetry.commands[0]?.ok, true);
  assert.doesNotThrow(() => internals.commit());
  assert.equal(production.summary().inventoryCount, 1);
  internals.dispose();
  ship.dispose();
});
