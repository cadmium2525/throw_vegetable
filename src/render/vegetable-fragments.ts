import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

type Parcel = { radiusM: number; kind: string };
type DebrisKind = 'pulp' | 'skin' | 'drop' | 'chip' | 'wedge' | 'leaf';
type Palette = { flesh: number; deep: number; skin: number; vein: number; roughness: number };
type Bucket = { mesh: THREE.InstancedMesh; kind: DebrisKind; next: number };
type Instance = { bucket: Bucket; slot: number; shape: THREE.Vector3 };

const PALETTES: Record<string, Palette> = {
  tomato: { flesh: 0xf16a41, deep: 0xbf2d1d, skin: 0xe74626, vein: 0xffc66e, roughness: 0.25 },
  carrot: { flesh: 0xffac49, deep: 0xe57a25, skin: 0xed8a32, vein: 0xffd17b, roughness: 0.67 },
  cucumber: { flesh: 0xdce9b5, deep: 0x9fbb78, skin: 0x41623a, vein: 0xf7f0cd, roughness: 0.32 },
  eggplant: { flesh: 0xeee5c6, deep: 0xc0bc8f, skin: 0x604163, vein: 0xf7f0dc, roughness: 0.54 },
  pumpkin: { flesh: 0xffb23c, deep: 0xe18727, skin: 0x6c783f, vein: 0xffd171, roughness: 0.56 },
  cabbage: { flesh: 0xcbdc9b, deep: 0x7b9d58, skin: 0x84a45e, vein: 0xf0eecb, roughness: 0.82 },
};

function tint(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const colors = new Float32Array(geometry.getAttribute('position').count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function merge(parts: THREE.BufferGeometry[]) {
  const normalized = parts.map(part => part.index ? part.toNonIndexed() : part.clone());
  const result = mergeGeometries(normalized)!;
  normalized.forEach(part => part.dispose());
  parts.forEach(part => part.dispose());
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** Curled, irregular-edged sheet; the underside exposes pale flesh.
 * Geometry is a visual vocabulary, not a material-fracture solution.
 */
function tornSheet(palette: Palette, leafy: boolean) {
  const columns = leafy ? 14 : 9, rows = leafy ? 18 : 11;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const skin = new THREE.Color(leafy ? palette.flesh : palette.skin);
  const under = new THREE.Color(palette.flesh).lerp(new THREE.Color(palette.vein), 0.38);
  const deep = new THREE.Color(palette.deep), vein = new THREE.Color(palette.vein);
  const stride = columns + 1, layerSize = stride * (rows + 1);
  for (let side = 0; side < 2; side++) for (let y = 0; y <= rows; y++) for (let x = 0; x <= columns; x++) {
    const v = y / rows * 2 - 1, u = x / columns * 2 - 1;
    const edge = 1 + 0.09 * Math.sin(y * 3.7) + 0.05 * Math.cos(y * 1.7);
    const width = leafy ? 0.48 + 0.53 * Math.sqrt(Math.max(0, 1 - v * v)) : 1;
    const px = u * width * edge;
    const py = v * (1 + 0.06 * Math.sin(x * 3.1));
    const curve = leafy ? 0.38 * px * px + 0.16 * Math.sin(v * 3) + 0.09 * px * v
      : 0.28 * (px * px + py * py) + 0.08 * Math.sin(v * 3.4);
    positions.push(px, py, curve + (side ? -0.035 : 0.035));
    const rib = leafy && (Math.abs(u) < 0.10 || Math.abs(Math.abs(u) - ((v + 1) * 2.5 % 0.52)) < 0.065);
    const color = (side ? under : skin).clone().lerp(deep, 0.10 + 0.10 * Math.sin(x * 1.6 + y * 0.9));
    if (rib) color.lerp(vein, Math.abs(u) < 0.10 ? 0.85 : 0.55);
    color.toArray(colors, colors.length);
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = y * stride + x, b = a + 1, c = a + stride, d = c + 1;
    indices.push(a, b, d, a, d, c, a + layerSize, d + layerSize, b + layerSize, a + layerSize, c + layerSize, d + layerSize);
  }
  const connectEdge = (a: number, b: number) => indices.push(a, a + layerSize, b + layerSize, a, b + layerSize, b);
  for (let x = 0; x < columns; x++) {
    connectEdge(x + 1, x);
    connectEdge(rows * stride + x, rows * stride + x + 1);
  }
  for (let y = 0; y < rows; y++) {
    connectEdge(y * stride, (y + 1) * stride);
    connectEdge((y + 1) * stride + columns, y * stride + columns);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function fleshChunk(palette: Palette, vegetableId: string) {
  const geometry = new THREE.SphereGeometry(1, 11, 8);
  const positions = geometry.getAttribute('position');
  const colors: number[] = [];
  const light = new THREE.Color(palette.flesh), dark = new THREE.Color(palette.deep);
  const skin = new THREE.Color(palette.skin), vein = new THREE.Color(palette.vein);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const irregularity = 0.87 + 0.12 * Math.sin(x * 7 + y * 3) * Math.cos(z * 5 - y * 2);
    const face = z > 0.42;
    const cutZ = face ? 0.42 + 0.035 * Math.sin(x * 15 + y * 11) : z;
    positions.setXYZ(i, x * irregularity, y * irregularity, cutZ * irregularity);
    const fiber = vegetableId === 'carrot' || vegetableId === 'eggplant'
      ? 0.15 * (0.5 + 0.5 * Math.sin(x * 48 + z * 12)) : 0;
    const color = light.clone().lerp(dark, 0.08 + fiber + 0.13 * (1 - y) / 2);
    if (vegetableId !== 'tomato' && vegetableId !== 'cabbage' && !face && z < -0.7) color.lerp(skin, 0.8);
    if (face) color.lerp(vein, 0.22);
    color.toArray(colors, colors.length);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const parts = [geometry];
  // Exposed cucumber flesh carries visible seed pockets instead of green gravel.
  if (vegetableId === 'cucumber') for (let i = 0; i < 5; i++) {
    const theta = i / 5 * Math.PI * 2;
    const seed = new THREE.SphereGeometry(1, 5, 4);
    seed.scale(0.10, 0.19, 0.045);
    seed.rotateZ(-theta);
    seed.translate(Math.sin(theta) * 0.38, Math.cos(theta) * 0.38, 0.405);
    tint(seed, new THREE.Color(palette.vein)); parts.push(seed);
  }
  return merge(parts);
}

function geometryFor(kind: DebrisKind, palette: Palette, vegetableId: string) {
  if (kind === 'skin' || kind === 'leaf') return tornSheet(palette, kind === 'leaf');
  if (kind === 'pulp') return fleshChunk(palette, vegetableId);
  if (kind === 'drop') {
    const geometry = new THREE.SphereGeometry(1, 9, 7);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i), taper = 0.88 - 0.20 * y;
      positions.setXYZ(i, positions.getX(i) * taper, y, positions.getZ(i) * taper);
    }
    geometry.computeVertexNormals();
    return merge([tint(geometry, new THREE.Color(palette.flesh))]);
  }
  if (kind === 'chip') {
    const geometry = new THREE.CylinderGeometry(0.75, 0.48, 2, 5, 1);
    geometry.rotateZ(0.18);
    const positions = geometry.getAttribute('position'), colors: number[] = [];
    for (let i = 0; i < positions.count; i++) {
      const color = new THREE.Color(palette.flesh).lerp(new THREE.Color(palette.vein), positions.getY(i) > 0.8 ? 0.55 : 0.08);
      color.toArray(colors, colors.length);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return merge([geometry]);
  }
  const geometry = new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 0.60);
  const colors: number[] = [];
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const color = new THREE.Color(palette.flesh).lerp(new THREE.Color(palette.skin), positions.getZ(i) < -0.25 ? 0.8 : 0);
    color.toArray(colors, colors.length);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Two rough cut faces close the rind wedge, with lighter exposed flesh.
  const face = new THREE.CircleGeometry(0.99, 8, 0, Math.PI);
  face.rotateZ(Math.PI / 2); face.rotateY(Math.PI / 2);
  tint(face, new THREE.Color(palette.flesh));
  const otherFace = face.clone(); otherFace.rotateY(Math.PI * 0.60);
  return merge([geometry, face, otherFace]);
}

function kindFor(id: string, index: number, kind: string): DebrisKind {
  const selector = (index * 7 + (kind === 'deposit' ? 3 : 0)) % 20;
  if (id === 'cabbage') return selector < 16 ? 'leaf' : 'pulp';
  if (id === 'carrot') return selector < 15 ? 'chip' : 'pulp';
  if (id === 'pumpkin') return selector < 5 ? 'wedge' : selector < 16 ? 'pulp' : 'drop';
  if (id === 'eggplant') return selector < 6 ? 'skin' : selector < 18 ? 'pulp' : 'drop';
  if (id === 'cucumber') return selector < 5 ? 'skin' : selector < 13 ? 'pulp' : 'drop';
  return selector < 4 ? 'skin' : selector < 13 ? 'pulp' : 'drop';
}

/** Render-only anatomy for existing simulated parcels. No new mass, trajectories,
 * fracture thresholds or extra detached objects are introduced here.
 */
export function createVegetableDebris(vegetableId: string, particles: readonly Parcel[], skinColor: number) {
  const root = new THREE.Group(); root.name = `anatomical-debris-${vegetableId}`;
  const palette = { ...(PALETTES[vegetableId] ?? PALETTES.tomato) };
  if (vegetableId !== 'pumpkin') palette.skin = skinColor;
  const counts = new Map<DebrisKind, number>();
  const radii = particles.map(p => p.radiusM).sort((a, b) => a - b);
  const medianRadius = radii[Math.floor(radii.length / 2)] ?? 1;
  const kinds = particles.map((p, i): DebrisKind => {
    if (p.radiusM > medianRadius * 1.25) {
      return vegetableId === 'cabbage' ? 'leaf' : vegetableId === 'carrot' ? 'chip'
        : vegetableId === 'pumpkin' && i % 3 === 0 ? 'wedge' : 'pulp';
    }
    if (p.radiusM < medianRadius * 0.7 && !['carrot', 'cabbage', 'eggplant'].includes(vegetableId)) return 'drop';
    return kindFor(vegetableId, i, p.kind);
  });
  kinds.forEach(kind => counts.set(kind, (counts.get(kind) ?? 0) + 1));
  const buckets = new Map<DebrisKind, Bucket>();
  for (const [kind, count] of counts) {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: kind === 'drop' ? 0.16 : kind === 'skin' ? 0.31 : palette.roughness,
      metalness: 0, side: kind === 'leaf' || kind === 'skin' || kind === 'wedge' ? THREE.DoubleSide : THREE.FrontSide,
    });
    const mesh = new THREE.InstancedMesh(geometryFor(kind, palette, vegetableId), material, count);
    mesh.name = `debris-${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    root.add(mesh); buckets.set(kind, { mesh, kind, next: 0 });
  }
  const transform = new THREE.Object3D();
  const instances: Instance[] = particles.map((particle, i) => {
    const bucket = buckets.get(kinds[i])!, t = (Math.sin(i * 127.1 + 8.4) * 43758.5453) % 1;
    const variety = 0.9 + Math.abs(t) * 0.2;
    const shape = bucket.kind === 'skin' ? new THREE.Vector3(1.25 * variety, 1.35 / variety, 0.8)
      : bucket.kind === 'leaf' ? new THREE.Vector3(1.25 * variety, 1.5 / variety, 0.9)
      : bucket.kind === 'drop' ? new THREE.Vector3(0.67, 1.6 * variety, 0.67 / variety)
      : bucket.kind === 'chip' ? new THREE.Vector3(0.75 * variety, 1.3 / variety, 0.7)
      : new THREE.Vector3(0.9 * variety, 1.02 / variety, 0.95);
    const slot = bucket.next++;
    transform.position.set(0, 0, 0); transform.scale.setScalar(0); transform.updateMatrix();
    bucket.mesh.setMatrixAt(slot, transform.matrix);
    return { bucket, slot, shape };
  });
  let disposed = false;
  function updateParticle(index: number, position: THREE.Vector3, rotation: THREE.Euler, radiusM: number, landed: boolean, adhering: boolean) {
    if (disposed) return;
    const instance = instances[index];
    if (!instance) return;
    const { bucket, slot, shape } = instance;
    const bounds = bucket.mesh.geometry.boundingBox!;
    transform.position.copy(position); transform.rotation.copy(rotation);
    transform.scale.copy(shape).multiplyScalar(radiusM);
    if (adhering) {
      transform.rotation.set(0, 0, rotation.z);
      transform.scale.z *= 0.14;
      // The supplied z is the target face, not a parcel center behind that face.
      transform.position.z -= bounds.min.z * transform.scale.z;
    } else if (landed) {
      transform.rotation.set(0, rotation.y, 0);
      transform.scale.y *= bucket.kind === 'chip' || bucket.kind === 'wedge' ? 0.65 : 0.35;
      transform.position.y = -bounds.min.y * transform.scale.y + 0.001;
    }
    transform.updateMatrix(); bucket.mesh.setMatrixAt(slot, transform.matrix);
    bucket.mesh.instanceMatrix.needsUpdate = true;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; root.removeFromParent();
    for (const { mesh } of buckets.values()) {
      mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
    root.clear();
  }
  function setOpacity(opacity: number) {
    const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
    for (const { mesh } of buckets.values()) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.opacity = alpha;
      material.transparent = alpha < 1;
      material.depthWrite = alpha >= 1;
      mesh.visible = alpha > 0;
    }
  }
  return { root, updateParticle, setOpacity, dispose };
}
