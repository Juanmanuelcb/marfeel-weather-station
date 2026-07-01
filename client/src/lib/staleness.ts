// recorded_at is 'YYYY-MM-DD HH:MM:SS' in UTC. A device silent past the threshold
// is flagged stale so the console surfaces quiet or misbehaving sensors.
export function isStale(recordedAt: string, nowMs: number, thresholdMs: number): boolean {
	const seen = Date.parse(`${recordedAt.replace(' ', 'T')}Z`);
	return Number.isFinite(seen) && nowMs - seen > thresholdMs;
}
