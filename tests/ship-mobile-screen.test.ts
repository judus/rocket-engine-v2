import test from 'node:test';
import assert from 'node:assert/strict';
import { enterMobileScreen } from '../games/farwake/MobileScreen.js';

void test('Mobile launch requests fullscreen in the gesture and locks landscape only after entry', async () => {
  const calls: string[] = [];
  let complete!: () => void;
  const pending = enterMobileScreen(
    {
      requestFullscreen(options) {
        calls.push(`fullscreen:${options?.navigationUI}`);
        return new Promise<void>((resolve) => {
          complete = resolve;
        });
      },
    },
    { fullscreenElement: null, fullscreenEnabled: true },
    {
      lock(mode) {
        calls.push(mode);
        return Promise.resolve();
      },
    },
  );
  assert.deepEqual(calls, ['fullscreen:hide']);
  complete();
  assert.equal(await pending, '');
  assert.deepEqual(calls, ['fullscreen:hide', 'landscape']);
});

void test('Mobile launch reports browser limitations without preventing flight', async () => {
  const page = { fullscreenElement: null, fullscreenEnabled: true };
  assert.match(await enterMobileScreen({}, page, {}), /unavailable/);
  assert.match(
    await enterMobileScreen({}, { ...page, fullscreenEnabled: false }, {}),
    /unavailable/,
  );
  let locks = 0;
  const orientation = {
    lock() {
      locks++;
      return Promise.resolve();
    },
  };
  assert.match(
    await enterMobileScreen(
      { requestFullscreen: () => Promise.reject(new Error('denied')) },
      page,
      orientation,
    ),
    /refused/,
  );
  assert.equal(locks, 0);
  const target = { requestFullscreen: () => Promise.resolve() };
  assert.match(
    await enterMobileScreen(target, page, {}),
    /rotation is unavailable/,
  );
  assert.match(
    await enterMobileScreen(target, page, {
      lock: () => Promise.reject(new Error('unsupported')),
    }),
    /could not lock/,
  );
  assert.equal(
    await enterMobileScreen(
      {},
      { fullscreenElement: {} as Element, fullscreenEnabled: true },
      orientation,
    ),
    '',
  );
  assert.equal(locks, 1);
});
