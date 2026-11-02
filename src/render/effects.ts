import * as THREE from 'three';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';

export interface ImpactOptions {
  position: THREE.Vector3;
  color: number;
  energyJ: number;
  kind: 'target' | 'ground' | 'timeout';
  speedKmh: number;
}

export interface ThrowEffects {
  update(realDelta: number): void;
  impact(options: ImpactOptions): void;
  setTrail(points: THREE.Vector3[]): void;
  clear(): void;
  dispose(): void;
}

type Chunk = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  body?: RigidBody;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  radius: number;
  age: number;
  life: number;
};

type Dust = {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  size: number;
};

type Ring = {
  mesh: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  age: number;
};

/** Debris is an illustrative effect, separate from the measured flight model. */
export async function createEffects(scene: THREE.Scene): Promise<ThrowEffects> {
  let physics: World | null = null;
  let RAPIER: (typeof import('@dimforge/rapier3d-compat'))['default'] | null = null;
  let disposed = false;
  async function initializeDebrisPhysics() {
    let initializingWorld: World | null = null;
    try {
      const module = (await import('@dimforge/rapier3d-compat')).default;
      await module.init();
      if (disposed) return;
      initializingWorld = new module.World({ x: 0, y: -9.80665, z: 0 });
      initializingWorld.timestep = 1 / 120;
      initializingWorld.createCollider(module.ColliderDesc.cuboid(80, 0.1, 100)
        .setTranslation(0, -0.1, -30).setFriction(0.75).setRestitution(0.18));
      initializingWorld.createCollider(module.ColliderDesc.cuboid(1.3, 1.3, 0.06)
        .setTranslation(0, 1.6, -12.07).setFriction(0.55).setRestitution(0.2));
      RAPIER = module;
      physics = initializingWorld;
    } catch (error) {
      initializingWorld?.free();
      console.info('Debris uses the lightweight visual fallback.', error);
    }
  }

  const root = new THREE.Group();
  root.name = 'throw-effects';
  scene.add(root);
  const chunks: Chunk[] = [];
  const dust: Dust[] = [];
  const rings: Ring[] = [];
  let accumulator = 0;
  let sequence = 1;

  // A seeded generator keeps an individual throw stable between replay frames.
  function random(): number {
    sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0;
    return sequence / 4294967296;
  }

  const dustCanvas = document.createElement('canvas');
  dustCanvas.width = dustCanvas.height = 64;
  const dustContext = dustCanvas.getContext('2d');
  if (dustContext) {
    const gradient = dustContext.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,0.75)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    dustContext.fillStyle = gradient;
    dustContext.fillRect(0, 0, 64, 64);
  }
  const dustTexture = new THREE.CanvasTexture(dustCanvas);

  const trailCapacity = 192;
  const trailPositions = new Float32Array(trailCapacity * 3);
  const trailGeometry = new THREE.BufferGeometry();
  const trailAttribute = new THREE.BufferAttribute(trailPositions, 3);
  trailAttribute.setUsage(THREE.DynamicDrawUsage);
  trailGeometry.setAttribute('position', trailAttribute);
  trailGeometry.setDrawRange(0, 0);
  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0xd38349, transparent: true, opacity: 0.62, depthWrite: false,
  });
  const trail = new THREE.Line(trailGeometry, trailMaterial);
  trail.frustumCulled = false;
  root.add(trail);

  function removeChunk(index: number) {
    const chunk = chunks[index];
    if (chunk.body && physics) physics.removeRigidBody(chunk.body);
    root.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    chunk.mesh.material.dispose();
    chunks.splice(index, 1);
  }

  function removeDust(index: number) {
    root.remove(dust[index].sprite);
    (dust[index].sprite.material as THREE.SpriteMaterial).dispose();
    dust.splice(index, 1);
  }

  function removeRing(index: number) {
    const ring = rings[index];
    root.remove(ring.mesh);
    ring.mesh.geometry.dispose();
    ring.mesh.material.dispose();
    rings.splice(index, 1);
  }

  function clearParticles() {
    for (let i = chunks.length - 1; i >= 0; i--) removeChunk(i);
    for (let i = dust.length - 1; i >= 0; i--) removeDust(i);
    for (let i = rings.length - 1; i >= 0; i--) removeRing(i);
    accumulator = 0;
  }

  function impact(options: ImpactOptions) {
    clearParticles();
    if (options.kind === 'timeout') return;
    const speed = Math.max(0, options.speedKmh);
    const vigor = Math.min(1, Math.log10(1 + Math.max(0, options.energyJ)) / 5);
    const isGround = options.kind === 'ground';
    const origin = options.position.clone();
    if (isGround) origin.y = Math.max(0.04, origin.y);
    else origin.z += 0.1;
    sequence = Math.max(1, Math.round(options.energyJ * 31 + speed * 7)) >>> 0;

    // Low-speed drops remain intact in the main renderer; they only raise dust.
    const count = speed < 40 ? 0 : Math.round(14 + vigor * 18);
    for (let i = 0; i < count; i++) {
      const leaf = i % 9 === 0;
      const radius = leaf ? 0.025 + random() * 0.018 : 0.018 + random() * 0.045;
      const geometry = leaf
        ? new THREE.OctahedronGeometry(radius, 0)
        : new THREE.IcosahedronGeometry(radius, 0);
      const skinColor = new THREE.Color(options.color);
      const insideColor = skinColor.clone().lerp(new THREE.Color(0xffe4a6), 0.35);
      const material = new THREE.MeshStandardMaterial({
        color: leaf ? 0x59713c : i % 3 === 0 ? skinColor : insideColor,
        roughness: 0.82, flatShading: true, transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.copy(origin).add(new THREE.Vector3(
        (random() - 0.5) * 0.12, random() * 0.1, random() * 0.08,
      ));
      if (leaf) mesh.scale.set(0.6, 1.7, 0.25);
      root.add(mesh);
      const power = 1.1 + vigor * 5;
      const velocity = new THREE.Vector3(
        (random() - 0.5) * power * 2,
        (0.3 + random()) * power * (isGround ? 0.9 : 0.7),
        (0.25 + random()) * power,
      );
      const spin = new THREE.Vector3((random() - 0.5) * 16, (random() - 0.5) * 16, (random() - 0.5) * 16);
      let body: RigidBody | undefined;
      if (physics && RAPIER) {
        body = physics.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
          .setLinvel(velocity.x, velocity.y, velocity.z)
          .setAngvel({ x: spin.x, y: spin.y, z: spin.z })
          .setLinearDamping(0.35).setAngularDamping(0.8).setCcdEnabled(true));
        physics.createCollider(RAPIER.ColliderDesc.ball(radius)
          .setDensity(850).setFriction(0.7).setRestitution(0.18), body);
      }
      chunks.push({ mesh, body, velocity, spin, radius, age: 0, life: 3.2 + random() * 0.7 });
    }

    const dustCount = speed < 40 ? 4 : 12;
    for (let i = 0; i < dustCount; i++) {
      const material = new THREE.SpriteMaterial({
        map: dustTexture, color: isGround ? 0xc6ad85 : 0xe2c9a1,
        transparent: true, opacity: 0.35, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(origin);
      const size = 0.15 + random() * (0.2 + vigor * 0.2);
      sprite.scale.setScalar(size);
      root.add(sprite);
      dust.push({ sprite, velocity: new THREE.Vector3(
        (random() - 0.5) * (1 + vigor * 2),
        0.1 + random() * 0.7,
        random() * (0.4 + vigor),
      ), size, age: 0, life: 0.65 + random() * 0.8 });
    }

    if (speed >= 1235) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.2, 0.007, 6, 64),
        new THREE.MeshBasicMaterial({ color: 0xfff4da, transparent: true, opacity: 0.7, depthWrite: false }),
      );
      mesh.position.copy(origin);
      if (isGround) mesh.rotation.x = -Math.PI / 2;
      root.add(mesh);
      rings.push({ mesh, age: 0 });
    }
  }

  function update(realDelta: number) {
    const dt = Math.min(0.05, Math.max(0, realDelta));
    if (physics && chunks.length) {
      accumulator += dt;
      while (accumulator >= 1 / 120) {
        physics.step();
        accumulator -= 1 / 120;
      }
    }
    for (let i = chunks.length - 1; i >= 0; i--) {
      const chunk = chunks[i];
      chunk.age += dt;
      if (chunk.age >= chunk.life) {
        removeChunk(i);
        continue;
      }
      if (chunk.body) {
        const position = chunk.body.translation();
        const rotation = chunk.body.rotation();
        chunk.mesh.position.set(position.x, position.y, position.z);
        chunk.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      } else {
        chunk.velocity.y -= 9.80665 * dt;
        chunk.mesh.position.addScaledVector(chunk.velocity, dt);
        chunk.mesh.rotation.x += chunk.spin.x * dt;
        chunk.mesh.rotation.y += chunk.spin.y * dt;
        chunk.mesh.rotation.z += chunk.spin.z * dt;
        if (chunk.mesh.position.y < chunk.radius) {
          chunk.mesh.position.y = chunk.radius;
          chunk.velocity.y = Math.abs(chunk.velocity.y) * 0.18;
          chunk.velocity.x *= 0.75;
          chunk.velocity.z *= 0.75;
          chunk.spin.multiplyScalar(0.7);
        }
      }
      chunk.mesh.material.opacity = Math.min(1, (chunk.life - chunk.age) / 0.65);
    }
    for (let i = dust.length - 1; i >= 0; i--) {
      const particle = dust[i];
      particle.age += dt;
      if (particle.age >= particle.life) {
        removeDust(i);
        continue;
      }
      particle.sprite.position.addScaledVector(particle.velocity, dt);
      particle.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.5));
      const ratio = particle.age / particle.life;
      particle.sprite.scale.setScalar(particle.size * (1 + ratio * 3));
      (particle.sprite.material as THREE.SpriteMaterial).opacity = 0.35 * (1 - ratio) ** 2;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i];
      ring.age += dt;
      if (ring.age > 0.55) {
        removeRing(i);
        continue;
      }
      ring.mesh.scale.setScalar(1 + ring.age * 18);
      ring.mesh.material.opacity = 0.65 * (1 - ring.age / 0.55) ** 2;
    }
  }

  function setTrail(points: THREE.Vector3[]) {
    const count = Math.min(points.length, trailCapacity);
    if (count < 2) {
      trailGeometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < count; i++) {
      const point = points[Math.round(i * (points.length - 1) / (count - 1))];
      trailPositions[i * 3] = point.x;
      trailPositions[i * 3 + 1] = point.y;
      trailPositions[i * 3 + 2] = point.z;
    }
    trailAttribute.needsUpdate = true;
    trailGeometry.setDrawRange(0, count);
  }

  function clear() {
    clearParticles();
    trailGeometry.setDrawRange(0, 0);
  }

  function dispose() {
    disposed = true;
    clear();
    scene.remove(root);
    trailGeometry.dispose();
    trailMaterial.dispose();
    dustTexture.dispose();
    physics?.free();
    physics = null;
  }

  // Flight and input are ready immediately; debris upgrades after WASM loads.
  void initializeDebrisPhysics();
  return { update, impact, setTrail, clear, dispose };
}
