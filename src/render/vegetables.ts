import * as THREE from 'three';

const materials = {
  tomato: new THREE.MeshStandardMaterial({ color: '#e74626', roughness: 0.48 }),
  tomatoLight: new THREE.MeshStandardMaterial({ color: '#ef5b32', roughness: 0.5 }),
  leaf: new THREE.MeshStandardMaterial({ color: '#47713e', roughness: 0.88, side: THREE.DoubleSide }),
  leafLight: new THREE.MeshStandardMaterial({ color: '#71904d', roughness: 0.9, side: THREE.DoubleSide }),
  carrot: new THREE.MeshStandardMaterial({ color: '#f18b30', roughness: 0.76 }),
  carrotLine: new THREE.MeshStandardMaterial({ color: '#ba6028', roughness: 0.9 }),
  cucumber: new THREE.MeshStandardMaterial({ color: '#41623a', roughness: 0.65 }),
  cucumberLight: new THREE.MeshStandardMaterial({ color: '#6e8743', roughness: 0.75 }),
  eggplant: new THREE.MeshStandardMaterial({ color: '#604163', roughness: 0.36 }),
  pumpkin: new THREE.MeshStandardMaterial({ color: '#dc8b30', roughness: 0.76 }),
  pumpkinLight: new THREE.MeshStandardMaterial({ color: '#e79a39', roughness: 0.76 }),
  stem: new THREE.MeshStandardMaterial({ color: '#6f6e39', roughness: 0.9 }),
  cabbage: new THREE.MeshStandardMaterial({ color: '#9aaf65', roughness: 0.91 }),
  cabbageOuter: new THREE.MeshStandardMaterial({ color: '#779257', roughness: 0.91, side: THREE.DoubleSide }),
};

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const item = new THREE.Mesh(geometry, material);
  item.castShadow = true;
  item.receiveShadow = true;
  return item;
}

function leaf(length: number, width: number, material = materials.leaf): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.quadraticCurveTo(width, length * 0.4, 0, length);
  shape.quadraticCurveTo(-width, length * 0.4, 0, 0);
  return mesh(new THREE.ShapeGeometry(shape, 4), material);
}

function crown(group: THREE.Group, y: number, length: number, count = 5): void {
  for (let i = 0; i < count; i++) {
    const item = leaf(length, length * 0.22, i % 2 ? materials.leaf : materials.leafLight);
    item.position.y = y;
    item.rotation.set(-Math.PI * 0.42, i * Math.PI * 2 / count, 0);
    group.add(item);
  }
}

/** Geometry sizes are metres. Render-only geometry; no simulation state is stored here. */
export function createVegetable(id: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `vegetable-${id}`;

  if (id === 'tomato') {
    group.scale.setScalar(0.6);
    const body = mesh(new THREE.SphereGeometry(0.054, 20, 14), materials.tomato);
    body.scale.y = 0.84;
    group.add(body);
    for (let i = 0; i < 5; i++) {
      const lobe = mesh(new THREE.SphereGeometry(0.034, 10, 8), i % 2 ? materials.tomato : materials.tomatoLight);
      lobe.position.set(Math.sin(i * 1.2566) * 0.024, 0, Math.cos(i * 1.2566) * 0.024);
      lobe.scale.y = 1.1;
      group.add(lobe);
    }
    crown(group, 0.046, 0.032);
    const stem = mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.022, 6), materials.stem);
    stem.position.y = 0.052;
    stem.rotation.z = -0.22;
    group.add(stem);
  } else if (id === 'carrot') {
    const body = mesh(new THREE.ConeGeometry(0.028, 0.19, 14), materials.carrot);
    body.rotation.z = Math.PI;
    body.position.y = -0.023;
    group.add(body);
    for (let i = 0; i < 5; i++) {
      const line = mesh(new THREE.TorusGeometry(0.026 - i * 0.004, 0.0009, 4, 14, Math.PI * 0.8), materials.carrotLine);
      line.rotation.x = Math.PI / 2;
      line.rotation.z = i * 0.9;
      line.position.y = 0.055 - i * 0.03;
      group.add(line);
    }
    for (let i = 0; i < 7; i++) {
      const frond = leaf(0.11 + (i % 3) * 0.018, 0.019, i % 2 ? materials.leaf : materials.leafLight);
      frond.position.y = 0.066;
      frond.rotation.set(0.3 + (i % 2) * 0.3, i * 0.91, Math.sin(i * 2) * 0.45);
      group.add(frond);
    }
  } else if (id === 'cucumber') {
    const body = mesh(new THREE.CapsuleGeometry(0.026, 0.17, 5, 12), materials.cucumber);
    body.rotation.z = -0.13;
    group.add(body);
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7;
      const stripe = mesh(new THREE.CapsuleGeometry(0.0028, 0.16, 3, 5), materials.cucumberLight);
      stripe.position.set(Math.sin(angle) * 0.025, 0, Math.cos(angle) * 0.025);
      stripe.rotation.z = -0.13;
      group.add(stripe);
    }
    const stem = mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.018, 5), materials.stem);
    stem.position.y = 0.12;
    group.add(stem);
  } else if (id === 'eggplant') {
    const body = mesh(new THREE.SphereGeometry(0.046, 18, 14), materials.eggplant);
    body.scale.set(1, 1.85, 0.87);
    body.position.y = -0.025;
    group.add(body);
    const neck = mesh(new THREE.SphereGeometry(0.027, 12, 9), materials.eggplant);
    neck.scale.y = 1.6;
    neck.position.set(0.012, 0.046, 0);
    group.add(neck);
    crown(group, 0.077, 0.035, 6);
    const stem = mesh(new THREE.CylinderGeometry(0.005, 0.009, 0.037, 7), materials.leaf);
    stem.position.set(0.01, 0.09, 0);
    stem.rotation.z = -0.32;
    group.add(stem);
  } else if (id === 'pumpkin') {
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI * 2 / 10;
      const lobe = mesh(new THREE.SphereGeometry(0.087, 12, 11), i % 2 ? materials.pumpkin : materials.pumpkinLight);
      lobe.position.set(Math.sin(angle) * 0.058, 0, Math.cos(angle) * 0.058);
      lobe.scale.set(0.84, 1.16, 0.84);
      group.add(lobe);
    }
    const stem = mesh(new THREE.CylinderGeometry(0.012, 0.021, 0.052, 7), materials.stem);
    stem.position.y = 0.113;
    stem.rotation.z = -0.17;
    group.add(stem);
    crown(group, 0.09, 0.045, 5);
  } else if (id === 'cabbage') {
    const body = mesh(new THREE.SphereGeometry(0.103, 18, 14), materials.cabbage);
    body.scale.y = 0.93;
    group.add(body);
    for (let i = 0; i < 9; i++) {
      const angle = i * Math.PI * 2 / 9;
      const outer = mesh(new THREE.SphereGeometry(0.077, 10, 9, 0, Math.PI * 2, 0.15, Math.PI * 0.72), i % 2 ? materials.cabbageOuter : materials.cabbage);
      outer.position.set(Math.sin(angle) * 0.043, -0.012, Math.cos(angle) * 0.043);
      outer.scale.set(1, 1.15, 0.65);
      outer.rotation.set(0.25, angle, 0.25);
      group.add(outer);
    }
    for (let i = 0; i < 5; i++) {
      const vein = mesh(new THREE.TorusGeometry(0.086 - i * 0.009, 0.0015, 3, 20, Math.PI * 1.2), materials.leafLight);
      vein.rotation.set(Math.PI * 0.37, i * 1.3, i * 0.8);
      vein.position.y = 0.018;
      group.add(vein);
    }
  } else {
    group.add(mesh(new THREE.SphereGeometry(0.055, 16, 12), materials.tomato));
  }

  return group;
}
