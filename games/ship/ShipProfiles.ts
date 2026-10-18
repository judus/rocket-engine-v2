import type { Vec3 } from '../../src/3d/index.js';

export interface BodyProfile {
  id: string;
  massKg: number;
  yawInertiaKgM2: number;
}
export interface PowerPlantProfile {
  id: string;
  capacityJ: number;
  reactorOutputW: number;
}
export interface EngineProfile {
  id: string;
  maxThrustN: number;
  maxYawTorqueNm: number;
  baselineW: number;
  fullThrustW: number;
  fullYawW: number;
  restartEnergyJ: number;
}
export interface ShipProfile {
  readonly id: string;
  readonly body: Readonly<BodyProfile>;
  readonly power: Readonly<PowerPlantProfile>;
  readonly engine: Readonly<EngineProfile>;
}
export interface ShipInitialState {
  readonly energyJ: number;
  readonly velocityMps: Readonly<Vec3>;
}
export interface ShipSetup {
  readonly profile: Readonly<ShipProfile>;
  readonly initialState: Readonly<ShipInitialState>;
}
export function numberIn(
  name: string,
  value: number,
  min: number,
  max = 1e30,
): number {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new RangeError(
      `${name} must be finite and between ${min} and ${max}`,
    );
  return value;
}
export function recordWithKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of keys)
    if (!Object.hasOwn(record, key))
      throw new TypeError(`${label}: missing ${key}`);
  for (const key of Object.keys(record))
    if (!keys.includes(key)) throw new TypeError(`${label}: unknown ${key}`);
  return record;
}
export function profileId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(value))
    throw new TypeError(`${label} must be a lowercase equipment identifier`);
  return value;
}
function readNumber(
  record: Record<string, unknown>,
  key: string,
  min: number,
  max = 1e30,
): number {
  const value = record[key];
  if (typeof value !== 'number')
    throw new TypeError(`${key} must be a JSON number`);
  return numberIn(key, value, min, max);
}
export function validateBodyProfile(value: unknown): Readonly<BodyProfile> {
  const p = recordWithKeys(
    value,
    ['id', 'massKg', 'yawInertiaKgM2'],
    'Body profile',
  );
  return Object.freeze({
    id: profileId(p.id, 'Body id'),
    massKg: readNumber(p, 'massKg', 1e-6),
    yawInertiaKgM2: readNumber(p, 'yawInertiaKgM2', 1e-6),
  });
}
export function validatePowerProfile(
  value: unknown,
): Readonly<PowerPlantProfile> {
  const p = recordWithKeys(
    value,
    ['id', 'capacityJ', 'reactorOutputW'],
    'Power profile',
  );
  return Object.freeze({
    id: profileId(p.id, 'Power id'),
    capacityJ: readNumber(p, 'capacityJ', 1),
    reactorOutputW: readNumber(p, 'reactorOutputW', 0),
  });
}
export function validateEngineProfile(value: unknown): Readonly<EngineProfile> {
  const p = recordWithKeys(
    value,
    [
      'id',
      'maxThrustN',
      'maxYawTorqueNm',
      'baselineW',
      'fullThrustW',
      'fullYawW',
      'restartEnergyJ',
    ],
    'Engine profile',
  );
  return Object.freeze({
    id: profileId(p.id, 'Engine id'),
    maxThrustN: readNumber(p, 'maxThrustN', 0),
    maxYawTorqueNm: readNumber(p, 'maxYawTorqueNm', 0),
    baselineW: readNumber(p, 'baselineW', Number.MIN_VALUE),
    fullThrustW: readNumber(p, 'fullThrustW', Number.MIN_VALUE),
    fullYawW: readNumber(p, 'fullYawW', Number.MIN_VALUE),
    restartEnergyJ: readNumber(p, 'restartEnergyJ', 0),
  });
}
export function validateInitialState(
  value: unknown,
  capacityJ: number,
): Readonly<ShipInitialState> {
  const p = recordWithKeys(value, ['energyJ', 'velocityMps'], 'Initial state');
  const v = recordWithKeys(p.velocityMps, ['x', 'y', 'z'], 'Initial velocity');
  return Object.freeze({
    energyJ: readNumber(p, 'energyJ', 0, capacityJ),
    velocityMps: Object.freeze({
      x: readNumber(v, 'x', -1e30),
      y: readNumber(v, 'y', -1e30),
      z: readNumber(v, 'z', -1e30),
    }),
  });
}
