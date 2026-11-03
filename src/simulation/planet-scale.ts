/** Reference comparisons only: no climate, radiation or impact propagation model. */
export const EARTH_MASS_KG = 5.9722e24;
export const EARTH_RADIUS_M = 6.371e6;
// Uniform-density approximation, NOT a catastrophic environmental-impact threshold.
export const EARTH_BINDING_J = 3 * 6.67430e-11 * EARTH_MASS_KG ** 2 / (5 * EARTH_RADIUS_M);
// LPI reference estimate ~100 million megatons TNT; highly event-dependent.
export const CHICXULUB_REFERENCE_J = 4.184e23;
export function planetScale(kineticEnergyJ: number) {
  if (!Number.isFinite(kineticEnergyJ) || kineticEnergyJ < 0) throw new RangeError('Finite nonnegative energy required');
  return {
    earthBindingFraction: kineticEnergyJ / EARTH_BINDING_J,
    chicxulubFraction: kineticEnergyJ / CHICXULUB_REFERENCE_J,
  };
}
