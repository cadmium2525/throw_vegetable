/** Calorically perfect air. Normal-shock / isentropic relations, NASA NACA 1135. */
export const AIR = Object.freeze({ gamma: 1.4, pressurePa: 101325, temperatureK: 288.15, soundSpeed: 340.294 });
export function airFlow(speedMs: number) {
  if (!Number.isFinite(speedMs) || speedMs < 0) throw new RangeError('Air speed must be finite and nonnegative.');
  const mach = speedMs / AIR.soundSpeed;
  const g = AIR.gamma, m2 = mach * mach;
  const shockPressureRatio = mach > 1 ? (2 * g * m2 - (g - 1)) / (g + 1) : 1;
  const shockDensityRatio = mach > 1 ? (g + 1) * m2 / ((g - 1) * m2 + 2) : 1;
  const downstreamMachSquared = mach > 1 ? ((g - 1) * m2 + 2) / (2 * g * m2 - (g - 1)) : m2;
  const stagnationPressurePa = AIR.pressurePa * shockPressureRatio * (1 + (g - 1) / 2 * downstreamMachSquared) ** (g / (g - 1));
  return {
    mach, shockPressureRatio, shockDensityRatio,
    downstreamMach: Math.sqrt(downstreamMachSquared),
    shockPressureRisePa: AIR.pressurePa * (shockPressureRatio - 1),
    shockAirTemperatureK: AIR.temperatureK * shockPressureRatio / shockDensityRatio,
    stagnationGaugePa: stagnationPressurePa - AIR.pressurePa,
    stagnationAirTemperatureK: AIR.temperatureK * (1 + (g - 1) / 2 * m2),
  };
}

export interface BreakupSettings { strengthPa: number; fragmentCount: number }
/** Sensitivity model only: NOT a measured whole-vegetable failure law. */
export const DEFAULT_BREAKUP: Readonly<BreakupSettings> = Object.freeze({ strengthPa: 150_000, fragmentCount: 32 });
export function breakupRate(speedMs: number, radiusM: number, massKg: number, strengthPa: number): number {
  // Air pressure is a loading scale, not the internally resolved solid stress.
  const excess = Math.max(0, airFlow(speedMs).stagnationGaugePa / strengthPa - 1);
  const density = massKg / (4 / 3 * Math.PI * radiusM ** 3);
  const responseTime = 2 * radiusM / Math.max(speedMs, 1) * Math.sqrt(density / 1.225);
  return excess / Math.max(responseTime, 1e-6);
}
