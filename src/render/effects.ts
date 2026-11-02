import * as THREE from 'three';
import { createAftermath, stepAftermath, type AftermathCloud } from '../simulation/aftermath';
import type { ImpactResponse } from '../simulation/impact';

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

export interface FollowTarget {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  landed: boolean;
}

export interface ThrowEffects {
  update(realDelta: number): void;
  impact(options: ImpactOptions): void;
  setTrail(points: THREE.Vector3[]): void;
  getFollowTarget(): FollowTarget | null;
  clear(): void;
  dispose(): void;
}

type Mist = {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  opacity: number;
  size: number;
};

type FragmentStyle = {
  scale: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
};

/** Rendering adapter for the mass-accounted, persistent aftermath model. */
export async function createEffects(scene: THREE.Scene): Promise<ThrowEffects> {
  const root = new THREE.Group();
  root.name = 'throw-effects';
  scene.add(root);
  const mist: Mist[] = [];
  let cloud: AftermathCloud | null = null;
  let followedParticleId: number | null = null;
  let depositsOnTarget = false;
  let fragments: THREE.InstancedMesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial> | null = null;
  let splat: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  const styles: FragmentStyle[] = [];
  const instanceTransform = new THREE.Object3D();
  let sequence = 1;

  function random(): number {
    sequence = (Math.imul(sequence, 1664525) + 1013904223) >>> 0;
    return sequence / 4294967296;
  }

  const mistCanvas = document.createElement('canvas');
  mistCanvas.width = mistCanvas.height = 64;
  const mistContext = mistCanvas.getContext('2d');
  if (mistContext) {
    const gradient = mistContext.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, 'rgba(255,255,255,0.65)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.25)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    mistContext.fillStyle = gradient;
    mistContext.fillRect(0, 0, 64, 64);
  }
  const mistTexture = new THREE.CanvasTexture(mistCanvas);

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

  function removeMist(index: number) {
    root.remove(mist[index].sprite);
    (mist[index].sprite.material as THREE.SpriteMaterial).dispose();
    mist.splice(index, 1);
  }

  function clearParticles() {
    for (let i = mist.length - 1; i >= 0; i--) removeMist(i);
    if (fragments) {
      root.remove(fragments);
      fragments.geometry.dispose();
      fragments.material.dispose();
      fragments = null;
    }
    cloud = null;
    followedParticleId = null;
    depositsOnTarget = false;
    styles.length = 0;
    if (splat) {
      root.remove(splat);
      splat.material.map?.dispose();
      splat.material.dispose();
      splat.geometry.dispose();
      splat = null;
    }
  }

  function impact(options: ImpactOptions) {
    clearParticles();
    if (options.kind === 'timeout') return;
    const speed = Math.max(0, options.speedKmh);
    const radius = Math.max(0.025, options.radiusM ?? 0.055);
    const condition = options.response?.vegetable ?? (speed < 40 ? 'intact' : speed < 200 ? 'split' : 'pulverized');
    // Main owns the intact vegetable mesh, including a low-speed ground drop.
    if (condition === 'intact') return;
    const severity = THREE.MathUtils.clamp(options.response?.severity ?? speed / 500, 0, 1);
    const target: ImpactResponse['target'] = options.response?.target === 'breached' ? 'breached'
      : options.response?.target === 'cracked' ? 'cracked'
      : options.response?.target === 'dent' ? 'dent' : 'none';
    const response: ImpactResponse = {
      vegetable: condition,
      target,
      severity,
      fragmentCount: options.response?.fragmentCount ?? (condition === 'pulverized' ? 120 : 8),
      holeRadiusM: options.response?.holeRadiusM ?? 0,
    };
    sequence = Math.max(1, Math.round(options.energyJ * 31 + speed * 7)) >>> 0;
    depositsOnTarget = options.kind === 'target';
    cloud = createAftermath({
      position: { x: options.position.x, y: options.position.y, z: options.position.z },
      velocity: options.incomingVelocity
        ? { x: options.incomingVelocity.x, y: options.incomingVelocity.y, z: options.incomingVelocity.z }
        : { x: 0, y: 0, z: -speed / 3.6 },
      massKg: Math.max(0.001, options.massKg ?? 0.18),
      radiusM: radius,
      vegetableId: options.vegetableId ?? 'tomato',
      energyJ: Math.max(0, options.energyJ),
      kind: options.kind,
      response,
      seed: sequence,
    });
    // Lock the camera to one actual fragment for the entire aftermath. The
    // representative velocity is selected once; later dispersion never moves
    // the focus into empty space between fragments.
    const forward = cloud.particles.filter(particle => particle.kind === 'forward');
    const forwardMass = forward.reduce((sum, particle) => sum + particle.massKg, 0);
    if (forwardMass > 0) {
      const meanVelocity = new THREE.Vector3();
      for (const particle of forward) {
        const weight = particle.massKg / forwardMass;
        meanVelocity.x += particle.velocity.x * weight;
        meanVelocity.y += particle.velocity.y * weight;
        meanVelocity.z += particle.velocity.z * weight;
      }
      let bestDistance = Infinity;
      let bestMass = -Infinity;
      for (const particle of forward) {
        const distance = (particle.velocity.x - meanVelocity.x) ** 2
          + (particle.velocity.y - meanVelocity.y) ** 2
          + (particle.velocity.z - meanVelocity.z) ** 2;
        const tied = Math.abs(distance - bestDistance) < 1e-12;
        if (distance < bestDistance - 1e-12 || tied && (particle.massKg > bestMass
          || particle.massKg === bestMass && particle.id < (followedParticleId ?? Infinity))) {
          followedParticleId = particle.id;
          bestDistance = distance;
          bestMass = particle.massKg;
        }
      }
    }

    const skinColor = new THREE.Color(options.color);
    const fleshColors: Record<string, number> = {
      tomato: 0xf07c55, carrot: 0xf7b552, cucumber: 0xd0dea6,
      eggplant: 0xe8dbb4, pumpkin: 0xf6b43e, cabbage: 0xdce4b9,
    };
    const fleshColor = new THREE.Color(fleshColors[options.vegetableId ?? ''] ?? options.color);
    fragments = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.33, metalness: 0, flatShading: true }),
      cloud.particles.length,
    );
    fragments.name = 'persistent-vegetable-fragments';
    fragments.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    fragments.frustumCulled = false;
    fragments.castShadow = true;
    fragments.receiveShadow = true;
    root.add(fragments);
    cloud.particles.forEach((particle, i) => {
      const skin = i % 6 === 0;
      const deposited = particle.kind === 'deposit' && depositsOnTarget;
      styles.push({
        scale: deposited ? new THREE.Vector3(1.2, 1.2, 0.16)
          : skin ? new THREE.Vector3(0.7, 1.6, 0.2)
          : new THREE.Vector3(0.85 + random() * 0.3, 0.7 + random() * 0.4, 0.75 + random() * 0.4),
        rotation: deposited ? new THREE.Euler(0, 0, random() * Math.PI * 2)
          : new THREE.Euler(random() * 6, random() * 6, random() * 6),
        spin: deposited ? new THREE.Vector3() : new THREE.Vector3((random() - 0.5) * 10, (random() - 0.5) * 10, (random() - 0.5) * 10),
      });
      fragments!.setColorAt(i, skin ? skinColor : fleshColor.clone().lerp(new THREE.Color(0xfff8d9), random() * 0.18));
    });
    if (fragments.instanceColor) fragments.instanceColor.needsUpdate = true;
    renderFragments();

    // Mist fades by dilution; the mass-carrying fragments never expire.
    const mistOrigin = options.position.clone();
    if (options.kind === 'target') mistOrigin.z = -11.97;
    for (let i = 0; i < 6; i++) {
      const opacity = 0.12;
      const material = new THREE.SpriteMaterial({
        map: mistTexture, color: fleshColor.clone().lerp(new THREE.Color(0xfff5df), 0.65),
        transparent: true, opacity, depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(mistOrigin);
      const size = radius * (1.5 + random() * 3);
      sprite.scale.setScalar(size);
      root.add(sprite);
      mist.push({ sprite, velocity: new THREE.Vector3((random() - 0.5) * 2, random() * 1.5, random() * 1.5),
        size, opacity, age: 0, life: 0.55 + random() * 0.65 });
    }
    if (options.kind === 'target') createTargetSplat(options, skinColor, radius, severity);
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
    context.fillStyle = `#${color.clone().multiplyScalar(0.82).getHexString()}`;
    // Peripheral wet islands retain a clear view through a breached target.
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

  function renderFragments() {
    if (!fragments || !cloud) return;
    cloud.particles.forEach((particle, i) => {
      const style = styles[i];
      const adhering = particle.kind === 'deposit' && depositsOnTarget;
      instanceTransform.position.set(particle.position.x, particle.position.y, particle.position.z);
      instanceTransform.scale.copy(style.scale).multiplyScalar(particle.radiusM);
      if (particle.landed && !adhering) {
        // Flatten wet pulp on the ground while retaining visible resting bits.
        instanceTransform.scale.y *= 0.45;
        instanceTransform.position.y = instanceTransform.scale.y + 0.001;
        instanceTransform.rotation.set(0, style.rotation.y, 0);
      } else {
        if (adhering) instanceTransform.position.z = -11.994 + instanceTransform.scale.z;
        instanceTransform.rotation.set(
        style.rotation.x + style.spin.x * cloud!.elapsedSeconds,
        style.rotation.y + style.spin.y * cloud!.elapsedSeconds,
        style.rotation.z + style.spin.z * cloud!.elapsedSeconds,
        );
      }
      instanceTransform.updateMatrix();
      fragments!.setMatrixAt(i, instanceTransform.matrix);
    });
    fragments.instanceMatrix.needsUpdate = true;
  }

  function update(realDelta: number) {
    const dt = Number.isFinite(realDelta) ? Math.max(0, realDelta) : 0;
    if (cloud) {
      stepAftermath(cloud, dt);
      renderFragments();
    }
    for (let i = mist.length - 1; i >= 0; i--) {
      const particle = mist[i];
      particle.age += dt;
      if (particle.age >= particle.life) { removeMist(i); continue; }
      particle.sprite.position.addScaledVector(particle.velocity, dt);
      particle.velocity.multiplyScalar(Math.max(0, 1 - dt * 1.5));
      const ratio = particle.age / particle.life;
      particle.sprite.scale.setScalar(particle.size * (1 + ratio * 3));
      (particle.sprite.material as THREE.SpriteMaterial).opacity = particle.opacity * (1 - ratio) ** 2;
    }
  }

  function getFollowTarget(): FollowTarget | null {
    if (!cloud || followedParticleId === null) return null;
    const representative = cloud.particles.find(particle => particle.id === followedParticleId);
    if (!representative) return null;
    let localMass = 0;
    let localVariance = 0;
    for (const particle of cloud.particles) {
      if (particle.kind !== 'forward') continue;
      const distanceSq = (particle.position.x - representative.position.x) ** 2
        + (particle.position.y - representative.position.y) ** 2
        + (particle.position.z - representative.position.z) ** 2;
      if (distanceSq > 0.8 ** 2) continue;
      localMass += particle.massKg;
      localVariance += (distanceSq + particle.radiusM ** 2) * particle.massKg;
    }
    return {
      position: new THREE.Vector3(representative.position.x, representative.position.y, representative.position.z),
      velocity: new THREE.Vector3(representative.velocity.x, representative.velocity.y, representative.velocity.z),
      radius: THREE.MathUtils.clamp(Math.sqrt(localVariance / Math.max(1e-12, localMass)), 0.08, 0.35),
      landed: representative.landed,
    };
  }

  function setTrail(points: THREE.Vector3[]) {
    const count = Math.min(points.length, trailCapacity);
    if (count < 2) { trailGeometry.setDrawRange(0, 0); return; }
    for (let i = 0; i < count; i++) {
      const point = points[Math.round(i * (points.length - 1) / (count - 1))];
      trailPositions[i * 3] = point.x;
      trailPositions[i * 3 + 1] = point.y;
      trailPositions[i * 3 + 2] = point.z;
    }
    trailAttribute.needsUpdate = true;
    trailGeometry.setDrawRange(0, count);
  }

  function clear() { clearParticles(); trailGeometry.setDrawRange(0, 0); }
  function dispose() {
    clear();
    scene.remove(root);
    trailGeometry.dispose();
    trailMaterial.dispose();
    mistTexture.dispose();
  }
  return { update, impact, setTrail, getFollowTarget, clear, dispose };
}
