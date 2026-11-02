import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlywoodBoard } from './world.ts';

test('a high energy impact opens a genuine hole through both faces and reset restores it', () => {
  const plywood = createPlywoodBoard();
  const mesh = plywood.group.getObjectByName('breakable-painted-plywood') as THREE.Mesh;
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  plywood.group.updateMatrixWorld(true);
  const triangles = mesh.geometry.getAttribute('position').count;
  assert.ok(ray.intersectObject(mesh).length > 0);
  plywood.setDamage(16000, 0, 1.6, { target: 'breached', holeRadiusM: 0.12, severity: 1 });
  plywood.group.updateMatrixWorld(true);
  assert.equal(ray.intersectObject(mesh).length, 0, 'front and backing must both be absent');
  assert.ok(mesh.geometry.getAttribute('position').count < triangles);
  ray.set(new THREE.Vector3(0.8, 0, 1), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(mesh).length > 0, 'the surrounding board remains');
  plywood.update(0.05);
  assert.ok(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite));
  plywood.reset();
  assert.equal(mesh.geometry.getAttribute('position').count, triangles);
  ray.set(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  assert.ok(ray.intersectObject(mesh).length > 0);
  plywood.dispose();
});

test('a dent or crack does not create a false through-hole', () => {
  const plywood = createPlywoodBoard();
  const mesh = plywood.group.getObjectByName('breakable-painted-plywood') as THREE.Mesh;
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1));
  for (const target of ['dent', 'cracked'] as const) {
    plywood.setDamage(300, 0, 1.6, { target, holeRadiusM: 0, severity: 0.6 });
    plywood.group.updateMatrixWorld(true);
    assert.ok(ray.intersectObject(mesh).length > 0);
  }
  plywood.dispose();
});
