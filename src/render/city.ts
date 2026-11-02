import * as THREE from 'three';
import { BUS_SHELTER, CITY_OBSERVERS, type CityExperiment } from '../simulation/city';
import { createWaveEmissions, firstWaveArrival, waveRadius, type WaveEmission } from '../simulation/waves';
import type { ThrowResult } from '../simulation/physics';

/** A fictional, procedural street. No paid models, textures or network calls. */
export function createCityView(scene: THREE.Scene, experiment: CityExperiment) {
  const root = new THREE.Group();
  root.name = 'urban-experiment';
  scene.add(root);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  function mat(color: string) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.82 }));
    return materials.get(color)!;
  }
  function block(x: number, y: number, z: number, w: number, h: number, d: number, color: string) {
    const mesh = new THREE.Mesh(box, mat(color));
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
    return mesh;
  }
  block(0, -0.06, -65, 9, 0.1, 170, '#697879');
  for (const side of [-1, 1]) {
    block(side * 4.7, -0.015, -65, 0.6, 0.05, 170, '#c6c6b5');
    for (let z = 12; z > -145; z -= 6) block(side * 3.9, 0.005, z, 0.07, 0.012, 2.6, '#e7ddae');
  }
  for (let stripe = -3; stripe <= 3; stripe++) block(stripe, 0.009, -39, 0.6, 0.015, 3.5, '#e9e4cf');
  const surfaceMeshes = new Map<string, THREE.Mesh>();
  const originalMaterials = new Map<string, THREE.Material | THREE.Material[]>();
  const fractureLines = new Map<string, THREE.LineSegments>();
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#87c4ca', transparent: true, opacity: 0.38, roughness: 0.2, metalness: 0.15, depthWrite: false });
  for (const surface of experiment.surfaces) {
    const { min, max } = surface;
    const center = new THREE.Vector3((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
    const size = new THREE.Vector3(max.x - min.x, max.y - min.y, max.z - min.z);
    const color = surface.kind === 'wall' ? ['#d8c4ae', '#b6c3bc', '#c6bcae', '#bcafa3'][surfaceMeshes.size % 4] : '#c7894c';
    const mesh = block(center.x, center.y, center.z, size.x, size.y, size.z, color);
    mesh.name = surface.id;
    if (surface.kind === 'glass') mesh.material = glassMaterial;
    surfaceMeshes.set(surface.id, mesh);
    originalMaterials.set(surface.id, mesh.material);
    if (surface.kind === 'wall') {
      block(center.x, max.y + 0.13, center.z, size.x + 0.22, 0.26, size.z + 0.2, '#697d77');
      const frontX = center.x < 0 ? max.x + 0.015 : min.x - 0.015;
      for (let floor = 4; floor < max.y; floor += 2) for (const dz of [-3, 0, 3]) block(frontX, floor, center.z + dz, 0.025, 1.1, 1.55, '#607b7d');
      block(frontX, 3.05, center.z, 0.6, 0.18, 9, center.x < 0 ? '#b57a51' : '#5b887f');
    }
    if (surface.kind === 'glass') {
      const points: number[] = [];
      for (let ray = 0; ray < 14; ray++) {
        const angle = ray * Math.PI * 2 / 14;
        const along = Math.cos(angle) * (surface.normalAxis === 'z' ? size.x : size.z) * 0.48;
        const vertical = Math.sin(angle) * size.y * 0.48;
        const offset = surface.normalAxis === 'x' ? (center.x < 0 ? 0.023 : -0.023) : 0.024;
        const a = center.clone(), b = center.clone();
        a[surface.normalAxis] += offset; b[surface.normalAxis] += offset;
        b[surface.normalAxis === 'x' ? 'z' : 'x'] += along; b.y += vertical;
        points.push(...a.toArray(), ...b.toArray());
      }
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), new THREE.LineBasicMaterial({ color: '#f7f3dd', transparent: true, opacity: 0.9 }));
      lines.visible = false; root.add(lines); fractureLines.set(surface.id, lines);
    }
  }
  // Sidewalk shelter, open toward the road; back panes share collision geometry.
  const shelter = BUS_SHELTER;
  block(5.55, -0.015, shelter.centerZ, 2.3, 0.05, 3.8, '#c6c6b5');
  block(5.5, shelter.height, shelter.centerZ, 1.9, 0.16, 3.7, '#506f70').name = 'shelter-roof';
  for (const x of [shelter.frontX, shelter.backX]) for (const dz of [-1.7, 1.7]) {
    block(x, shelter.height / 2, shelter.centerZ + dz, 0.07, shelter.height, 0.07, '#506f70');
  }
  block(5.95, 0.48, shelter.centerZ, 0.42, 0.09, 2.5, '#a38360');
  for (const dz of [-0.9, 0.9]) block(5.95, 0.23, shelter.centerZ + dz, 0.08, 0.46, 0.08, '#506f70');
  block(3.85, 0.65, -17.1, 0.08, 1.3, 0.08, '#758583');
  // Restrained street furniture establishes human scale without people.
  for (let z = 6; z > -100; z -= 28) for (const side of [-1, 1]) {
    block(side * 4.45, 2.15, z, 0.07, 4.3, 0.07, '#586c69');
    block(side * 4.1, 4.3, z, 0.8, 0.08, 0.22, '#e4dfbd');
  }
  const observers = CITY_OBSERVERS.map(o => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 5, 24), new THREE.MeshBasicMaterial({ color: '#6bd5ea' }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(o.position.x, 0.04, o.position.z); root.add(ring);
    return ring;
  });
  const waveGeometry = new THREE.SphereGeometry(1, 24, 12);
  const wavesRoot = new THREE.Group(); root.add(wavesRoot);
  let emissions: WaveEmission[] = [], waveMeshes: THREE.Mesh[] = [], arrivals: (number | null)[] = [];
  let showWaves = true;
  function reset() {
    emissions = []; arrivals = [];
    waveMeshes.forEach(m => (m.material as THREE.Material).dispose());
    waveMeshes = []; wavesRoot.clear();
    fractureLines.forEach(line => line.visible = false);
    for (const s of experiment.surfaces) {
      const mesh = surfaceMeshes.get(s.id)!;
      mesh.material = originalMaterials.get(s.id)!;
      mesh.rotation.set(0, 0, 0);
    }
    observers.forEach(o => o.material.color.set('#6bd5ea'));
  }
  function start(result: ThrowResult) {
    reset();
    emissions = createWaveEmissions(result);
    arrivals = CITY_OBSERVERS.map(o => firstWaveArrival(emissions, o.position));
    waveMeshes = emissions.map(wave => {
      const mesh = new THREE.Mesh(waveGeometry, new THREE.MeshBasicMaterial({ color: wave.kind === 'flight' ? '#52c6e2' : '#eeae65', wireframe: true, transparent: true, opacity: 0.13, depthWrite: false }));
      mesh.position.set(wave.position.x, wave.position.y, wave.position.z); mesh.visible = false; wavesRoot.add(mesh); return mesh;
    });
  }
  function update(time: number) {
    waveMeshes.forEach((mesh, i) => {
      const radius = waveRadius(emissions[i], time);
      mesh.visible = showWaves && time >= emissions[i].time && radius > 0 && radius < 110;
      mesh.scale.setScalar(Math.max(0.001, radius));
      (mesh.material as THREE.MeshBasicMaterial).opacity = (emissions[i].kind === 'flight' ? 0.09 : 0.22) * Math.max(0, 1 - radius / 110);
    });
    observers.forEach((o, i) => o.material.color.set(arrivals[i] !== null && time >= arrivals[i] ? '#eabb71' : '#6bd5ea'));
    for (const [id, damage] of experiment.damage) {
      const mesh = surfaceMeshes.get(id)!;
      const lines = fractureLines.get(id);
      if (lines) {
        lines.visible = damage.state !== 'marked';
        // Laminated glass stays retained in its frame; no imaginary open hole.
        mesh.material = mat(damage.state === 'broken' ? '#c3d9d5' : damage.state === 'cracked' ? '#89b1ad' : '#99ab78');
      } else if (id === 'street-sign') mesh.rotation.x = damage.state === 'cracked' ? -0.32 : 0;
      else mesh.material = mat('#9f997b');
    }
  }
  return { start, reset, update, setWaves: (visible: boolean) => { showWaves = visible; },
    get arrivals() { return arrivals; },
    dispose: () => { reset(); root.removeFromParent(); box.dispose(); waveGeometry.dispose(); glassMaterial.dispose(); materials.forEach(m => m.dispose()); fractureLines.forEach(l => { l.geometry.dispose(); (l.material as THREE.Material).dispose(); }); observers.forEach(o => { o.geometry.dispose(); o.material.dispose(); }); } };
}
