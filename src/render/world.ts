import * as THREE from 'three';

export interface WorldView {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  targetGroup: THREE.Group;
  render: () => void;
  update: (dtSeconds: number) => void;
  resize: () => void;
  dispose: () => void;
  setTargetDamage: (energy: number, hitX?: number, hitY?: number, response?: TargetDamageResponse) => void;
  resetTarget: () => void;
}

export interface TargetDamageResponse {
  target: 'none' | 'dent' | 'cracked' | 'breached';
  holeRadiusM: number;
  severity: number;
}

const palette = {
  sky: '#dbe4d6',
  grass: '#a9b5ac',
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

/**
 * A thin, painted plywood disk made of independent prism patches in one mesh.
 * Damage removes real front/back/edge geometry. The appearance and splinter
 * motion illustrate the supplied response; they are not a fracture solver.
 */
export function createPlywoodBoard() {
  const group = new THREE.Group();
  group.name = 'segmented-plywood-12mm';
  type Patch = { x: number; y: number; vertices: number[]; paint: THREE.Color; phase: number };
  type MovingPatch = { offset: number; length: number; x: number; y: number; axis: THREE.Vector3; angle: number; phase: number; shrink: number; dent: number };
  type Splinter = { position: THREE.Vector3; velocity: THREE.Vector3; rotation: THREE.Euler; spin: THREE.Vector3; scale: THREE.Vector3; age: number };
  const patches: Patch[] = [];
  const paintColors = ['#d96b44', '#f6efda', '#d96b44', '#f6efda', '#839b75', '#f6efda'].map(c => new THREE.Color(c));
  const paintBounds = [0.165, 0.38, 0.61, 0.85, 1.09, 1.3];
  const woodColor = new THREE.Color('#bd9668');
  const darkWoodColor = new THREE.Color('#a27b52');
  const boardMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, flatShading: true });
  const board = object(new THREE.BufferGeometry(), boardMaterial);
  board.name = 'breakable-painted-plywood';
  board.frustumCulled = false;
  group.add(board);
  const decals = new THREE.Group();
  group.add(decals);
  const dentMaterial = new THREE.MeshStandardMaterial({ color: '#795b3f', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
  const crackMaterial = new THREE.LineBasicMaterial({ color: '#6b4f35' });

  const radii = [0];
  let lastRadius = 0;
  for (const boundary of paintBounds) {
    const steps = Math.ceil((boundary - lastRadius) / 0.08);
    for (let step = 1; step <= steps; step++) radii.push(THREE.MathUtils.lerp(lastRadius, boundary, step / steps));
    lastRadius = boundary;
  }
  const sectorCount = 64;
  const faceZ = 0;
  const backZ = -0.012;
  for (let ring = 0; ring < radii.length - 1; ring++) {
    const inner = radii[ring];
    const outer = radii[ring + 1];
    for (let sector = 0; sector < sectorCount; sector++) {
      const a = sector * Math.PI * 2 / sectorCount;
      const b = (sector + 1) * Math.PI * 2 / sectorCount;
      const corners = [
        [Math.cos(a) * inner, Math.sin(a) * inner],
        [Math.cos(a) * outer, Math.sin(a) * outer],
        [Math.cos(b) * outer, Math.sin(b) * outer],
        [Math.cos(b) * inner, Math.sin(b) * inner],
      ];
      const vertices: number[] = [];
      const triangle = (i: number, j: number, k: number, z: number) => {
        for (const index of [i, j, k]) vertices.push(corners[index][0], corners[index][1], z);
      };
      // Front faces are counterclockwise from the throwing side (+z).
      triangle(0, 1, 2, faceZ);
      triangle(0, 2, 3, faceZ);
      triangle(0, 2, 1, backZ);
      triangle(0, 3, 2, backZ);
      for (let edge = 0; edge < 4; edge++) {
        const next = (edge + 1) % 4;
        const p = corners[edge];
        const q = corners[next];
        vertices.push(p[0], p[1], faceZ, p[0], p[1], backZ, q[0], q[1], backZ);
        vertices.push(p[0], p[1], faceZ, q[0], q[1], backZ, q[0], q[1], faceZ);
      }
      const radius = (inner + outer) / 2;
      const angle = (a + b) / 2;
      const colorIndex = paintBounds.findIndex(boundary => radius <= boundary);
      patches.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vertices, paint: paintColors[colorIndex], phase: Math.sin(sector * 12.9898 + ring * 78.233) * 43758.5453 % 1 });
    }
  }

  let movingPatches: MovingPatch[] = [];
  let originalPositions = new Float32Array();
  let originalNormals = new Float32Array();
  let damageElapsed = 0;
  let damaged = false;
  const splinters: Splinter[] = [];
  const splinterMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93, flatShading: true });
  const splinterMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), splinterMaterial, 96);
  splinterMesh.name = 'flying-plywood-splinters';
  splinterMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  splinterMesh.castShadow = true;
  splinterMesh.frustumCulled = false;
  splinterMesh.count = 0;
  group.add(splinterMesh);
  const instanceDummy = new THREE.Object3D();
  const rotation = new THREE.Quaternion();
  const vertex = new THREE.Vector3();

  function clearDecals() {
    for (const child of [...decals.children]) {
      decals.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) child.geometry.dispose();
    }
  }

  function rebuild(x = 0, y = 0, response?: TargetDamageResponse): Patch[] {
    const positions: number[] = [];
    const colors: number[] = [];
    const removed: Patch[] = [];
    movingPatches = [];
    const severity = response ? THREE.MathUtils.clamp(response.severity, 0, 1) : 0;
    const holeRadius = response?.target === 'breached' ? THREE.MathUtils.clamp(response.holeRadiusM, 0.045, 1.18) : 0;
    const influence = holeRadius + (response?.target === 'cracked' ? 0.4 : 0.18 + severity * 0.22);
    for (const patch of patches) {
      const dx = patch.x - x;
      const dy = patch.y - y;
      const distance = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const jaggedRadius = holeRadius * (1 + 0.08 * Math.sin(angle * 13 + 1.4) + 0.055 * Math.sin(angle * 7));
      if (holeRadius && distance < jaggedRadius) { removed.push(patch); continue; }
      const offset = positions.length;
      positions.push(...patch.vertices);
      for (let i = 0; i < patch.vertices.length; i += 3) {
        const color = i < 18 ? patch.paint : i < 36 ? woodColor : darkWoodColor;
        colors.push(color.r, color.g, color.b);
      }
      if (response && response.target !== 'none' && distance < influence && distance > holeRadius * 0.88) {
        const falloff = 1 - THREE.MathUtils.clamp((distance - holeRadius) / Math.max(0.001, influence - holeRadius), 0, 1);
        const isFracture = response.target === 'cracked' || response.target === 'breached';
        movingPatches.push({
          offset, length: patch.vertices.length, x: patch.x, y: patch.y,
          axis: new THREE.Vector3(-dy, dx, 0).normalize(),
          angle: isFracture ? falloff * (response.target === 'breached' ? 0.28 + severity * 0.62 : 0.06 + severity * 0.1) : 0,
          phase: patch.phase * Math.PI * 2,
          shrink: isFracture ? 1 - falloff * (response.target === 'breached' ? 0.09 : 0.025) : 1,
          dent: response.target === 'dent' ? -0.006 * falloff : -0.012 * falloff,
        });
      }
    }
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.Float32BufferAttribute(positions, 3);
    position.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', position);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    (geometry.getAttribute('normal') as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    originalPositions = new Float32Array(position.array);
    originalNormals = new Float32Array(geometry.getAttribute('normal').array);
    board.geometry.dispose();
    board.geometry = geometry;
    return removed;
  }

  function reset() {
    clearDecals();
    splinters.length = 0;
    splinterMesh.count = 0;
    damageElapsed = 0;
    if (damaged) rebuild();
    damaged = false;
  }

  function setDamage(energy: number, hitX = 0, hitY = 1.6, response?: TargetDamageResponse) {
    reset();
    const x = THREE.MathUtils.clamp(hitX, -1.3, 1.3);
    const y = THREE.MathUtils.clamp(hitY - 1.6, -1.3, 1.3);
    const safeEnergy = Math.max(0, Number.isFinite(energy) ? energy : 0);
    const state: TargetDamageResponse = response ?? {
      target: safeEnergy < 8 ? 'none' : safeEnergy < 250 ? 'dent' : safeEnergy < 1800 ? 'cracked' : 'breached',
      holeRadiusM: THREE.MathUtils.clamp(Math.sqrt(safeEnergy) * 0.0027, 0.065, 1.05),
      severity: THREE.MathUtils.clamp(Math.log10(safeEnergy + 1) / 5, 0, 1),
    };
    if (state.target === 'none') return;
    damaged = true;
    const removed = rebuild(x, y, state);
    const random = seeded(Math.round(safeEnergy * 31) + 17);
    if (state.target !== 'breached') {
      const radius = Math.min(0.1, 0.025 + Math.log10(safeEnergy + 1) * 0.013);
      const dent = object(new THREE.CircleGeometry(radius, 13), dentMaterial, false);
      dent.position.set(x, y, 0.001);
      decals.add(dent);
    }
    if (state.target === 'cracked' || state.target === 'breached') {
      const positions: number[] = [];
      const holeRadius = state.target === 'breached' ? state.holeRadiusM : 0.035;
      const reach = Math.min(1, holeRadius + 0.28 + state.severity * 0.3);
      for (let i = 0; i < 11; i++) {
        const angle = i * Math.PI * 2 / 11 + random() * 0.2;
        let px = x + Math.cos(angle) * (holeRadius + 0.025);
        let py = y + Math.sin(angle) * (holeRadius + 0.025);
        for (let j = 1; j <= 4; j++) {
          const radius = THREE.MathUtils.lerp(holeRadius + 0.025, reach, j / 4);
          const nextAngle = angle + (random() - 0.5) * 0.16;
          const nx = x + Math.cos(nextAngle) * radius;
          const ny = y + Math.sin(nextAngle) * radius;
          if (Math.hypot(nx, ny) < 1.29 && Math.hypot(px, py) < 1.29) positions.push(px, py, 0.003, nx, ny, 0.003);
          px = nx;
          py = ny;
        }
      }
      decals.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)), crackMaterial));
      const count = Math.min(96, state.target === 'breached' ? 32 + Math.round(state.severity * 60) : 18);
      for (let i = 0; i < count; i++) {
        const patch = removed.length ? removed[Math.floor(random() * removed.length)] : patches[Math.floor(random() * patches.length)];
        const theta = random() * Math.PI * 2;
        const spread = state.target === 'breached' ? 0.3 + random() * 3.8 : 0.5;
        const position = removed.length ? new THREE.Vector3(patch.x, patch.y, -0.015) : new THREE.Vector3(x + Math.cos(theta) * 0.07, y + Math.sin(theta) * 0.07, 0.02);
        splinters.push({
          position,
          velocity: new THREE.Vector3(Math.cos(theta) * spread, Math.sin(theta) * spread + random() * 1.8, state.target === 'breached' ? -(2 + random() * (5 + state.severity * 12)) : 0.4 + random()),
          rotation: new THREE.Euler(random() * 6, random() * 6, random() * 6),
          spin: new THREE.Vector3((random() - 0.5) * 18, (random() - 0.5) * 18, (random() - 0.5) * 18),
          scale: new THREE.Vector3(0.003 + random() * 0.014, 0.002 + random() * 0.006,
            0.008 + random() * Math.min(0.065, Math.max(0.012, holeRadius * 0.5))),
          age: 0,
        });
        splinterMesh.setColorAt(i, i % 3 === 0 ? patch.paint : i % 2 ? woodColor : darkWoodColor);
      }
      splinterMesh.count = count;
      if (splinterMesh.instanceColor) splinterMesh.instanceColor.needsUpdate = true;
    }
    update(0);
  }

  function update(dtSeconds: number) {
    const dt = THREE.MathUtils.clamp(dtSeconds, 0, 0.05);
    damageElapsed += dt;
    if (movingPatches.length) {
      const positions = board.geometry.getAttribute('position');
      const normals = board.geometry.getAttribute('normal');
      const damping = Math.exp(-damageElapsed * 2.5);
      for (const patch of movingPatches) {
        const swing = patch.angle * (1 - damping * Math.cos(damageElapsed * 14 + patch.phase) * 0.45);
        rotation.setFromAxisAngle(patch.axis, swing);
        for (let i = patch.offset; i < patch.offset + patch.length; i += 3) {
          vertex.set((originalPositions[i] - patch.x) * patch.shrink, (originalPositions[i + 1] - patch.y) * patch.shrink, originalPositions[i + 2]);
          vertex.applyQuaternion(rotation);
          positions.setXYZ(i / 3, vertex.x + patch.x, vertex.y + patch.y, vertex.z + patch.dent);
          vertex.set(originalNormals[i], originalNormals[i + 1], originalNormals[i + 2]).applyQuaternion(rotation);
          normals.setXYZ(i / 3, vertex.x, vertex.y, vertex.z);
        }
      }
      positions.needsUpdate = true;
      normals.needsUpdate = true;
      // The residual bend remains in the mesh after the short impact vibration.
      if (damageElapsed > 2.5) movingPatches.length = 0;
    }
    for (let i = 0; i < splinters.length; i++) {
      const splinter = splinters[i];
      splinter.age += dt;
      splinter.velocity.y -= 9.80665 * dt;
      splinter.position.addScaledVector(splinter.velocity, dt);
      splinter.rotation.x += splinter.spin.x * dt;
      splinter.rotation.y += splinter.spin.y * dt;
      splinter.rotation.z += splinter.spin.z * dt;
      if (splinter.position.y < -1.58) {
        splinter.position.y = -1.58;
        splinter.velocity.y = Math.abs(splinter.velocity.y) * 0.13;
        splinter.velocity.x *= 0.8;
        splinter.velocity.z *= 0.8;
        splinter.spin.multiplyScalar(0.7);
      }
      instanceDummy.position.copy(splinter.position);
      instanceDummy.rotation.copy(splinter.rotation);
      instanceDummy.scale.copy(splinter.scale).multiplyScalar(THREE.MathUtils.clamp((6.5 - splinter.age) / 0.7, 0, 1));
      instanceDummy.updateMatrix();
      splinterMesh.setMatrixAt(i, instanceDummy.matrix);
    }
    if (splinters.length) splinterMesh.instanceMatrix.needsUpdate = true;
    if (splinters.length && splinters[0].age > 6.5) { splinters.length = 0; splinterMesh.count = 0; }
  }

  rebuild();
  return { group, setDamage, reset, update, dispose: () => { clearDecals(); dentMaterial.dispose(); crackMaterial.dispose(); } };
}

/** All scene objects are render adapters. Trajectory and collisions live in simulation/. */
export function createWorld(container: HTMLElement): WorldView {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.sky);
  scene.fog = new THREE.Fog(palette.sky, 65, 190);
  const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.domElement.setAttribute('aria-label', '街中の野菜投擲実験。的まで12メートル、奥に停留所。');
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

  const ground = object(new THREE.PlaneGeometry(1200, 1200), mats.grass, false);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.025;
  scene.add(ground);

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
  const plywood = createPlywoodBoard();
  targetGroup.add(plywood.group);
  const rim = object(new THREE.TorusGeometry(1.325, 0.025, 6, 80), mats.wood);
  rim.position.z = -0.012;
  targetGroup.add(rim);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2;
    const bolt = object(new THREE.SphereGeometry(0.024, 8, 6), mats.ink, false);
    bolt.scale.z = 0.2;
    bolt.position.set(Math.cos(angle) * 1.255, Math.sin(angle) * 1.255, 0.007);
    targetGroup.add(bolt);
  }
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

  const random = seeded(2000);

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
    group.position.set(-150 + i * 45, 85 + random() * 20, -180 - random() * 60);
    scene.add(group);
  }

  let initialCamera = true;
  const resize = () => {
    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const portrait = width / height < 0.9;
    camera.aspect = width / height;
    if (initialCamera) {
      camera.fov = portrait ? 53 : 43;
      camera.position.set(portrait ? 3.8 : 5.4, portrait ? 4.5 : 4.0, portrait ? 9.2 : 6.6);
      camera.lookAt(portrait ? -0.1 : 0.1, portrait ? 1.15 : 1.3, -5.2);
      initialCamera = false;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  resize();

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
    update: plywood.update,
    render: () => { if (!contextLost) renderer.render(scene, camera); },
    resize,
    setTargetDamage: plywood.setDamage,
    resetTarget: plywood.reset,
    dispose: () => {
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored);
      plywood.dispose();
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
