import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ShipMounts,
  validateMountsProfile,
} from '../games/farwake/ShipMounts.js';
import { Ship } from '../games/farwake/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile = starterSetup.profile.mounts;
const owners: Ship[] = [];
afterEach(() => {
  for (const ship of owners.splice(0)) ship.dispose();
});
function createMounts(profile: typeof starterSetup.profile.mounts): ShipMounts {
  const ship = new Ship(
    { ...starterSetup.profile, mounts: profile },
    starterSetup.initialState,
  );
  owners.push(ship);
  return ship.mounts;
}
function step(ship: Ship) {
  ship.fixedUpdate(1 / 60, {
    dt: 1 / 60,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + 1 / 60,
  });
}
void test('Starter mounts provide seven slots, independent installations, six editable groups and immutable telemetry', () => {
  const mounts = createMounts(profile),
    t = mounts.telemetry;
  assert.equal(t.slots.length, 7);
  assert.equal(t.groups.length, 6);
  assert.deepEqual(
    t.selectedWeapons.map((i) => i.installationId),
    ['cannon-port', 'cannon-starboard'],
  );
  assert.ok(Object.isFrozen(t.slots));
  assert.ok(Object.isFrozen(t.slots[0]));
  assert.ok(Object.isFrozen(t.groups[0]?.mountIds));
  assert.ok(Object.isFrozen(t.slots[0]?.installation));
  const other = createMounts(profile);
  mounts.remove('mount-1');
  mounts.commit();
  assert.equal(
    other.telemetry.slots[0]?.installation?.installationId,
    'cannon-port',
  );
  assert.equal(t.selectedWeapons.length, 2);
  mounts.dispose();
  other.dispose();
});
void test('Any number of installed weapons may share a group and a weapon may belong to several groups', () => {
  const mounts = createMounts(profile);
  mounts.remove('mount-3');
  for (let i = 3; i <= 7; i++)
    mounts.install(`mount-${i}`, 'pulse-cannon', `cannon-${i}`);
  for (let i = 1; i <= 7; i++) mounts.assign('group-2', `mount-${i}`, true);
  mounts.assign('group-3', 'mount-1', true);
  mounts.selectGroup('group-2');
  assert.equal(mounts.telemetry.selectedGroupId, 'group-1');
  mounts.commit();
  assert.equal(mounts.telemetry.selectedWeapons.length, 7);
  mounts.selectGroup('group-3');
  mounts.commit();
  assert.equal(
    mounts.telemetry.selectedWeapons[0]?.installationId,
    'cannon-port',
  );
  mounts.selectGroup('group-6');
  mounts.commit();
  assert.deepEqual(mounts.telemetry.selectedWeapons, []);
  mounts.dispose();
});
void test('Removing and replacing a weapon clears every assignment and does not transfer them to replacement equipment', () => {
  const mounts = createMounts(profile);
  mounts.assign('group-2', 'mount-1', true);
  mounts.remove('mount-1');
  mounts.install('mount-1', 'mining-laser', 'miner');
  mounts.commit();
  assert.equal(
    mounts.telemetry.slots[0]?.installation?.installationId,
    'miner',
  );
  for (const g of mounts.telemetry.groups)
    assert.ok(!g.mountIds.includes('mount-1'));
  assert.equal(mounts.telemetry.selectedWeapons.length, 1);
  mounts.dispose();
});
void test('Invalid commands fail atomically without erasing earlier queued edits; slot compatibility and instance identity are enforced', () => {
  const mounts = createMounts({
    ...profile,
    slots: profile.slots.map((s) => ({
      ...s,
      accepts: s.id === 'mount-7' ? ['utility'] : s.accepts,
    })),
  });
  mounts.assign('group-2', 'mount-1', true);
  assert.throws(
    () => mounts.install('mount-1', 'mining-laser', 'miner'),
    /occupied/,
  );
  assert.throws(
    () => mounts.install('mount-7', 'pulse-cannon', 'weapon'),
    /incompatible/,
  );
  assert.throws(
    () => mounts.install('mount-4', 'pulse-cannon', 'cannon-port'),
    /duplicate/i,
  );
  assert.throws(
    () => mounts.install('missing', 'pulse-cannon', 'new'),
    /incompatible/,
  );
  assert.throws(() => mounts.remove('mount-4'), /no installation/);
  assert.throws(() => mounts.selectGroup('missing'), /Unknown/);
  assert.throws(() => mounts.assign('group-1', 'mount-3', true), /weapons/);
  assert.throws(() => mounts.assign('missing', 'mount-1', true), /Unknown/);
  assert.throws(
    () => mounts.assign('group-1', 'mount-1', 1 as unknown as boolean),
    /boolean/,
  );
  mounts.commit();
  assert.deepEqual(mounts.telemetry.groups[1]?.mountIds, ['mount-1']);
  mounts.install('mount-7', 'survey-scanner', 'scanner-aft');
  mounts.commit();
  assert.equal(
    mounts.telemetry.slots[6]?.installation?.installationId,
    'scanner-aft',
  );
  mounts.dispose();
});
void test('Mount profile validation rejects malformed arrays, duplicate identifiers, missing references and nonweapon group members', () => {
  for (const value of [
    { ...profile, slots: [] },
    { ...profile, slots: [...profile.slots, profile.slots[0]] },
    { ...profile, groups: [] },
    {
      ...profile,
      groups: [{ id: 'g', mountIds: ['mount-3'] }],
      selectedGroupId: 'g',
    },
    {
      ...profile,
      groups: [{ id: 'g', mountIds: ['mount-1', 'mount-1'] }],
      selectedGroupId: 'g',
    },
    { ...profile, equipment: [{ id: 'bad', label: '', kind: 'weapon' }] },
    { ...profile, equipment: [{ id: 'bad', label: 'Bad', kind: 'magic' }] },
    {
      ...profile,
      loadout: [
        { slotId: 'mount-1', equipmentId: 'missing', installationId: 'test' },
      ],
    },
    { ...profile, slots: new Array(7) },
    { ...profile, selectedGroupId: 'missing' },
    { ...profile, loadout: null },
    { ...profile, extra: true },
  ])
    assert.throws(() => validateMountsProfile(value));
});
void test('Ship commits mount changes on its single fixed tick without changing power or movement; disposal rejects mutation', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  const other = new Ship(starterSetup.profile, starterSetup.initialState);
  const before = ship.telemetry;
  ship.mounts.remove('mount-1');
  assert.equal(ship.telemetry, before);
  step(ship);
  step(other);
  assert.equal(ship.telemetry.mounts.selectedWeapons.length, 1);
  assert.deepEqual(ship.telemetry.body, other.telemetry.body);
  assert.deepEqual(ship.telemetry.power, other.telemetry.power);
  ship.mounts.selectGroup('group-2');
  ship.dispose();
  assert.throws(() => ship.mounts.commit(), /disposed/);
  assert.throws(
    () => ship.mounts.install('mount-4', 'pulse-cannon', 'new'),
    /disposed/,
  );
  assert.throws(
    () => ship.mounts.assign('group-1', 'mount-2', true),
    /disposed/,
  );
  assert.throws(() => ship.mounts.remove('mount-2'), /disposed/);
  assert.throws(() => ship.mounts.selectGroup('group-3'), /disposed/);
  other.dispose();
});
