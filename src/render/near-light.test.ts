import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNearLightView } from './near-light';
import { nearLightShot } from '../simulation/near-light';

test('near-light view restores the ordinary scene and never alters city geometry', () => {
  const scene = new THREE.Scene();
  const background = new THREE.Color('#dbe4d6');
  const fog = new THREE.Fog('#dbe4d6', 30, 150);
  scene.background = background; scene.fog = fog;
  const light = new THREE.DirectionalLight('white', 3.2);
  const targetGroup = new THREE.Group();
  const building = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 4), new THREE.MeshStandardMaterial());
  building.position.set(7.7, 6, -12);
  scene.add(light, targetGroup, building);
  const camera = new THREE.PerspectiveCamera(46, 16 / 9);
  const view = createNearLightView({ scene, targetGroup, camera });
  for (const aspect of [16 / 9, 390 / 444]) {
    camera.aspect = aspect;
    for (const id of ['tomato', 'pumpkin', 'cabbage']) {
      view.show(id);
      assert.equal(targetGroup.visible, false);
      for (const time of [0, 0.2, 1, 3, 6]) {
        view.update(time, 'air', nearLightShot(0.15, 0.999), true, false);
        assert.ok(camera.position.toArray().every(Number.isFinite));
        assert.ok(Math.abs(camera.position.x) < 5 || camera.position.y > 12, 'camera stays over the road or above the roofs');
        if (time === 3) assert.ok(light.intensity < 3.2);
      }
      assert.equal(light.intensity, 3.2, 'light returns when the glow fades so rubble can be inspected');
      assert.deepEqual(building.position.toArray(), [7.7, 6, -12]);
      view.hide();
      assert.equal(targetGroup.visible, true);
      assert.equal(scene.background, background);
      assert.equal(scene.fog, fog);
      assert.equal(light.intensity, 3.2);
    }
  }
  view.dispose();
  assert.equal(scene.children.length, 3);
  building.geometry.dispose(); building.material.dispose();
});
