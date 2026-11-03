import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createContactDeformation } from './contact-deformation.ts';

const base = {
  vegetableId: 'tomato', radiusM: 0.035,
  position: new THREE.Vector3(0, 1.6, -12), normal: new THREE.Vector3(0, 0, 1),
  contactSeconds: 0.000126, severity: 1, preFragmented: false,
};

test('contact skin remains finite in all vegetable profiles and hands off without persistent duplicate material', () => {
  for (const vegetableId of ['tomato', 'carrot', 'cucumber', 'eggplant', 'pumpkin', 'cabbage']) {
    const effect = createContactDeformation({ ...base, vegetableId });
    let previous = 0;
    for (const ratio of [0, 0.4, 0.8, 1.3, 2.5, 10]) {
      const handoff = effect.update(ratio * base.contactSeconds);
      assert.ok(handoff >= previous && handoff <= 1);
      effect.root.updateMatrixWorld(true);
      effect.root.traverse(object => {
        assert.ok(object.matrixWorld.elements.every(Number.isFinite));
        if (object instanceof THREE.Mesh) {
          assert.ok(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite));
        }
      });
      previous = handoff;
    }
    assert.equal(effect.root.visible, false);
    effect.dispose();
  }
});

test('ground deformation uses the contact normal and airborne-broken specimens skip the intact pose', () => {
  const ground = createContactDeformation({ ...base, normal: new THREE.Vector3(0, 1, 0) });
  const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(ground.root.quaternion);
  assert.ok(direction.distanceTo(new THREE.Vector3(0, 1, 0)) < 1e-12);
  ground.dispose();
  const broken = createContactDeformation({ ...base, preFragmented: true });
  assert.equal(broken.update(0), 1);
  assert.equal(broken.root.visible, false);
  broken.dispose();
});

test('disposing removes the view and releases owned GPU resources only once per geometry', () => {
  const scene = new THREE.Scene(), effect = createContactDeformation(base);
  scene.add(effect.root);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  effect.root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  let released = 0;
  for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => released++);
  effect.dispose();
  assert.equal(scene.children.length, 0);
  assert.equal(released, geometries.size + materials.size);
});

test('torn skin faces outward so its exterior stays visible before opening', () => {
  const effect = createContactDeformation(base);
  const skinPatch = effect.root.children[0].children[0] as THREE.Mesh;
  const positions = skinPatch.geometry.getAttribute('position');
  const normals = skinPatch.geometry.getAttribute('normal');
  let outward = 0;
  for (let i = 0; i < positions.count; i++) {
    const dot = positions.getX(i) * normals.getX(i) + positions.getY(i) * normals.getY(i) + positions.getZ(i) * normals.getZ(i);
    if (dot > 0.5) outward++;
  }
  assert.ok(outward > positions.count * 0.9);
  effect.dispose();
});
