import { LIGHT_SPEED_MS, relativisticMotion } from './relativity';

export const NEAR_LIGHT_PRESETS = [0.9, 0.99, 0.999] as const;
export type NearLightMedium = 'air' | 'vacuum';
export const NEAR_LIGHT_DURATION = 6;

/** Exact launch kinematics, deliberately separate from the ordinary drag solver. */
export function nearLightShot(massKg: number, beta: number) {
  if (!(NEAR_LIGHT_PRESETS as readonly number[]).includes(beta)) throw new RangeError('Unsupported near-light preset');
  return { ...relativisticMotion(massKg, beta * LIGHT_SPEED_MS), massKg, speedMs: beta * LIGHT_SPEED_MS };
}

/** Presentation clock, not an atmospheric trajectory or energy-deposition calculation.
 * Only the vacuum comparison has a physical time coordinate. */
export function nearLightFrame(elapsed: number, medium: NearLightMedium, shot: ReturnType<typeof nearLightShot>) {
  if (!Number.isFinite(elapsed)) throw new RangeError('Finite playback time required');
  const time = Math.max(0, Math.min(NEAR_LIGHT_DURATION, elapsed));
  const progress = Math.min(1, time / 3);
  return {
    time, progress, complete: time >= NEAR_LIGHT_DURATION,
    vacuumTimeSeconds: medium === 'vacuum' ? progress * shot.vacuumTransitSeconds! : null,
    // A visual dissolve, not a measured disintegration location or time.
    recognizableFraction: medium === 'vacuum' ? 1 : Math.max(0, 1 - progress / 0.16),
    spread: Math.max(0, Math.min(1, (time - 1) / 4)),
    // No solved pressure field, temperature, deposited energy or damage radius.
  };
}
