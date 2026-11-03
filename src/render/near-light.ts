import * as THREE from 'three';
import { createVegetable } from './vegetables';
import type { WorldView } from './world';
import { nearLightFrame, type nearLightShot, type NearLightMedium } from '../simulation/near-light';
import { createDemolitionView } from './demolition';

/** Illustrative interaction paths. None of this geometry is a damage contour,
 * radiation transport solution, or a prediction of how far the vegetable survives. */
export function createNearLightView(world: Pick<WorldView, 'scene' | 'camera' | 'targetGroup'>) {
  const root = new THREE.Group();
  root.visible = false;
  world.scene.add(root);
  const demolition = createDemolitionView(world.scene);
  let vegetable: THREE.Group | null = null;
  let specimenRadius = 0.05;
  const ownMaterials: THREE.Material[] = [];
  const ownGeometries: THREE.BufferGeometry[] = [];
  const paths: THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial>[] = [];
  const haze: THREE.Sprite[] = [];
  const glowPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const r2 = ((x - 31.5) / 31.5) ** 2 + ((y - 31.5) / 31.5) ** 2;
    const offset = (y * 64 + x) * 4;
    glowPixels.set([255, 255, 255, Math.round(255 * Math.exp(-r2 * 5) * Math.max(0, 1 - r2))], offset);
  }
  const glowTexture = new THREE.DataTexture(glowPixels, 64, 64);
  glowTexture.needsUpdate = true;
  const markerMaterial = new THREE.LineBasicMaterial({ color: '#69c1df', transparent: true, opacity: 0.65 });
  ownMaterials.push(markerMaterial);
  const markerGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.6, 0), new THREE.Vector3(0, 1.6, -12)]);
  ownGeometries.push(markerGeometry);
  const marker = new THREE.Line(markerGeometry, markerMaterial);
  root.add(marker);
  for (let i = 0; i < 22; i++) {
    const phase = i * 2.39996;
    const points = Array.from({ length: 21 }, (_, j) => {
      const f = j / 20;
      const spread = Math.pow(f, 1.3) * (0.45 + (i % 7) * 0.31);
      return new THREE.Vector3(Math.cos(phase + f * 1.3) * spread, 1.6 + Math.sin(phase + f * 1.3) * spread * 0.7 + f * 0.8, -12 * f);
    });
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 80, i % 4 === 0 ? 0.035 : 0.012, 5, false);
    const material = new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? '#fff2c7' : i % 2 ? '#5bdbe8' : '#b494ed', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const path = new THREE.Mesh(geometry, material);
    ownGeometries.push(geometry); ownMaterials.push(material); paths.push(path); root.add(path);
  }
  for (let i = 0; i < 18; i++) {
    const material = new THREE.SpriteMaterial({ map: glowTexture, color: i % 2 ? '#94e9f5' : '#b9abe8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const cloud = new THREE.Sprite(material);
    cloud.position.set(Math.sin(i * 2.4) * 0.15, 1.6, -i * 0.68);
    ownMaterials.push(material); haze.push(cloud); root.add(cloud);
  }
  const background = world.scene.background;
  const fog = world.scene.fog;
  const modeFog = new THREE.Fog('#303e52', 65, 160);
  const lights: { light: THREE.Light; intensity: number }[] = [];
  world.scene.traverse(node => { if (node instanceof THREE.Light) lights.push({ light: node, intensity: node.intensity }); });
  function removeVegetable() {
    vegetable?.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
    vegetable?.removeFromParent();
    vegetable = null;
  }
  return {
    show(id: string) {
      root.visible = true;
      demolition.reset();
      world.targetGroup.visible = false;
      world.scene.background = new THREE.Color('#303e52');
      world.scene.fog = modeFog;
      removeVegetable();
      vegetable = createVegetable(id);
      specimenRadius = new THREE.Box3().setFromObject(vegetable).getBoundingSphere(new THREE.Sphere()).radius;
      root.add(vegetable);
    },
    update(elapsed: number, medium: NearLightMedium, shot: ReturnType<typeof nearLightShot>, launched: boolean, reducedMotion: boolean, before = false) {
      const frame = nearLightFrame(elapsed, medium, shot);
      const air = medium === 'air' && launched;
      const fade = 1 - THREE.MathUtils.smoothstep(elapsed, 3.5, 5.5);
      const damage = demolition.update(elapsed, shot.kineticEnergyJ, air, before);
      lights.forEach(({ light, intensity }) => { light.intensity = intensity * (air && !before ? 1 - frame.spread * fade * 0.65 : 1); });
      const progress = launched ? frame.progress : 0;
      if (vegetable) {
        vegetable.position.set(0, 1.6, -12 * progress);
        // Simultaneous ground-frame length, not a relativistic camera photograph.
        vegetable.scale.set(1, 1, launched ? 1 / shot.gamma : 1);
        vegetable.scale.multiplyScalar(launched ? frame.recognizableFraction : 1);
        vegetable.visible = !launched || frame.recognizableFraction > 0;
      }
      marker.visible = medium === 'vacuum';
      paths.forEach((path, i) => {
        path.visible = air && !before && fade > 0;
        path.geometry.setDrawRange(0, Math.floor(progress * 80) * 5 * 6);
        path.material.opacity = air ? (0.35 + 0.45 * Math.sin(Math.min(1, elapsed / 2) * Math.PI / 2)) * (1 - frame.spread * 0.25) * fade : 0;
        path.scale.set(0.3 + frame.spread * 0.7, 1, 1);
        // A slow, deterministic unfurling, never a strobe or a physical wave speed.
        path.rotation.z = reducedMotion ? 0 : Math.sin(i + elapsed * 0.25) * frame.spread * 0.025;
      });
      haze.forEach((cloud, i) => {
        const age = Math.max(0, progress - i / 18);
        cloud.visible = air && age > 0 && !before && fade > 0;
        const size = 0.15 + age * (2 + frame.spread * 4);
        cloud.scale.set(size, size, 1);
        cloud.material.opacity = Math.min(0.65, age * 2) * (1 - frame.spread * 0.2) * fade;
      });
      const camera = world.camera;
      const portrait = camera.aspect < 1;
      camera.fov = portrait ? 53 : 46;
      camera.near = 0.005; camera.far = 200;
      camera.updateProjectionMatrix();
      const halfField = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect);
      const closeDistance = Math.max(0.24, specimenRadius / (0.45 * halfField));
      const close = new THREE.Vector3(closeDistance * 0.8, 1.6 + closeDistance * 0.3, closeDistance * 0.6 - progress * 12);
      // Keep the camera over the road; a side pullback lands inside a building.
      const wide = new THREE.Vector3(portrait ? 2.2 : 3, portrait ? 10 : 7, portrait ? 14 : 6);
      const survey = THREE.MathUtils.smootherstep(elapsed, 3, 7);
      wide.lerp(new THREE.Vector3(portrait ? 20 : 18, portrait ? 35 : 25, portrait ? 8 : 0), survey);
      const blend = launched && medium === 'air' ? THREE.MathUtils.smootherstep(elapsed, reducedMotion ? 0 : 0.15, reducedMotion ? 0.01 : 1.9) : 0;
      camera.position.copy(close.lerp(wide, blend));
      const focus = new THREE.Vector3(0, 1.6, -progress * 12).lerp(new THREE.Vector3(0, 1.4, -6 - survey * 18), blend);
      camera.lookAt(focus);
      return { ...frame, damage };
    },
    hide() {
      root.visible = false;
      demolition.reset();
      world.targetGroup.visible = true;
      world.scene.background = background;
      world.scene.fog = fog;
      lights.forEach(({ light, intensity }) => { light.intensity = intensity; });
    },
    dispose() {
      this.hide(); removeVegetable(); root.removeFromParent();
      demolition.dispose();
      ownGeometries.forEach(g => g.dispose()); ownMaterials.forEach(m => m.dispose());
      glowTexture.dispose();
    },
  };
}
