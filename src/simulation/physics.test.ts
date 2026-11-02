import assert from 'node:assert/strict';
import test from 'node:test';
import { PHYSICS, VEGETABLES, compressibilityMultiplier, sampleTrajectory, simulateThrow } from './physics.ts';

const throwTomato = (speedKmh: number, angleDeg = 0, options = {}) => simulateThrow({ vegetableId: 'tomato', speedKmh, angleDeg }, options);
const close = (actual: number, expected: number, tolerance: number) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);

test('0 km/h drops vertically; vacuum fall matches analytic solution', () => {
  const result = throwTomato(0, 0, { drag: false });
  const expectedTime = Math.sqrt(2 * (PHYSICS.launchHeight - result.vegetable.radiusM) / PHYSICS.gravity);
  assert.equal(result.impact.kind, 'ground');
  close(result.impact.position.x, 0, 1e-12);
  close(result.impact.position.z, 0, 1e-12);
  close(result.impact.position.y, result.vegetable.radiusM, 1e-10);
  close(result.impact.time, expectedTime, 1e-6);
  close(result.impact.speedKmh / 3.6, PHYSICS.gravity * expectedTime, 1e-5);
});

test('vacuum horizontal target contact matches analytic time and gravitational drop', () => {
  const result = throwTomato(180, 0, { drag: false });
  const expectedTime = (PHYSICS.targetDistance - result.vegetable.radiusM) / 50;
  assert.equal(result.impact.kind, 'target');
  close(result.impact.time, expectedTime, 1e-10);
  close(result.impact.position.y, PHYSICS.launchHeight - 0.5 * PHYSICS.gravity * expectedTime ** 2, 1e-6);
  close(result.impact.contactPoint.z, -PHYSICS.targetDistance, 1e-12);
});

test('all vegetables hit at 2000 km/h without tunneling or nonfinite states', () => {
  for (const vegetable of VEGETABLES) {
    const result = simulateThrow({ vegetableId: vegetable.id, speedKmh: 2000, angleDeg: 0 });
    assert.equal(result.impact.kind, 'target', vegetable.id);
    assert.ok(result.launchMach > 1.6 && result.launchMach < 1.7);
    assert.ok(result.impact.time > 0.02 && result.impact.time < 0.05, vegetable.id);
    assert.ok(result.impact.speedKmh < 2000 && result.impact.speedKmh > 0);
    assert.ok(Number.isFinite(result.impact.energyJ));
    close(result.impact.position.z, -PHYSICS.targetDistance + vegetable.radiusM, 1e-8);
  }
});

test('continuous collision remains reliable when a coarse step passes the whole disk', () => {
  const result = throwTomato(2000, 0, { stepSeconds: 0.02, drag: false });
  assert.equal(result.impact.kind, 'target');
  close(result.impact.position.z, -PHYSICS.targetDistance + result.vegetable.radiusM, 1e-8);
});

test('rim collision uses sphere/disk distance and angled misses continue to ground', () => {
  const rimAngle = Math.atan((PHYSICS.targetRadius + 0.01) / PHYSICS.targetDistance) * 180 / Math.PI;
  const hit = simulateThrow({ vegetableId: 'tomato', speedKmh: 2000, angleDeg: 0, azimuthDeg: rimAngle }, { drag: false });
  assert.equal(hit.impact.kind, 'target');
  const miss = simulateThrow({ vegetableId: 'tomato', speedKmh: 2000, angleDeg: 0, azimuthDeg: 15 });
  assert.equal(miss.impact.kind, 'ground');
  assert.ok(miss.targetPlaneCrossing);
  assert.ok(miss.impact.position.z < -PHYSICS.targetDistance);
});

test('drag lowers speed and dissipates total mechanical energy during flight', () => {
  const result = throwTomato(180, 2);
  const vacuum = throwTomato(180, 2, { drag: false });
  assert.equal(result.impact.kind, 'target');
  assert.ok(result.impact.speedKmh < vacuum.impact.speedKmh);
  let previousEnergy = Number.POSITIVE_INFINITY;
  for (const sample of result.samples) {
    const speed = sample.speedKmh / 3.6;
    const energy = 0.5 * result.vegetable.massKg * speed * speed + result.vegetable.massKg * PHYSICS.gravity * sample.position.y;
    assert.ok(energy <= previousEnergy + 1e-6);
    previousEnergy = energy;
  }
});

test('vacuum mechanical energy is conserved independently of drag model', () => {
  const result = throwTomato(180, 0, { drag: false });
  const initialEnergy = result.initialEnergyJ + result.vegetable.massKg * PHYSICS.gravity * PHYSICS.launchHeight;
  const finalEnergy = result.impact.energyJ + result.vegetable.massKg * PHYSICS.gravity * result.impact.position.y;
  close(finalEnergy, initialEnergy, 1e-5);
});

test('high-speed impact converges when integration step halves', () => {
  for (const vegetable of VEGETABLES) {
    const input = { vegetableId: vegetable.id, speedKmh: 2000, angleDeg: 2 };
    const normal = simulateThrow(input);
    const fine = simulateThrow(input, { stepSeconds: PHYSICS.stepSeconds / 2 });
    assert.equal(normal.impact.kind, fine.impact.kind);
    close(normal.impact.speedKmh, fine.impact.speedKmh, 0.05);
    close(normal.impact.time, fine.impact.time, 1e-6);
  }
});

test('trajectory interpolation has stable endpoints and velocity-derived metrics', () => {
  const result = throwTomato(300, 2);
  assert.equal(sampleTrajectory(result, -1), result.samples[0]);
  assert.equal(sampleTrajectory(result, 100), result.samples[result.samples.length - 1]);
  const t = result.impact.time / 2;
  const middle = sampleTrajectory(result, t);
  close(middle.t, t, 1e-12);
  close(middle.speedKmh, Math.hypot(middle.velocity.x, middle.velocity.y, middle.velocity.z) * 3.6, 1e-12);
  assert.ok(middle.position.z < 0 && middle.position.z > result.impact.position.z);
});

test('2000 km/h energy and dynamic pressure use SI units', () => {
  const result = throwTomato(2000);
  close(result.initialEnergyJ, 0.5 * 0.15 * (2000 / 3.6) ** 2, 1e-8);
  close(result.maxDynamicPressurePa, 0.5 * PHYSICS.airDensity * (2000 / 3.6) ** 2, 1e-8);
  close(result.impact.energyJ, 0.5 * 0.15 * (result.impact.speedKmh / 3.6) ** 2, 1e-8);
  assert.ok(result.impact.normalEnergyJ <= result.impact.energyJ + 1e-8);
  assert.ok(compressibilityMultiplier(1.1) > compressibilityMultiplier(0.5));
});

test('invalid inputs fail explicitly and speed clamps to the advertised range', () => {
  assert.throws(() => simulateThrow({ vegetableId: 'unknown', speedKmh: 1, angleDeg: 0 }), RangeError);
  assert.throws(() => throwTomato(Number.NaN), RangeError);
  assert.throws(() => throwTomato(10, 0, { stepSeconds: 0 }), RangeError);
  assert.equal(throwTomato(-10).launchSpeedKmh, 0);
  assert.equal(throwTomato(5000).launchSpeedKmh, 2000);
});
