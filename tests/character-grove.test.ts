import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import type { SituationDefinition } from 'character-framework';
import { GroveHost } from '../examples/character-grove/GroveHost.js';
import { grove } from '../examples/characters/GroveVisit.js';
async function definition(
  mode: 'events' | 'fact',
): Promise<SituationDefinition> {
  const value: unknown = JSON.parse(
    await readFile(
      new URL(
        `../../examples/character-grove/grove-${mode}.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return value as SituationDefinition; // CFW publish performs mandatory validation.
}
async function ticks(host: GroveHost, n = 16) {
  for (let i = 0; i < n; i++) {
    host.advance(1 / 60);
    await setImmediate();
  }
}
async function pump<T>(host: GroveHost, promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let i = 0; i < 200 && !done; i++) await ticks(host, 1);
  assert.ok(done);
  return promise;
}
void test('new-entry arming excludes earlier visit; committed reveal lost reply reconciles once; new pickup closes', async (t) => {
  const host = new GroveHost(await definition('events'), 'visit');
  t.after(() => host.dispose());
  await pump(host, host.arm());
  await ticks(host);
  assert.equal(host.view?.situationId, 'watch');
  assert.equal(host.state.visible, false);
  assert.equal(host.state.cuts[0]!.after, 1);
  assert.equal(host.pickup(), false);
  host.loseNextRevealReply();
  host.observePlayer(grove);
  await ticks(host, 30);
  assert.equal(host.view?.situationId, 'pickup');
  assert.equal(host.view?.status, 'waiting');
  assert.equal(host.state.visible, true);
  assert.equal(host.state.revealCalls, 1);
  assert.equal(
    host.state.cuts.find((c) => c.stream === 'marker-pickups')!.after,
    2,
  );
  assert.equal(host.pickup(), true);
  assert.equal(host.pickup(), false);
  await ticks(host);
  assert.equal(host.view?.situationId, 'found');
  assert.equal(host.view?.status, 'closed');
  assert.equal(host.state.revealCalls, 1);
  assert.equal(host.state.exists, true);
});
void test('authored fact can use prior visit; pickup still needs range and a new event after its stage', async (t) => {
  const host = new GroveHost(await definition('fact'), 'visit');
  t.after(() => host.dispose());
  await pump(host, host.arm());
  await ticks(host);
  assert.equal(host.view?.situationId, 'pickup');
  assert.equal(host.state.visible, true);
  assert.equal(
    host.pickup(),
    false,
    'outside player cannot collect through presentation',
  );
  host.observePlayer(grove);
  assert.equal(host.pickup(), true);
  await ticks(host);
  assert.equal(host.view?.status, 'closed');
  await pump(host, host.retire());
  await ticks(host);
  await pump(host, host.retire());
  await ticks(host);
  assert.equal(host.view?.status, 'retired');
  assert.equal(host.state.retired, 1);
  assert.equal(host.state.collected, true);
  assert.equal(
    host.state.exists,
    true,
    'retirement does not delete a shared entity',
  );
});
void test('prior pickup never becomes new pickup evidence or causes a replacement', async (t) => {
  const host = new GroveHost(await definition('fact'), 'pickup');
  t.after(() => host.dispose());
  await pump(host, host.arm());
  await ticks(host);
  assert.equal(host.view?.situationId, 'pickup');
  assert.equal(host.view?.status, 'waiting');
  assert.equal(host.state.visible, false);
  assert.equal(host.state.collected, true);
  host.observePlayer(grove);
  assert.equal(host.pickup(), false);
  await ticks(host, 30);
  assert.equal(host.view?.status, 'waiting');
  assert.equal(host.state.revealCalls, 1);
});
void test('unknown event evidence waits and recovers using original location and pickup cursors', async (t) => {
  const host = new GroveHost(await definition('events'));
  t.after(() => host.dispose());
  await pump(host, host.arm());
  await ticks(host);
  const entryCut = host.state.cuts[0]!.after;
  host.setEvidenceAvailable(false);
  host.observePlayer(grove);
  await ticks(host);
  assert.equal(host.view?.situationId, 'watch');
  assert.equal(host.state.visible, false);
  host.setEvidenceAvailable(true);
  await ticks(host);
  assert.equal(host.view?.situationId, 'pickup');
  assert.equal(host.state.cuts[0]!.after, entryCut);
  const pickupCut = host.state.cuts.find(
    (c) => c.stream === 'marker-pickups',
  )!.after;
  host.setEvidenceAvailable(false);
  assert.equal(host.pickup(), true);
  await ticks(host);
  assert.equal(host.view?.status, 'blocked');
  assert.match(host.view?.error ?? '', /evidence unknown/);
  host.setEvidenceAvailable(true);
  await ticks(host);
  assert.equal(host.view?.status, 'closed');
  assert.equal(
    host.state.cuts.find((c) => c.stream === 'marker-pickups')!.after,
    pickupCut,
  );
});
void test('removed marker cannot be replaced by a late reveal; disposed pending arm cannot revive world', async (t) => {
  const host = new GroveHost(await definition('events'));
  t.after(() => host.dispose());
  await pump(host, host.arm());
  host.removeMarker();
  host.observePlayer(grove);
  await ticks(host);
  assert.equal(host.state.exists, false);
  assert.equal(host.state.revealCalls, 0);
  assert.equal(host.pickup(), false);
  assert.equal(host.view?.status, 'blocked');
  const other = new GroveHost(await definition('events'));
  const pending = other.arm();
  const rejected = assert.rejects(pending, /disposed|Disposed/);
  other.dispose();
  await rejected;
  other.dispose();
  assert.throws(() => other.pickup(), /disposed/);
});
void test('capture acknowledgement unavailable at arming retries the original cut, not a later baseline', async (t) => {
  const host = new GroveHost(await definition('events'));
  t.after(() => host.dispose());
  host.setEvidenceAvailable(false);
  await assert.rejects(
    pump(host, host.arm()),
    /Authoritative evidence unavailable/,
  );
  assert.equal(host.state.cuts[0]!.after, 0);
  host.observePlayer(grove);
  host.setEvidenceAvailable(true);
  await pump(host, host.arm());
  await ticks(host);
  assert.equal(host.state.cuts[0]!.after, 0);
  assert.equal(host.view?.situationId, 'pickup');
  assert.equal(host.state.revealCalls, 1);
});
