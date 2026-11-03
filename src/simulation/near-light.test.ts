import test from 'node:test';
import assert from 'node:assert/strict';
import { NEAR_LIGHT_PRESETS, nearLightShot, nearLightFrame } from './near-light';
import { LIGHT_SPEED_MS as c } from './relativity';

test('near-light launch is finite, subluminal, and obeys the energy–momentum invariant', () => {
  let previous = 0;
  for (const beta of NEAR_LIGHT_PRESETS) {
    for (const mass of [0.12, 0.15, 0.2, 0.23, 1, 2]) {
      const shot = nearLightShot(mass, beta);
      assert.ok(shot.speedMs < c && shot.vacuumTransitSeconds! > 12 / c);
      const total = shot.kineticEnergyJ + mass * c * c;
      const expected = (shot.momentumKgMs * c) ** 2 + (mass * c * c) ** 2;
      assert.ok(Math.abs(total * total / expected - 1) < 1e-12);
      assert.ok(Number.isFinite(shot.kineticEnergyJ));
    }
    const energy = nearLightShot(0.15, beta).kineticEnergyJ;
    assert.ok(energy > previous);
    previous = energy;
  }
  for (const invalid of [0, 1, 1.1, Infinity, NaN]) assert.throws(() => nearLightShot(0.15, invalid));
});

test('air sequence never reports a calculated flight time; vacuum ends at exactly 12m/v', () => {
  const shot = nearLightShot(0.15, 0.999);
  for (const elapsed of [0, 0.01, 1, 3, 6, 100]) {
    const air = nearLightFrame(elapsed, 'air', shot);
    assert.equal(air.vacuumTimeSeconds, null);
    assert.ok(air.progress >= 0 && air.progress <= 1);
    assert.ok(air.recognizableFraction >= 0 && air.recognizableFraction <= 1);
    const vacuum = nearLightFrame(elapsed, 'vacuum', shot);
    assert.equal(vacuum.recognizableFraction, 1);
    assert.ok(vacuum.vacuumTimeSeconds! <= shot.vacuumTransitSeconds!);
  }
  assert.equal(nearLightFrame(6, 'vacuum', shot).vacuumTimeSeconds, 12 / shot.speedMs);
  assert.equal(nearLightFrame(6, 'air', shot).complete, false);
  assert.equal(nearLightFrame(9, 'air', shot).complete, true);
  assert.throws(() => nearLightFrame(NaN, 'air', shot));
});
