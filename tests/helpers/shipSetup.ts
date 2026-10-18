import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadShipSetup } from '../../games/ship/loadShipSetup.js';

export const starterSetup = await loadShipSetup(
  pathToFileURL(resolve('games/ship/ships/science-ship.json')),
  async (url) => new Response(await readFile(url, 'utf8')),
);
