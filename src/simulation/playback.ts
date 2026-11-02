/** Only an explicitly requested replay changes the physical clock. */
export function playbackRate(flightSeconds: number, replay: boolean): number {
  if (!Number.isFinite(flightSeconds) || flightSeconds <= 0) throw new RangeError('Invalid flight duration');
  return replay ? Math.min(0.25, Math.max(0.01, flightSeconds / 1.8)) : 1;
}

export function flightTimeAt(wallSeconds: number, rate: number, durationSeconds: number): number {
  return Math.min(durationSeconds, Math.max(0, wallSeconds) * rate);
}
