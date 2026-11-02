import assert from 'node:assert/strict';
import test from 'node:test';
import { getImpactResponse, IMPACT_MODEL } from './impact.ts';
import { VEGETABLES, simulateThrow } from './physics.ts';

function normalImpact(speedKmh: number, vegetableId = 'tomato', kind: 'target' | 'ground' | 'timeout' = 'target') {
  const vegetable = VEGETABLES.find(value => value.id === vegetableId)!;
  return getImpactResponse({
    massKg: vegetable.massKg,
    radiusM: vegetable.radiusM,
    speedKmh,
    normalEnergyJ: 0.5 * vegetable.massKg * (speedKmh / 3.6) ** 2,
    kind,
    vegetableId,
  });
}

test('no contact energy produces no fragments or target damage', () => {
  const response = normalImpact(0);
  assert.deepEqual(response, { vegetable: 'intact', target: 'none', severity: 0, holeRadiusM: 0, fragmentCount: 0 });
  assert.equal(IMPACT_MODEL.targetThicknessM, 0.012);
});

test('0 km/h launch drops remain visually intact instead of exploding', () => {
  for (const vegetable of VEGETABLES) {
    const flight = simulateThrow({ vegetableId: vegetable.id, speedKmh: 0, angleDeg: 2 });
    const response = getImpactResponse({ massKg: vegetable.massKg, radiusM: vegetable.radiusM, speedKmh: flight.impact.speedKmh, normalEnergyJ: flight.impact.normalEnergyJ, kind: flight.impact.kind, vegetableId: vegetable.id });
    assert.equal(response.vegetable, 'intact', vegetable.id);
    assert.equal(response.target, 'none');
    assert.equal(response.fragmentCount, 0);
  }
});

test('2000 km/h tomato destroys its shape and breaches the assumed thin target', () => {
  const flight = simulateThrow({ vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 });
  const response = getImpactResponse({ massKg: flight.vegetable.massKg, radiusM: flight.vegetable.radiusM, speedKmh: flight.impact.speedKmh, normalEnergyJ: flight.impact.normalEnergyJ, kind: flight.impact.kind, vegetableId: 'tomato' });
  assert.equal(response.vegetable, 'pulverized');
  assert.equal(response.target, 'breached');
  assert.ok(response.fragmentCount >= 40);
  assert.ok(response.holeRadiusM > flight.vegetable.radiusM);
  assert.ok(response.holeRadiusM <= IMPACT_MODEL.maximumHoleRadiusM);
});

test('same normal specific energy preserves vegetable classification across masses', () => {
  const small = getImpactResponse({ massKg: 0.15, radiusM: 0.06, speedKmh: 100, normalEnergyJ: 0.5 * 0.15 * (100 / 3.6) ** 2, kind: 'target', vegetableId: 'tomato' });
  const heavy = getImpactResponse({ massKg: 2, radiusM: 0.06, speedKmh: 100, normalEnergyJ: 0.5 * 2 * (100 / 3.6) ** 2, kind: 'target', vegetableId: 'tomato' });
  assert.equal(small.vegetable, heavy.vegetable);
  assert.equal(small.target, 'dent');
  assert.equal(heavy.target, 'cracked');
});

test('a moderate-speed pumpkin cracks the illustrative plywood target', () => {
  const response = normalImpact(100, 'pumpkin');
  assert.equal(response.target, 'cracked');
  assert.equal(response.vegetable, 'split');
  assert.equal(response.holeRadiusM, 0);
});

test('normal energy, not high tangential speed, drives the visual response', () => {
  const grazing = getImpactResponse({ massKg: 0.15, radiusM: 0.035, speedKmh: 2000, normalEnergyJ: 0.01, kind: 'target', vegetableId: 'tomato' });
  assert.equal(grazing.vegetable, 'intact');
  assert.equal(grazing.target, 'none');
  const headOn = normalImpact(2000);
  assert.equal(headOn.vegetable, 'pulverized');
  assert.equal(headOn.target, 'breached');
  assert.ok(grazing.severity < headOn.severity);
});

test('ground impacts never damage the remote target and timeouts create no impact', () => {
  const ground = normalImpact(2000, 'tomato', 'ground');
  assert.equal(ground.vegetable, 'pulverized');
  assert.equal(ground.target, 'none');
  assert.equal(ground.holeRadiusM, 0);
  assert.deepEqual(normalImpact(2000, 'pumpkin', 'timeout'), normalImpact(0));
});

test('increasing normal impact speed never reduces damage or creates invalid radii', () => {
  const targetRanks = { none: 0, dent: 1, cracked: 2, breached: 3 };
  const vegetableRanks = { intact: 0, split: 1, pulverized: 2 };
  for (const vegetable of VEGETABLES) {
    let previous = normalImpact(0, vegetable.id);
    for (let speed = 10; speed <= 2000; speed += 10) {
      const response = normalImpact(speed, vegetable.id);
      assert.ok(targetRanks[response.target] >= targetRanks[previous.target]);
      assert.ok(vegetableRanks[response.vegetable] >= vegetableRanks[previous.vegetable]);
      assert.ok(response.severity >= previous.severity);
      assert.ok(response.fragmentCount >= previous.fragmentCount);
      assert.ok(response.holeRadiusM >= previous.holeRadiusM);
      assert.ok(Number.isFinite(response.holeRadiusM) && response.holeRadiusM >= 0);
      assert.ok(response.severity >= 0 && response.severity <= 1);
      previous = response;
    }
  }
});

test('normal energy is bounded by available kinetic energy', () => {
  const response = getImpactResponse({ massKg: 0.15, speedKmh: 1, normalEnergyJ: 1e6, kind: 'target', vegetableId: 'tomato' });
  assert.equal(response.vegetable, 'intact');
  assert.equal(response.target, 'none');
  assert.ok(response.severity < 0.01);
});

test('missing vegetable properties use finite defaults and invalid units fail explicitly', () => {
  const response = getImpactResponse({ massKg: 0.2, speedKmh: 100, normalEnergyJ: 50, kind: 'target' });
  assert.ok(Number.isFinite(response.severity));
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => getImpactResponse({ massKg: invalid, speedKmh: 1, normalEnergyJ: 1, kind: 'target' }), RangeError);
  }
  assert.throws(() => getImpactResponse({ massKg: 1, speedKmh: -1, normalEnergyJ: 0, kind: 'target' }), RangeError);
  assert.throws(() => getImpactResponse({ massKg: 1, speedKmh: 1, normalEnergyJ: Number.NaN, kind: 'target' }), RangeError);
  assert.throws(() => getImpactResponse({ massKg: 1, speedKmh: 1, normalEnergyJ: 0, kind: 'target', radiusM: 0 }), RangeError);
});
