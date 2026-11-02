import test from 'node:test';
import assert from 'node:assert/strict';
import { impactPulse, pressureAt } from './acoustics.ts';
import { PHYSICS } from './physics.ts';

test('conditional pressure pulse carries exactly the allocated sound energy', () => {
  const pulse = impactPulse(10000, { x: 0, y: 0, z: 0 }, 0.02, 0.03, 0.001, 0.002);
  const observer = { x: 10, y: 0, z: 0 };
  const arrival = pressureAt(pulse, observer, 0)!.arrivalSeconds;
  const steps = 2000, dt = pulse.durationSeconds / steps;
  let integral = 0, mean = 0;
  for (let i = 0; i < steps; i++) {
    const p = pressureAt(pulse, observer, arrival + (i + 0.5) * dt)!.pressurePa;
    integral += p * p * dt; mean += p * dt;
  }
  const energy = 4 * Math.PI * 100 * integral / (PHYSICS.airDensity * PHYSICS.speedOfSound);
  assert.ok(Math.abs(energy - 10) < 1e-5);
  assert.ok(Math.abs(mean) < 1e-10);
});
test('sound is causal, pressure falls as inverse distance and scales as sqrt energy', () => {
  const origin = { x: 0, y: 0, z: 0 };
  const pulse = impactPulse(1000, origin, 0, 0.03);
  assert.equal(pressureAt(pulse, { x: 10, y: 0, z: 0 }, 0)!.pressurePa, 0);
  assert.equal(pressureAt(pulse, origin, 0), null);
  const a = pressureAt(pulse, { x: 10, y: 0, z: 0 }, 0)!;
  const b = pressureAt(pulse, { x: 20, y: 0, z: 0 }, 0)!;
  assert.ok(Math.abs(a.peakPa / b.peakPa - 2) < 1e-12);
  const c = pressureAt(impactPulse(4000, origin, 0, 0.03), { x: 10, y: 0, z: 0 }, 0)!;
  assert.ok(Math.abs(c.peakPa / a.peakPa - 2) < 1e-12);
});
test('zero energy stays silent; invalid source fractions are rejected', () => {
  const origin = { x: 0, y: 0, z: 0 };
  assert.equal(pressureAt(impactPulse(0, origin, 0, 0.03), { x: 1, y: 0, z: 0 }, 1)!.peakPa, 0);
  assert.throws(() => impactPulse(100, origin, 0, 0.03, 1.01));
  assert.throws(() => impactPulse(100, origin, 0, 0.03, 0.001, 0));
});
