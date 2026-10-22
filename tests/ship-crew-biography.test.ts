import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  biographyProse,
  initialCrewKnowledge,
  paginateBiography,
} from '../games/farwake/CrewBiography.js';
import { loadCrewProfiles } from '../games/farwake/CrewProfiles.js';
import type { CrewProfile } from '../games/farwake/CrewProfiles.js';
import { crewControlAt } from '../games/farwake/WindshieldApp.js';

const fixture: CrewProfile = {
  id: 'test',
  displayName: 'Test',
  fullName: 'Test Crew',
  role: 'Navigator',
  biographySections: [
    {
      id: 'known',
      title: 'Known history',
      level: 2,
      markdown:
        'A short public account.\n\nAnother public paragraph for pagination.',
    },
    {
      id: 'secret',
      title: 'Secret title',
      level: 2,
      markdown: 'SECRET_MARKER',
    },
  ],
};
void test('Biography filters locked sections before pagination and reveals only explicitly unlocked IDs', () => {
  const pages = paginateBiography(fixture, ['known'], (s) => s.length, 20, 2);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((p) => p.sectionId === 'known' && p.lines.length <= 2));
  assert.ok(pages.every((p) => p.lines.every((line) => line.length <= 20)));
  assert.ok(!JSON.stringify(pages).includes('SECRET'));
  assert.ok(!JSON.stringify(pages).includes('Secret title'));
  const unlocked = paginateBiography(
    fixture,
    ['known', 'secret'],
    (s) => s.length,
    20,
    2,
  );
  assert.equal(unlocked.at(-1)!.lines[0], 'SECRET_MARKER');
  assert.deepEqual(
    paginateBiography(fixture, [], (s) => s.length, 20, 2),
    [],
  );
  assert.throws(() =>
    paginateBiography(fixture, ['missing'], (s) => s.length, 20, 2),
  );
  assert.throws(() =>
    paginateBiography(fixture, ['known', 'known'], (s) => s.length, 20, 2),
  );
});
void test('Biography wrapping preserves text across pages and splits long unbroken words', () => {
  const profile = {
    ...fixture,
    biographySections: [
      { ...fixture.biographySections[0]!, markdown: 'abcdefghijklmnop' },
    ],
  };
  const pages = paginateBiography(profile, ['known'], (s) => s.length, 5, 2);
  assert.equal(pages.flatMap((p) => p.lines).join(''), 'abcdefghijklmnop');
  assert.equal(pages.length, 2);
  assert.throws(() =>
    paginateBiography(fixture, ['known'], (s) => s.length, 0, 2),
  );
  assert.throws(() =>
    paginateBiography(fixture, ['known'], (s) => s.length, 20, 0),
  );
});
void test('Biography prose removes author citations and navigation while retaining readable emphasis and links', () => {
  const prose = biographyProse(
    '> Draft source\n\n[All crew](README.md)\n\n**Trait core (Ivy #1035):** precise, *kind*, and [curious](story.md).',
  );
  assert.equal(prose, 'Trait core: precise, kind, and curious.');
});
void test('Initial knowledge points to real public sections in every imported profile', async () => {
  const crew = await loadCrewProfiles(
    new URL('../../games/farwake/characters/', import.meta.url),
    async (url) => new Response(await readFile(url, 'utf8')),
  );
  for (const profile of crew) {
    const pages = paginateBiography(
      profile,
      initialCrewKnowledge[profile.id]!,
      (s) => s.length * 17,
      1000,
      14,
    );
    assert.ok(pages.length > 1);
    assert.ok(
      pages.every(
        (p) =>
          !p.sectionId.startsWith('background') &&
          !p.sectionId.includes('perks'),
      ),
    );
    assert.ok(!JSON.stringify(pages).includes('#103'));
  }
});
void test('Crew Details and biography navigation use distinct hit regions', () => {
  for (let i = 0; i < 4; i++)
    assert.deepEqual(
      crewControlAt((319 + i * 360 + 165) / 2048, 1 - 1025 / 1408, false),
      { kind: 'details', member: i },
    );
  assert.deepEqual(crewControlAt(400 / 2048, 1 - 275 / 1408, true), {
    kind: 'back',
  });
  assert.deepEqual(crewControlAt(850 / 2048, 1 - 1017 / 1408, true), {
    kind: 'previous',
  });
  assert.deepEqual(crewControlAt(1550 / 2048, 1 - 1017 / 1408, true), {
    kind: 'next',
  });
  assert.equal(crewControlAt(0.5, 0.5, true), null);
});
