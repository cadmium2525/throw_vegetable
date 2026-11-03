import test from 'node:test';
import assert from 'node:assert/strict';
import { EARTH_BINDING_J, planetScale } from './planet-scale';
import { nearLightShot, NEAR_LIGHT_PRESETS } from './near-light';
import { VEGETABLES } from './physics';

test('current presets fall far short of planetary dispersal energy, without implying environmental safety', () => {
  assert.ok(EARTH_BINDING_J > 2.24e32 && EARTH_BINDING_J < 2.25e32);
  for (const v of VEGETABLES) for (const beta of NEAR_LIGHT_PRESETS) {
    const scale = planetScale(nearLightShot(v.massKg, beta).kineticEnergyJ);
    assert.ok(scale.earthBindingFraction > 0 && scale.earthBindingFraction < 2e-14);
    assert.ok(scale.chicxulubFraction < 1e-5);
  }
  assert.equal(planetScale(0).earthBindingFraction, 0);
  for (const invalid of [-1, Infinity, NaN]) assert.throws(() => planetScale(invalid));
});
