import { PHYSICS, type ThrowResult, type Vec3 } from './physics.ts';
export interface WaveEmission { time: number; position: Vec3; kind: 'flight' | 'impact' }
/** Weak-disturbance geometry only. A blunt vegetable's bow shock is not solved. */
export function machAngle(mach: number): number | null { return mach > 1 ? Math.asin(1 / mach) : null; }
export function waveRadius(emission: WaveEmission, time: number): number { return Math.max(0, time - emission.time) * PHYSICS.speedOfSound; }
export function createWaveEmissions(result: ThrowResult): WaveEmission[] {
  const samples = result.samples.filter(s => s.mach > 1);
  const waves: WaveEmission[] = [];
  // Bounded representative wavefronts, not a CFD pressure field.
  for (let i = 0; i < Math.min(18, samples.length); i++) {
    const sample = samples[Math.floor(i * (samples.length - 1) / Math.max(1, Math.min(18, samples.length) - 1))];
    waves.push({ time: sample.t, position: { ...sample.position }, kind: 'flight' });
  }
  if (result.impact.kind !== 'timeout' && result.impact.energyJ > 0) waves.push({ time: result.impact.time, position: { ...result.impact.contactPoint }, kind: 'impact' });
  return waves;
}
export function firstWaveArrival(waves: readonly WaveEmission[], observer: Vec3): number | null {
  if (!waves.length) return null;
  return Math.min(...waves.map(w => w.time + Math.hypot(observer.x - w.position.x, observer.y - w.position.y, observer.z - w.position.z) / PHYSICS.speedOfSound));
}
export function flightEnergyBudget(result: ThrowResult) {
  const initialHeight = result.samples[0].position.y;
  const gravityWorkJ = result.vegetable.massKg * PHYSICS.gravity * (initialHeight - result.impact.position.y);
  return { initialJ: result.initialEnergyJ, impactJ: result.impact.energyJ,
    dragWorkJ: Math.max(0, result.initialEnergyJ + gravityWorkJ - result.impact.energyJ), gravityWorkJ };
}
