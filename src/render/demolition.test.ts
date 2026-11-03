import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCityView } from './city';
import { createDemolitionView } from './demolition';
import { CityExperiment } from '../simulation/city';
import { nearLightShot } from '../simulation/near-light';

test('collapse is seekable, instanced and fully reversible, including roof/window decorations', () => {
  const scene = new THREE.Scene();
  const city = createCityView(scene, new CityExperiment());
  const root = scene.getObjectByName('urban-experiment')!;
  const initial = root.children.map(mesh => ({ mesh, visible: mesh.visible, position: mesh.position.clone(), scale: mesh.scale.clone() }));
  const demolition = createDemolitionView(scene);
  const energy = nearLightShot(0.15, 0.99).kineticEnergyJ;
  const final = demolition.update(9, energy, true, false);
  assert.ok(final.buildings >= 4 && final.windows >= 12);
  const owners = root.children.filter(o => o.userData.buildingOwner === 'wall--1-0');
  assert.ok(owners.length > 2 && owners.every(o => !o.visible));
  demolition.update(9, energy, true, true);
  initial.forEach(({ mesh, visible }) => assert.equal(mesh.visible, visible));
  demolition.update(0, energy, true, false);
  initial.forEach(({ mesh, visible }) => assert.equal(mesh.visible, visible));
  for (let t = 0; t <= 9; t += 1 / 60) demolition.update(t, energy, true, false);
  assert.deepEqual(demolition.update(9, energy, true, false), final, 'scrub and uninterrupted playback agree');
  const rubble = scene.getObjectByName('sandbox-rubble')!;
  assert.equal(rubble.children.filter(o => o instanceof THREE.InstancedMesh).length, 3);
  const matrix = new THREE.Matrix4();
  rubble.traverse(o => {
    if (!(o instanceof THREE.InstancedMesh)) return;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, matrix); assert.ok(matrix.elements.every(Number.isFinite)); }
  });
  demolition.reset();
  initial.forEach(({ mesh, visible, position, scale }) => {
    assert.equal(mesh.visible, visible); assert.deepEqual(mesh.position, position); assert.deepEqual(mesh.scale, scale);
  });
  assert.deepEqual(demolition.update(9, energy, false, false), { buildings: 0, windows: 0, fixtures: 0, score: 0 });
  demolition.dispose(); city.dispose(); assert.equal(scene.children.length, 0);
});
