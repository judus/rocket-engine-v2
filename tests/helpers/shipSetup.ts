import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadShipSetup } from '../../games/farwake/loadShipSetup.js';

export const starterSetup = await loadShipSetup(
  pathToFileURL(resolve('games/farwake/ships/science-ship.json')),
  async (url) => new Response(await readFile(url, 'utf8')),
);
