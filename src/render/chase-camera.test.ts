import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chasePose, impactPose } from './chase-camera.ts';

function project(point: THREE.Vector3, pose: ReturnType<typeof chasePose>, aspect: number) {
  const camera = new THREE.PerspectiveCamera(46, aspect, 0.005, 150);
  camera.position.copy(pose.position);
  camera.lookAt(pose.focus);
  camera.updateMatrixWorld();
  return point.clone().project(camera);
}

test('small and large vegetables occupy a close-up frame on desktop and mobile', () => {
  for (const radius of [0.04, 0.13, 0.22]) for (const aspect of [0.75, 1, 2.2]) {
    const center = new THREE.Vector3(0, 1.6, -5);
    const pose = chasePose(center, new THREE.Vector3(0, 0, -555), radius, 46, aspect);
    const projected = project(center, pose, aspect);
    assert.ok(Math.abs(projected.x) < 0.1 && Math.abs(projected.y) < 0.1);
    const top = project(center.clone().add(new THREE.Vector3(0, radius, 0)), pose, aspect);
    assert.ok(Math.abs(top.y - projected.y) > 0.12, 'specimen should be visibly large');
    assert.ok(Math.abs(top.y) < 0.8, 'specimen must fit');
  }
});

test('camera follows a high speed translation immediately, without positional lag', () => {
  const a = chasePose(new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 0, -555), 0.04, 46, 1);
  const b = chasePose(new THREE.Vector3(0, 1.6, -9), new THREE.Vector3(0, 0, -555), 0.04, 46, 1);
  assert.equal(b.position.z - a.position.z, -9);
});

test('impact view fits the full target even on a narrow screen', () => {
  for (const aspect of [0.75, 1, 2]) {
    const pose = impactPose(new THREE.Vector3(0, 1.6, -12), true, 46, aspect);
    for (const point of [new THREE.Vector3(-1.3, 1.6, -12), new THREE.Vector3(1.3, 1.6, -12), new THREE.Vector3(0, 2.9, -12)]) {
      const p = project(point, pose, aspect);
      assert.ok(Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9);
    }
  }
});
