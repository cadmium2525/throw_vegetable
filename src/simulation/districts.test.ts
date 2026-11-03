import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICT_BUILDINGS, DISTRICT_AVENUES, DISTRICT_CROSS_STREETS, CITY_BUILDING_COUNT } from './districts';
import { createCitySurfaces, firstCityHit } from './city';

test('expanded city fills both axes, keeps its streets clear, and shares collision geometry', () => {
  const surfaces = createCitySurfaces();
  assert.equal(CITY_BUILDING_COUNT, 108);
  assert.equal(surfaces.filter(s => s.kind === 'wall').length, 108);
  assert.equal(new Set(surfaces.map(s => s.id)).size, surfaces.length);
  for (const b of DISTRICT_BUILDINGS) {
    assert.ok(Math.abs(b.x) - b.width / 2 > 10.4);
    for (const x of DISTRICT_AVENUES) assert.ok(Math.abs(b.x - x) >= b.width / 2 + 3);
    for (const z of DISTRICT_CROSS_STREETS) assert.ok(Math.abs(b.z - z) >= b.depth / 2 + 2);
    const surface = surfaces.find(s => s.id === b.id)!;
    assert.equal(surface.max.y, b.height);
    assert.equal(surface.max.x - surface.min.x, b.width);
    assert.ok(firstCityHit({ x: b.x - b.width, y: 2, z: b.z }, { x: b.x, y: 2, z: b.z }, 0.01, [surface]));
  }
  for (let i = 0; i < DISTRICT_BUILDINGS.length; i++) for (let j = i + 1; j < DISTRICT_BUILDINGS.length; j++) {
    const a = DISTRICT_BUILDINGS[i], b = DISTRICT_BUILDINGS[j];
    assert.ok(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 || Math.abs(a.z - b.z) >= (a.depth + b.depth) / 2);
  }
});
