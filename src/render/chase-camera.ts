import * as THREE from 'three';

export interface CameraPose { position: THREE.Vector3; focus: THREE.Vector3 }

/** Keep the real-size specimen large in the frame without enlarging its model. */
export function chasePose(position: THREE.Vector3, velocity: THREE.Vector3, radius: number, fov: number, aspect: number): CameraPose {
  const forward = velocity.lengthSq() > 0.01 ? velocity.clone().normalize() : new THREE.Vector3(0, 0, -1);
  // Ground drops still use the launch direction, keeping the camera above ground.
  if (Math.abs(forward.y) > 0.7) forward.set(0, 0, -1);
  const side = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const halfField = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1, aspect);
  const distance = Math.max(0.3, radius / (0.30 * halfField));
  const eye = position.clone().addScaledVector(forward, -distance * 0.92).addScaledVector(side, distance * 0.33);
  eye.y += distance * 0.20;
  eye.y = Math.max(0.10, eye.y);
  return { position: eye, focus: position.clone().addScaledVector(forward, radius * 0.2) };
}

export function impactPose(point: THREE.Vector3, target: boolean, fov: number, aspect: number): CameraPose {
  if (!target) return { position: point.clone().add(new THREE.Vector3(0.55, 0.65, 1.3)), focus: point.clone().add(new THREE.Vector3(0, 0.07, 0)) };
  const halfField = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1, aspect);
  const distance = 1.3 / (0.70 * halfField);
  const focus = new THREE.Vector3(0, 1.6, -12);
  return { position: focus.clone().add(new THREE.Vector3(distance * 0.27, distance * 0.16, distance)), focus };
}

/** Keep the line of sight away from the opaque remainder of the target. */
function clearTargetSightline(eye: THREE.Vector3, focus: THREE.Vector3): void {
  const targetZ = -12;
  if (focus.z >= targetZ || eye.z <= targetZ - 0.035) return;
  const fraction = (targetZ - eye.z) / (focus.z - eye.z);
  if (fraction <= 0 || fraction >= 1) return;
  const x = THREE.MathUtils.lerp(eye.x, focus.x, fraction);
  const y = THREE.MathUtils.lerp(eye.y, focus.y, fraction);
  if (Math.hypot(x, y - 1.6) < 1.43) {
    // Move around the plane rather than looking through unbroken plywood.
    eye.z = Math.min(targetZ - 0.045, focus.z - 0.04);
  }
}

/** A side view becomes a trailing view as the broken vegetable travels on. */
export function aftermathPose(position: THREE.Vector3, velocity: THREE.Vector3, radius: number, fov: number, aspect: number, elapsed = 0, landed = false): CameraPose {
  const cloudRadius = THREE.MathUtils.clamp(radius, 0.1, 1.2);
  const halfField = Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1, Math.max(0.2, aspect));
  const distance = THREE.MathUtils.clamp(cloudRadius / (0.43 * halfField), landed ? 0.4 : 0.5, 8.5);
  const forward = new THREE.Vector3(velocity.x, 0, velocity.z);
  if (forward.lengthSq() < 0.01) forward.set(0, 0, -1);
  else forward.normalize();
  const side = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const focus = position.clone().add(new THREE.Vector3(0, landed ? 0.015 : 0, 0));
  let offset: THREE.Vector3;
  if (landed) {
    offset = new THREE.Vector3(distance * 0.3, Math.max(0.3, distance * 0.34), distance * 0.9);
  } else {
    const initial = side.clone().multiplyScalar(distance * 0.8)
      .addScaledVector(forward, -distance * 0.65);
    initial.y = Math.max(0.16, distance * 0.28);
    const trailing = side.clone().multiplyScalar(distance * 0.46)
      .addScaledVector(forward, -distance * 0.86);
    trailing.y = Math.max(0.16, distance * 0.3);
    const orbit = THREE.MathUtils.smootherstep(elapsed, 0.12, 0.52);
    offset = initial.lerp(trailing, orbit);
  }
  const eye = position.clone().add(offset);
  eye.y = Math.max(0.16, eye.y);
  clearTargetSightline(eye, focus);
  return { position: eye, focus };
}

export function createChaseCamera(camera: THREE.PerspectiveCamera, reducedMotion = false) {
  let pose: CameraPose | null = null;
  let pullingBack = false;
  let impactAge = 0;
  let shake = 0;
  let impactPoint: THREE.Vector3 | null = null;
  let impactIsTarget = false;
  let lastAspect = camera.aspect;
  let aftermath: { position: THREE.Vector3; velocity: THREE.Vector3; radius: number; landed: boolean } | null = null;
  let aftermathAge = 0;
  const aftermathOffset = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const applyLens = () => {
    const fov = camera.aspect < 1 ? 53 : 46;
    if (camera.fov !== fov || camera.near !== 0.005) {
      camera.fov = fov;
      camera.near = 0.005;
      camera.updateProjectionMatrix();
    }
  };
  return {
    observeContact(point: THREE.Vector3, radius: number, target: boolean) {
      applyLens();
      pullingBack = false;
      aftermath = null;
      const halfField = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect);
      const distance = Math.max(0.24, radius * 2.4 / (0.55 * halfField));
      focus.copy(point);
      camera.position.copy(point).add(target
        ? new THREE.Vector3(distance * 0.56, distance * 0.3, distance * 0.8)
        : new THREE.Vector3(distance * 0.4, distance * 0.7, distance * 0.65));
      camera.position.y = Math.max(0.08, camera.position.y);
      camera.lookAt(focus);
    },
    follow(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
      applyLens();
      pullingBack = false;
      aftermath = null;
      pose = chasePose(position, velocity, radius, camera.fov, camera.aspect);
      // Do not smooth a 556 m/s translation: that leaves the vegetable behind.
      camera.position.copy(pose.position);
      focus.copy(pose.focus);
      camera.lookAt(focus);
    },
    followAftermath(position: THREE.Vector3, velocity: THREE.Vector3, radius: number, landed: boolean) {
      applyLens();
      if (camera.far < 200) { camera.far = 200; camera.updateProjectionMatrix(); }
      pullingBack = false;
      if (!aftermath) {
        aftermathAge = 0;
        pose = aftermathPose(position, velocity, radius, camera.fov, camera.aspect, reducedMotion ? 1 : 0, landed);
        aftermathOffset.copy(pose.position).sub(position);
        camera.position.copy(pose.position);
        focus.copy(pose.focus);
      } else {
        // Follow the complete centroid translation immediately. Interpolating
        // its world position would leave a fast cloud outside the frame.
        camera.position.add(position.clone().sub(aftermath.position));
        focus.copy(position).add(new THREE.Vector3(0, landed ? 0.015 : 0, 0));
        clearTargetSightline(camera.position, focus);
        aftermathOffset.copy(camera.position).sub(position);
      }
      aftermath = { position: position.clone(), velocity: velocity.clone(), radius, landed };
      camera.lookAt(focus);
    },
    impact(point: THREE.Vector3, target: boolean, severity: number) {
      applyLens();
      pose = impactPose(point, target, camera.fov, camera.aspect);
      impactPoint = point.clone();
      impactIsTarget = target;
      lastAspect = camera.aspect;
      pullingBack = true;
      aftermath = null;
      impactAge = 0;
      shake = reducedMotion ? 0 : 0.025 * severity;
    },
    update(delta: number) {
      if (aftermath) {
        applyLens();
        const dt = THREE.MathUtils.clamp(delta, 0, 0.05);
        aftermathAge += dt;
        pose = aftermathPose(aftermath.position, aftermath.velocity, aftermath.radius, camera.fov, camera.aspect, reducedMotion ? 1 : aftermathAge, aftermath.landed);
        const desiredOffset = pose.position.clone().sub(aftermath.position);
        const blend = reducedMotion ? 1 : 1 - Math.exp(-7 * dt);
        aftermathOffset.lerp(desiredOffset, blend);
        camera.position.copy(aftermath.position).add(aftermathOffset);
        focus.copy(pose.focus);
        clearTargetSightline(camera.position, focus);
        aftermathOffset.copy(camera.position).sub(aftermath.position);
        camera.lookAt(focus);
        return;
      }
      if (!pullingBack || !pose) return;
      if (camera.aspect !== lastAspect && impactPoint) {
        applyLens();
        pose = impactPose(impactPoint, impactIsTarget, camera.fov, camera.aspect);
        lastAspect = camera.aspect;
      }
      impactAge += delta;
      const blend = reducedMotion ? 1 : 1 - Math.exp(-6 * delta);
      camera.position.lerp(pose.position, blend);
      focus.lerp(pose.focus, blend);
      camera.lookAt(focus);
      if (impactAge < 0.2) camera.position.x += Math.sin(impactAge * 100) * shake * (1 - impactAge / 0.2);
    },
  };
}
