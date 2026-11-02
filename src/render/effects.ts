import * as THREE from 'three';
import type { RigidBody, World } from '@dimforge/rapier3d-compat';

export interface ImpactOptions {
  position: THREE.Vector3;
  color: number;
  energyJ: number;
  kind: 'target' | 'ground' | 'timeout';
  speedKmh: number;
  response?: {
    vegetable: 'intact' | 'split' | 'pulverized';
    severity: number;
    fragmentCount: number;
    target?: string;
    holeRadiusM?: number;
  };
  vegetableId?: string;
  massKg?: number;
  radiusM?: number;
  incomingVelocity?: THREE.Vector3;
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
  opacity: number;
  size: number;
};

type Droplet = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  age: number;
  life: number;
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
  const droplets: Droplet[] = [];
  let spray: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial> | null = null;
  let splat: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  const instanceTransform = new THREE.Object3D();
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

  function clearParticles() {
    for (let i = chunks.length - 1; i >= 0; i--) removeChunk(i);
    for (let i = dust.length - 1; i >= 0; i--) removeDust(i);
    if (spray) {
      root.remove(spray);
      spray.geometry.dispose();
      spray.material.dispose();
      spray = null;
    }
    droplets.length = 0;
    if (splat) {
      root.remove(splat);
      splat.material.map?.dispose();
      splat.material.dispose();
      splat.geometry.dispose();
      splat = null;
    }
    accumulator = 0;
  }

  function impact(options: ImpactOptions) {
    clearParticles();
    if (options.kind === 'timeout') return;
    const speed = Math.max(0, options.speedKmh);
    const energy = Math.max(0, options.energyJ);
    const mass = Math.max(0.02, options.massKg ?? 0.18);
    const vegetableRadius = Math.max(0.025, options.radiusM ?? 0.055);
    const response = options.response;
    const condition = response?.vegetable ?? (speed < 40 ? 'intact' : speed < 200 ? 'split' : 'pulverized');
    const severity = THREE.MathUtils.clamp(response?.severity ?? speed / 500, 0, 1);
    const isGround = options.kind === 'ground';
    const origin = options.position.clone();
    if (isGround) origin.y = Math.max(0.04, origin.y);
    else origin.z = -11.975;
    sequence = Math.max(1, Math.round(options.energyJ * 31 + speed * 7)) >>> 0;
    const pulverized = condition === 'pulverized';
    const broken = condition !== 'intact';
    const skinColor = new THREE.Color(options.color);
    const fleshColors: Record<string, number> = {
      tomato: 0xf07c55, carrot: 0xf7b552, cucumber: 0xd0dea6,
      eggplant: 0xe8dbb4, pumpkin: 0xf6b43e, cabbage: 0xdce4b9,
    };
    const fleshColor = options.vegetableId && fleshColors[options.vegetableId]
      ? new THREE.Color(fleshColors[options.vegetableId])
      : skinColor.clone().lerp(new THREE.Color(0xffe4a6), 0.4);

    // This is a bounded visual fragmentation estimate, not an explosion model.
    // Only a small fraction of impact energy is assigned to visible ejecta.
    const ejectaBudget = energy * (pulverized ? 0.018 : 0.04);
    const velocityScale = Math.min(pulverized ? 25 : 12, Math.sqrt(2 * ejectaBudget / (mass * 0.6)));
    const incoming = options.incomingVelocity?.clone().normalize() ?? new THREE.Vector3(0, 0, -1);
    const skinCount = !broken ? 0 : pulverized ? 16 : THREE.MathUtils.clamp(response?.fragmentCount ?? 6, 3, 9);
    const chunkVelocities: THREE.Vector3[] = [];
    const chunkRadii: number[] = [];
    for (let i = 0; i < skinCount; i++) {
      chunkRadii.push(pulverized
        ? Math.min(0.018, vegetableRadius * (0.045 + random() * 0.09))
        : vegetableRadius * (0.24 + random() * 0.2));
      const theta = random() * Math.PI * 2;
      const radial = velocityScale * (0.12 + random() * 0.65);
      chunkVelocities.push(new THREE.Vector3(
        Math.cos(theta) * radial + incoming.x * velocityScale * 0.1,
        Math.sin(theta) * radial + velocityScale * (isGround ? 0.5 : 0.08),
        velocityScale * (0.08 + random() * 0.35),
      ));
    }

    if (broken) {
      const count = pulverized ? Math.round(170 + severity * 70) : 52;
      spray = new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(1, 0),
        new THREE.MeshStandardMaterial({ roughness: 0.24, metalness: 0, transparent: true, opacity: 0.95 }),
        count,
      );
      spray.name = 'fine-vegetable-pulp';
      spray.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      spray.frustumCulled = false;
      root.add(spray);
      for (let i = 0; i < count; i++) {
        const theta = random() * Math.PI * 2;
        const radial = velocityScale * (0.08 + random() ** 0.6 * 0.85);
        const radius = Math.min(0.012, vegetableRadius * (0.025 + random() * 0.07));
        droplets.push({
          position: origin.clone().add(new THREE.Vector3((random() - 0.5) * vegetableRadius, (random() - 0.5) * vegetableRadius, random() * 0.035)),
          velocity: new THREE.Vector3(
            Math.cos(theta) * radial + incoming.x * velocityScale * 0.12,
            Math.sin(theta) * radial + velocityScale * (isGround ? 0.5 : 0.05),
            velocityScale * (0.06 + random() * 0.42),
          ),
          radius, age: 0, life: 1.6 + random() * 1.5,
        });
        spray.setColorAt(i, i % 5 === 0 ? skinColor : fleshColor.clone().lerp(new THREE.Color(0xfff8d9), random() * 0.22));
      }

      // Normalize all emitted translational velocities together to conserve the
      // assigned energy budget even when mass, angle or particle count changes.
      const sprayMass = mass * (pulverized ? 0.55 : 0.12);
      const skinMass = mass * (pulverized ? 0.08 : 0.65);
      const calculatedEnergy = droplets.reduce((sum, particle) => sum + 0.5 * sprayMass / count * particle.velocity.lengthSq(), 0)
        + chunkVelocities.reduce((sum, velocity) => sum + 0.5 * skinMass / skinCount * velocity.lengthSq(), 0);
      const correction = Math.min(1, Math.sqrt(ejectaBudget / Math.max(1e-9, calculatedEnergy)));
      droplets.forEach(particle => particle.velocity.multiplyScalar(correction));
      chunkVelocities.forEach(velocity => velocity.multiplyScalar(correction));
      if (spray.instanceColor) spray.instanceColor.needsUpdate = true;
    }

    for (let i = 0; i < skinCount; i++) {
      const radius = chunkRadii[i];
      const geometry = new THREE.IcosahedronGeometry(radius, 0);
      const material = new THREE.MeshStandardMaterial({
        color: pulverized || i % 3 === 0 ? skinColor : fleshColor,
        roughness: 0.55, flatShading: true, transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !pulverized;
      mesh.position.copy(origin).add(new THREE.Vector3(
        (random() - 0.5) * vegetableRadius, random() * vegetableRadius, random() * 0.025,
      ));
      if (pulverized) mesh.scale.set(0.85, 1.5, 0.13);
      else mesh.scale.set(0.75, 1.1, 0.7);
      root.add(mesh);
      const velocity = chunkVelocities[i];
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

    const dustCount = broken ? 7 : isGround ? 3 : 0;
    for (let i = 0; i < dustCount; i++) {
      const mistColor = isGround && !broken ? new THREE.Color(0xc6ad85) : fleshColor.clone().lerp(new THREE.Color(0xfff5df), 0.65);
      const opacity = broken ? 0.14 : 0.28;
      const material = new THREE.SpriteMaterial({
        map: dustTexture, color: mistColor,
        transparent: true, opacity, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(origin);
      const size = vegetableRadius * (1.5 + random() * 3.5);
      sprite.scale.setScalar(size);
      root.add(sprite);
      dust.push({ sprite, velocity: new THREE.Vector3(
        (random() - 0.5) * velocityScale * 0.15,
        0.1 + random() * velocityScale * 0.1,
        random() * velocityScale * 0.1,
      ), size, opacity, age: 0, life: 0.55 + random() * 0.65 });
    }

    if (broken && !isGround) {
      createTargetSplat(options, skinColor, vegetableRadius, severity);
    }

    // Populate the initial matrices before the first rendered impact frame.
    updateSpray(0);
  }

  function createTargetSplat(options: ImpactOptions, color: THREE.Color, radius: number, severity: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) return;
    const holeRadius = options.response?.target === 'breached' ? Math.max(0, options.response.holeRadiusM ?? radius * 1.5) : 0;
    const size = Math.max(0.5, radius * 9, holeRadius * 3.6);
    const pixelsPerMeter = 512 / size;
    const holePixels = holeRadius * pixelsPerMeter;
    const wetColor = color.clone().multiplyScalar(0.82);
    context.fillStyle = `#${wetColor.getHexString()}`;
    // Irregular islands, rather than an opaque circular billboard. A breached
    // target explicitly clears the entire hole, including antialiased edges.
    for (let i = 0; i < 100; i++) {
      const theta = random() * Math.PI * 2;
      const distance = holePixels + 5 + random() ** 1.8 * Math.max(20, 210 - holePixels);
      const blob = (i < 24 ? 4 + random() * 13 : 1 + random() * 4) * (0.5 + severity * 0.5);
      context.globalAlpha = 0.35 + random() * 0.45;
      context.beginPath();
      context.ellipse(256 + Math.cos(theta) * distance, 256 + Math.sin(theta) * distance, blob, blob * (0.35 + random() * 0.7), theta, 0, Math.PI * 2);
      context.fill();
    }
    if (!holeRadius) {
      for (let i = 0; i < 14; i++) {
        context.globalAlpha = 0.16;
        context.beginPath();
        context.ellipse(256 + (random() - 0.5) * 50, 256 + (random() - 0.5) * 50, 14 + random() * 20, 5 + random() * 16, random() * Math.PI, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      context.globalCompositeOperation = 'destination-out';
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(256, 256, holePixels + 3, 0, Math.PI * 2);
      context.fill();
    }
    context.globalCompositeOperation = 'destination-in';
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(256 - options.position.x * pixelsPerMeter, 256 + (options.position.y - 1.6) * pixelsPerMeter, 1.3 * pixelsPerMeter, 0, Math.PI * 2);
    context.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    splat = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
      map: texture, transparent: true, opacity: 0.9, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2,
    }));
    splat.name = 'wet-vegetable-splatter';
    splat.position.set(options.position.x, options.position.y, -11.992);
    root.add(splat);
  }

  function updateSpray(dt: number) {
    if (!spray) return;
    let living = 0;
    for (let i = 0; i < droplets.length; i++) {
      const particle = droplets[i];
      particle.age += dt;
      if (particle.age < particle.life) {
        living++;
        // Quadratic drag for small wet fragments; no superelastic bouncing.
        const drag = 3 * 1.204 * 0.47 / (8 * 1000 * particle.radius);
        particle.velocity.multiplyScalar(1 / (1 + drag * particle.velocity.length() * dt));
        particle.velocity.y -= 9.80665 * dt;
        particle.position.addScaledVector(particle.velocity, dt);
        if (particle.position.y < particle.radius) {
          particle.position.y = particle.radius;
          particle.velocity.y = 0;
          particle.velocity.x *= Math.max(0, 1 - dt * 10);
          particle.velocity.z *= Math.max(0, 1 - dt * 10);
        }
        const fade = Math.min(1, (particle.life - particle.age) / 0.5);
        instanceTransform.position.copy(particle.position);
        instanceTransform.scale.set(particle.radius * fade, particle.radius * fade * 0.75, particle.radius * fade);
      } else instanceTransform.scale.setScalar(0);
      instanceTransform.updateMatrix();
      spray.setMatrixAt(i, instanceTransform.matrix);
    }
    spray.instanceMatrix.needsUpdate = true;
    if (!living) {
      root.remove(spray);
      spray.geometry.dispose();
      spray.material.dispose();
      spray = null;
      droplets.length = 0;
    }
  }

  function update(realDelta: number) {
    const dt = Math.min(0.05, Math.max(0, realDelta));
    updateSpray(dt);
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
      (particle.sprite.material as THREE.SpriteMaterial).opacity = particle.opacity * (1 - ratio) ** 2;
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
