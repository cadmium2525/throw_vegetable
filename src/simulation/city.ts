import { PHYSICS, type Vec3 } from './physics.ts';
import { DISTRICT_BUILDINGS } from './districts';

export interface CitySurface {
  id: string;
  kind: 'wall' | 'glass' | 'sign';
  min: Vec3;
  max: Vec3;
  normalAxis: 'x' | 'z';
}
export interface CityHit { surface: CitySurface; fraction: number; position: Vec3 }
export interface CityDamage { hits: number; absorbedEnergyJ: number; peakNormalEnergyJ: number; state: 'marked' | 'cracked' | 'broken' }
/** Illustrative per-parcel thresholds, NOT glass strength measurements. */
export const CITY_ASSUMPTIONS = Object.freeze({ glassCrackJ: 8, glassBreakJ: 35, signBendJ: 40 });
/** Sidewalk recess between the buildings ending at z=-17 and starting at z=-21. */
export const BUS_SHELTER = Object.freeze({ backX: 6.25, frontX: 4.7, centerZ: -19, height: 2.6 });

export function createCitySurfaces(): CitySurface[] {
  const surfaces: CitySurface[] = [];
  for (const side of [-1, 1]) for (let row = 0; row < 8; row++) {
    const x = side * 7.7, z = 2 - row * 14;
    surfaces.push({ id: `wall-${side}-${row}`, kind: 'wall', min: { x: x - 2.7, y: 0, z: z - 5 }, max: { x: x + 2.7, y: 6 + row % 3 * 2, z: z + 5 }, normalAxis: 'x' });
    for (let pane = 0; pane < 3; pane++) {
      const face = side * 4.96, centerZ = z - 3.1 + pane * 3.1;
      surfaces.push({ id: `glass-${side}-${row}-${pane}`, kind: 'glass', min: { x: face - 0.015, y: 0.65, z: centerZ - 1.1 }, max: { x: face + 0.015, y: 2.65, z: centerZ + 1.1 }, normalAxis: 'x' });
    }
  }
  // Back glazing runs along the road, entirely outside its 4.5 m half-width.
  for (const b of DISTRICT_BUILDINGS) surfaces.push({ id: b.id, kind: 'wall', normalAxis: 'x',
    min: { x: b.x - b.width / 2, y: 0, z: b.z - b.depth / 2 },
    max: { x: b.x + b.width / 2, y: b.height, z: b.z + b.depth / 2 } });
  for (let i = 0; i < 3; i++) surfaces.push({ id: `shelter-${i}`, kind: 'glass', min: { x: BUS_SHELTER.backX - 0.015, y: 0.35, z: BUS_SHELTER.centerZ - 1.65 + i * 1.1 }, max: { x: BUS_SHELTER.backX + 0.015, y: 2.45, z: BUS_SHELTER.centerZ - 0.59 + i * 1.1 }, normalAxis: 'x' });
  surfaces.push({ id: 'street-sign', kind: 'sign', min: { x: 3.4, y: 1.2, z: -17.1 }, max: { x: 4.3, y: 2.2, z: -17.04 }, normalAxis: 'z' });
  return surfaces;
}

/** Swept sphere vs expanded AABB: no high-speed tunnelling between substeps. */
export function firstCityHit(start: Vec3, end: Vec3, radius: number, surfaces: readonly CitySurface[]): CityHit | null {
  let best: CityHit | null = null;
  for (const surface of surfaces) {
    let enter = 0, leave = 1;
    for (const axis of ['x', 'y', 'z'] as const) {
      const distance = end[axis] - start[axis];
      const low = surface.min[axis] - radius, high = surface.max[axis] + radius;
      if (Math.abs(distance) < 1e-12) {
        if (start[axis] < low || start[axis] > high) { enter = 2; break; }
      } else {
        const a = (low - start[axis]) / distance, b = (high - start[axis]) / distance;
        enter = Math.max(enter, Math.min(a, b));
        leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter > leave || enter > 1 || (best && enter >= best.fraction)) continue;
    best = { surface, fraction: enter, position: { x: start.x + (end.x - start.x) * enter, y: start.y + (end.y - start.y) * enter, z: start.z + (end.z - start.z) * enter } };
  }
  return best;
}

export class CityExperiment {
  readonly surfaces = createCitySurfaces();
  readonly damage = new Map<string, CityDamage>();
  reset() { this.damage.clear(); }
  record(hit: CityHit, massKg: number, velocity: Vec3) {
    const energy = 0.5 * massKg * (velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2);
    const normalEnergy = 0.5 * massKg * velocity[hit.surface.normalAxis] ** 2;
    const previous = this.damage.get(hit.surface.id);
    const peak = Math.max(previous?.peakNormalEnergyJ ?? 0, normalEnergy);
    const state = hit.surface.kind === 'glass' ? peak >= CITY_ASSUMPTIONS.glassBreakJ ? 'broken' : peak >= CITY_ASSUMPTIONS.glassCrackJ ? 'cracked' : 'marked'
      : hit.surface.kind === 'sign' && peak >= CITY_ASSUMPTIONS.signBendJ ? 'cracked' : 'marked';
    this.damage.set(hit.surface.id, { hits: (previous?.hits ?? 0) + 1, absorbedEnergyJ: (previous?.absorbedEnergyJ ?? 0) + energy, peakNormalEnergyJ: peak, state });
  }
  get summary() {
    return { contacted: this.damage.size, brokenGlass: [...this.damage].filter(([id, d]) => d.state === 'broken' && this.surfaces.find(s => s.id === id)?.kind === 'glass').length,
      absorbedEnergyJ: [...this.damage.values()].reduce((sum, d) => sum + d.absorbedEnergyJ, 0) };
  }
}

export const CITY_OBSERVERS = [
  { name: '歩道', position: { x: -4.4, y: 1.6, z: -6 } },
  { name: '停留所', position: { x: 5.2, y: 1.6, z: BUS_SHELTER.centerZ } },
  { name: '交差点', position: { x: 4.4, y: 1.6, z: -42 } },
] as const;

/** Dynamic pressure on the moving object is NOT pressure at a street window. */
export const dynamicPressure = (speedMs: number) => 0.5 * PHYSICS.airDensity * speedMs ** 2;
