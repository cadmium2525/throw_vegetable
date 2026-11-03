/** SANDBOX RULES, NOT a blast model. No pressure, lethal radius or structural
 * load is inferred from relativistic launch energy. Display reach is deliberately
 * compressed to fit a fictional street and provide different play outcomes. */
import { CITY_BUILDING_COUNT } from './districts';
export const DEMOLITION_RULES_VERSION = 2;
export function demolitionReach(energyJ: number) {
  if (!Number.isFinite(energyJ) || energyJ < 0) throw new RangeError('Finite nonnegative energy required');
  if (energyJ === 0) return 0;
  const power = Math.max(0, Math.min(1, Math.log10(energyJ / 1e16) / 2.65));
  return 32 + 78 * power;
}
export function demolitionPhase(distance: number, elapsed: number, energyJ: number, kind: 'wall' | 'glass' | 'fixture') {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(elapsed)) throw new RangeError('Invalid presentation coordinates');
  const reach = demolitionReach(energyJ);
  if (reach === 0 || distance > reach * (kind === 'glass' ? 1.18 : 1)) return 0;
  const arrival = 1.3 + distance / 24 + (kind === 'wall' ? 0.35 : 0);
  return Math.max(0, Math.min(1, (elapsed - arrival) / (kind === 'wall' ? 2.1 : 1.2)));
}
export interface DemolitionCounts { buildings: number; windows: number; fixtures: number }
export function demolitionScore(counts: DemolitionCounts) {
  return counts.buildings * 100 + counts.windows * 10 + counts.fixtures * 25;
}
export interface SandboxRecord { key: string; vegetableId: string; beta: number; score: number; buildings: number; windows: number }
export const SANDBOX_STORAGE_KEY = `vegetable-demolition-v${DEMOLITION_RULES_VERSION}`;
/** Validate storage: malformed / stale local data must never break launch. */
export function readSandboxRecords(text: string | null): SandboxRecord[] {
  try {
    const data: unknown = JSON.parse(text ?? '[]');
    if (!Array.isArray(data)) return [];
    const ids = ['tomato', 'carrot', 'cucumber', 'eggplant', 'pumpkin', 'cabbage'];
    return data.filter((r): r is SandboxRecord => r && ids.includes(r.vegetableId) && [0.9, 0.99, 0.999].includes(r.beta)
      && r.key === `${r.vegetableId}:${r.beta}` && Number.isInteger(r.score) && r.score >= 0 && r.score <= CITY_BUILDING_COUNT * 100 + 560
      && Number.isInteger(r.buildings) && r.buildings >= 0 && r.buildings <= CITY_BUILDING_COUNT
      && Number.isInteger(r.windows) && r.windows >= 0 && r.windows <= 51).slice(0, 18);
  } catch { return []; }
}
