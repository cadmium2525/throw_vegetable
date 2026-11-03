import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createVegetableDebris } from './vegetable-fragments.ts';

const vegetables = ['tomato', 'carrot', 'cucumber', 'eggplant', 'pumpkin', 'cabbage'];
const parcels = Array.from({ length: 120 }, (_, i) => ({ radiusM: 0.005 + i % 5 * 0.002, kind: i % 3 ? 'splash' : 'deposit' }));

test('vegetable debris uses finite anatomical geometry and a small number of instanced draws', () => {
  const fingerprints = new Set<string>();
  for (const vegetable of vegetables) {
    const debris = createVegetableDebris(vegetable, parcels, 0x7b5f3f);
    assert.ok(debris.root.children.length >= 2 && debris.root.children.length <= 4);
    let represented = 0;
    const fingerprint: number[] = [];
    for (const child of debris.root.children) {
      assert.ok(child instanceof THREE.InstancedMesh);
      represented += child.count;
      for (const name of ['position', 'normal', 'color']) {
        const attribute: THREE.BufferAttribute = child.geometry.getAttribute(name) as THREE.BufferAttribute;
        assert.ok(attribute && [...attribute.array].every(Number.isFinite));
        fingerprint.push(attribute.count, attribute.getX(0), attribute.getY(0), attribute.getZ(0));
      }
      assert.ok(child.geometry.boundingBox && child.geometry.boundingSphere);
    }
    assert.equal(represented, parcels.length);
    fingerprints.add(JSON.stringify(fingerprint));
    debris.dispose();
  }
  assert.equal(fingerprints.size, vegetables.length);
});

test('settled debris rests above the floor and adhered debris stays in front of the supplied face', () => {
  for (const adhering of [false, true]) {
    const debris = createVegetableDebris('tomato', parcels, 0xe74626);
    const position = new THREE.Vector3(1, 1.6, -11.994), rotation = new THREE.Euler(0.7, 0.9, 1.2);
    const originalPosition = position.clone(), originalRotation = rotation.clone();
    parcels.forEach((p, i) => debris.updateParticle(i, position, rotation, p.radiusM, true, adhering));
    for (const child of debris.root.children) {
      const mesh = child as THREE.InstancedMesh;
      for (let i = 0; i < mesh.count; i++) {
        const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i, matrix);
        assert.ok(matrix.elements.every(Number.isFinite));
        const bounds = mesh.geometry.boundingBox!.clone().applyMatrix4(matrix);
        assert.ok(adhering ? bounds.min.z >= position.z - 1e-6 : bounds.min.y >= 0.00099);
      }
    }
    assert.deepEqual(position, originalPosition); assert.deepEqual(rotation, originalRotation);
    debris.dispose();
  }
});

test('disposing debris releases every shared geometry and material exactly once', () => {
  const debris = createVegetableDebris('cucumber', parcels, 0x41623a);
  const count = debris.root.children.length;
  let geometries = 0, materials = 0;
  for (const child of debris.root.children) {
    const mesh = child as THREE.InstancedMesh;
    mesh.geometry.addEventListener('dispose', () => geometries++);
    (mesh.material as THREE.Material).addEventListener('dispose', () => materials++);
  }
  debris.dispose(); debris.dispose();
  assert.equal(geometries, count); assert.equal(materials, count);
  assert.equal(debris.root.children.length, 0);
});
