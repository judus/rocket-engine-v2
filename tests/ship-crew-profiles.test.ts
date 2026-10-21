import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  crewIds,
  loadCrewProfiles,
  validateCrewProfile,
} from '../games/ship/CrewProfiles.js';

const base = new URL('../../games/ship/characters/', import.meta.url);
const fetcher = async (url: URL) => new Response(await readFile(url, 'utf8'));

void test('Game crew definitions load in portrait order with names, functions and retained biography sections', async () => {
  const crew = await loadCrewProfiles(base, fetcher);
  assert.deepEqual(
    crew.map((p) => p.id),
    crewIds,
  );
  assert.deepEqual(
    crew.map((p) => p.displayName),
    ['Sera Vale', 'Ren Talbot', 'Nadia Varga', 'Bram Mercer'],
  );
  for (const profile of crew) {
    assert.ok(profile.role.length > 0);
    assert.ok(profile.biographySections.some((s) => s.markdown.length > 0));
    assert.equal(
      new Set(profile.biographySections.map((s) => s.id)).size,
      profile.biographySections.length,
    );
    assert.ok(Object.isFrozen(profile));
    assert.ok(Object.isFrozen(profile.biographySections));
  }
});

void test('Character definition validation rejects malformed identity, duplicate sections and mutable game state', async () => {
  const [profile] = await loadCrewProfiles(base, fetcher);
  assert.ok(profile);
  for (const invalid of [
    { ...profile, displayName: '' },
    { ...profile, id: '../sera' },
    { ...profile, health: 100 },
    { ...profile, biographySections: [] },
    {
      ...profile,
      biographySections: [
        profile.biographySections[0],
        profile.biographySections[0],
      ],
    },
    {
      ...profile,
      biographySections: [{ ...profile.biographySections[0], level: 1.5 }],
    },
  ])
    assert.throws(() => validateCrewProfile(invalid));
});

void test('Crew loading rejects missing files and a profile returned for the wrong identity', async () => {
  await assert.rejects(
    loadCrewProfiles(base, async () => new Response('', { status: 404 })),
    /HTTP 404/,
  );
  const [profile] = await loadCrewProfiles(base, fetcher);
  await assert.rejects(
    loadCrewProfiles(base, async () => new Response(JSON.stringify(profile))),
    /identity mismatch/,
  );
});
