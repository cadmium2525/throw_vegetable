import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { chasePose, impactPose, aftermathPose, createChaseCamera } from './chase-camera.ts';

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

function targetBlocks(eye: THREE.Vector3, focus: THREE.Vector3): boolean {
  const t = (-12 - eye.z) / (focus.z - eye.z);
  if (!Number.isFinite(t) || t <= 0 || t >= 1) return false;
  const intersection = eye.clone().lerp(focus, t);
  return Math.hypot(intersection.x, intersection.y - 1.6) < 1.3;
}

test('aftermath camera keeps fragments visible around the opaque target', () => {
  for (const aspect of [0.65, 1, 2.2]) for (const z of [-12.02, -12.3, -13, -15, -40, -100]) {
    const position = new THREE.Vector3(0, 1.65, z);
    const pose = aftermathPose(position, new THREE.Vector3(0, 0, -300), 0.4, 46, aspect, 0.2);
    assert.ok(!targetBlocks(pose.position, pose.focus), `board occludes cloud at z=${z}`);
    assert.ok(pose.position.y >= 0.16);
    const projected = project(position, pose, aspect);
    assert.ok(Math.abs(projected.x) < 0.05 && Math.abs(projected.y) < 0.05, 'centroid stays central');
    assert.ok(pose.position.toArray().every(Number.isFinite));
  }
});

test('aftermath camera follows a 300 m/s translation without world-position lag', () => {
  const camera = new THREE.PerspectiveCamera(46, 1, 0.005, 150);
  const chase = createChaseCamera(camera);
  const velocity = new THREE.Vector3(0, 0, -300);
  chase.impact(new THREE.Vector3(0, 1.6, -12), true, 1);
  chase.followAftermath(new THREE.Vector3(0, 1.6, -20), velocity, 0.35, false);
  const before = camera.position.clone();
  chase.followAftermath(new THREE.Vector3(0, 1.6, -25), velocity, 0.35, false);
  assert.equal(camera.position.z - before.z, -5);
  camera.updateMatrixWorld();
  const projected = new THREE.Vector3(0, 1.6, -25).project(camera);
  assert.ok(Math.abs(projected.x) < 0.05 && Math.abs(projected.y) < 0.05);
  chase.update(1 / 60);
  assert.ok(camera.position.z < -20, 'static impact pullback must not override tracking');
  assert.equal(camera.far, 200);
});

test('aftermath interpolation remains clear of plywood during the transition', () => {
  const camera = new THREE.PerspectiveCamera(53, 0.75, 0.005, 150);
  const chase = createChaseCamera(camera);
  const velocity = new THREE.Vector3(0, 0, -30);
  for (let i = 0; i < 50; i++) {
    const position = new THREE.Vector3(0.1, 1.5, -12.025 - i * 0.08);
    chase.followAftermath(position, velocity, 0.5, false);
    chase.update(1 / 60);
    camera.updateMatrixWorld();
    assert.ok(!targetBlocks(camera.position, position));
    const projected = position.clone().project(camera);
    assert.ok(Math.abs(projected.x) < 0.05 && Math.abs(projected.y) < 0.05);
  }
});

test('landed debris stays above ground and in frame with zero velocity', () => {
  for (const aspect of [0.65, 1, 2.2]) for (const reduced of [false, true]) {
    const camera = new THREE.PerspectiveCamera(46, aspect, 0.005, 150);
    const chase = createChaseCamera(camera, reduced);
    const position = new THREE.Vector3(0.2, 0.015, -24);
    chase.followAftermath(position, new THREE.Vector3(), 0.5, true);
    for (let i = 0; i < 80; i++) chase.update(1 / 60);
    camera.updateMatrixWorld();
    const projected = position.clone().project(camera);
    assert.ok(Math.abs(projected.x) < 0.1 && Math.abs(projected.y) < 0.15);
    assert.ok(camera.position.y >= 0.3);
    assert.ok(camera.position.toArray().every(Number.isFinite));
  }
});

test('a resting centimeter crumb remains visibly sized in the close landed view', () => {
  for (const aspect of [0.65, 1, 2.2]) {
    const position = new THREE.Vector3(0.2, 0.01, -24);
    const pose = aftermathPose(position, new THREE.Vector3(), 0.08, 46, aspect, 2, true);
    const center = project(position, pose, aspect);
    const top = project(position.clone().add(new THREE.Vector3(0, 0.01, 0)), pose, aspect);
    assert.ok(Math.abs(top.y - center.y) > 0.022, 'centimeter fragment should cover visible pixels');
    assert.ok(Math.abs(center.x) < 0.1 && Math.abs(center.y) < 0.1);
    assert.ok(pose.position.distanceTo(position) < 1, 'resting fragment should receive a close view');
    assert.ok(pose.position.y >= 0.3);
    assert.ok(!targetBlocks(pose.position, pose.focus));
  }
});

test('new throws leave aftermath tracking and preserve close flight follow', () => {
  const camera = new THREE.PerspectiveCamera(46, 1, 0.005, 150);
  const chase = createChaseCamera(camera);
  chase.followAftermath(new THREE.Vector3(0, 0.02, -40), new THREE.Vector3(), 0.8, true);
  const launch = new THREE.Vector3(0, 1.6, 0);
  chase.follow(launch, new THREE.Vector3(0, 0, -1), 0.04);
  const before = camera.position.clone();
  chase.update(1 / 60);
  assert.ok(camera.position.distanceTo(before) < 1e-12);
  assert.ok(camera.position.distanceTo(launch) < 0.5);
});
