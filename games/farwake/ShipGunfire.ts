import { ShipTargeting } from './ShipTargeting.js';
import type { TargetingReading } from './ShipTargeting.js';
import type { AimProjection } from './AimProjection.js';
import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import type { Ship } from './Ship.js';
import type { GunWorld } from './AsteroidHits.js';

/** Prototype hardpoints in ship-local metres, independent of cockpit mesh fitting.
 * Three paired installations share their per-volley output energy across muzzles. */
export const gunHardpoints: Readonly<
  Record<string, readonly Readonly<Vec3>[]>
> = {
  'mount-1': [{ x: -1.8, y: 1, z: 2 }],
  'mount-2': [{ x: 1.8, y: 1, z: 2 }],
  'mount-3': [{ x: -2.5, y: 0.5, z: 0.5 }],
  'mount-4': [{ x: 2.5, y: 0.5, z: 0.5 }],
  'mount-5': [
    { x: -3.2, y: 0, z: -0.5 },
    { x: -3.6, y: 0, z: -0.5 },
  ],
  'mount-6': [
    { x: 3.2, y: 0, z: -0.5 },
    { x: 3.6, y: 0, z: -0.5 },
  ],
  'mount-7': [
    { x: -0.45, y: 0.2, z: 1 },
    { x: 0.45, y: 0.2, z: 1 },
  ],
};
export const pulseCannon = Object.freeze({
  volleyEnergyJ: 6250000,
  speedMps: 2400,
  lifeSeconds: 2.5,
  convergenceM: 2000,
});
export interface GunBolt {
  readonly id: number;
  readonly installationId: string;
  readonly position: Readonly<Vec3>;
  readonly velocity: Readonly<Vec3>;
  readonly energyJ: number;
  readonly life: number;
}
export interface GunEffect {
  readonly id: number;
  readonly position: Readonly<Vec3>;
  readonly life: number;
  readonly duration: number;
}
export interface GunDestruction extends GunEffect {
  readonly radiusM: number;
}
export interface GunfireReading {
  readonly targeting: TargetingReading | null;
  readonly destructions: readonly GunDestruction[];
  readonly asteroidsDestroyed: number;
  readonly bolts: readonly GunBolt[];
  readonly flashes: readonly GunEffect[];
  readonly impacts: readonly GunEffect[];
  readonly shotsFired: number;
  readonly hits: number;
  readonly hitEnergyJ: number;
}
const empty: GunfireReading = Object.freeze({
  targeting: null,
  destructions: [],
  asteroidsDestroyed: 0,
  bolts: [],
  flashes: [],
  impacts: [],
  shotsFired: 0,
  hits: 0,
  hitEnergyJ: 0,
});
const add = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
const freezePoint = (v: Readonly<Vec3>) => Object.freeze({ ...v });

/** Optional game combat behavior, ordered after the ship's committed movement.
 * Consumes funded mount output; never draws power or adds a second heat bill.
 * The world supplies collision queries. Rendering reads immutable snapshots. */
export class ShipGunfire implements Behavior {
  readonly requires: readonly Behavior[];
  #world: GunWorld | null = null;
  #targeting: ShipTargeting | null = null;
  #banks = new Map<string, number>();
  #reading: GunfireReading = empty;
  #nextId = 1;
  #tick = 0;
  constructor(private readonly ship: Ship) {
    this.requires = [ship.movement];
    this.validateLoadout();
  }
  private validateLoadout() {
    for (const installation of this.ship.mounts.telemetry.installations) {
      const equipment = this.ship.mounts.profile.equipment.find(
        (e) => e.id === installation.equipmentId,
      )!;
      if (
        equipment.kind === 'weapon' &&
        (!gunHardpoints[installation.slotId] || equipment.id !== 'pulse-cannon')
      )
        throw new Error(
          `No gun firing definition for ${installation.slotId}/${equipment.id}`,
        );
    }
  }
  setWorld(world: GunWorld, projection: AimProjection): void {
    if (this.#world)
      throw new Error('Gun collision world is already installed');
    this.#world = world;
    this.#targeting = new ShipTargeting(this.ship, world, projection);
  }
  nextTarget(): void {
    if (!this.#targeting)
      throw new Error('Gun targeting world is not installed');
    this.#targeting.next();
  }
  fixedUpdate(dt: number): undefined {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1)
      throw new RangeError('Invalid gun fixed step');
    const tick = this.ship.telemetry.tick;
    if (tick <= this.#tick)
      throw new Error('Gunfire requires a new committed ship step');
    this.validateLoadout();
    if (!this.#world) throw new Error('Gun collision world is not installed');
    this.#tick = tick;
    const old = this.#reading;
    let shotsFired = old.shotsFired,
      hits = old.hits,
      hitEnergyJ = old.hitEnergyJ;
    const age = <T extends GunEffect>(effects: readonly T[]) =>
      effects
        .filter((e) => e.life > dt)
        .map((e) => Object.freeze({ ...e, life: e.life - dt }));
    const destructions = age(old.destructions);
    let asteroidsDestroyed = old.asteroidsDestroyed;
    const flashes = age(old.flashes),
      impacts = age(old.impacts),
      bolts: GunBolt[] = [];
    for (const bolt of old.bolts) {
      const travel = Math.min(dt, bolt.life);
      const to = {
        x: bolt.position.x + bolt.velocity.x * travel,
        y: bolt.position.y + bolt.velocity.y * travel,
        z: bolt.position.z + bolt.velocity.z * travel,
      };
      const hit = this.#world.trace(bolt.position, to);
      if (hit) {
        const destroyed = this.#world.damage(hit.targetId, bolt.energyJ);
        if (destroyed) {
          asteroidsDestroyed++;
          destructions.push(
            Object.freeze({
              id: this.#nextId++,
              position: destroyed.position,
              radiusM: destroyed.radiusM,
              duration: 2,
              life: 2,
            }),
          );
        }
        hits++;
        hitEnergyJ += bolt.energyJ;
        impacts.push(
          Object.freeze({
            id: this.#nextId++,
            position: freezePoint(hit.point),
            duration: 0.3,
            life: 0.3,
          }),
        );
      } else if (bolt.life > dt)
        bolts.push(
          Object.freeze({
            ...bolt,
            position: freezePoint(to),
            life: bolt.life - dt,
          }),
        );
    }
    const targeting = this.#targeting!.update(
      dt,
      pulseCannon.speedMps,
      pulseCannon.lifeSeconds,
      pulseCannon.convergenceM,
    );
    const mounts = this.ship.telemetry.mounts;
    const active = new Set<string>();
    if (mounts.firingRequested)
      for (const installation of mounts.selectedWeapons) {
        const operation = mounts.installations.find(
          (i) => i.installationId === installation.installationId,
        )!.operation;
        if (operation.outputJ <= 0) continue;
        active.add(installation.installationId);
        let bank =
          (this.#banks.get(installation.installationId) ?? 0) +
          operation.outputJ;
        const muzzles = gunHardpoints[installation.slotId]!;
        while (bank >= pulseCannon.volleyEnergyJ) {
          bank -= pulseCannon.volleyEnergyJ;
          const body = this.ship.telemetry.body;
          const aim = targeting.aimWorld;
          for (const muzzle of muzzles) {
            const position = add(
              body.positionM,
              this.ship.body.localToWorld(muzzle),
            );
            const delta = {
              x: aim.x - position.x,
              y: aim.y - position.y,
              z: aim.z - position.z,
            };
            const length = Math.hypot(delta.x, delta.y, delta.z);
            const velocity = {
              x: body.velocityMps.x + (delta.x / length) * pulseCannon.speedMps,
              y: body.velocityMps.y + (delta.y / length) * pulseCannon.speedMps,
              z: body.velocityMps.z + (delta.z / length) * pulseCannon.speedMps,
            };
            const id = this.#nextId++;
            bolts.push(
              Object.freeze({
                id,
                installationId: installation.installationId,
                position: freezePoint(position),
                velocity: freezePoint(velocity),
                energyJ: pulseCannon.volleyEnergyJ / muzzles.length,
                life: pulseCannon.lifeSeconds,
              }),
            );
            flashes.push(
              Object.freeze({
                id,
                position: freezePoint(position),
                duration: 0.045,
                life: 0.045,
              }),
            );
            shotsFired++;
          }
        }
        this.#banks.set(installation.installationId, bank);
      }
    for (const id of this.#banks.keys())
      if (!active.has(id)) this.#banks.delete(id);
    this.#reading = Object.freeze({
      targeting,
      destructions: Object.freeze(destructions),
      asteroidsDestroyed,
      bolts: Object.freeze(bolts),
      flashes: Object.freeze(flashes),
      impacts: Object.freeze(impacts),
      shotsFired,
      hits,
      hitEnergyJ,
    });
  }
  get telemetry(): GunfireReading {
    return this.#reading;
  }
  dispose(): undefined {
    this.#banks.clear();
    this.#reading = empty;
    this.#world = null;
    this.#targeting = null;
  }
}
