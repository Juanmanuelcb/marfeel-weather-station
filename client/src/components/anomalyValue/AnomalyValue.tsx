const ANOMALY_FLAG = 0.5;

// Traffic light for the anomaly probability. Red is pinned to the server's anomaly
// threshold (0.5), the same cutoff the fleet rollup counts against; yellow is the band
// approaching it.
function anomalyLevel(prob: number): { dotClass: string; label: string } {
	if (prob >= ANOMALY_FLAG) return { dotClass: 'bg-anomaly', label: 'anomalous' };
	if (prob >= 0.4) return { dotClass: 'bg-stale', label: 'elevated' };
	return { dotClass: 'bg-live', label: 'normal' };
}

export function AnomalyValue({ prob }: { prob: number }) {
	const level = anomalyLevel(prob);
	return (
		<span className="inline-flex items-center justify-end gap-2 tabular-nums">
			<span className={`h-2.5 w-2.5 rounded-full ${level.dotClass}`} aria-hidden />
			<span className="sr-only">{level.label}</span>
			{prob.toFixed(2)}
		</span>
	);
}
