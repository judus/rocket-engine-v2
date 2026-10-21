import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { crewIds, validateCrewProfile } from '../games/ship/CrewProfiles.js';

const source = resolve(
  process.argv[2] ?? '../madhouse/agents/luna/farwake/characters',
);
const target = resolve('games/ship/characters');
// Validate every definition before changing any game copy.
const definitions = await Promise.all(
  crewIds.map(async (id) => {
    const contents = await readFile(resolve(source, `${id}.json`), 'utf8');
    const profile = validateCrewProfile(JSON.parse(contents) as unknown);
    if (profile.id !== id)
      throw new Error(`Crew profile identity mismatch: ${id}`);
    return { id, contents };
  }),
);
await mkdir(target, { recursive: true });
for (const { id, contents } of definitions)
  await writeFile(resolve(target, `${id}.json`), contents);
console.log(`Imported ${definitions.length} crew definitions from ${source}`);
