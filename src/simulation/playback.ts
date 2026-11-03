/** Only an explicitly requested replay changes the physical clock. */
export function playbackRate(flightSeconds: number, replay: boolean): number {
  if (!Number.isFinite(flightSeconds) || flightSeconds <= 0) throw new RangeError('Invalid flight duration');
  return replay ? Math.min(0.25, Math.max(0.01, flightSeconds / 1.8)) : 1;
}

export function flightTimeAt(wallSeconds: number, rate: number, durationSeconds: number): number {
  return Math.min(durationSeconds, Math.max(0, wallSeconds) * rate);
}

/** Size/speed is a display timescale, NOT a calibrated fracture duration. */
export function contactTimescale(radiusM: number, normalSpeedMs: number): number {
  return Math.min(0.015, Math.max(0.00008, 2 * radiusM / Math.max(1, normalSpeedMs)));
}

/** Explicit replay slows the contact separately, then accelerates to the debris.
 * The normal-play clock remains exactly real time.
 */
export function aftermathTimeAt(wallSeconds: number, replay: boolean, contactSeconds: number): number {
  const wall = Math.max(0, wallSeconds);
  if (!replay) return wall;
  const contactEnd = contactSeconds * 2.5;
  if (wall <= 1.2) return wall / 1.2 * contactEnd;
  if (wall <= 3.2) return contactEnd + (wall - 1.2) * 0.025;
  if (wall <= 5.2) return contactEnd + 0.05 + (wall - 3.2) * 0.25;
  return contactEnd + 0.55 + wall - 5.2;
}
