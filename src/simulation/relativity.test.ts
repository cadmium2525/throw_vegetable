import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_SPEED_MS as c, relativisticMotion } from './relativity.ts';

function near(actual: number, expected: number, relative = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relative, `${actual} != ${expected}`);
}

test('ordinary throws retain the Newtonian limit without cancellation', () => {
  near(relativisticMotion(0.15, 2000 / 3.6).kineticEnergyJ, 23148.14814814815, 3e-12);
  near(relativisticMotion(0.15, 0.001).kineticEnergyJ, 7.5e-8);
  near(relativisticMotion(0.15, 2000 / 3.6).vacuumTransitSeconds!, 0.0216);
  const rest = relativisticMotion(0.15, 0);
  assert.equal(rest.kineticEnergyJ, 0);
  assert.equal(rest.momentumKgMs, 0);
  assert.equal(rest.vacuumTransitSeconds, null);
  assert.equal(relativisticMotion(0.15, 0, 0).vacuumTransitSeconds, 0);
});

test('0.6c has independently known gamma 5/4 and momentum 3mc/4', () => {
  const m = 0.15, result = relativisticMotion(m, 0.6 * c);
  near(result.gamma, 1.25);
  near(result.kineticEnergyJ, 0.25 * m * c * c);
  near(result.momentumKgMs, 0.75 * m * c);
});

test('near-light presets obey the energy–momentum invariant and increase monotonically', () => {
  let previous = 0;
  for (const beta of [0.1, 0.9, 0.99, 0.999999]) {
    const m = 0.15, result = relativisticMotion(m, beta * c);
    const restEnergy = m * c * c;
    near((result.kineticEnergyJ + restEnergy) ** 2,
      (result.momentumKgMs * c) ** 2 + restEnergy ** 2);
    assert.ok(result.kineticEnergyJ > previous);
    assert.ok(result.vacuumTransitSeconds! > 12 / c);
    previous = result.kineticEnergyJ;
  }
});

test('c, superluminal motion and invalid inputs are rejected', () => {
  for (const speed of [-1, c, c * 1.01, Infinity, NaN]) assert.throws(() => relativisticMotion(0.15, speed), RangeError);
  for (const mass of [0, -1, Infinity, NaN]) assert.throws(() => relativisticMotion(mass, 1), RangeError);
  for (const distance of [-1, Infinity, NaN]) assert.throws(() => relativisticMotion(0.15, 1, distance), RangeError);
});
