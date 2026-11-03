import test from 'node:test';
import assert from 'node:assert/strict';
import { demolitionReach, demolitionPhase, demolitionScore, readSandboxRecords } from './demolition';
import { nearLightShot } from './near-light';

test('sandbox reach is bounded and monotonic, without substituting a physical damage radius', () => {
  assert.equal(demolitionReach(0), 0);
  let previous = 0;
  for (const energy of [1, 1e16, 1e17, 1e18, 1e20]) {
    const reach = demolitionReach(energy);
    assert.ok(reach >= previous && reach <= 110); previous = reach;
  }
  for (const bad of [-1, NaN, Infinity]) assert.throws(() => demolitionReach(bad));
  const energy = nearLightShot(0.15, 0.99).kineticEnergyJ;
  assert.equal(demolitionPhase(10, 0, energy, 'wall'), 0);
  assert.equal(demolitionPhase(10, 9, energy, 'wall'), 1);
  assert.equal(demolitionPhase(200, 9, energy, 'wall'), 0);
  assert.equal(demolitionScore({ buildings: 2, windows: 3, fixtures: 1 }), 255);
});
test('bad or outdated browser records cannot crash the experiment book', () => {
  for (const value of [null, '{bad', '{}', 'null', '[null,1,{}]']) assert.deepEqual(readSandboxRecords(value), []);
  const record = { key: 'tomato:0.99', vegetableId: 'tomato', beta: 0.99, score: 255, buildings: 2, windows: 3 };
  assert.deepEqual(readSandboxRecords(JSON.stringify([record])), [record]);
  assert.deepEqual(readSandboxRecords(JSON.stringify([{ ...record, beta: 1 }])), []);
});
