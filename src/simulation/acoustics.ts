import { PHYSICS, type Vec3 } from './physics.ts';

export interface AcousticPulse {
  origin: Vec3;
  emissionTime: number;
  acousticEnergyJ: number;
  durationSeconds: number;
  minimumRangeM: number;
}
/** Conditional free-field weak-wave estimate, not a calibrated sonic-boom law.
 * E = 4πr²/(ρc) ∫p²dt. A zero-mean N pulse has ∫p²dt = A² τ / 3.
 */
export function impactPulse(energyJ: number, origin: Vec3, emissionTime: number, sourceRadiusM: number, efficiency = 0.001, durationSeconds = 0.001): AcousticPulse {
  if (![energyJ, origin.x, origin.y, origin.z, emissionTime, sourceRadiusM, efficiency, durationSeconds].every(Number.isFinite)
    || energyJ < 0 || emissionTime < 0 || sourceRadiusM <= 0 || efficiency < 0 || efficiency > 1 || durationSeconds <= 0) throw new RangeError('Invalid acoustic source.');
  return { origin: { ...origin }, emissionTime, acousticEnergyJ: energyJ * efficiency,
    durationSeconds, minimumRangeM: Math.max(0.25, sourceRadiusM * 10) };
}
export function pressureAt(pulse: AcousticPulse, observer: Vec3, time: number) {
  const distance = Math.hypot(observer.x - pulse.origin.x, observer.y - pulse.origin.y, observer.z - pulse.origin.z);
  if (distance < pulse.minimumRangeM) return null;
  const arrivalSeconds = pulse.emissionTime + distance / PHYSICS.speedOfSound;
  const peakPa = Math.sqrt(3 * PHYSICS.airDensity * PHYSICS.speedOfSound * pulse.acousticEnergyJ / (4 * Math.PI * distance ** 2 * pulse.durationSeconds));
  const phase = (time - arrivalSeconds) / pulse.durationSeconds;
  return { arrivalSeconds, peakPa, pressurePa: phase >= 0 && phase <= 1 ? peakPa * (1 - 2 * phase) : 0 };
}
