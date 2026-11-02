import assert from 'node:assert/strict';
import test from 'node:test';
import { AFTERMATH_MODEL, createAftermath, getForwardCentroid, stepAftermath, type AftermathCloud, type AftermathInput } from './aftermath.ts';
import { type ImpactResponse } from './impact.ts';
import { PHYSICS } from './physics.ts';

const breached: ImpactResponse = { vegetable: 'pulverized', target: 'breached', severity: 1, holeRadiusM: 0.11, fragmentCount: 120 };
const base: AftermathInput = { position: { x: 0, y: 2, z: -12 }, velocity: { x: 0, y: 15, z: -465 }, massKg: 0.15, radiusM: 0.035, vegetableId: 'tomato', energyJ: 16000, response: breached, seed: 2026 };
const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const sumMass = (cloud: AftermathCloud) => cloud.particles.reduce((sum, particle) => sum + particle.massKg, 0);
const kinetic = (cloud: AftermathCloud) => cloud.particles.reduce((sum, particle) => sum + 0.5 * particle.massKg * (particle.velocity.x ** 2 + particle.velocity.y ** 2 + particle.velocity.z ** 2), 0);
const mechanical = (cloud: AftermathCloud) => kinetic(cloud) + cloud.particles.reduce((sum, particle) => sum + particle.massKg * PHYSICS.gravity * particle.position.y, 0);

test('all mass remains represented in the explicit 55/25/20 breached split', () => {
  for (const massKg of [0.12, 0.15, 0.2, 0.23, 1, 2]) {
    const cloud = createAftermath({ ...base, massKg });
    close(sumMass(cloud), massKg);
    close(cloud.forwardMassKg, massKg * 0.55);
    close(cloud.backsplashMassKg, massKg * 0.25);
    close(cloud.depositedMassKg, massKg * 0.20);
    for (const [kind, fraction] of [['forward', 0.55], ['splash', 0.25], ['deposit', 0.20]] as const) {
      close(cloud.particles.filter(particle => particle.kind === kind).reduce((sum, particle) => sum + particle.massKg, 0), massKg * fraction);
    }
    assert.ok(cloud.particles.length <= AFTERMATH_MODEL.maximumParticles);
    assert.ok(cloud.particles.every(particle => particle.massKg > 0 && particle.radiusM > 0));
  }
});

test('forward fragments start behind the board, fit the opening and retain forward direction', () => {
  const cloud = createAftermath(base);
  const forward = cloud.particles.filter(particle => particle.kind === 'forward');
  assert.ok(forward.length > 0);
  for (const particle of forward) {
    assert.ok(particle.velocity.z < 0);
    assert.ok(particle.position.z <= -12.02);
    assert.ok(particle.position.z + particle.radiusM <= -12 - 0.012);
    assert.ok(Math.hypot(particle.position.x - base.position.x, particle.position.y - base.position.y) + particle.radiusM < breached.holeRadiusM);
  }
  const centroid = getForwardCentroid(cloud)!;
  const initialZ = centroid.z;
  stepAftermath(cloud, 1 / 30);
  assert.ok(getForwardCentroid(cloud)!.z < initialZ - 1);
});

test('emitted kinetic energy is capped and explicitly partitions available impact energy', () => {
  const cloud = createAftermath(base);
  close(kinetic(cloud), base.energyJ * 0.33, 1e-8);
  close(cloud.residualEnergyJ, kinetic(cloud), 1e-8);
  close(cloud.residualEnergyJ + cloud.dissipatedEnergyJ, cloud.incomingEnergyJ, 1e-8);
  assert.ok(cloud.residualEnergyJ <= cloud.incomingEnergyJ);
  const limited = createAftermath({ ...base, energyJ: 10 });
  close(limited.residualEnergyJ, 3.3, 1e-10);
  const velocityLimited = createAftermath({ ...base, velocity: { x: 0, y: 0, z: -1 }, energyJ: 1e9 });
  close(velocityLimited.incomingEnergyJ, 0.5 * base.massKg);
  assert.ok(velocityLimited.residualEnergyJ <= velocityLimited.incomingEnergyJ);
});

test('an unbreached board emits no forward mass and never teleports matter behind it', () => {
  const cloud = createAftermath({ ...base, response: { ...breached, target: 'cracked', holeRadiusM: 0 } });
  assert.equal(cloud.forwardMassKg, 0);
  assert.equal(getForwardCentroid(cloud), null);
  close(sumMass(cloud), base.massKg);
  assert.ok(cloud.particles.every(particle => particle.kind !== 'forward' && particle.position.z - particle.radiusM >= -12));
  for (let index = 0; index < 120; index++) stepAftermath(cloud, 1 / 60);
  assert.ok(cloud.particles.every(particle => particle.position.z >= -12));
});

test('near-rim deposits adhere only to surviving board material outside the aperture', () => {
  const position = { x: 0.1, y: PHYSICS.targetCenterY + 1.24, z: -12 };
  const cloud = createAftermath({ ...base, position, massKg: 2, radiusM: 0.13, vegetableId: 'pumpkin', response: { ...breached, holeRadiusM: 0.48 } });
  const deposits = cloud.particles.filter(particle => particle.kind === 'deposit');
  assert.ok(deposits.length > 0);
  assert.ok(deposits.every(particle => particle.landed));
  for (const particle of deposits) {
    assert.ok(Math.hypot(particle.position.x, particle.position.y - PHYSICS.targetCenterY) + particle.radiusM < PHYSICS.targetRadius);
    assert.ok(Math.hypot(particle.position.x - position.x, particle.position.y - position.y) - particle.radiusM > 0.48);
  }
  close(sumMass(cloud), 2);
});

test('ground impact fragments remain at the ground contact location, away from the target', () => {
  const cloud = createAftermath({ ...base, position: { x: 2, y: 0, z: -4 }, kind: 'ground' });
  assert.equal(cloud.forwardMassKg, 0);
  assert.ok(cloud.particles.every(particle => Math.abs(particle.position.z + 4) < base.radiusM * 2));
  assert.ok(cloud.particles.every(particle => particle.position.y >= particle.radiusM));
  close(sumMass(cloud), base.massKg);
});

test('intact low-energy matter is retained as one resting parcel, without an explosion', () => {
  const cloud = createAftermath({ ...base, position: { x: 0, y: 0, z: 0 }, kind: 'ground', energyJ: 2, response: { ...breached, vegetable: 'intact', target: 'none', fragmentCount: 0 } });
  assert.equal(cloud.particles.length, 1);
  assert.equal(cloud.particles[0].landed, true);
  assert.equal(cloud.particles[0].kind, 'deposit');
  assert.equal(cloud.particles[0].massKg, base.massKg);
  assert.equal(cloud.residualEnergyJ, 0);
});

test('render frame rates 30 and 120 Hz produce identical fixed-step trajectories', () => {
  const slow = createAftermath(base);
  const fast = createAftermath(base);
  for (let index = 0; index < 90; index++) stepAftermath(slow, 1 / 30);
  for (let index = 0; index < 360; index++) stepAftermath(fast, 1 / 120);
  close(slow.elapsedSeconds, fast.elapsedSeconds);
  for (let index = 0; index < slow.particles.length; index++) {
    assert.deepEqual(slow.particles[index], fast.particles[index]);
  }
});

test('landed and deposited material persists without deletion or movement', () => {
  const cloud = createAftermath(base);
  const count = cloud.particles.length;
  stepAftermath(cloud, 30);
  assert.ok(cloud.particles.every(particle => particle.landed));
  assert.ok(cloud.particles.every(particle => particle.position.y >= particle.radiusM));
  const snapshot = structuredClone(cloud.particles);
  stepAftermath(cloud, 10);
  assert.equal(cloud.particles.length, count);
  assert.deepEqual(cloud.particles, snapshot);
  close(sumMass(cloud), base.massKg);
  assert.equal(cloud.kineticEnergyJ, 0);
});

test('quadratic drag and inelastic ground contact dissipate mechanical energy', () => {
  const cloud = createAftermath(base);
  let previous = mechanical(cloud);
  for (let index = 0; index < 120; index++) {
    stepAftermath(cloud, 1 / 60);
    const energy = mechanical(cloud);
    assert.ok(energy <= previous + 1e-6, `${energy} > ${previous}`);
    previous = energy;
  }
});

test('vertical parcel fall matches the independent analytic quadratic-drag solution', () => {
  const radiusM = 0.005;
  const massKg = 4 / 3 * Math.PI * radiusM ** 3 * AFTERMATH_MODEL.densityKgM3;
  const cloud = createAftermath({ ...base, massKg, radiusM, energyJ: 0, kind: 'ground', response: { ...breached, vegetable: 'intact', target: 'none', fragmentCount: 0 } });
  const particle = cloud.particles[0];
  particle.position = { x: 0, y: 10, z: 0 };
  particle.velocity = { x: 0, y: 0, z: 0 };
  particle.landed = false;
  const drag = 0.5 * PHYSICS.airDensity * AFTERMATH_MODEL.dragCoefficient * Math.PI * radiusM ** 2 / massKg;
  const terminalSpeed = Math.sqrt(PHYSICS.gravity / drag);
  const expectedSpeed = terminalSpeed * Math.tanh(Math.sqrt(PHYSICS.gravity * drag));
  const expectedDrop = Math.log(Math.cosh(Math.sqrt(PHYSICS.gravity * drag))) / drag;
  stepAftermath(cloud, 1);
  close(particle.position.y, 10 - expectedDrop, 5e-5);
  close(particle.velocity.y, -expectedSpeed, 5e-5);
});

test('emission is deterministic and keeps caller-owned vectors unchanged', () => {
  const input = structuredClone(base);
  const original = structuredClone(input);
  const first = createAftermath(input);
  const second = createAftermath(input);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.particles, createAftermath({ ...input, seed: 12 }).particles);
  stepAftermath(first, 1);
  assert.deepEqual(input, original);
});

test('nonfinite inputs and invalid time steps are rejected', () => {
  assert.throws(() => createAftermath({ ...base, massKg: 0 }), RangeError);
  assert.throws(() => createAftermath({ ...base, radiusM: Number.NaN }), RangeError);
  assert.throws(() => createAftermath({ ...base, velocity: { x: 0, y: Number.POSITIVE_INFINITY, z: -10 } }), RangeError);
  assert.throws(() => createAftermath({ ...base, energyJ: -1 }), RangeError);
  const cloud = createAftermath(base);
  assert.throws(() => stepAftermath(cloud, -1), RangeError);
  assert.throws(() => stepAftermath(cloud, Number.NaN), RangeError);
});
