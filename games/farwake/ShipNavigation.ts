import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { ShipBody, copyVector } from './ShipBody.js';
import { numberIn, profileId } from './ShipProfiles.js';

export interface NavigationContact {
  readonly id: string;
  readonly label: string;
  readonly positionM: Readonly<Vec3>;
  readonly arrivalRadiusM: number;
}
export interface NavigationFix extends NavigationContact {
  readonly distanceM: number;
  readonly bearingDegrees: number;
  readonly relativeBearingDegrees: number;
  readonly elevationDegrees: number;
  readonly closingSpeedMps: number;
  readonly closingTimeSeconds: number | null;
  readonly arrived: boolean;
  readonly localOffsetM: Readonly<Vec3>;
}
export interface NavigationReading {
  readonly positionM: Readonly<Vec3>;
  readonly velocityMps: Readonly<Vec3>;
  readonly headingDegrees: number;
  readonly speedMps: number;
  readonly contacts: readonly Readonly<NavigationFix>[];
  readonly destination: Readonly<NavigationFix> | null;
}
const degrees = (r: number) => (r * 180) / Math.PI;
/** Host-owned known landmarks; one post-motion fix, never a motion or sensor owner. */
export class ShipNavigation implements Behavior {
  readonly requires: readonly Behavior[];
  #contacts: readonly NavigationContact[] = [];
  #selected: string | null = null;
  #reading: Readonly<NavigationReading>;
  #disposed = false;
  constructor(
    private readonly body: ShipBody,
    contacts: readonly NavigationContact[] = [],
  ) {
    this.requires = [body];
    this.setContacts(contacts);
    this.#reading = this.calculate();
  }
  private live(): void {
    if (this.#disposed) throw new Error('Navigation disposed');
  }
  setContacts(contacts: readonly NavigationContact[]): void {
    this.live();
    if (!Array.isArray(contacts))
      throw new TypeError('Navigation contacts must be an array');
    const ids = new Set<string>();
    const next = contacts.map((c: NavigationContact) => {
      const id = profileId(c.id, 'Navigation contact');
      if (ids.has(id)) throw new Error('Duplicate navigation contact');
      ids.add(id);
      if (
        typeof c.label !== 'string' ||
        !c.label.trim() ||
        c.label.length > 120
      )
        throw new Error('Invalid navigation label');
      return Object.freeze({
        id,
        label: c.label,
        positionM: Object.freeze(
          copyVector(c.positionM, 'Navigation position'),
        ),
        arrivalRadiusM: numberIn('Arrival radius', c.arrivalRadiusM, 0, 1e30),
      });
    });
    this.#contacts = Object.freeze(next);
    if (this.#selected && !ids.has(this.#selected)) this.#selected = null;
  }
  selectDestination(id: string | null): void {
    this.live();
    if (id !== null && !this.#contacts.some((c) => c.id === id))
      throw new Error('Unknown navigation destination');
    this.#selected = id;
  }
  private calculate(): Readonly<NavigationReading> {
    const b = this.body.telemetry,
      yaw = b.yawRadians;
    const contacts = this.#contacts
      .map((c) => {
        const x = c.positionM.x - b.positionM.x,
          y = c.positionM.y - b.positionM.y,
          z = c.positionM.z - b.positionM.z;
        const distanceM = Math.hypot(x, y, z),
          planar = Math.hypot(x, z);
        const bearing = planar === 0 ? yaw : Math.atan2(x, z);
        const closingSpeedMps =
          distanceM === 0
            ? 0
            : (x * b.velocityMps.x +
                y * b.velocityMps.y +
                z * b.velocityMps.z) /
              distanceM;
        const arrived = distanceM <= c.arrivalRadiusM;
        const local = this.body.worldToLocal({ x, y, z });
        return Object.freeze({
          ...c,
          distanceM,
          bearingDegrees: (degrees(bearing) + 360) % 360,
          relativeBearingDegrees: degrees(Math.atan2(local.x, local.z)),
          elevationDegrees: degrees(
            Math.atan2(local.y, Math.hypot(local.x, local.z)),
          ),
          closingSpeedMps,
          closingTimeSeconds: arrived
            ? 0
            : closingSpeedMps > 0
              ? (distanceM - c.arrivalRadiusM) / closingSpeedMps
              : null,
          arrived,
          localOffsetM: Object.freeze(local),
        });
      })
      .sort((a, b) => a.distanceM - b.distanceM || a.id.localeCompare(b.id));
    return Object.freeze({
      positionM: b.positionM,
      velocityMps: b.velocityMps,
      headingDegrees: (degrees(yaw) + 360) % 360,
      speedMps: Math.hypot(b.velocityMps.x, b.velocityMps.y, b.velocityMps.z),
      contacts: Object.freeze(contacts),
      destination: contacts.find((c) => c.id === this.#selected) ?? null,
    });
  }
  commit(): void {
    this.live();
    this.#reading = this.calculate();
  }
  get telemetry(): Readonly<NavigationReading> {
    return this.#reading;
  }
  dispose(): undefined {
    this.#disposed = true;
  }
}
