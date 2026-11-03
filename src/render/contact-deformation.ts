import * as THREE from 'three';

export interface ContactDeformationOptions {
  vegetableId: string;
  radiusM: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  contactSeconds: number;
  severity: number;
  preFragmented: boolean;
}

/** Render-only material transition, not a calibrated fracture or contact solver.
 * This surface represents the same material handed to the debris adapter.
 */
export function createContactDeformation(options: ContactDeformationOptions) {
  const root = new THREE.Group();
  root.name = 'contact-deformation';
  root.position.copy(options.position);
  const normal = options.normal.lengthSq() > 0 ? options.normal.clone().normalize() : new THREE.Vector3(0, 0, 1);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  const palette: Record<string, [number, number]> = {
    tomato: [0xd94729, 0xf18a59], carrot: [0xe48625, 0xf4ad41],
    cucumber: [0x416b32, 0xd9e7a0], eggplant: [0x59416c, 0xeee0ae],
    pumpkin: [0xb97c2f, 0xf1a82f], cabbage: [0x7d9e57, 0xc9d9a0],
  };
  const [skinColor, fleshColor] = palette[options.vegetableId] ?? palette.tomato;
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: options.vegetableId === 'cabbage' ? 0.7 : 0.35, side: THREE.FrontSide });
  const flesh = new THREE.MeshStandardMaterial({ color: fleshColor, roughness: 0.22, side: THREE.BackSide });
  const coreMaterial = new THREE.MeshStandardMaterial({ color: options.vegetableId === 'tomato' ? 0xe76842 : fleshColor, roughness: 0.17, vertexColors: true });
  const seedMaterial = new THREE.MeshStandardMaterial({ color: options.vegetableId === 'tomato' ? 0xf3d483 : 0xf4efd0, roughness: 0.29 });
  const ownedMaterials = [skin, flesh, coreMaterial, seedMaterial];
  const geometries: THREE.BufferGeometry[] = [];
  const sectors: { group: THREE.Group; angle: number; layer: number; speed: number; lift: number; twist: number }[] = [];
  const isLeaf = options.vegetableId === 'cabbage';
  const count = isLeaf ? 9 : options.vegetableId === 'carrot' ? 6 : 8;
  const layers = isLeaf ? 3 : 1;
  let sequence = 2166136261;
  for (const character of options.vegetableId) sequence = Math.imul(sequence ^ character.charCodeAt(0), 16777619);
  const random = () => { sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0; return sequence / 4294967296; };
  const widths = Array.from({ length: count }, () => 0.65 + random() * 0.95);
  const widthSum = widths.reduce((sum, value) => sum + value, 0);
  const boundaries = [0];
  for (const width of widths) boundaries.push(boundaries[boundaries.length - 1] + width / widthSum * Math.PI * 2);
  const seamPhases = Array.from({ length: count }, () => random() * Math.PI * 2);
  const seam = (index: number, polar: number) => {
    const phase = seamPhases[index % count];
    return (Math.sin(polar * 4.7 + phase) * 0.085 + Math.sin(polar * 17.3 + phase * 1.7) * 0.022) * Math.sin(polar);
  };
  for (let layer = 0; layer < layers; layer++) for (let index = 0; index < count; index++) {
    const start = boundaries[index] + layer * 0.23, end = boundaries[index + 1] + layer * 0.23;
    const angle = (start + end) / 2;
    const group = new THREE.Group();
    const positions: number[] = [], indices: number[] = [];
    const across = 9, down = 22;
    for (let v = 0; v <= down; v++) for (let u = 0; u <= across; u++) {
      const polar = Math.PI * v / down;
      const a = start + seam(index, polar), b = end + seam(index + 1, polar);
      const phi = THREE.MathUtils.lerp(a, b, u / across);
      const ridge = 1 + (isLeaf ? 0.06 : 0.035) * Math.sin(phi * 5 + Math.cos(polar) * 4 + layer);
      const radial = (1 - layer * 0.09) * Math.sin(polar) * ridge;
      positions.push(-Math.cos(phi) * radial, -Math.sin(phi) * radial, Math.cos(polar) * (1 - layer * 0.09));
      if (v < down && u < across) {
        const i = v * (across + 1) + u;
        indices.push(i, i + across + 1, i + 1, i + 1, i + across + 1, i + across + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometries.push(geometry);
    const outer = new THREE.Mesh(geometry, skin);
    const inner = new THREE.Mesh(geometry, flesh);
    inner.scale.setScalar(0.985);
    outer.castShadow = true;
    inner.castShadow = true;
    group.add(outer, inner);
    sectors.push({ group, angle: angle + Math.PI, layer, speed: 0.72 + random() * 0.55,
      lift: 0.55 + random() * 0.7, twist: (random() - 0.5) * 0.65 });
    root.add(group);
  }
  const core = new THREE.Group();
  core.name = 'wet-flesh-core';
  root.add(core);
  const coreGeometry = new THREE.SphereGeometry(isLeaf ? 0.7 : 0.93, 28, 18);
  const corePositions = coreGeometry.getAttribute('position');
  const coreBase = Float32Array.from(corePositions.array);
  const colors: number[] = [];
  const tint = new THREE.Color();
  for (let i = 0; i < corePositions.count; i++) {
    const x = corePositions.getX(i), y = corePositions.getY(i), z = corePositions.getZ(i);
    const phi = Math.atan2(y, x);
    const chamber = 0.5 + 0.5 * Math.sin(phi * 5 + z * 6);
    tint.setRGB(0.76 + chamber * 0.24, 0.75 + chamber * 0.25, 0.70 + chamber * 0.30);
    colors.push(tint.r, tint.g, tint.b);
  }
  coreGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometries.push(coreGeometry);
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.castShadow = true;
  core.add(coreMesh);
  if (options.vegetableId === 'tomato' || options.vegetableId === 'cucumber') {
    const seedGeometry = new THREE.SphereGeometry(1, 6, 5);
    geometries.push(seedGeometry);
    const tomato = options.vegetableId === 'tomato';
    const seedCount = tomato ? 26 : 18;
    const seeds = new THREE.InstancedMesh(seedGeometry, seedMaterial, seedCount);
    seeds.name = 'embedded-seeds';
    const transform = new THREE.Object3D();
    for (let i = 0; i < seedCount; i++) {
      const phi = i * 2.399963 + (random() - 0.5) * 0.4;
      const r = tomato ? 0.35 + random() * 0.38 : 0.12 + random() * 0.13;
      const x = Math.cos(phi) * r, y = tomato ? Math.sin(phi) * r : (i / (seedCount - 1) - 0.5) * 1.5;
      transform.position.set(x, y, Math.sqrt(Math.max(0.02, 0.93 ** 2 - x * x - y * y)) + 0.005);
      transform.rotation.set(0.1, phi * 0.3, phi);
      transform.scale.set(0.032, tomato ? 0.06 : 0.075, 0.014);
      transform.updateMatrix(); seeds.setMatrixAt(i, transform.matrix);
    }
    seeds.instanceMatrix.needsUpdate = true;
    core.add(seeds);
  }
  const radius = Math.max(0.001, options.radiusM);
  const duration = Math.max(1e-7, options.contactSeconds);
  const severity = THREE.MathUtils.clamp(options.severity, 0, 1);
  const soft = (a: number, b: number, value: number) => THREE.MathUtils.smoothstep(value, a, b);

  /** Returns debris handoff 0..1. The incoming material is never duplicated opaque. */
  function update(ageSeconds: number): number {
    if (options.preFragmented) { root.visible = false; return 1; }
    const age = Math.max(0, Number.isFinite(ageSeconds) ? ageSeconds : 0) / duration;
    const compression = soft(0, 0.8, age);
    const tearing = soft(0.55, 1.8, age);
    const handoff = soft(0.8, 2.5, age);
    root.visible = handoff < 1;
    const depth = THREE.MathUtils.lerp(1, 0.22, compression);
    const spread = 1 / Math.sqrt(depth);
    const longitudinal = options.vegetableId === 'carrot' || options.vegetableId === 'cucumber' ? 1.55 : 1;
    const asymmetry = 1 + compression * 0.09;
    for (const sector of sectors) {
      const { group, angle, layer } = sector;
      const localTear = soft(0.55, 1.8, age * sector.speed);
      const opening = localTear * (0.18 + severity * 0.3) * (1 - layer * 0.12);
      group.position.set(Math.cos(angle) * radius * opening,
        Math.sin(angle) * radius * opening, radius * depth / Math.sqrt(longitudinal) * (1 - layer * 0.04));
      group.rotation.set(Math.sin(angle) * localTear * sector.lift, -Math.cos(angle) * localTear * sector.lift, localTear * sector.twist);
      group.scale.set(radius * spread * asymmetry / Math.sqrt(longitudinal), radius * spread * longitudinal / asymmetry,
        radius * depth / Math.sqrt(longitudinal));
    }
    core.position.z = radius * depth / Math.sqrt(longitudinal);
    core.scale.set(radius * spread * asymmetry / Math.sqrt(longitudinal), radius * spread * longitudinal / asymmetry,
      radius * depth / Math.sqrt(longitudinal));
    for (let i = 0; i < corePositions.count; i++) {
      const x = coreBase[i * 3], y = coreBase[i * 3 + 1], z = coreBase[i * 3 + 2];
      const phi = Math.atan2(y, x);
      const bulge = 1 + tearing * (0.055 * Math.sin(phi * 5 + z * 7) + 0.04 * Math.sin(y * 8 - x * 5));
      corePositions.setXYZ(i, x * bulge, y * bulge, z / (bulge * bulge));
    }
    corePositions.needsUpdate = true;
    coreGeometry.computeVertexNormals();
    // Dither-free crossfade is view-only; no mass or energy is emitted here.
    for (const material of ownedMaterials) {
      material.transparent = handoff > 0;
      material.opacity = 1 - handoff;
      material.depthWrite = handoff === 0;
    }
    return handoff;
  }
  update(0);
  function dispose() {
    root.removeFromParent();
    geometries.forEach(geometry => geometry.dispose());
    ownedMaterials.forEach(material => material.dispose());
    root.clear();
  }
  return { root, update, dispose };
}
