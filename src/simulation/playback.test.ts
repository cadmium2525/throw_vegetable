import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackRate, flightTimeAt } from './playback.ts';

test('a 24 ms supersonic flight finishes after 24 ms in normal play', () => {
  const duration = 0.024;
  const rate = playbackRate(duration, false);
  assert.equal(rate, 1);
  assert.equal(flightTimeAt(0.016, rate, duration), 0.016);
  assert.equal(flightTimeAt(0.032, rate, duration), duration);
});

test('slow playback requires explicit replay; normal time has no minimum duration', () => {
  for (const duration of [0.022, 0.024, 0.15, 0.6, 12]) {
    assert.equal(flightTimeAt(duration, playbackRate(duration, false), duration), duration);
    assert.ok(playbackRate(duration, true) < 1);
  }
  assert.equal(flightTimeAt(1.8, playbackRate(0.024, true), 0.024), 0.024);
});

test('an occasional slow frame does not stretch the physical clock', () => {
  assert.equal(flightTimeAt(0.2, 1, 0.18), 0.18);
  assert.throws(() => playbackRate(0, false), RangeError);
});
