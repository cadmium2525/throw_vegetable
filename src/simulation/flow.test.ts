import test from 'node:test';
import assert from 'node:assert/strict';
import { AIR, airFlow } from './flow.ts';
import { simulateThrow } from './physics.ts';

test('M=2 normal shock matches independent standard gas-dynamics values', () => {
  const f = airFlow(AIR.soundSpeed * 2);
  assert.ok(Math.abs(f.shockPressureRatio - 4.5) < 1e-12);
  assert.ok(Math.abs(f.shockDensityRatio - 8 / 3) < 1e-12);
  assert.ok(Math.abs(f.downstreamMach - Math.sqrt(1 / 3)) < 1e-12);
  assert.ok(Math.abs(f.shockAirTemperatureK / AIR.temperatureK - 1.6875) < 1e-12);
  assert.ok(Math.abs(f.stagnationAirTemperatureK / AIR.temperatureK - 1.8) < 1e-12);
});
test('rest has no pressure rise or heating and sonic limit is continuous', () => {
  const rest = airFlow(0);
  assert.equal(rest.stagnationGaugePa, 0);
  assert.equal(rest.shockPressureRisePa, 0);
  assert.equal(rest.stagnationAirTemperatureK, AIR.temperatureK);
  assert.ok(Math.abs(airFlow(AIR.soundSpeed * (1 - 1e-8)).stagnationGaugePa - airFlow(AIR.soundSpeed * (1 + 1e-8)).stagnationGaugePa) < 0.02);
  assert.throws(() => airFlow(-1)); assert.throws(() => airFlow(NaN));
});
test('fragmentation conserves represented mass/volume and increases drag instead of adding blast energy', () => {
  const input = { vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 };
  const rigid = simulateThrow(input);
  const broken = simulateThrow(input, { breakup: { strengthPa: 150000, fragmentCount: 32 } });
  assert.ok(broken.breakup);
  assert.ok(broken.breakup.time > 0 && broken.breakup.time < broken.impact.time);
  assert.equal(broken.vegetable.massKg, rigid.vegetable.massKg);
  assert.ok(Math.abs(broken.breakup.fragmentCount * broken.breakup.fragmentRadiusM ** 3 - broken.vegetable.radiusM ** 3) < 1e-12);
  assert.ok(broken.impact.energyJ < rigid.impact.energyJ);
  assert.ok(broken.impact.time > rigid.impact.time);
  for (let i = 1; i < broken.samples.length; i++) {
    const a = broken.samples[i - 1], b = broken.samples[i];
    const energy = (s: typeof a) => 0.5 * broken.vegetable.massKg * (s.speedKmh / 3.6) ** 2 + broken.vegetable.massKg * 9.80665 * s.position.y;
    assert.ok(energy(b) <= energy(a) + 1e-6);
    assert.ok(b.t > a.t);
  }
});
test('strong specimen, slow throw and vacuum do not develop aerodynamic fragmentation', () => {
  const input = { vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 };
  assert.equal(simulateThrow(input, { breakup: { strengthPa: 1e9, fragmentCount: 32 } }).breakup, undefined);
  assert.equal(simulateThrow({ ...input, speedKmh: 100 }, { breakup: { strengthPa: 150000, fragmentCount: 32 } }).breakup, undefined);
  assert.equal(simulateThrow(input, { drag: false, breakup: { strengthPa: 1, fragmentCount: 32 } }).breakup, undefined);
  assert.throws(() => simulateThrow(input, { breakup: { strengthPa: 0, fragmentCount: 32 } }));
});
test('fragmentation timing and impact converge when the integration step halves', () => {
  const input = { vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 };
  const breakup = { strengthPa: 150000, fragmentCount: 32 };
  const a = simulateThrow(input, { breakup, stepSeconds: 1 / 2000 });
  const b = simulateThrow(input, { breakup, stepSeconds: 1 / 4000 });
  assert.ok(a.breakup && b.breakup);
  assert.ok(Math.abs(a.breakup.time - b.breakup.time) <= 1 / 2000 + 1e-10);
  assert.ok(Math.abs(a.impact.energyJ - b.impact.energyJ) / b.impact.energyJ < 0.02);
});
