import type { Behavior } from '../../src/index.js';
import { profileId, recordWithKeys } from './ShipProfiles.js';

export type MountKind = 'weapon' | 'utility';
export interface MountSlot {
  readonly id: string;
  readonly accepts: readonly MountKind[];
}
export interface MountEquipment {
  readonly id: string;
  readonly label: string;
  readonly kind: MountKind;
}
export interface MountInstallation {
  readonly slotId: string;
  readonly equipmentId: string;
  readonly installationId: string;
}
export interface FireGroup {
  readonly id: string;
  readonly mountIds: readonly string[];
}
export interface MountsProfile {
  readonly id: string;
  readonly slots: readonly MountSlot[];
  readonly equipment: readonly MountEquipment[];
  readonly loadout: readonly MountInstallation[];
  readonly groups: readonly FireGroup[];
  readonly selectedGroupId: string;
}
export interface MountsReading {
  readonly slots: readonly Readonly<
    MountSlot & { installation: Readonly<MountInstallation> | null }
  >[];
  readonly groups: readonly FireGroup[];
  readonly selectedGroupId: string;
  readonly selectedWeapons: readonly Readonly<MountInstallation>[];
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Array.from(value as unknown[]);
}
function unique(ids: readonly string[], label: string): void {
  if (new Set(ids).size !== ids.length)
    throw new Error(`${label} contains duplicate IDs`);
}
function kind(value: unknown): MountKind {
  if (value !== 'weapon' && value !== 'utility')
    throw new TypeError('Mount kind must be weapon or utility');
  return value;
}
export function validateMountsProfile(value: unknown): Readonly<MountsProfile> {
  const p = recordWithKeys(
    value,
    ['id', 'slots', 'equipment', 'loadout', 'groups', 'selectedGroupId'],
    'Mounts profile',
  );
  const slots = array(p.slots, 'Mount slots').map((v) => {
    const s = recordWithKeys(v, ['id', 'accepts'], 'Mount slot');
    const accepts = array(s.accepts, 'Mount slot accepts').map(kind);
    if (!accepts.length) throw new Error('Mount slot must accept equipment');
    unique(accepts, 'Accepted kinds');
    return Object.freeze({
      id: profileId(s.id, 'Mount slot id'),
      accepts: Object.freeze(accepts),
    });
  });
  if (!slots.length) throw new Error('At least one mount slot is required');
  unique(
    slots.map((s) => s.id),
    'Mount slots',
  );
  const equipment = array(p.equipment, 'Mount equipment').map((v) => {
    const e = recordWithKeys(v, ['id', 'label', 'kind'], 'Mount equipment');
    if (typeof e.label !== 'string' || !e.label.trim() || e.label.length > 120)
      throw new TypeError('Equipment label must be 1–120 characters');
    return Object.freeze({
      id: profileId(e.id, 'Equipment id'),
      label: e.label,
      kind: kind(e.kind),
    });
  });
  unique(
    equipment.map((e) => e.id),
    'Mount equipment',
  );
  const loadout = array(p.loadout, 'Mount loadout').map((v) => {
    const i = recordWithKeys(
      v,
      ['slotId', 'equipmentId', 'installationId'],
      'Mount installation',
    );
    return Object.freeze({
      slotId: profileId(i.slotId, 'Slot id'),
      equipmentId: profileId(i.equipmentId, 'Equipment id'),
      installationId: profileId(i.installationId, 'Installation id'),
    });
  });
  unique(
    loadout.map((i) => i.slotId),
    'Occupied slots',
  );
  unique(
    loadout.map((i) => i.installationId),
    'Installations',
  );
  for (const i of loadout) {
    const slot = slots.find((s) => s.id === i.slotId),
      e = equipment.find((e) => e.id === i.equipmentId);
    if (!slot || !e || !slot.accepts.includes(e.kind))
      throw new Error('Unknown or incompatible mount installation');
  }
  const groups = array(p.groups, 'Fire groups').map((v) => {
    const g = recordWithKeys(v, ['id', 'mountIds'], 'Fire group');
    const mountIds = array(g.mountIds, 'Fire group mounts').map((v) =>
      profileId(v, 'Group mount id'),
    );
    unique(mountIds, 'Fire group members');
    for (const id of mountIds) {
      const i = loadout.find((i) => i.slotId === id);
      if (
        !i ||
        equipment.find((e) => e.id === i.equipmentId)?.kind !== 'weapon'
      )
        throw new Error('Fire group members must be installed weapons');
    }
    return Object.freeze({
      id: profileId(g.id, 'Fire group id'),
      mountIds: Object.freeze(mountIds),
    });
  });
  if (!groups.length) throw new Error('At least one fire group is required');
  unique(
    groups.map((g) => g.id),
    'Fire groups',
  );
  const selectedGroupId = profileId(p.selectedGroupId, 'Selected group id');
  if (!groups.some((g) => g.id === selectedGroupId))
    throw new Error('Unknown selected fire group');
  return Object.freeze({
    id: profileId(p.id, 'Mounts profile id'),
    slots: Object.freeze(slots),
    equipment: Object.freeze(equipment),
    loadout: Object.freeze(loadout),
    groups: Object.freeze(groups),
    selectedGroupId,
  });
}
/** Loadout and grouping only. No firing, inventory transfer, energy ledger or private clock. */
export class ShipMounts implements Behavior {
  readonly profile: Readonly<MountsProfile>;
  #state: Readonly<MountsProfile>;
  #pending: Readonly<MountsProfile> | undefined;
  #disposed = false;
  constructor(profile: MountsProfile) {
    this.profile = validateMountsProfile(profile);
    this.#state = this.profile;
  }
  private live(): Readonly<MountsProfile> {
    if (this.#disposed) throw new Error('Mounts disposed');
    return this.#pending ?? this.#state;
  }
  install(slotId: string, equipmentId: string, installationId: string): void {
    const p = this.live();
    if (p.loadout.some((i) => i.slotId === slotId))
      throw new Error('Mount slot occupied; remove its installation first');
    this.#pending = validateMountsProfile({
      ...p,
      loadout: [...p.loadout, { slotId, equipmentId, installationId }],
    });
  }
  remove(slotId: string): void {
    const p = this.live();
    if (!p.loadout.some((i) => i.slotId === slotId))
      throw new Error('Mount slot has no installation');
    this.#pending = validateMountsProfile({
      ...p,
      loadout: p.loadout.filter((i) => i.slotId !== slotId),
      groups: p.groups.map((g) => ({
        ...g,
        mountIds: g.mountIds.filter((id) => id !== slotId),
      })),
    });
  }
  assign(groupId: string, slotId: string, enabled: boolean): void {
    const p = this.live();
    if (typeof enabled !== 'boolean')
      throw new TypeError('Group assignment must be boolean');
    if (!p.groups.some((g) => g.id === groupId))
      throw new Error('Unknown fire group');
    const installation = p.loadout.find((i) => i.slotId === slotId);
    if (
      !installation ||
      p.equipment.find((e) => e.id === installation.equipmentId)?.kind !==
        'weapon'
    )
      throw new Error('Only installed weapons can join fire groups');
    this.#pending = validateMountsProfile({
      ...p,
      groups: p.groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              mountIds: enabled
                ? [...new Set([...g.mountIds, slotId])]
                : g.mountIds.filter((id) => id !== slotId),
            }
          : g,
      ),
    });
  }
  selectGroup(groupId: string): void {
    const p = this.live();
    this.#pending = validateMountsProfile({ ...p, selectedGroupId: groupId });
  }
  commit(): void {
    this.live();
    if (this.#pending) {
      this.#state = this.#pending;
      this.#pending = undefined;
    }
  }
  get telemetry(): Readonly<MountsReading> {
    const p = this.#state;
    const members = p.groups.find((g) => g.id === p.selectedGroupId)?.mountIds;
    if (!members) throw new Error('Missing selected fire group');
    return Object.freeze({
      slots: Object.freeze(
        p.slots.map((s) =>
          Object.freeze({
            ...s,
            installation: p.loadout.find((i) => i.slotId === s.id) ?? null,
          }),
        ),
      ),
      groups: p.groups,
      selectedGroupId: p.selectedGroupId,
      selectedWeapons: Object.freeze(
        p.loadout.filter((i) => members.includes(i.slotId)),
      ),
    });
  }
  dispose(): undefined {
    this.#disposed = true;
    this.#pending = undefined;
  }
}
