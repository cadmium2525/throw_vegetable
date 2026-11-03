import test from 'node:test';
import assert from 'node:assert/strict';
import { playbackRate, flightTimeAt, contactTimescale, aftermathTimeAt } from './playback.ts';

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

test('contact replay resolves a short impact without altering normal time', () => {
  const contact = contactTimescale(0.035, 500);
  assert.ok(Math.abs(contact - 0.00014) < 1e-15);
  assert.equal(aftermathTimeAt(0.032, false, contact), 0.032);
  assert.equal(aftermathTimeAt(1.2, true, contact), contact * 2.5);
  let previous = 0;
  for (let i = 1; i < 700; i++) {
    const time = aftermathTimeAt(i / 100, true, contact);
    assert.ok(time >= previous);
    previous = time;
  }
  for (const boundary of [1.2, 3.2, 5.2]) {
    assert.ok(aftermathTimeAt(boundary + 1e-8, true, contact) - aftermathTimeAt(boundary - 1e-8, true, contact) < 1e-7);
  }
});
