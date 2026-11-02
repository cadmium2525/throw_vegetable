/** Ground-frame kinematics only. No atmosphere, acceleration or damage model.
 * https://newt.phys.unsw.edu.au/einsteinlight/jw/module5_equations.htm
 */
export const LIGHT_SPEED_MS = 299_792_458;

export function relativisticMotion(massKg: number, speedMs: number, distanceM = 12) {
  if (!Number.isFinite(massKg) || massKg <= 0) throw new RangeError('Positive rest mass required.');
  if (!Number.isFinite(speedMs) || speedMs < 0 || speedMs >= LIGHT_SPEED_MS) {
    throw new RangeError('Massive objects require 0 <= v < c.');
  }
  if (!Number.isFinite(distanceM) || distanceM < 0) throw new RangeError('Nonnegative distance required.');
  const beta = speedMs / LIGHT_SPEED_MS;
  const inverseGamma = Math.sqrt((1 - beta) * (1 + beta));
  // Rationalized (gamma - 1) mc² avoids subtractive cancellation at low speed.
  const kineticEnergyJ = massKg * speedMs * speedMs / (inverseGamma * (1 + inverseGamma));
  return {
    beta, gamma: 1 / inverseGamma, kineticEnergyJ,
    momentumKgMs: massKg * speedMs / inverseGamma,
    vacuumTransitSeconds: distanceM === 0 ? 0 : speedMs === 0 ? null : distanceM / speedMs,
  };
}
