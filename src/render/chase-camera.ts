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

export function createChaseCamera(camera: THREE.PerspectiveCamera, reducedMotion = false) {
  let pose: CameraPose | null = null;
  let pullingBack = false;
  let impactAge = 0;
  let shake = 0;
  let impactPoint: THREE.Vector3 | null = null;
  let impactIsTarget = false;
  let lastAspect = camera.aspect;
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
    follow(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
      applyLens();
      pullingBack = false;
      pose = chasePose(position, velocity, radius, camera.fov, camera.aspect);
      // Do not smooth a 556 m/s translation: that leaves the vegetable behind.
      camera.position.copy(pose.position);
      focus.copy(pose.focus);
      camera.lookAt(focus);
    },
    impact(point: THREE.Vector3, target: boolean, severity: number) {
      applyLens();
      pose = impactPose(point, target, camera.fov, camera.aspect);
      impactPoint = point.clone();
      impactIsTarget = target;
      lastAspect = camera.aspect;
      pullingBack = true;
      impactAge = 0;
      shake = reducedMotion ? 0 : 0.025 * severity;
    },
    update(delta: number) {
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
