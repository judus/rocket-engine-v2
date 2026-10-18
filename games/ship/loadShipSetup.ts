import {
  numberIn,
  profileId,
  recordWithKeys,
  validateBodyProfile,
  validateShieldProfile,
  validateHullProfile,
  validateDamperProfile,
  validateCoolingProfile,
  validateThermalInstallation,
  validateEngineProfile,
  validateInitialState,
  validatePowerProfile,
} from './ShipProfiles.js';
import type { ShipSetup } from './ShipProfiles.js';

export type ProfileFetch = (
  url: URL,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;
async function readJson(url: URL, fetcher: ProfileFetch): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok)
    throw new Error(`Cannot load ${url.pathname}: HTTP ${response.status}`);
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new Error(`Invalid JSON in ${url.pathname}`, { cause });
  }
}
/** Fully validate a loadout before any ship/entity or runtime state is created. */
export async function loadShipSetup(
  url: URL,
  fetcher: ProfileFetch = (resource) => fetch(resource, { cache: 'no-cache' }),
): Promise<Readonly<ShipSetup>> {
  const manifest = recordWithKeys(
    await readJson(url, fetcher),
    [
      'id',
      'bodyProfile',
      'powerProfile',
      'engineProfile',
      'damperProfile',
      'coolingProfile',
      'shieldProfile',
      'hullProfile',
      'initialState',
    ],
    'Ship definition',
  );
  const id = profileId(manifest.id, 'Ship id');
  const bodyId = profileId(manifest.bodyProfile, 'Body reference');
  const powerId = profileId(manifest.powerProfile, 'Power reference');
  const engineId = profileId(manifest.engineProfile, 'Engine reference');
  const damperId = profileId(manifest.damperProfile, 'Damper reference');
  const shieldId = profileId(manifest.shieldProfile, 'Shield reference');
  const hullId = profileId(manifest.hullProfile, 'Hull reference');
  const coolingId = profileId(manifest.coolingProfile, 'Cooling reference');
  const results = await Promise.all([
    readJson(new URL(`../profiles/${bodyId}.json`, url), fetcher),
    readJson(new URL(`../profiles/${powerId}.json`, url), fetcher),
    readJson(new URL(`../profiles/${engineId}.json`, url), fetcher),
    readJson(new URL(`../profiles/${damperId}.json`, url), fetcher),
    readJson(new URL(`../profiles/${coolingId}.json`, url), fetcher),
    readJson(new URL(`../profiles/${shieldId}.json`, url), fetcher),
    readJson(new URL(`../profiles/${hullId}.json`, url), fetcher),
  ]);
  const body = validateBodyProfile(results[0]);
  const power = validatePowerProfile(results[1]);
  const engine = validateEngineProfile(results[2]);
  const dampers = validateDamperProfile(results[3]);
  const cooling = validateCoolingProfile(results[4]);
  const shields = validateShieldProfile(results[5]);
  const hull = validateHullProfile(results[6]);
  if (
    shields.id !== shieldId ||
    hull.id !== hullId ||
    cooling.id !== coolingId ||
    dampers.id !== damperId ||
    body.id !== bodyId ||
    power.id !== powerId ||
    engine.id !== engineId
  )
    throw new Error(
      'Equipment profile id does not match the ship definition reference',
    );
  numberIn(
    'Engine restartEnergyJ for installed reserve',
    engine.restartEnergyJ,
    0,
    power.capacityJ,
  );
  numberIn(
    'Damper restartEnergyJ for installed reserve',
    dampers.restartEnergyJ,
    0,
    power.capacityJ,
  );
  numberIn(
    'Cooling restartEnergyJ for installed reserve',
    cooling.restartEnergyJ,
    0,
    power.capacityJ,
  );
  numberIn(
    'Shield restartEnergyJ for installed reserve',
    shields.restartEnergyJ,
    0,
    power.capacityJ,
  );
  validateThermalInstallation(cooling, power.thermal);
  validateThermalInstallation(cooling, engine.thermal);
  validateThermalInstallation(cooling, dampers.thermal);
  validateThermalInstallation(cooling, shields.thermal);
  const initialState = validateInitialState(
    manifest.initialState,
    power.capacityJ,
    engine.health.maxPoints,
  );
  return Object.freeze({
    profile: Object.freeze({
      id,
      body,
      power,
      engine,
      dampers,
      cooling,
      shields,
      hull,
    }),
    initialState,
  });
}
