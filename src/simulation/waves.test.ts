import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaveEmissions, firstWaveArrival, flightEnergyBudget, machAngle, waveRadius } from './waves.ts';
import { PHYSICS, simulateThrow } from './physics.ts';

test('Mach angle exists only above sonic speed and matches M=2 analytic angle', () => {
  assert.equal(machAngle(0), null); assert.equal(machAngle(1), null);
  assert.ok(Math.abs(machAngle(2)! - Math.PI / 6) < 1e-12);
});
test('wave radius and observer arrival follow sound travel time, never pre-emission', () => {
  const wave = { time: 2, position: { x: 0, y: 0, z: 0 }, kind: 'flight' as const };
  assert.equal(waveRadius(wave, 1), 0);
  assert.equal(waveRadius(wave, 3), PHYSICS.speedOfSound);
  assert.equal(firstWaveArrival([wave], { x: PHYSICS.speedOfSound, y: 0, z: 0 }), 3);
  assert.equal(firstWaveArrival([], { x: 0, y: 0, z: 0 }), null);
});
test('subsonic throw has impact sound but no supersonic wave train', () => {
  const slow = simulateThrow({ vegetableId: 'tomato', speedKmh: 100, angleDeg: 2 });
  assert.deepEqual(createWaveEmissions(slow).map(w => w.kind), ['impact']);
  const fast = simulateThrow({ vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 });
  const waves = createWaveEmissions(fast);
  assert.ok(waves.some(w => w.kind === 'flight'));
  assert.ok(waves.length <= 19);
  assert.ok(waves.every(w => w.time <= fast.impact.time));
});
test('energy accounting includes gravitational work; vacuum drag work is zero', () => {
  const input = { vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 };
  const vacuum = flightEnergyBudget(simulateThrow(input, { drag: false }));
  assert.ok(vacuum.dragWorkJ < 1e-5);
  const air = flightEnergyBudget(simulateThrow(input));
  assert.ok(air.dragWorkJ > 0);
  assert.ok(Math.abs(air.initialJ + air.gravityWorkJ - air.impactJ - air.dragWorkJ) < 1e-8);
});
