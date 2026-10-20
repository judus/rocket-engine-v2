import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultControls,
  validateControls,
  saveControls,
  readControls,
  controlPreset,
  virtualMode,
  settingsKey,
} from '../games/ship/ControlSettings.js';
import { ActionContext } from '../src/ActionContext.js';
import { InputScope } from '../src/Input.js';

void test('Ship controls persist a detached valid draft and build the real engine action bindings', () => {
  let saved: string | null = null;
  const storage = {
    getItem: (key: string) => {
      assert.equal(key, settingsKey);
      return saved;
    },
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  const draft = defaultControls();
  draft.steering = 'keyboard';
  draft.sensitivity = 1.7;
  draft.invertPitch = true;
  draft.virtual = 'digital';
  draft.bindings.forward = { code: 'KeyT', modifiers: ['Shift'] };
  const applied = saveControls(storage, draft);
  draft.bindings.forward = 'KeyY';
  assert.deepEqual(readControls(storage), applied);
  const scope = new InputScope<string>(
    {},
    {},
    () => true,
    () => {},
  );
  const actions = new ActionContext(scope, () => {});
  actions.use(controlPreset(applied));
  assert.equal(actions.kind('forward'), 'axis');
  assert.equal(actions.kind('fire'), 'hold');
  assert.deepEqual(controlPreset(applied).actions.forward!.mapping, {
    negative: 'KeyS',
    positive: { code: 'KeyT', modifiers: ['Shift'] },
  });
  actions.dispose();
});
void test('Ship controls refuse conflicts, reserved keys and malformed persisted settings before writing', () => {
  const bad = defaultControls();
  bad.bindings.forward = 'KeyS';
  let writes = 0;
  const storage = {
    setItem: () => {
      writes++;
    },
  };
  assert.throws(() => saveControls(storage, bad), /conflicts/);
  assert.equal(writes, 0);
  bad.bindings.forward = 'Escape';
  assert.throws(() => validateControls(bad), /reserved/);
  bad.bindings.forward = 'KeyW';
  bad.sensitivity = Infinity;
  assert.throws(() => validateControls(bad), /Invalid/);
  assert.throws(() => readControls({ getItem: () => '{' }), SyntaxError);
  assert.throws(
    () => validateControls({ ...defaultControls(), surprise: true }),
    /Invalid/,
  );
  const missing = defaultControls();
  delete missing.bindings.fire;
  assert.throws(() => validateControls(missing), /match/);
});
void test('Storage denial remains visible to the caller and defaults are independent', () => {
  assert.throws(
    () =>
      saveControls(
        {
          setItem: () => {
            throw new Error('Storage denied');
          },
        },
        defaultControls(),
      ),
    /Storage denied/,
  );
  const a = readControls({ getItem: () => null });
  a.bindings.forward = 'KeyT';
  assert.equal(defaultControls().bindings.forward, 'KeyW');
  const b = defaultControls();
  b.bindings.forward = { code: 'KeyS', modifiers: ['Shift'] };
  assert.doesNotThrow(() => validateControls(b));
});

void test('Retained flight pauses the entire ship in Settings and resumes the same entity', async () => {
  const { Stage2D, SceneNavigator } =
    await import('../src/experimental/index.js');
  const { Ship } = await import('../games/ship/Ship.js');
  const { starterSetup } = await import('./helpers/shipSetup.js');
  const flight = new Stage2D({ fixed: true });
  const ship = flight.entity(
    () => new Ship(starterSetup.profile, starterSetup.initialState),
  );
  const navigation = new SceneNavigator({ fixed: true })
    .add('flight', { create: () => flight, retain: true })
    .add('settings', { create: () => new Stage2D(), retain: true });
  await navigation.run('flight');
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  navigation.fixedUpdate!(1 / 60, { dt: 1 / 60, time: 1 / 60, tick: 1 });
  const committed = ship.telemetry;
  assert.ok(committed.body.velocityMps.z > 0);
  await navigation.run('settings');
  navigation.fixedUpdate!(1 / 60, { dt: 1 / 60, time: 2 / 60, tick: 2 });
  assert.equal(ship.telemetry, committed);
  assert.equal(ship.disposed, false);
  await navigation.run('flight');
  assert.equal(navigation.scene, flight);
  navigation.fixedUpdate!(1 / 60, { dt: 1 / 60, time: 3 / 60, tick: 3 });
  assert.notEqual(ship.telemetry, committed);
  assert.ok(ship.telemetry.body.positionM.z > committed.body.positionM.z);
  await navigation.dispose();
  assert.equal(ship.disposed, true);
});

void test('Ship automatic controls use touch sticks without pointer lock and preserve explicit choices', () => {
  const settings = defaultControls();
  assert.equal(settings.virtual, 'auto');
  assert.equal(virtualMode(settings, true), 'analog');
  assert.equal(controlPreset(settings, true).capture, 'focus');
  assert.equal(virtualMode(settings, false), 'off');
  assert.equal(controlPreset(settings, false).capture, 'pointer-lock');
  for (const mode of ['off', 'analog', 'digital'] as const) {
    settings.virtual = mode;
    assert.equal(virtualMode(settings, true), mode);
    assert.equal(virtualMode(settings, false), mode);
    assert.equal(
      controlPreset(settings, true).capture,
      mode === 'off' ? 'pointer-lock' : 'focus',
    );
  }
  settings.virtual = 'auto';
  const saved = saveControls({ setItem() {} }, settings);
  assert.equal(saved.virtual, 'auto');
  assert.equal(
    settings.steering,
    'mouse',
    'device policy leaves the saved steering choice intact',
  );
});

void test('C stays reserved independently of configurable cockpit display bindings', () => {
  const settings = defaultControls();
  assert.equal(settings.bindings.systems, 'KeyI');
  settings.bindings.systems = 'KeyC';
  assert.throws(
    () => validateControls(settings),
    /right mouse toggle mouse steering/,
  );
  settings.bindings.systems = 'Mouse2';
  assert.throws(
    () => validateControls(settings),
    /right mouse toggle mouse steering/,
  );
});
