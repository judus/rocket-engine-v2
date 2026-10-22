import test from 'node:test';
import assert from 'node:assert/strict';
import { CrewCallVideo } from '../games/farwake/CrewCallVideo.js';
import {
  commsControlAt,
  crewControlAt,
} from '../games/farwake/WindshieldApp.js';

void test('Call playback loads only the selected crew member and pauses when hidden', () => {
  let plays = 0,
    pauses = 0;
  const video = {
    muted: false,
    loop: false,
    playsInline: false,
    preload: '',
    src: '',
    videoWidth: 512,
    videoHeight: 512,
    readyState: 2,
    currentTime: 0,
    addEventListener() {},
    removeEventListener() {},
    load() {},
    removeAttribute() {
      this.src = '';
    },
    pause() {
      pauses++;
    },
    play() {
      plays++;
      return Promise.resolve();
    },
  };
  const call = new CrewCallVideo(
    new URL('http://localhost/comms/'),
    (error) => {
      throw error;
    },
    video as unknown as HTMLVideoElement,
  );
  call.setVisible(true);
  call.start('nadia');
  assert.equal(video.src, 'http://localhost/comms/nadia-512-24fps.mp4');
  assert.equal(plays, 1);
  assert.equal(video.muted, true);
  assert.equal(video.loop, true);
  assert.equal(call.changed(), true);
  assert.equal(call.image!.revision, 0);
  assert.equal(call.changed(), false);
  video.currentTime = 1 / 24;
  assert.equal(call.changed(), true);
  assert.equal(call.image!.revision, 1);
  call.setVisible(false);
  assert.equal(call.changed(), false);
  call.setVisible(true);
  assert.equal(plays, 2);
  call.start('bram');
  assert.ok(video.src.endsWith('/bram-512-24fps.mp4'));
  call.stop();
  assert.equal(video.src, '');
  assert.equal(call.image, null);
  assert.equal(call.changed(), false);
  assert.ok(pauses >= 3);
  assert.throws(() => call.start('unknown'), /Unknown crew/);
  call.dispose();
});
void test('Call, dialogue choices and End call use their own hit regions', () => {
  assert.deepEqual(crewControlAt(480 / 2048, 1 - 1110 / 1408, false), {
    kind: 'call',
    member: 0,
  });
  assert.equal(crewControlAt(480 / 2048, 1 - 1110 / 1408, true), null);
  for (let i = 0; i < 3; i++)
    assert.equal(commsControlAt(1300 / 2048, 1 - (450 + i * 150) / 1408), i);
  assert.equal(commsControlAt(450 / 2048, 1 - 1140 / 1408), 'end');
  assert.equal(commsControlAt(0.5, 0.5), null);
});
