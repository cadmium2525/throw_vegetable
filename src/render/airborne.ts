import * as THREE from 'three';
import type { BreakupEvent, Vegetable } from '../simulation/physics';
import { createVegetableDebris } from './vegetable-fragments';

/** Display of an equal-mass fragment population moving on the mean trajectory.
 * Layout and rotation are visual only; no claim to resolve lateral dispersion.
 */
export function createAirborneFragments(vegetable: Vegetable, breakup: BreakupEvent): THREE.Group {
  const group = new THREE.Group();
  group.name = 'airborne-fragment-population';
  const debris = createVegetableDebris(vegetable.id,
    Array.from({length: breakup.fragmentCount}, () => ({radiusM: breakup.fragmentRadiusM, kind: 'forward'})),
    new THREE.Color(vegetable.color).getHex());
  group.add(debris.root);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < breakup.fragmentCount; i++) {
    // Antipodal pairs keep the visual cloud centred on the calculated position.
    const pair = Math.floor(i / 2), sign = i % 2 ? -1 : 1;
    const phi = pair * Math.PI * (3 - Math.sqrt(5));
    const z = (pair + 0.5) / Math.ceil(breakup.fragmentCount / 2);
    const ring = Math.sqrt(1 - z * z);
    dummy.position.set(sign * Math.cos(phi) * ring, sign * Math.sin(phi) * ring, sign * z).multiplyScalar(vegetable.radiusM * 1.6);
    dummy.rotation.set(pair * 0.3, pair * 0.7, pair * 1.1);
    debris.updateParticle(i, dummy.position, dummy.rotation, breakup.fragmentRadiusM, false, false);
  }
  return group;
}
