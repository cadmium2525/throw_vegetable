/**
 * Visual impact response, not a validated material-failure solver.
 * The values below are deliberately explicit, editable assumptions. They do
 * not predict real vegetable fragmentation or a plywood ballistic limit.
 * See docs/physics.md for sources, scope and the distinction from flight.
 */
export interface ImpactInput {
  massKg: number;
  /** Actual contact speed, not launch speed. */
  speedKmh: number;
  /** Kinetic energy in the contact-normal velocity component, in joules. */
  normalEnergyJ: number;
  kind: 'target' | 'ground' | 'timeout';
  vegetableId?: string;
  radiusM?: number;
}

export interface ImpactResponse {
  /** "pulverized" means wet pulp/small fragments, not vaporization. */
  vegetable: 'intact' | 'split' | 'pulverized';
  target: 'none' | 'dent' | 'cracked' | 'breached';
  severity: number;
  holeRadiusM: number;
  fragmentCount: number;
}

export const IMPACT_MODEL = Object.freeze({
  targetMaterial: 'plywood',
  targetThicknessM: 0.012,
  referenceRadiusM: 0.06,
  /** Visual thresholds for the reference radius. Not material test results. */
  dentNormalEnergyJ: 12,
  crackNormalEnergyJ: 180,
  breachNormalEnergyJ: 1800,
  maximumHoleRadiusM: 0.55,
});

export interface VegetableImpactThresholds {
  splitSpecificEnergyJkg: number;
  pulverizeSpecificEnergyJkg: number;
}

/** Assumed relative softness; no claim that these values were measured. */
export const VEGETABLE_IMPACT_THRESHOLDS: Readonly<Record<string, Readonly<VegetableImpactThresholds>>> = Object.freeze({
  tomato: Object.freeze({ splitSpecificEnergyJkg: 35, pulverizeSpecificEnergyJkg: 450 }),
  cucumber: Object.freeze({ splitSpecificEnergyJkg: 60, pulverizeSpecificEnergyJkg: 900 }),
  eggplant: Object.freeze({ splitSpecificEnergyJkg: 55, pulverizeSpecificEnergyJkg: 800 }),
  pumpkin: Object.freeze({ splitSpecificEnergyJkg: 180, pulverizeSpecificEnergyJkg: 2600 }),
  cabbage: Object.freeze({ splitSpecificEnergyJkg: 100, pulverizeSpecificEnergyJkg: 1600 }),
  carrot: Object.freeze({ splitSpecificEnergyJkg: 180, pulverizeSpecificEnergyJkg: 3000 }),
});

const FALLBACK_THRESHOLDS: Readonly<VegetableImpactThresholds> = Object.freeze({ splitSpecificEnergyJkg: 90, pulverizeSpecificEnergyJkg: 1500 });
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function getImpactResponse(input: ImpactInput): ImpactResponse {
  if (!Number.isFinite(input.massKg) || input.massKg <= 0) throw new RangeError('Impact mass must be finite and positive.');
  if (!Number.isFinite(input.speedKmh) || input.speedKmh < 0) throw new RangeError('Impact speed must be finite and nonnegative.');
  if (!Number.isFinite(input.normalEnergyJ) || input.normalEnergyJ < 0) throw new RangeError('Normal energy must be finite and nonnegative.');
  if (input.radiusM !== undefined && (!Number.isFinite(input.radiusM) || input.radiusM <= 0)) {
    throw new RangeError('Impact radius must be finite and positive.');
  }
  const empty: ImpactResponse = { vegetable: 'intact', target: 'none', severity: 0, holeRadiusM: 0, fragmentCount: 0 };
  if (input.kind === 'timeout') return empty;

  const speed = input.speedKmh / 3.6;
  const totalEnergyJ = 0.5 * input.massKg * speed * speed;
  // Floating-point roundoff or a caller error must not invent impact energy.
  const normalEnergyJ = Math.min(input.normalEnergyJ, totalEnergyJ);
  if (normalEnergyJ === 0) return empty;

  const specificEnergy = normalEnergyJ / input.massKg;
  const thresholds = VEGETABLE_IMPACT_THRESHOLDS[input.vegetableId ?? ''] ?? FALLBACK_THRESHOLDS;
  const vegetable: ImpactResponse['vegetable'] = specificEnergy >= thresholds.pulverizeSpecificEnergyJkg
    ? 'pulverized'
    : specificEnergy >= thresholds.splitSpecificEnergyJkg ? 'split' : 'intact';

  // Smaller assumed contact patches need less visual damage energy. This
  // linear size factor is an art/interaction assumption, not a punching law.
  const radius = input.radiusM ?? Math.cbrt(3 * input.massKg / (4 * Math.PI * 950));
  const sizeFactor = clamp(radius / IMPACT_MODEL.referenceRadiusM, 0.5, 3);
  const dentEnergy = IMPACT_MODEL.dentNormalEnergyJ * sizeFactor;
  const crackEnergy = IMPACT_MODEL.crackNormalEnergyJ * sizeFactor;
  const breachEnergy = IMPACT_MODEL.breachNormalEnergyJ * sizeFactor;
  let target: ImpactResponse['target'] = 'none';
  if (input.kind === 'target') {
    if (normalEnergyJ >= breachEnergy) target = 'breached';
    else if (normalEnergyJ >= crackEnergy) target = 'cracked';
    else if (normalEnergyJ >= dentEnergy) target = 'dent';
  }

  const vegetableSeverity = clamp(specificEnergy / thresholds.pulverizeSpecificEnergyJkg, 0, 1);
  const targetSeverity = input.kind === 'target'
    ? clamp(Math.log1p(normalEnergyJ / dentEnergy) / Math.log1p(breachEnergy / dentEnergy), 0, 1)
    : 0;
  const severity = Math.max(vegetableSeverity, targetSeverity);
  const holeRadiusM = target === 'breached'
    ? Math.min(IMPACT_MODEL.maximumHoleRadiusM, radius * (1 + 0.55 * Math.log2(normalEnergyJ / breachEnergy)))
    : 0;
  const fragmentCount = vegetable === 'intact'
    ? 0
    : vegetable === 'split' ? Math.round(4 + severity * 8) : Math.round(40 + severity * 80);

  return { vegetable, target, severity, holeRadiusM, fragmentCount };
}
