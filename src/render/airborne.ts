import * as THREE from 'three';
import type { BreakupEvent, Vegetable } from '../simulation/physics';

/** Display of an equal-mass fragment population moving on the mean trajectory.
 * Layout and rotation are visual only; no claim to resolve lateral dispersion.
 */
export function createAirborneFragments(vegetable: Vegetable, breakup: BreakupEvent): THREE.Group {
  const group = new THREE.Group();
  group.name = 'airborne-fragment-population';
  const geometry = new THREE.IcosahedronGeometry(breakup.fragmentRadiusM, 0);
  const material = new THREE.MeshStandardMaterial({ color: vegetable.color, roughness: 0.65, flatShading: true });
  const mesh = new THREE.InstancedMesh(geometry, material, breakup.fragmentCount);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < breakup.fragmentCount; i++) {
    // Antipodal pairs keep the visual cloud centred on the calculated position.
    const pair = Math.floor(i / 2), sign = i % 2 ? -1 : 1;
    const phi = pair * Math.PI * (3 - Math.sqrt(5));
    const z = (pair + 0.5) / Math.ceil(breakup.fragmentCount / 2);
    const ring = Math.sqrt(1 - z * z);
    dummy.position.set(sign * Math.cos(phi) * ring, sign * Math.sin(phi) * ring, sign * z).multiplyScalar(vegetable.radiusM * 1.6);
    dummy.rotation.set(pair * 0.3, pair * 0.7, pair * 1.1);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
  return group;
}
