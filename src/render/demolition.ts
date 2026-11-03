import * as THREE from 'three';
import { demolitionPhase, demolitionScore } from '../simulation/demolition';

/** Reversible, seekable set-piece destruction. The original city is never disposed
 * or used as a rigid-body simulation. Its pristine meshes return on reset/exit. */
export function createDemolitionView(scene: THREE.Scene) {
  const city = scene.getObjectByName('urban-experiment');
  const root = new THREE.Group(); root.name = 'sandbox-rubble'; root.visible = false; scene.add(root);
  type Part = { mesh: THREE.Mesh; home: THREE.Vector3; scale: THREE.Vector3; spin: THREE.Vector3; toss: THREE.Vector3; floor: number; index: number };
  type Structure = { originals: THREE.Object3D[]; visible: boolean[]; parts: Part[]; center: THREE.Vector3; kind: 'wall' | 'glass' | 'fixture'; dust: THREE.Mesh | null; lastPhase: number };
  const structures: Structure[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const materials: THREE.Material[] = [];
  const solid = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.95, color: '#8e887e' });
  const glass = new THREE.MeshStandardMaterial({ color: '#97d2dc', roughness: 0.25, metalness: 0.15, side: THREE.DoubleSide });
  const roof = new THREE.MeshStandardMaterial({ color: '#627b73', roughness: 0.9 });
  materials.push(solid, glass, roof);
  let seed = 4905;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function makeStructure(mesh: THREE.Mesh, kind: Structure['kind']) {
    const originals: THREE.Object3D[] = kind === 'wall' ? city!.children.filter(o => o.userData.buildingOwner === mesh.name) : [mesh];
    const s: Structure = { originals, visible: originals.map(o => o.visible), parts: [], center: mesh.position.clone(), kind, dust: null, lastPhase: -1 };
    const pieces: { offset: THREE.Vector3; size: THREE.Vector3; fall: 'x' | 'z' | 'flat'; layer: number }[] = [];
    if (kind === 'wall') {
      // Hollow building: thin facade panels and floor slabs, not a solid block
      // chopped into huge cubes. These are visual shells, not an FEM model.
      const w = mesh.scale.x, h = mesh.scale.y, d = mesh.scale.z;
      // Distant blocks use fewer facade slabs; cost stays bounded as the city grows.
      const floors = Math.min(mesh.name.includes('district') ? 3 : 5, Math.ceil(h / 2)), dy = h / floors;
      for (let y = 0; y < floors; y++) {
        for (const side of [-1, 1]) {
          for (let z = 0; z < 4; z++) pieces.push({ offset: new THREE.Vector3(side * w / 2, (y + 0.5) * dy - h / 2, (z + 0.5) * d / 4 - d / 2), size: new THREE.Vector3(0.2, dy, d / 4), fall: 'z', layer: y });
          for (let x = 0; x < 3; x++) pieces.push({ offset: new THREE.Vector3((x + 0.5) * w / 3 - w / 2, (y + 0.5) * dy - h / 2, side * d / 2), size: new THREE.Vector3(w / 3, dy, 0.2), fall: 'x', layer: y });
        }
        for (let x = 0; x < 3; x++) for (let z = 0; z < 4; z++) pieces.push({ offset: new THREE.Vector3((x + 0.5) * w / 3 - w / 2, (y + 1) * dy - h / 2, (z + 0.5) * d / 4 - d / 2), size: new THREE.Vector3(w / 3, 0.22, d / 4), fall: 'flat', layer: y });
      }
    } else {
      for (let y = 0; y < 2; y++) for (let z = 0; z < 3; z++) pieces.push({ offset: new THREE.Vector3(0, (y + 0.5) * mesh.scale.y / 2 - mesh.scale.y / 2, (z + 0.5) * mesh.scale.z / 3 - mesh.scale.z / 2), size: mesh.scale.clone().divide(new THREE.Vector3(1, 2, 3)), fall: 'z', layer: 0 });
    }
    for (const piece of pieces) {
      const part = new THREE.Mesh(box, kind === 'glass' ? glass : kind === 'fixture' ? roof : solid);
      part.castShadow = true; part.receiveShadow = true; part.visible = false;
      const home = mesh.position.clone().add(piece.offset);
      const scale = piece.size.clone().multiplyScalar(kind === 'wall' ? 0.96 : 0.9);
      const floor = kind === 'wall' ? 0.12 + piece.layer * 0.16 + random() * 0.3 : 0.035;
      s.parts.push({ mesh: part, home, scale, floor, index: 0,
        spin: new THREE.Vector3(piece.fall === 'x' ? 1.35 + random() * 0.4 : (random() - 0.5) * 0.5, (random() - 0.5) * 2, piece.fall === 'z' ? 1.35 + random() * 0.4 : (random() - 0.5) * 0.5),
        toss: new THREE.Vector3(-Math.sign(mesh.position.x) * (0.7 + random() * 2.6), 0.4 + random() * 2, (random() - 0.5) * 3) });
    }
    if (kind === 'wall') {
      const material = new THREE.MeshBasicMaterial({ color: '#b0a38e', transparent: true, opacity: 0, depthWrite: false });
      materials.push(material);
      s.dust = new THREE.Mesh(sphere, material); root.add(s.dust);
    }
    structures.push(s);
  }
  city?.children.forEach(object => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name.startsWith('wall-')) makeStructure(object, 'wall');
    else if (object.userData.demolitionKind === 'glass') makeStructure(object, 'glass');
    else if (object.userData.demolitionKind === 'fixture') makeStructure(object, 'fixture');
  });
  const batches = new Map<Structure['kind'], THREE.InstancedMesh>();
  for (const kind of ['wall', 'glass', 'fixture'] as const) {
    const parts = structures.filter(s => s.kind === kind).flatMap(s => s.parts);
    const batch = new THREE.InstancedMesh(box, kind === 'glass' ? glass : kind === 'wall' ? solid : roof, parts.length);
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.frustumCulled = false; batch.castShadow = true; batch.receiveShadow = true;
    parts.forEach((p, i) => { p.index = i; batch.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); });
    batches.set(kind, batch); root.add(batch);
  }
  const bounds = new THREE.Box3();
  const trees = city?.getObjectByName('park-trees') as THREE.InstancedMesh | undefined;
  const treeHomes: THREE.Matrix4[] = [];
  if (trees) for (let i = 0; i < trees.count; i++) { const m = new THREE.Matrix4(); trees.getMatrixAt(i, m); treeHomes.push(m); }
  const treePose = new THREE.Object3D();
  const intactTreeColor = new THREE.Color('white'), fallenTreeColor = new THREE.Color('#ac9366');
  const treeColor = new THREE.Color();
  function updateTrees(elapsed: number, energyJ: number, enabled: boolean, before: boolean) {
    if (!trees) return;
    treeHomes.forEach((matrix, index) => {
      matrix.decompose(treePose.position, treePose.quaternion, treePose.scale);
      const phase = enabled && !before ? demolitionPhase(Math.hypot(treePose.position.x, treePose.position.z + 6), elapsed, energyJ, 'fixture') : 0;
      treePose.rotation.z += phase * 1.4;
      treePose.position.y -= phase * 0.8;
      treePose.updateMatrix(); trees.setMatrixAt(index, treePose.matrix);
      trees.setColorAt(index, treeColor.copy(intactTreeColor).lerp(fallenTreeColor, phase));
    });
    trees.instanceMatrix.needsUpdate = true;
    if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
  }
  function reset() {
    root.visible = false;
    updateTrees(0, 0, false, false);
    structures.forEach(s => s.originals.forEach((o, i) => { o.visible = s.visible[i]; }));
  }
  return {
    update(elapsed: number, energyJ: number, enabled: boolean, before: boolean) {
      const counts = { buildings: 0, windows: 0, fixtures: 0 };
      updateTrees(elapsed, energyJ, enabled, before);
      root.visible = enabled && !before;
      for (const s of structures) {
        const distance = Math.hypot(s.center.x, s.center.z + 6);
        const phase = enabled ? demolitionPhase(distance, elapsed, energyJ, s.kind) : 0;
        const broken = phase > 0;
        if (broken) {
          if (s.kind === 'wall') counts.buildings++;
          else if (s.kind === 'glass') counts.windows++;
          else counts.fixtures++;
        }
        s.originals.forEach((o, i) => { o.visible = (!broken || before) && s.visible[i]; });
        if (phase === s.lastPhase) continue;
        s.lastPhase = phase;
        for (const p of s.parts) {
          p.mesh.visible = broken;
          const t = phase;
          const tumble = THREE.MathUtils.smoothstep(t, 0, 0.9);
          p.mesh.position.copy(p.home).addScaledVector(p.toss, Math.sin(t * Math.PI / 2));
          const settleY = p.floor + p.scale.y * (s.kind === 'wall' ? 0.22 : 0.03);
          p.mesh.position.y = THREE.MathUtils.lerp(p.home.y, settleY, t * t) + Math.sin(Math.PI * t) * p.toss.y * 0.45;
          p.mesh.rotation.set(p.spin.x * tumble, p.spin.y * tumble, p.spin.z * tumble);
          p.mesh.scale.copy(p.scale);
          // Final support comes from the rotated box bounds: no sinking shards.
          p.mesh.updateMatrixWorld(true);
          const minY = bounds.setFromObject(p.mesh).min.y;
          if (minY < 0.02) p.mesh.position.y += 0.02 - minY;
          if (!broken) p.mesh.scale.setScalar(0);
          p.mesh.updateMatrix();
          batches.get(s.kind)!.setMatrixAt(p.index, p.mesh.matrix);
        }
        if (s.dust) {
          s.dust.visible = broken && phase < 1;
          s.dust.position.copy(s.center); s.dust.position.y = 0.8 + phase * 2;
          s.dust.scale.set(3 + phase * 3, 0.8 + phase * 1.7, 4 + phase * 4);
          (s.dust.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * phase) * 0.23;
        }
      }
      batches.forEach(b => { b.instanceMatrix.needsUpdate = true; });
      return { ...counts, score: demolitionScore(counts) };
    },
    reset,
    dispose() { reset(); root.removeFromParent(); box.dispose(); sphere.dispose(); materials.forEach(m => m.dispose()); },
  };
}
