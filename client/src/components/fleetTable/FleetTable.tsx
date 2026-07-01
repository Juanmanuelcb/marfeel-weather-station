import { memo } from 'react';
import type { FleetReading } from '../../api';
import { isStale } from '../../lib/staleness';

const STALE_MS = 15000;
const ANOMALY_FLAG = 0.5;

type Props = {
	rows: FleetReading[];
	nowMs: number;
};

// Memoized and render-all: smooth to several hundred devices, well past the test
// fleet. For thousands, swap the tbody for a windowed list (e.g. react-window).
export const FleetTable = memo(function FleetTable({ rows, nowMs }: Props) {
	return (
		<table className="w-full text-sm bg-white rounded shadow">
			<thead>
				<tr className="text-left border-b">
					<th className="p-2">Device</th>
					<th className="p-2">Location</th>
					<th className="p-2">Temp</th>
					<th className="p-2">Humidity</th>
					<th className="p-2">Anomaly</th>
					<th className="p-2">Last seen</th>
				</tr>
			</thead>
			<tbody>
				{rows.map(r => {
					const stale = isStale(r.recorded_at, nowMs, STALE_MS);
					const anomalous = r.anomaly_prob > ANOMALY_FLAG;
					return (
						<tr key={r.device_id} className="border-b">
							<td className="p-2 font-mono">{r.device_id}</td>
							<td className="p-2">{r.location_name || r.location}</td>
							<td className="p-2">{r.temperature.toFixed(1)}</td>
							<td className="p-2">{r.humidity.toFixed(1)}</td>
							<td className={`p-2 ${anomalous ? 'text-red-600 font-semibold' : ''}`}>
								{`${r.anomaly_prob.toFixed(2)}${anomalous ? ' !' : ''}`}
							</td>
							<td className="p-2">
								{r.recorded_at}
								{stale ? <span className="ml-2 text-xs text-amber-600">stale</span> : null}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
});
