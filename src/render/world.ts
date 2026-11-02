import * as THREE from 'three';

export interface WorldView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  targetGroup: THREE.Group;
  render: () => void;
  resize: () => void;
  dispose: () => void;
  setTargetDamage: (energy: number, hitX?: number, hitY?: number) => void;
  resetTarget: () => void;
}

const palette = {
  sky: '#dbe4d6',
  grass: '#a9b18a',
  grassDark: '#8c9a73',
  ground: '#d8c5a2',
  lane: '#d4b790',
  cream: '#f6efda',
  orange: '#d96b44',
  sage: '#839b75',
  ink: '#48564a',
  wood: '#b28961',
};

function material(color: THREE.ColorRepresentation, roughness = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function object(geometry: THREE.BufferGeometry, mat: THREE.Material, shadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function labelTexture(text: string, subtitle?: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = subtitle ? 256 : 192;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = palette.cream;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.ink;
  ctx.font = '700 112px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, subtitle ? 104 : 104);
  if (subtitle) {
    ctx.font = '600 31px Arial, sans-serif';
    ctx.fillText(subtitle, 256, 202);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** All scene objects are render adapters. Trajectory and collisions live in simulation/. */
export function createWorld(container: HTMLElement): WorldView {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.sky, 24, 91);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', '野菜を投げる実験場。的まで12メートル。');
  renderer.domElement.setAttribute('role', 'img');
  container.appendChild(renderer.domElement);

  const hemisphere = new THREE.HemisphereLight('#fffae8', '#9c9c77', 2.6);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight('#fff1ce', 3.2);
  sunlight.position.set(-9, 16, 7);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -18;
  sunlight.shadow.camera.right = 18;
  sunlight.shadow.camera.top = 18;
  sunlight.shadow.camera.bottom = -18;
  sunlight.shadow.camera.near = 1;
  sunlight.shadow.camera.far = 65;
  sunlight.shadow.bias = -0.0002;
  sunlight.shadow.normalBias = 0.025;
  sunlight.target.position.set(0, 0, -5);
  scene.add(sunlight, sunlight.target);

  const mats = {
    grass: material(palette.grass),
    grassDark: material(palette.grassDark),
    ground: material(palette.ground),
    lane: material(palette.lane),
    cream: material(palette.cream),
    orange: material(palette.orange),
    sage: material(palette.sage),
    ink: material(palette.ink),
    wood: material(palette.wood),
    paleWood: material('#c5a47a'),
    concrete: material('#dcd5bc'),
  };

  const ground = object(new THREE.PlaneGeometry(210, 210), mats.grass, false);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.025;
  scene.add(ground);

  const clearing = object(new THREE.CircleGeometry(15.5, 64), mats.ground, false);
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.set(0, -0.016, -5.5);
  clearing.scale.set(0.64, 1, 1);
  scene.add(clearing);

  const lane = object(new THREE.PlaneGeometry(4.5, 15.6), mats.lane, false);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.001, -5.8);
  scene.add(lane);

  const stripGeometry = new THREE.PlaneGeometry(0.045, 14.5);
  for (const x of [-2.12, 2.12]) {
    const strip = object(stripGeometry, mats.cream, false);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(x, 0.007, -5.4);
    scene.add(strip);
  }
  for (let z = 0; z >= -12; z--) {
    for (const x of [-2.01, 2.01]) {
      const mark = object(new THREE.PlaneGeometry(z % 5 === 0 ? 0.3 : 0.13, 0.035), mats.cream, false);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, 0.009, z);
      scene.add(mark);
    }
  }
  for (const z of [-5, -10]) {
    const cross = object(new THREE.PlaneGeometry(3.85, 0.023), mats.cream, false);
    cross.rotation.x = -Math.PI / 2;
    cross.position.set(0, 0.008, z);
    scene.add(cross);
    const text = object(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: labelTexture(`${Math.abs(z)} m`), transparent: false }), false);
    text.rotation.x = -Math.PI / 2;
    text.position.set(2.55, 0.014, z + 0.06);
    scene.add(text);
  }

  const launch = object(new THREE.BoxGeometry(4.2, 0.08, 1.6), mats.concrete);
  launch.position.set(0, -0.04, 0.7);
  scene.add(launch);
  const throwLine = object(new THREE.PlaneGeometry(3.8, 0.075), mats.orange, false);
  throwLine.rotation.x = -Math.PI / 2;
  throwLine.position.set(0, 0.004, 0);
  scene.add(throwLine);
  const startCircle = object(new THREE.RingGeometry(0.38, 0.397, 40), mats.cream, false);
  startCircle.rotation.x = -Math.PI / 2;
  startCircle.position.set(0, 0.006, 0.55);
  scene.add(startCircle);

  // The front face is exactly the z = -12 m collision plane.
  const targetGroup = new THREE.Group();
  targetGroup.name = 'target';
  targetGroup.position.set(0, 1.6, -12);
  const back = object(new THREE.CylinderGeometry(1.355, 1.355, 0.11, 64), mats.wood);
  back.rotation.x = Math.PI / 2;
  back.position.z = -0.065;
  targetGroup.add(back);
  const faceGroup = new THREE.Group();
  const ringColors = [mats.cream, mats.sage, mats.cream, mats.orange, mats.cream, mats.orange];
  const ringSizes = [1.3, 1.09, 0.85, 0.61, 0.38, 0.165];
  ringSizes.forEach((radius, index) => {
    const disk = object(new THREE.CircleGeometry(radius, 64), ringColors[index], false);
    disk.position.z = 0.0004 * index;
    faceGroup.add(disk);
  });
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const bolt = object(new THREE.SphereGeometry(0.024, 8, 6), mats.ink, false);
    bolt.scale.z = 0.2;
    bolt.position.set(Math.cos(angle) * 1.255, Math.sin(angle) * 1.255, 0.007);
    faceGroup.add(bolt);
  }
  targetGroup.add(faceGroup);
  scene.add(targetGroup);

  for (const x of [-0.79, 0.79]) {
    const leg = object(new THREE.BoxGeometry(0.13, 2.12, 0.14), mats.wood);
    leg.position.set(x, 1.04, -12.15);
    leg.rotation.z = x > 0 ? -0.13 : 0.13;
    scene.add(leg);
    const brace = object(new THREE.BoxGeometry(0.09, 1.74, 0.09), mats.paleWood);
    brace.position.set(x, 0.77, -12.74);
    brace.rotation.x = -0.68;
    scene.add(brace);
  }
  const beam = object(new THREE.BoxGeometry(2.07, 0.13, 0.16), mats.wood);
  beam.position.set(0, 0.49, -12.2);
  scene.add(beam);
  const rangePlate = object(new THREE.PlaneGeometry(1.15, 0.43), new THREE.MeshStandardMaterial({ map: labelTexture('12 m'), roughness: 0.9 }));
  rangePlate.position.set(0, 0.43, -11.98);
  scene.add(rangePlate);

  const damage = new THREE.Group();
  damage.name = 'target-damage';
  targetGroup.add(damage);

  // A low fence, orchard and distant hills establish scale without cluttering the throwing lane.
  const fenceMat = material('#c7b48d');
  for (let x = -20; x <= 20; x += 2.5) {
    const post = object(new THREE.BoxGeometry(0.095, 0.8, 0.095), fenceMat);
    post.position.set(x, 0.4, -19);
    scene.add(post);
  }
  for (const y of [0.29, 0.62]) {
    const rail = object(new THREE.BoxGeometry(41, 0.07, 0.055), fenceMat);
    rail.position.set(0, y, -19.03);
    scene.add(rail);
  }

  const random = seeded(2000);
  const hillGeo = new THREE.SphereGeometry(1, 24, 12);
  const hills = ['#a5b493', '#aab697', '#b7bea0', '#b9c3aa', '#bbc7b2'];
  for (let i = 0; i < 15; i++) {
    const hill = object(hillGeo, material(hills[i % hills.length]), false);
    hill.position.set(-70 + i * 10 + random() * 5, -0.8, -43 - random() * 27);
    hill.scale.set(10 + random() * 12, 3 + random() * 6, 8 + random() * 7);
    scene.add(hill);
  }

  const treeTrunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 1.5, 6);
  const treeCrownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const treeMat = material('#84946b');
  const treeLightMat = material('#97a478');
  for (let i = 0; i < 18; i++) {
    const x = (i % 2 ? -1 : 1) * (8 + random() * 20);
    const z = -6 - random() * 33;
    const trunk = object(treeTrunkGeometry, mats.wood);
    trunk.position.set(x, 0.75, z);
    scene.add(trunk);
    const crown = object(treeCrownGeometry, i % 3 ? treeMat : treeLightMat);
    crown.position.set(x, 2.1, z);
    crown.scale.set(1.1 + random() * 0.55, 1.5 + random() * 0.7, 1.05 + random() * 0.4);
    scene.add(crown);
  }

  const grassGeometry = new THREE.ConeGeometry(0.07, 0.35, 3);
  const grassInstances = new THREE.InstancedMesh(grassGeometry, mats.grassDark, 190);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 190; i++) {
    const side = i % 2 ? -1 : 1;
    dummy.position.set(side * (4.4 + random() * 15), 0.1, 5 - random() * 28);
    dummy.rotation.set((random() - 0.5) * 0.3, random() * 6.28, (random() - 0.5) * 0.5);
    dummy.scale.setScalar(0.5 + random() * 0.8);
    dummy.updateMatrix();
    grassInstances.setMatrixAt(i, dummy.matrix);
  }
  scene.add(grassInstances);

  // A little barn is intentionally far from the line of fire.
  const barn = new THREE.Group();
  const barnBody = object(new THREE.BoxGeometry(3.9, 2.05, 3.1), material('#b77d61'));
  barnBody.position.y = 1.025;
  barn.add(barnBody);
  const roofGeometry = new THREE.CylinderGeometry(2.42, 2.42, 3.45, 3, 1);
  const roof = object(roofGeometry, material('#747c68'));
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  roof.position.y = 2.38;
  barn.add(roof);
  const door = object(new THREE.PlaneGeometry(1.12, 1.52), material('#6c7461'));
  door.position.set(0, 0.76, 1.558);
  barn.add(door);
  barn.position.set(15, 0, -30);
  barn.rotation.y = -0.19;
  scene.add(barn);

  // Soft cloud silhouettes; no image downloads or runtime external services.
  const cloudMat = new THREE.MeshBasicMaterial({ color: '#f3f0df', fog: true });
  const cloudGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let i = 0; i < 7; i++) {
    const group = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const cloud = object(cloudGeo, cloudMat, false);
      cloud.scale.set(2.8 + random() * 1.6, 0.8 + random() * 0.8, 1.4);
      cloud.position.set(j * 2.4, (j % 2) * 0.65, 0);
      group.add(cloud);
    }
    group.position.set(-42 + i * 13, 13 + random() * 5, -50 - random() * 15);
    scene.add(group);
  }

  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const portrait = width / height < 0.9;
    camera.aspect = width / height;
    camera.fov = portrait ? 53 : 43;
    camera.position.set(portrait ? 3.8 : 5.4, portrait ? 4.5 : 4.0, portrait ? 9.2 : 6.6);
    camera.lookAt(portrait ? -0.1 : 0.1, portrait ? 1.15 : 1.3, -5.2);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  resize();

  function clearDamage(): void {
    for (const child of [...damage.children]) {
      damage.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
    }
  }

  const damageMat = new THREE.MeshStandardMaterial({ color: '#765137', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const crackMat = new THREE.LineBasicMaterial({ color: '#775b41', transparent: true, opacity: 0.87 });
  function setTargetDamage(energy: number, hitX = 0, hitY = 1.6): void {
    clearDamage();
    const x = THREE.MathUtils.clamp(hitX, -1.25, 1.25);
    const y = THREE.MathUtils.clamp(hitY - 1.6, -1.25, 1.25);
    const radius = Math.min(0.18, 0.035 + Math.log10(Math.max(1, energy)) * 0.024);
    const dent = object(new THREE.CircleGeometry(radius, 12), damageMat, false);
    dent.position.set(x, y, 0.009);
    damage.add(dent);
    if (energy > 250) {
      const crackRandom = seeded(Math.round(energy));
      const positions: number[] = [];
      const count = Math.min(11, 3 + Math.floor(Math.log10(energy)));
      const reach = Math.min(0.92, Math.log10(energy) * 0.12);
      for (let i = 0; i < count; i++) {
        const a = i * Math.PI * 2 / count + crackRandom() * 0.3;
        let px = x;
        let py = y;
        for (let j = 1; j <= 4; j++) {
          const nx = x + Math.cos(a + (crackRandom() - 0.5) * 0.3) * reach * j / 4;
          const ny = y + Math.sin(a + (crackRandom() - 0.5) * 0.3) * reach * j / 4;
          if (Math.hypot(nx, ny) < 1.28) positions.push(px, py, 0.011, nx, ny, 0.011);
          px = nx;
          py = ny;
        }
      }
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)), crackMat);
      damage.add(lines);
    }
  }

  let contextLost = false;
  const onLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    container.dispatchEvent(new CustomEvent('rendercontextlost'));
  };
  const onRestored = () => {
    contextLost = false;
    resize();
    container.dispatchEvent(new CustomEvent('rendercontextrestored'));
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);
  renderer.domElement.addEventListener('webglcontextrestored', onRestored);

  return {
    renderer,
    scene,
    camera,
    targetGroup,
    render: () => { if (!contextLost) renderer.render(scene, camera); },
    resize,
    setTargetDamage,
    resetTarget: clearDamage,
    dispose: () => {
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      const geometries = new Set<THREE.BufferGeometry>();
      const usedMaterials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      scene.traverse(child => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          geometries.add(child.geometry);
          (Array.isArray(child.material) ? child.material : [child.material]).forEach(mat => {
            usedMaterials.add(mat);
            if ('map' in mat && mat.map instanceof THREE.Texture) textures.add(mat.map);
          });
        }
      });
      geometries.forEach(geometry => geometry.dispose());
      usedMaterials.forEach(mat => mat.dispose());
      textures.forEach(texture => texture.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
