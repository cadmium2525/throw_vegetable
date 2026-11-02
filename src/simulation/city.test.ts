import test from 'node:test';
import assert from 'node:assert/strict';
import { CityExperiment, firstCityHit, type CitySurface } from './city.ts';
import { createAftermath, stepAftermath } from './aftermath.ts';
import { getImpactResponse } from './impact.ts';
import { simulateThrow } from './physics.ts';

const pane: CitySurface = { id: 'pane', kind: 'glass', min: { x: -1, y: 0, z: -10.03 }, max: { x: 1, y: 3, z: -10 }, normalAxis: 'z' };
test('swept collision catches a 3 cm pane across a 20 m step', () => {
  const hit = firstCityHit({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -20 }, 0.01, [pane]);
  assert.ok(hit);
  assert.ok(Math.abs(hit.position.z + 9.99) < 1e-10);
  assert.equal(firstCityHit({ x: 2, y: 1, z: 0 }, { x: 2, y: 1, z: -20 }, 0.01, [pane]), null);
});
test('nearest surface is independent of enumeration order and glass precedes its wall', () => {
  const city = new CityExperiment();
  const hit = firstCityHit({ x: 0, y: 1, z: 2 }, { x: -10, y: 1, z: 2 }, 0.01, city.surfaces);
  assert.equal(hit?.surface.kind, 'glass');
  assert.equal(firstCityHit({ x: 0, y: 1, z: 2 }, { x: -10, y: 1, z: 2 }, 0.01, [...city.surfaces].reverse())?.surface.id, hit?.surface.id);
});
test('glancing impact uses normal energy; small hits do not accumulate into false breakage', () => {
  const city = new CityExperiment();
  const hit = { surface: pane, position: { x: 0, y: 1, z: -10 }, fraction: 0.5 };
  for (let i = 0; i < 100; i++) city.record(hit, 0.01, { x: 400, y: 0, z: -1 });
  assert.equal(city.damage.get('pane')?.state, 'marked');
  city.record(hit, 0.01, { x: 0, y: 0, z: -100 });
  assert.equal(city.damage.get('pane')?.state, 'broken');
  city.reset(); assert.equal(city.damage.size, 0);
});

function tomatoCloud() {
  const shot = simulateThrow({ vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 });
  const hit = shot.impact;
  const response = getImpactResponse({ massKg: shot.vegetable.massKg, speedKmh: hit.speedKmh, normalEnergyJ: hit.normalEnergyJ, kind: hit.kind, vegetableId: shot.vegetable.id, radiusM: shot.vegetable.radiusM });
  return createAftermath({ position: hit.contactPoint, velocity: hit.velocity, massKg: shot.vegetable.massKg, radiusM: shot.vegetable.radiusM, energyJ: hit.energyJ, vegetableId: shot.vegetable.id, response });
}
test('2000 km/h fragments reach city glass, stop, retain mass and lose kinetic energy', () => {
  const cloud = tomatoCloud(), city = new CityExperiment();
  const initialEnergy = cloud.kineticEnergyJ;
  stepAftermath(cloud, 3, city);
  assert.ok(city.summary.contacted > 0);
  assert.ok(city.summary.absorbedEnergyJ > 0);
  assert.ok(city.summary.absorbedEnergyJ < initialEnergy + cloud.totalMassKg * 9.80665 * 4);
  const caught = cloud.particles.filter(p => p.surfaceId);
  assert.ok(caught.length > 0);
  assert.ok(caught.every(p => p.landed && p.velocity.x === 0 && p.velocity.y === 0 && p.velocity.z === 0));
  assert.ok(Math.abs(cloud.particles.reduce((m, p) => m + p.massKg, 0) - 0.15) < 1e-12);
  const positions = caught.map(p => ({ ...p.position }));
  stepAftermath(cloud, 2, city);
  assert.deepEqual(caught.map(p => p.position), positions);
});
test('secondary impacts are identical at 30 fps and 144 fps', () => {
  const a = tomatoCloud(), b = tomatoCloud(), ca = new CityExperiment(), cb = new CityExperiment();
  for (let i = 0; i < 60; i++) stepAftermath(a, 1 / 30, ca);
  for (let i = 0; i < 288; i++) stepAftermath(b, 1 / 144, cb);
  assert.deepEqual(a.particles, b.particles);
  assert.deepEqual(ca.summary, cb.summary);
});
