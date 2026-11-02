import { PHYSICS, type Vec3 } from './physics.ts';
import { IMPACT_MODEL, type ImpactResponse } from './impact.ts';

/** Explicit visual assumptions, not a validated penetration/fragmentation law. */
export const AFTERMATH_MODEL = Object.freeze({
  stepSeconds: 1 / 240,
  maximumParticles: 240,
  densityKgM3: 950,
  dragCoefficient: 0.7,
  forwardMassFraction: 0.55,
  backsplashMassFraction: 0.25,
  depositMassFraction: 0.20,
  forwardEnergyFraction: 0.30,
  backsplashEnergyFraction: 0.03,
  blockedSplashEnergyFraction: 0.045,
});

export interface AftermathInput {
  /** Contact surface position, in metres. */
  position: Vec3;
  /** Actual pre-contact velocity, in m/s. */
  velocity: Vec3;
  massKg: number;
  radiusM: number;
  vegetableId: string;
  energyJ: number;
  response: ImpactResponse;
  seed?: number;
  /** Defaults to the target. Ground impacts never emit through the target. */
  kind?: 'target' | 'ground';
}

export interface AftermathParticle {
  id: number;
  position: Vec3;
  velocity: Vec3;
  massKg: number;
  radiusM: number;
  kind: 'forward' | 'splash' | 'deposit';
  /** At rest on the ground, or adhering to the target for a deposit. */
  landed: boolean;
}

export interface AftermathCloud {
  particles: AftermathParticle[];
  totalMassKg: number;
  forwardMassKg: number;
  backsplashMassKg: number;
  depositedMassKg: number;
  /** Emitted translational energy; fixed at creation, before later gravity. */
  residualEnergyJ: number;
  incomingEnergyJ: number;
  dissipatedEnergyJ: number;
  /** Current translational kinetic energy; changes during the flight. */
  kineticEnergyJ: number;
  elapsedSeconds: number;
  accumulatorSeconds: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const lengthSquared = (value: Vec3) => value.x * value.x + value.y * value.y + value.z * value.z;
const isVector = (value: Vec3) => [value.x, value.y, value.z].every(Number.isFinite);
const particleEnergy = (particle: AftermathParticle) => 0.5 * particle.massKg * lengthSquared(particle.velocity);

function seededRandom(seed: number) {
  let sequence = seed >>> 0;
  return () => {
    sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0;
    return sequence / 4294967296;
  };
}

function stableSeed(input: AftermathInput) {
  if (input.seed !== undefined) return input.seed;
  let hash = 2166136261;
  for (const character of input.vegetableId) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash ^ Math.round(input.energyJ * 100) ^ Math.round(input.massKg * 10000)) >>> 0;
}

function normalizeGroupEnergy(particles: AftermathParticle[], assignedEnergyJ: number) {
  const rawEnergy = particles.reduce((sum, particle) => sum + particleEnergy(particle), 0);
  const correction = rawEnergy > 0 ? Math.sqrt(assignedEnergyJ / rawEnergy) : 0;
  for (const particle of particles) {
    particle.velocity.x *= correction;
    particle.velocity.y *= correction;
    particle.velocity.z *= correction;
  }
}

/**
 * Account for all vegetable mass as forward fragments, backsplash and material
 * left at the contact surface. Fractions are assumptions, not solved outcomes.
 */
export function createAftermath(input: AftermathInput): AftermathCloud {
  if (!isVector(input.position) || !isVector(input.velocity)) throw new RangeError('Aftermath vectors must be finite.');
  if (!Number.isFinite(input.massKg) || input.massKg <= 0) throw new RangeError('Aftermath mass must be positive.');
  if (!Number.isFinite(input.radiusM) || input.radiusM <= 0) throw new RangeError('Aftermath radius must be positive.');
  if (!Number.isFinite(input.energyJ) || input.energyJ < 0) throw new RangeError('Aftermath energy must be nonnegative.');
  if (input.seed !== undefined && !Number.isFinite(input.seed)) throw new RangeError('Aftermath seed must be finite.');
  if (!Number.isFinite(input.response.fragmentCount) || input.response.fragmentCount < 0
    || !Number.isFinite(input.response.holeRadiusM) || input.response.holeRadiusM < 0) {
    throw new RangeError('Aftermath fragment count and aperture radius must be finite and nonnegative.');
  }
  const random = seededRandom(stableSeed(input));
  const ground = input.kind === 'ground';
  const breached = !ground && input.response.target === 'breached';
  const broken = input.response.vegetable !== 'intact' || breached;
  const incomingEnergyJ = Math.min(input.energyJ, 0.5 * input.massKg * lengthSquared(input.velocity));
  const forwardMassKg = breached ? input.massKg * AFTERMATH_MODEL.forwardMassFraction : 0;
  const backsplashMassKg = broken ? input.massKg * (breached ? AFTERMATH_MODEL.backsplashMassFraction : 1 - AFTERMATH_MODEL.depositMassFraction) : 0;
  const depositedMassKg = input.massKg - forwardMassKg - backsplashMassKg;
  const desiredCount = broken
    ? clamp(Math.round(input.response.fragmentCount * (input.response.vegetable === 'pulverized' ? 1.7 : 2)), 24, AFTERMATH_MODEL.maximumParticles)
    : 1;
  const forwardCount = breached ? Math.max(1, Math.floor(desiredCount * AFTERMATH_MODEL.forwardMassFraction)) : 0;
  const splashCount = broken ? Math.max(1, Math.floor(desiredCount * (breached ? AFTERMATH_MODEL.backsplashMassFraction : 1 - AFTERMATH_MODEL.depositMassFraction))) : 0;
  const depositCount = desiredCount - forwardCount - splashCount;
  const directionLength = Math.sqrt(lengthSquared(input.velocity));
  const incomingDirection = directionLength > 0
    ? { x: input.velocity.x / directionLength, y: input.velocity.y / directionLength, z: input.velocity.z / directionLength }
    : { x: 0, y: 0, z: -1 };
  const holeRadius = Math.max(input.response.holeRadiusM || 0, input.radiusM * 0.3, 0.004);
  const particles: AftermathParticle[] = [];

  function emitGroup(kind: AftermathParticle['kind'], count: number, groupMass: number) {
    const group: AftermathParticle[] = [];
    let assignedMass = 0;
    for (let index = 0; index < count; index++) {
      const massKg = index === count - 1 ? groupMass - assignedMass : groupMass / count;
      assignedMass += massKg;
      // Equal-density spherical parcels: all represented mass remains present.
      let radiusM = Math.cbrt(3 * massKg / (4 * Math.PI * AFTERMATH_MODEL.densityKgM3));
      if (kind === 'forward') radiusM = Math.min(radiusM, holeRadius * 0.4);
      const angle = random() * Math.PI * 2;
      const fraction = Math.sqrt(random());
      const position = { ...input.position };
      let velocity: Vec3 = { x: 0, y: 0, z: 0 };
      let landed = kind === 'deposit';
      if (kind === 'forward') {
        // Start fully behind the 12 mm sheet, inside its now-open aperture.
        const spread = Math.max(0, holeRadius - radiusM - 0.001) * fraction * 0.75;
        position.x += Math.cos(angle) * spread;
        position.y += Math.sin(angle) * spread;
        position.z = Math.min(-PHYSICS.targetDistance - 0.02, -PHYSICS.targetDistance - IMPACT_MODEL.targetThicknessM - radiusM - 0.001);
        const variation = 0.65 + random() * 0.7;
        velocity = {
          x: (incomingDirection.x * 1.1 + Math.cos(angle) * (0.035 + random() * 0.11)) * variation,
          y: (incomingDirection.y * 1.1 + Math.sin(angle) * (0.035 + random() * 0.11)) * variation,
          z: -(Math.max(0.2, Math.abs(incomingDirection.z)) * variation),
        };
      } else if (kind === 'splash') {
        const spread = input.radiusM * fraction * 0.6;
        position.x += Math.cos(angle) * spread;
        if (ground) {
          position.y = radiusM + 0.001;
          position.z += Math.sin(angle) * spread;
          velocity = { x: Math.cos(angle) * (0.3 + random()), y: 0.3 + random() * 0.5, z: Math.sin(angle) * (0.3 + random()) };
        } else {
          position.y += Math.sin(angle) * spread;
          position.z = -PHYSICS.targetDistance + radiusM + 0.002;
          velocity = { x: Math.cos(angle) * (0.3 + random()), y: Math.sin(angle) * (0.3 + random()) + 0.12, z: 0.25 + random() * 0.4 };
        }
      } else if (ground) {
        position.x += Math.cos(angle) * input.radiusM * fraction * 1.6;
        position.z += Math.sin(angle) * input.radiusM * fraction * 1.6;
        position.y = radiusM;
      } else {
        // Deposits sit on surviving front-face material rather than fill the
        // aperture. They adhere as wet pulp until the next throw clears them.
        const spread = (breached ? holeRadius + radiusM + 0.006 : input.radiusM * 0.2) + input.radiusM * fraction * 0.7;
        position.x += Math.cos(angle) * spread;
        position.y += Math.sin(angle) * spread;
        position.z = -PHYSICS.targetDistance + radiusM + 0.002;
        const supported = () => Math.hypot(position.x, position.y - PHYSICS.targetCenterY)
          <= PHYSICS.targetRadius - radiusM - 0.002
          && (!breached || Math.hypot(position.x - input.position.x, position.y - input.position.y)
            >= holeRadius + radiusM + 0.003);
        // A near-rim impact must not leave a wet parcel floating outside the
        // board or in its aperture. Try the local ring first, then the disk.
        for (let attempt = 0; !supported() && attempt < 96; attempt++) {
          const candidateAngle = random() * Math.PI * 2;
          if (attempt < 48) {
            const distance = (breached ? holeRadius + radiusM + 0.006 : radiusM * 1.2)
              + input.radiusM * random() * 1.2;
            position.x = input.position.x + Math.cos(candidateAngle) * distance;
            position.y = input.position.y + Math.sin(candidateAngle) * distance;
          } else {
            const distance = Math.sqrt(random()) * Math.max(0, PHYSICS.targetRadius - radiusM - 0.003);
            position.x = Math.cos(candidateAngle) * distance;
            position.y = PHYSICS.targetCenterY + Math.sin(candidateAngle) * distance;
          }
        }
        if (!supported()) {
          // An unsupported parcel falls instead of attaching to empty space.
          landed = false;
          velocity = { x: 0, y: 0, z: 0 };
        }
      }
      if (position.y < radiusM) {
        position.y = radiusM;
        if (kind !== 'deposit' && velocity.y <= 0) {
          velocity = { x: 0, y: 0, z: 0 };
          landed = true;
        }
      }
      const particle: AftermathParticle = { id: particles.length, position, velocity, massKg, radiusM, kind, landed };
      particles.push(particle);
      group.push(particle);
    }
    return group;
  }

  const forward = emitGroup('forward', forwardCount, forwardMassKg);
  const splash = emitGroup('splash', splashCount, backsplashMassKg);
  emitGroup('deposit', depositCount, depositedMassKg);
  normalizeGroupEnergy(forward, breached ? incomingEnergyJ * AFTERMATH_MODEL.forwardEnergyFraction : 0);
  normalizeGroupEnergy(splash, incomingEnergyJ * (breached ? AFTERMATH_MODEL.backsplashEnergyFraction : AFTERMATH_MODEL.blockedSplashEnergyFraction));
  const residualEnergyJ = particles.reduce((sum, particle) => sum + particleEnergy(particle), 0);
  return {
    particles,
    totalMassKg: input.massKg,
    forwardMassKg,
    backsplashMassKg,
    depositedMassKg,
    residualEnergyJ,
    incomingEnergyJ,
    dissipatedEnergyJ: Math.max(0, incomingEnergyJ - residualEnergyJ),
    kineticEnergyJ: residualEnergyJ,
    elapsedSeconds: 0,
    accumulatorSeconds: 0,
  };
}

function integrateParticle(particle: AftermathParticle, dt: number) {
  if (particle.landed) return;
  const previousPosition = { ...particle.position };
  const previousVelocity = { ...particle.velocity };
  // Strang splitting: half gravity, exact drag-only velocity solution, half
  // gravity. Small fixed substeps make results independent of render frames.
  particle.velocity.y -= PHYSICS.gravity * dt / 2;
  const speed = Math.sqrt(lengthSquared(particle.velocity));
  const drag = 0.5 * PHYSICS.airDensity * AFTERMATH_MODEL.dragCoefficient
    * Math.PI * particle.radiusM * particle.radiusM / particle.massKg;
  const decay = 1 / (1 + drag * speed * dt);
  particle.velocity.x *= decay;
  particle.velocity.y *= decay;
  particle.velocity.z *= decay;
  particle.velocity.y -= PHYSICS.gravity * dt / 2;
  particle.position.x += (previousVelocity.x + particle.velocity.x) * dt / 2;
  particle.position.y += (previousVelocity.y + particle.velocity.y) * dt / 2;
  particle.position.z += (previousVelocity.z + particle.velocity.z) * dt / 2;
  if (particle.position.y <= particle.radiusM) {
    const fraction = clamp((previousPosition.y - particle.radiusM) / (previousPosition.y - particle.position.y || 1), 0, 1);
    particle.position.x = previousPosition.x + (particle.position.x - previousPosition.x) * fraction;
    particle.position.z = previousPosition.z + (particle.position.z - previousPosition.z) * fraction;
    particle.position.y = particle.radiusM;
    particle.velocity = { x: 0, y: 0, z: 0 };
    particle.landed = true;
  }
}

/** Mutates in place. Nothing expires: landed particles stay until cleared. */
export function stepAftermath(cloud: AftermathCloud, dt: number): void {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Aftermath time step must be finite and nonnegative.');
  cloud.accumulatorSeconds += dt;
  const step = AFTERMATH_MODEL.stepSeconds;
  while (cloud.accumulatorSeconds + 1e-12 >= step) {
    for (const particle of cloud.particles) integrateParticle(particle, step);
    cloud.accumulatorSeconds = Math.max(0, cloud.accumulatorSeconds - step);
    cloud.elapsedSeconds += step;
  }
  cloud.kineticEnergyJ = cloud.particles.reduce((sum, particle) => sum + particleEnergy(particle), 0);
}

/** Mass-weighted location, including fragments that have already landed. */
export function getForwardCentroid(cloud: AftermathCloud): Vec3 | null {
  if (cloud.forwardMassKg <= 0) return null;
  let mass = 0;
  const position = { x: 0, y: 0, z: 0 };
  for (const particle of cloud.particles) {
    if (particle.kind !== 'forward') continue;
    mass += particle.massKg;
    position.x += particle.position.x * particle.massKg;
    position.y += particle.position.y * particle.massKg;
    position.z += particle.position.z * particle.massKg;
  }
  if (mass === 0) return null;
  return { x: position.x / mass, y: position.y / mass, z: position.z / mass };
}
