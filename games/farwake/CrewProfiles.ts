import { recordWithKeys, profileId, numberIn } from './ShipProfiles.js';

export const crewIds = ['sera', 'ren', 'nadia', 'bram'] as const;
export interface CrewProfile {
  readonly id: string;
  readonly displayName: string;
  readonly fullName: string;
  readonly role: string;
  readonly biographySections: readonly {
    readonly id: string;
    readonly title: string;
    readonly level: number;
    readonly markdown: string;
  }[];
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label} must be nonempty text`);
  return value;
}
/** Validate authored JSON once; mutable crew state never belongs in a definition. */
export function validateCrewProfile(value: unknown): Readonly<CrewProfile> {
  const p = recordWithKeys(
    value,
    ['id', 'displayName', 'fullName', 'role', 'biographySections'],
    'Crew profile',
  );
  if (!Array.isArray(p.biographySections) || !p.biographySections.length)
    throw new Error('Crew profile requires biography sections');
  const ids = new Set<string>();
  const biographySections = p.biographySections.map((value: unknown) => {
    const section = recordWithKeys(
      value,
      ['id', 'title', 'level', 'markdown'],
      'Biography section',
    );
    const id = profileId(section.id, 'Biography section id');
    if (ids.has(id)) throw new Error(`Duplicate biography section: ${id}`);
    ids.add(id);
    const level = numberIn(
      'Biography heading level',
      section.level as number,
      0,
      6,
    );
    if (!Number.isInteger(level) || typeof section.markdown !== 'string')
      throw new Error('Invalid biography section content');
    return Object.freeze({
      id,
      title: text(section.title, 'Biography title'),
      level,
      markdown: section.markdown,
    });
  });
  return Object.freeze({
    id: profileId(p.id, 'Crew id'),
    displayName: text(p.displayName, 'Crew display name'),
    fullName: text(p.fullName, 'Crew full name'),
    role: text(p.role, 'Crew role'),
    biographySections: Object.freeze(biographySections),
  });
}
export async function loadCrewProfiles(
  base: URL,
  fetcher: (url: URL) => Promise<Pick<Response, 'ok' | 'status' | 'json'>> = (
    url,
  ) => fetch(url, { cache: 'no-cache' }),
): Promise<readonly Readonly<CrewProfile>[]> {
  return Object.freeze(
    await Promise.all(
      crewIds.map(async (id) => {
        const response = await fetcher(new URL(`${id}.json`, base));
        if (!response.ok)
          throw new Error(`Cannot load crew ${id}: HTTP ${response.status}`);
        const profile = validateCrewProfile(await response.json());
        if (profile.id !== id)
          throw new Error(`Crew profile identity mismatch: ${id}`);
        return profile;
      }),
    ),
  );
}

/** Explicit sample values for the overview, independent of simulation/save state. */
export const crewPlaceholderStats = Object.freeze([
  Object.freeze({ label: 'Health', value: 100 }),
  Object.freeze({ label: 'Fatigue', value: 0 }),
  Object.freeze({ label: 'Morale', value: 75 }),
]);
