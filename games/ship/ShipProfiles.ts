import type { Configuration } from 'production-workshop';
import type { InternalsProfile } from './ShipInternals.js';
import type { MountsProfile } from './ShipMounts.js';
import { validateCaptureProfile } from './CaptureResponse.js';
import type { CaptureProfile } from './CaptureResponse.js';
import type { Vec3 } from '../../src/3d/index.js';

export interface BodyProfile {
  id: string;
  massKg: number;
  yawInertiaKgM2: number;
}
export interface ReactorRecoveryProfile {
  startupPowerW: number;
  emergencyStartSeconds: number;
  emergencyOutputFraction: number;
  restoreReserveFraction: number;
  passiveCoolingW: number;
  sinkTemperatureK: number;
}
export interface PowerPlantProfile {
  health: Readonly<HealthProfile>;
  id: string;
  capacityJ: number;
  reactorOutputW: number;
  thermal: Readonly<ThermalProfile>;
  recovery: Readonly<ReactorRecoveryProfile>;
}
export interface ThermalProfile {
  heatCapacityJPerK: number;
  wasteHeatFraction: number;
  tripTemperatureK: number;
  restartTemperatureK: number;
  manualStartSeconds: number;
  rebootSeconds: number;
}
export interface CoolingProfile {
  health: Readonly<HealthProfile>;
  id: string;
  sinkTemperatureK: number;
  maxCoolingW: number;
  baselineW: number;
  fullPowerW: number;
  restartEnergyJ: number;
}
export interface HealthProfile {
  maxPoints: number;
  outputExponent: number;
}
export interface EngineProfile {
  health: Readonly<HealthProfile>;
  id: string;
  thermal: Readonly<ThermalProfile>;
  maxThrustN: number;
  maxYawTorqueNm: number;
  baselineW: number;
  fullThrustW: number;
  fullYawW: number;
  restartEnergyJ: number;
}
export interface DamperProfile {
  health: Readonly<HealthProfile>;
  id: string;
  thermal: Readonly<ThermalProfile>;
  responseSeconds: number;
  maxYawRateRadps: number;
  baselineW: number;
  wattsPerNewton: number;
  wattsPerNewtonMeter: number;
  restartEnergyJ: number;
  capture: Readonly<CaptureProfile>;
}
export interface CargoProfile {
  readonly id: string;
  readonly health: Readonly<HealthProfile>;
  readonly thermal: Readonly<ThermalProfile>;
  readonly baselineW: number;
  readonly restartEnergyJ: number;
  readonly graceSeconds: number;
  readonly stabilizationSeconds: number;
}
export interface ShieldProfile {
  health: Readonly<HealthProfile>;
  thermal: Readonly<ThermalProfile>;
  diversionW: number;
  diversionEfficiency: number;
  id: string;
  capacityJ: number;
  baselineW: number;
  rechargeW: number;
  rechargeEfficiency: number;
  rechargeDelaySeconds: number;
  restartEnergyJ: number;
}
export interface HullProfile {
  id: string;
  damageCapacityJ: number;
}
export interface ShipProfile {
  readonly internals: Readonly<InternalsProfile>;
  readonly production: Readonly<Configuration>;
  readonly mounts: Readonly<MountsProfile>;
  readonly cargo: Readonly<CargoProfile>;
  readonly id: string;
  readonly body: Readonly<BodyProfile>;
  readonly power: Readonly<PowerPlantProfile>;
  readonly engine: Readonly<EngineProfile>;
  readonly dampers: Readonly<DamperProfile>;
  readonly cooling: Readonly<CoolingProfile>;
  readonly shields: Readonly<ShieldProfile>;
  readonly hull: Readonly<HullProfile>;
}
export interface ShipInitialState {
  readonly cargoPocketId: string;
  readonly cargoTemperatureK: number;
  readonly cargoHealthPoints: number;
  readonly shieldHealthPoints: number;
  readonly damperHealthPoints: number;
  readonly coolingHealthPoints: number;
  readonly reactorHealthPoints: number;
  readonly engineHealthPoints: number;
  readonly shieldTemperatureK: number;
  readonly reactorTemperatureK: number;
  readonly engineTemperatureK: number;
  readonly damperTemperatureK: number;
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
    ['id', 'capacityJ', 'reactorOutputW', 'thermal', 'recovery', 'health'],
    'Power profile',
  );
  const thermal = validateThermalProfile(p.thermal);
  const recovery = validateReactorRecoveryProfile(p.recovery, thermal);
  if (
    readNumber(p, 'reactorOutputW', 0) *
      recovery.emergencyOutputFraction *
      thermal.wasteHeatFraction >=
    recovery.passiveCoolingW
  )
    throw new RangeError('Emergency output must be passively sustainable');
  return Object.freeze({
    thermal,
    recovery,
    health: validateHealthProfile(p.health),
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
      'thermal',
      'health',
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
    thermal: validateThermalProfile(p.thermal),
    health: validateHealthProfile(p.health),
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
  engineMaxHealthPoints: number,
  reactorMaxHealthPoints: number,
  coolingMaxHealthPoints: number,
  damperMaxHealthPoints: number,
  shieldMaxHealthPoints: number,
  cargoMaxHealthPoints: number,
): Readonly<ShipInitialState> {
  const p = recordWithKeys(
    value,
    [
      'engineHealthPoints',
      'reactorHealthPoints',
      'cargoPocketId',
      'cargoTemperatureK',
      'cargoHealthPoints',
      'shieldHealthPoints',
      'damperHealthPoints',
      'coolingHealthPoints',
      'energyJ',
      'velocityMps',
      'engineTemperatureK',
      'damperTemperatureK',
      'reactorTemperatureK',
      'shieldTemperatureK',
    ],
    'Initial state',
  );
  const v = recordWithKeys(p.velocityMps, ['x', 'y', 'z'], 'Initial velocity');
  return Object.freeze({
    cargoPocketId: profileId(p.cargoPocketId, 'Cargo pocket id'),
    cargoTemperatureK: readNumber(p, 'cargoTemperatureK', 0, 1e6),
    cargoHealthPoints: readNumber(
      p,
      'cargoHealthPoints',
      0,
      cargoMaxHealthPoints,
    ),
    shieldHealthPoints: readNumber(
      p,
      'shieldHealthPoints',
      0,
      shieldMaxHealthPoints,
    ),
    damperHealthPoints: readNumber(
      p,
      'damperHealthPoints',
      0,
      damperMaxHealthPoints,
    ),
    coolingHealthPoints: readNumber(
      p,
      'coolingHealthPoints',
      0,
      coolingMaxHealthPoints,
    ),
    reactorHealthPoints: readNumber(
      p,
      'reactorHealthPoints',
      0,
      reactorMaxHealthPoints,
    ),
    reactorTemperatureK: readNumber(p, 'reactorTemperatureK', 0, 1e6),
    engineHealthPoints: readNumber(
      p,
      'engineHealthPoints',
      0,
      engineMaxHealthPoints,
    ),
    shieldTemperatureK: readNumber(p, 'shieldTemperatureK', 0, 1e6),
    damperTemperatureK: readNumber(p, 'damperTemperatureK', 0, 1e6),
    engineTemperatureK: readNumber(p, 'engineTemperatureK', 0, 1e6),
    energyJ: readNumber(p, 'energyJ', 0, capacityJ),
    velocityMps: Object.freeze({
      x: readNumber(v, 'x', -1e30),
      y: readNumber(v, 'y', -1e30),
      z: readNumber(v, 'z', -1e30),
    }),
  });
}

export function validateDamperProfile(value: unknown): Readonly<DamperProfile> {
  const p = recordWithKeys(
    value,
    [
      'health',
      'id',
      'thermal',
      'responseSeconds',
      'maxYawRateRadps',
      'baselineW',
      'wattsPerNewton',
      'wattsPerNewtonMeter',
      'restartEnergyJ',
      'capture',
    ],
    'Damper profile',
  );
  return Object.freeze({
    health: validateHealthProfile(p.health),
    id: profileId(p.id, 'Damper id'),
    thermal: validateThermalProfile(p.thermal),
    responseSeconds: readNumber(p, 'responseSeconds', 0.01, 120),
    maxYawRateRadps: readNumber(p, 'maxYawRateRadps', 0, 10),
    baselineW: readNumber(p, 'baselineW', Number.MIN_VALUE),
    wattsPerNewton: readNumber(p, 'wattsPerNewton', Number.MIN_VALUE),
    wattsPerNewtonMeter: readNumber(p, 'wattsPerNewtonMeter', Number.MIN_VALUE),
    restartEnergyJ: readNumber(p, 'restartEnergyJ', 0),
    capture: validateCaptureProfile(p.capture),
  });
}

export function validateThermalProfile(
  value: unknown,
): Readonly<ThermalProfile> {
  const p = recordWithKeys(
    value,
    [
      'heatCapacityJPerK',
      'wasteHeatFraction',
      'tripTemperatureK',
      'restartTemperatureK',
      'manualStartSeconds',
      'rebootSeconds',
    ],
    'Module thermal profile',
  );
  const tripTemperatureK = readNumber(
    p,
    'tripTemperatureK',
    Number.MIN_VALUE,
    1e6,
  );
  const restartTemperatureK = readNumber(
    p,
    'restartTemperatureK',
    0,
    tripTemperatureK,
  );
  const manualStartSeconds = readNumber(p, 'manualStartSeconds', 0, 120);
  const rebootSeconds = readNumber(p, 'rebootSeconds', Number.MIN_VALUE, 600);
  if (restartTemperatureK >= tripTemperatureK)
    throw new RangeError('Restart temperature must be below trip temperature');
  if (rebootSeconds <= manualStartSeconds)
    throw new RangeError('Thermal reboot must be slower than manual start');
  return Object.freeze({
    heatCapacityJPerK: readNumber(p, 'heatCapacityJPerK', 1e-6),
    wasteHeatFraction: readNumber(p, 'wasteHeatFraction', 0, 1),
    tripTemperatureK,
    restartTemperatureK,
    manualStartSeconds,
    rebootSeconds,
  });
}
export function validateCoolingProfile(
  value: unknown,
): Readonly<CoolingProfile> {
  const p = recordWithKeys(
    value,
    [
      'id',
      'health',
      'sinkTemperatureK',
      'maxCoolingW',
      'baselineW',
      'fullPowerW',
      'restartEnergyJ',
    ],
    'Cooling profile',
  );
  return Object.freeze({
    id: profileId(p.id, 'Cooling id'),
    health: validateHealthProfile(p.health),
    sinkTemperatureK: readNumber(p, 'sinkTemperatureK', 0, 1e6),
    maxCoolingW: readNumber(p, 'maxCoolingW', Number.MIN_VALUE),
    baselineW: readNumber(p, 'baselineW', Number.MIN_VALUE),
    fullPowerW: readNumber(p, 'fullPowerW', Number.MIN_VALUE),
    restartEnergyJ: readNumber(p, 'restartEnergyJ', 0),
  });
}

export function validateThermalInstallation(
  cooling: Readonly<CoolingProfile>,
  thermal: Readonly<ThermalProfile>,
): void {
  if (cooling.sinkTemperatureK >= thermal.restartTemperatureK)
    throw new RangeError(
      'Cooling sink must be below each module restart temperature',
    );
}

export function validateReactorRecoveryProfile(
  value: unknown,
  thermal: Readonly<ThermalProfile>,
): Readonly<ReactorRecoveryProfile> {
  const p = recordWithKeys(
    value,
    [
      'startupPowerW',
      'emergencyStartSeconds',
      'emergencyOutputFraction',
      'restoreReserveFraction',
      'passiveCoolingW',
      'sinkTemperatureK',
    ],
    'Reactor recovery profile',
  );
  const emergencyStartSeconds = readNumber(
    p,
    'emergencyStartSeconds',
    Number.MIN_VALUE,
    3600,
  );
  const emergencyOutputFraction = readNumber(
    p,
    'emergencyOutputFraction',
    Number.MIN_VALUE,
    1,
  );
  const restoreReserveFraction = readNumber(
    p,
    'restoreReserveFraction',
    Number.MIN_VALUE,
    1,
  );
  const sinkTemperatureK = readNumber(p, 'sinkTemperatureK', 0, 1e6);
  if (emergencyStartSeconds <= thermal.rebootSeconds)
    throw new RangeError('Emergency start must be slower than thermal reboot');
  if (emergencyOutputFraction >= 1 || restoreReserveFraction >= 1)
    throw new RangeError(
      'Emergency output and restore reserve fractions must be below one',
    );
  if (sinkTemperatureK >= thermal.restartTemperatureK)
    throw new RangeError(
      'Passive cooling sink must be below reactor restart temperature',
    );
  return Object.freeze({
    startupPowerW: readNumber(p, 'startupPowerW', Number.MIN_VALUE),
    emergencyStartSeconds,
    emergencyOutputFraction,
    restoreReserveFraction,
    passiveCoolingW: readNumber(p, 'passiveCoolingW', Number.MIN_VALUE),
    sinkTemperatureK,
  });
}

export function validateShieldProfile(value: unknown): Readonly<ShieldProfile> {
  const p = recordWithKeys(
    value,
    [
      'health',
      'id',
      'thermal',
      'capacityJ',
      'baselineW',
      'rechargeW',
      'diversionW',
      'diversionEfficiency',
      'rechargeEfficiency',
      'rechargeDelaySeconds',
      'restartEnergyJ',
    ],
    'Shield profile',
  );
  return Object.freeze({
    health: validateHealthProfile(p.health),
    id: profileId(p.id, 'Shield id'),
    thermal: validateThermalProfile(p.thermal),
    capacityJ: readNumber(p, 'capacityJ', 1),
    baselineW: readNumber(p, 'baselineW', Number.MIN_VALUE),
    rechargeW: readNumber(p, 'rechargeW', Number.MIN_VALUE),
    diversionW: readNumber(p, 'diversionW', Number.MIN_VALUE),
    diversionEfficiency: readNumber(
      p,
      'diversionEfficiency',
      Number.MIN_VALUE,
      1,
    ),
    rechargeEfficiency: readNumber(
      p,
      'rechargeEfficiency',
      Number.MIN_VALUE,
      1,
    ),
    rechargeDelaySeconds: readNumber(p, 'rechargeDelaySeconds', 0, 600),
    restartEnergyJ: readNumber(p, 'restartEnergyJ', 0),
  });
}
export function validateHullProfile(value: unknown): Readonly<HullProfile> {
  const p = recordWithKeys(value, ['id', 'damageCapacityJ'], 'Hull profile');
  return Object.freeze({
    id: profileId(p.id, 'Hull id'),
    damageCapacityJ: readNumber(p, 'damageCapacityJ', 1),
  });
}

export function validateHealthProfile(value: unknown): Readonly<HealthProfile> {
  const p = recordWithKeys(
    value,
    ['maxPoints', 'outputExponent'],
    'Module health profile',
  );
  return Object.freeze({
    maxPoints: readNumber(p, 'maxPoints', 1),
    outputExponent: readNumber(p, 'outputExponent', 0.1, 10),
  });
}

export function validateCargoProfile(value: unknown): Readonly<CargoProfile> {
  const p = recordWithKeys(
    value,
    [
      'id',
      'health',
      'thermal',
      'baselineW',
      'restartEnergyJ',
      'graceSeconds',
      'stabilizationSeconds',
    ],
    'Cargo profile',
  );
  const graceSeconds = readNumber(p, 'graceSeconds', 0.01, 3600);
  return Object.freeze({
    id: profileId(p.id, 'Cargo id'),
    health: validateHealthProfile(p.health),
    thermal: validateThermalProfile(p.thermal),
    baselineW: readNumber(p, 'baselineW', Number.MIN_VALUE),
    restartEnergyJ: readNumber(p, 'restartEnergyJ', 0),
    graceSeconds,
    stabilizationSeconds: readNumber(
      p,
      'stabilizationSeconds',
      0.01,
      graceSeconds,
    ),
  });
}
