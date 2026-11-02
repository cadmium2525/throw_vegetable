/** SI units throughout. Rigid-vegetable approximation; see docs/physics.md. */
export interface Vec3 { x: number; y: number; z: number }

export interface Vegetable {
  id: string;
  name: string;
  massKg: number;
  radiusM: number;
  areaM2: number;
  dragCoefficient: number;
  color: string;
  accent: string;
}

/** Representative examples, not measured aerodynamic properties. */
export const VEGETABLES: readonly Vegetable[] = [
  { id: 'tomato', name: 'トマト', massKg: 0.15, radiusM: 0.035, areaM2: 0.00385, dragCoefficient: 0.47, color: '#ef543b', accent: '#77a54b' },
  { id: 'carrot', name: 'にんじん', massKg: 0.12, radiusM: 0.025, areaM2: 0.0020, dragCoefficient: 0.60, color: '#f28c35', accent: '#6eaa53' },
  { id: 'cucumber', name: 'きゅうり', massKg: 0.20, radiusM: 0.025, areaM2: 0.0020, dragCoefficient: 0.70, color: '#4a8344', accent: '#8dbd68' },
  { id: 'eggplant', name: 'なす', massKg: 0.23, radiusM: 0.045, areaM2: 0.0064, dragCoefficient: 0.55, color: '#62447c', accent: '#75a35d' },
  { id: 'pumpkin', name: 'かぼちゃ', massKg: 2.00, radiusM: 0.13, areaM2: 0.0531, dragCoefficient: 0.50, color: '#d89036', accent: '#6d7b40' },
  { id: 'cabbage', name: 'キャベツ', massKg: 1.00, radiusM: 0.10, areaM2: 0.0314, dragCoefficient: 0.60, color: '#a2bd67', accent: '#597d4c' },
];

export const PHYSICS = Object.freeze({
  gravity: 9.80665,
  airDensity: 1.225,
  speedOfSound: 340.294,
  airTemperatureC: 15,
  stepSeconds: 1 / 2000,
  launchHeight: 1.6,
  targetDistance: 12,
  targetCenterY: 1.6,
  targetRadius: 1.3,
  maxFlightSeconds: 60,
});

export interface ThrowInput {
  vegetableId: string;
  speedKmh: number;
  angleDeg: number;
  azimuthDeg?: number;
}

export interface SimulationOptions {
  /** Vacuum mode is for numerical verification and comparison. */
  drag?: boolean;
  stepSeconds?: number;
}

export interface TrajectorySample {
  t: number;
  position: Vec3;
  velocity: Vec3;
  speedKmh: number;
  mach: number;
  dynamicPressurePa: number;
}

export interface Impact {
  kind: 'target' | 'ground' | 'timeout';
  /** Center of the collision sphere. */
  position: Vec3;
  /** Surface location: target disk or ground. */
  contactPoint: Vec3;
  velocity: Vec3;
  time: number;
  speedKmh: number;
  mach: number;
  energyJ: number;
  normalEnergyJ: number;
  momentumNs: number;
}

export interface ThrowResult {
  vegetable: Vegetable;
  launchSpeedKmh: number;
  launchMach: number;
  initialEnergyJ: number;
  maxDynamicPressurePa: number;
  samples: TrajectorySample[];
  impact: Impact;
  targetPlaneCrossing?: TrajectorySample;
}

type State = readonly [number, number, number, number, number, number];
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;
const magnitude = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

/**
 * Illustrative compressibility correction, NOT measured vegetable Cd(M).
 * NASA's drag equation requires matching Mach/Reynolds conditions. In the
 * absence of vegetable wind-tunnel data this smooth lookup is an assumption.
 */
export function compressibilityMultiplier(mach: number): number {
  const points = [[0, 1], [0.6, 1], [0.9, 1.5], [1.1, 2.1], [1.4, 2], [2, 1.8]];
  const m = Math.max(0, mach);
  for (let i = 1; i < points.length; i++) {
    if (m <= points[i][0]) {
      const fraction = (m - points[i - 1][0]) / (points[i][0] - points[i - 1][0]);
      return lerp(points[i - 1][1], points[i][1], fraction);
    }
  }
  return points[points.length - 1][1];
}

function derivative(state: State, vegetable: Vegetable, drag: boolean): State {
  const speed = Math.hypot(state[3], state[4], state[5]);
  const coefficient = drag
    ? 0.5 * PHYSICS.airDensity * vegetable.dragCoefficient
      * compressibilityMultiplier(speed / PHYSICS.speedOfSound)
      * vegetable.areaM2 * speed / vegetable.massKg
    : 0;
  return [state[3], state[4], state[5], -coefficient * state[3], -PHYSICS.gravity - coefficient * state[4], -coefficient * state[5]];
}

function addScaled(state: State, delta: State, amount: number): State {
  return state.map((value, index) => value + delta[index] * amount) as unknown as State;
}

function rk4(state: State, dt: number, vegetable: Vegetable, drag: boolean): State {
  const a = derivative(state, vegetable, drag);
  const b = derivative(addScaled(state, a, dt / 2), vegetable, drag);
  const c = derivative(addScaled(state, b, dt / 2), vegetable, drag);
  const d = derivative(addScaled(state, c, dt), vegetable, drag);
  return state.map((value, index) => value + dt / 6 * (a[index] + 2 * b[index] + 2 * c[index] + d[index])) as unknown as State;
}

function interpolateState(a: State, b: State, fraction: number): State {
  return a.map((value, index) => lerp(value, b[index], fraction)) as unknown as State;
}

function toSample(state: State, t: number): TrajectorySample {
  const speed = Math.hypot(state[3], state[4], state[5]);
  return {
    t,
    position: { x: state[0], y: state[1], z: state[2] },
    velocity: { x: state[3], y: state[4], z: state[5] },
    speedKmh: speed * 3.6,
    mach: speed / PHYSICS.speedOfSound,
    dynamicPressurePa: 0.5 * PHYSICS.airDensity * speed * speed,
  };
}

/** Euclidean distance from a point to the filled, infinitely thin target disk. */
function distanceToDiskSquared(x: number, y: number, z: number): number {
  const radialGap = Math.max(0, Math.hypot(x, y - PHYSICS.targetCenterY) - PHYSICS.targetRadius);
  return radialGap * radialGap + (z + PHYSICS.targetDistance) ** 2;
}

/**
 * Continuous swept sphere/disk contact over a segment. The disk is convex, so
 * squared distance along a line is convex. Slab clipping then minimization
 * catches a fast crossing even when both integration endpoints miss the disk.
 */
function targetContactFraction(a: State, b: State, radius: number): number | undefined {
  let near = 0;
  let far = 1;
  const bounds = [
    [-PHYSICS.targetRadius - radius, PHYSICS.targetRadius + radius],
    [PHYSICS.targetCenterY - PHYSICS.targetRadius - radius, PHYSICS.targetCenterY + PHYSICS.targetRadius + radius],
    [-PHYSICS.targetDistance - radius, -PHYSICS.targetDistance + radius],
  ];
  for (let axis = 0; axis < 3; axis++) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-14) {
      if (a[axis] < bounds[axis][0] || a[axis] > bounds[axis][1]) return undefined;
    } else {
      let enter = (bounds[axis][0] - a[axis]) / delta;
      let leave = (bounds[axis][1] - a[axis]) / delta;
      if (enter > leave) [enter, leave] = [leave, enter];
      near = Math.max(near, enter);
      far = Math.min(far, leave);
      if (near > far) return undefined;
    }
  }
  const distance = (fraction: number) => distanceToDiskSquared(
    lerp(a[0], b[0], fraction), lerp(a[1], b[1], fraction), lerp(a[2], b[2], fraction),
  ) - radius * radius;
  if (distance(near) <= 1e-12) return near;
  let low = near;
  let high = far;
  for (let i = 0; i < 40; i++) {
    const left = (2 * low + high) / 3;
    const right = (low + 2 * high) / 3;
    if (distance(left) <= distance(right)) high = right;
    else low = left;
  }
  const minimum = (low + high) / 2;
  if (distance(minimum) > 1e-12) return undefined;
  low = near;
  high = minimum;
  for (let i = 0; i < 40; i++) {
    const midpoint = (low + high) / 2;
    if (distance(midpoint) > 0) low = midpoint;
    else high = midpoint;
  }
  return high;
}

function makeImpact(sample: TrajectorySample, kind: Impact['kind'], vegetable: Vegetable): Impact {
  const speed = magnitude(sample.velocity);
  let contactPoint = { ...sample.position };
  let normalSpeed = 0;
  if (kind === 'ground') {
    contactPoint.y = 0;
    normalSpeed = Math.abs(sample.velocity.y);
  } else if (kind === 'target') {
    const radial = Math.hypot(sample.position.x, sample.position.y - PHYSICS.targetCenterY);
    const ratio = radial > PHYSICS.targetRadius ? PHYSICS.targetRadius / radial : 1;
    contactPoint = {
      x: sample.position.x * ratio,
      y: PHYSICS.targetCenterY + (sample.position.y - PHYSICS.targetCenterY) * ratio,
      z: -PHYSICS.targetDistance,
    };
    const nx = sample.position.x - contactPoint.x;
    const ny = sample.position.y - contactPoint.y;
    const nz = sample.position.z - contactPoint.z;
    const length = Math.hypot(nx, ny, nz) || 1;
    normalSpeed = Math.abs((sample.velocity.x * nx + sample.velocity.y * ny + sample.velocity.z * nz) / length);
  }
  return {
    kind,
    position: { ...sample.position },
    contactPoint,
    velocity: { ...sample.velocity },
    time: sample.t,
    speedKmh: sample.speedKmh,
    mach: sample.mach,
    energyJ: 0.5 * vegetable.massKg * speed * speed,
    normalEnergyJ: 0.5 * vegetable.massKg * normalSpeed * normalSpeed,
    momentumNs: vegetable.massKg * speed,
  };
}

export function simulateThrow(input: ThrowInput, options: SimulationOptions = {}): ThrowResult {
  const vegetable = VEGETABLES.find((item) => item.id === input.vegetableId);
  if (!vegetable) throw new RangeError(`Unknown vegetable: ${input.vegetableId}`);
  if (![input.speedKmh, input.angleDeg, input.azimuthDeg ?? 0].every(Number.isFinite)) {
    throw new RangeError('Throw values must be finite numbers.');
  }
  const requestedStep = options.stepSeconds ?? PHYSICS.stepSeconds;
  if (!Number.isFinite(requestedStep) || requestedStep <= 0 || requestedStep > 0.02) {
    throw new RangeError('Integration step must be greater than 0 and at most 0.02 seconds.');
  }
  const speedKmh = clamp(input.speedKmh, 0, 2000);
  const speed = speedKmh / 3.6;
  const angle = clamp(input.angleDeg, -89, 89) * Math.PI / 180;
  const azimuth = clamp(input.azimuthDeg ?? 0, -89, 89) * Math.PI / 180;
  let state: State = [0, PHYSICS.launchHeight, 0, speed * Math.cos(angle) * Math.sin(azimuth), speed * Math.sin(angle), -speed * Math.cos(angle) * Math.cos(azimuth)];
  let t = 0;
  const samples = [toSample(state, t)];
  let maxDynamicPressurePa = samples[0].dynamicPressurePa;
  let impact: Impact | undefined;
  let targetPlaneCrossing: TrajectorySample | undefined;
  let nextSampleTime = 1 / 500;
  while (t < PHYSICS.maxFlightSeconds - 1e-10) {
    const dt = Math.min(requestedStep, PHYSICS.maxFlightSeconds - t);
    const next = rk4(state, dt, vegetable, options.drag !== false);
    const groundFraction = next[1] <= vegetable.radiusM && state[1] > vegetable.radiusM
      ? (state[1] - vegetable.radiusM) / (state[1] - next[1])
      : undefined;
    const targetFraction = targetContactFraction(state, next, vegetable.radiusM);
    let fraction: number | undefined;
    let kind: Impact['kind'] = 'timeout';
    if (targetFraction !== undefined && (groundFraction === undefined || targetFraction <= groundFraction)) {
      fraction = targetFraction;
      kind = 'target';
    } else if (groundFraction !== undefined) {
      fraction = groundFraction;
      kind = 'ground';
    }
    const actualFraction = fraction ?? 1;
    if (!targetPlaneCrossing && state[2] >= -PHYSICS.targetDistance && next[2] < -PHYSICS.targetDistance) {
      const crossingFraction = (-PHYSICS.targetDistance - state[2]) / (next[2] - state[2]);
      if (crossingFraction <= actualFraction) targetPlaneCrossing = toSample(interpolateState(state, next, crossingFraction), t + dt * crossingFraction);
    }
    state = actualFraction === 1 ? next : interpolateState(state, next, actualFraction);
    t += dt * actualFraction;
    const sample = toSample(state, t);
    maxDynamicPressurePa = Math.max(maxDynamicPressurePa, sample.dynamicPressurePa);
    if (t + 1e-10 >= nextSampleTime || fraction !== undefined) {
      samples.push(sample);
      nextSampleTime = t + 1 / 500;
    }
    if (fraction !== undefined) {
      impact = makeImpact(sample, kind, vegetable);
      break;
    }
  }
  if (!impact) {
    const finalSample = toSample(state, t);
    if (samples[samples.length - 1].t < t) samples.push(finalSample);
    impact = makeImpact(finalSample, 'timeout', vegetable);
  }
  return {
    vegetable,
    launchSpeedKmh: speedKmh,
    launchMach: speed / PHYSICS.speedOfSound,
    initialEnergyJ: 0.5 * vegetable.massKg * speed * speed,
    maxDynamicPressurePa,
    samples,
    impact,
    targetPlaneCrossing,
  };
}

/** Interpolate the precomputed trajectory without changing simulation time. */
export function sampleTrajectory(result: ThrowResult, time: number): TrajectorySample {
  const samples = result.samples;
  if (time <= 0) return samples[0];
  const last = samples[samples.length - 1];
  if (time >= last.t) return last;
  let low = 0;
  let high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].t <= time) low = middle;
    else high = middle;
  }
  const a = samples[low];
  const b = samples[high];
  const fraction = (time - a.t) / (b.t - a.t);
  const mixVec = (first: Vec3, second: Vec3): Vec3 => ({
    x: lerp(first.x, second.x, fraction), y: lerp(first.y, second.y, fraction), z: lerp(first.z, second.z, fraction),
  });
  const position = mixVec(a.position, b.position);
  const velocity = mixVec(a.velocity, b.velocity);
  const speed = magnitude(velocity);
  return { t: time, position, velocity, speedKmh: speed * 3.6, mach: speed / PHYSICS.speedOfSound, dynamicPressurePa: 0.5 * PHYSICS.airDensity * speed * speed };
}
