import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCityView } from './city.ts';
import { CityExperiment } from '../simulation/city.ts';
import { simulateThrow, PHYSICS } from '../simulation/physics.ts';

test('street collision surfaces match rendered boxes in metres', () => {
  const scene = new THREE.Scene(), city = new CityExperiment();
  const view = createCityView(scene, city);
  scene.updateMatrixWorld(true);
  for (const surface of city.surfaces) {
    const mesh = scene.getObjectByName(surface.id)!;
    assert.ok(mesh);
    const bounds = new THREE.Box3().setFromObject(mesh);
    for (const axis of ['x', 'y', 'z'] as const) {
      assert.ok(Math.abs(bounds.min[axis] - surface.min[axis]) < 1e-8);
      assert.ok(Math.abs(bounds.max[axis] - surface.max[axis]) < 1e-8);
    }
  }
  view.dispose(); assert.equal(scene.children.length, 0);
});
test('new experiment restores window and wall materials and fracture lines', () => {
  const scene = new THREE.Scene(), city = new CityExperiment();
  const view = createCityView(scene, city);
  const pane = city.surfaces.find(s => s.kind === 'glass')!;
  const wall = city.surfaces.find(s => s.kind === 'wall')!;
  const paneMesh = scene.getObjectByName(pane.id) as THREE.Mesh;
  const wallMesh = scene.getObjectByName(wall.id) as THREE.Mesh;
  const originalPane = paneMesh.material, originalWall = wallMesh.material;
  for (const surface of [pane, wall]) city.record({ surface, fraction: 0.5, position: surface.min }, 0.1, { x: 100, y: 0, z: -100 });
  view.update(0.1);
  assert.notEqual(paneMesh.material, originalPane);
  assert.notEqual(wallMesh.material, originalWall);
  city.reset(); view.reset(); view.update(0);
  assert.equal(paneMesh.material, originalPane);
  assert.equal(wallMesh.material, originalWall);
  scene.traverse(o => { if (o instanceof THREE.LineSegments) assert.equal(o.visible, false); });
  view.dispose();
});
test('wave geometry uses simulation time and wave toggle hides it without changing arrival times', () => {
  const scene = new THREE.Scene(), city = new CityExperiment();
  const view = createCityView(scene, city);
  view.start(simulateThrow({ vegetableId: 'tomato', speedKmh: 2000, angleDeg: 2 }));
  view.update(0.01);
  const spheres: THREE.Mesh[] = [];
  scene.traverse(o => { if (o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry) spheres.push(o); });
  assert.ok(Math.abs(spheres[0].scale.x - PHYSICS.speedOfSound * 0.01) < 1e-10);
  assert.ok(spheres[0].visible);
  const arrivals = [...view.arrivals];
  view.setWaves(false); view.update(0.02);
  assert.ok(spheres.every(s => !s.visible));
  assert.deepEqual(view.arrivals, arrivals);
  view.dispose();
});
