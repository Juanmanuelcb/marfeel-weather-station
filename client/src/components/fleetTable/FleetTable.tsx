import { memo } from 'react';
import { Link } from 'react-router';
import type { FleetReading } from '../../api';
import { isStale } from '../../lib/staleness';
import { useVirtualWindow } from '../../lib/useVirtualWindow';
import { FlashCell } from '../flashCell';

const STALE_MS = 15000;
const ANOMALY_FLAG = 0.5;

type Props = {
	rows: FleetReading[];
	nowMs: number;
};

// Virtualized: only the rows in view are in the DOM (plus a spacer above and below), so
// the fleet view stays responsive at thousands of devices. Fixed layout + tabular-nums
// keep columns from shifting as live values update; FlashCell flags what changed.
export const FleetTable = memo(function FleetTable({ rows, nowMs }: Props) {
	const { containerRef, measureRow, onScroll, start, end, padTop, padBottom } = useVirtualWindow(
		rows.length,
	);
	const visible = rows.slice(start, end);

	return (
		<div
			ref={containerRef}
			onScroll={onScroll}
			className="max-h-[70vh] overflow-auto rounded shadow bg-white"
		>
			<table className="w-full table-fixed text-sm">
				<thead className="sticky top-0 z-10 bg-white">
					<tr className="text-left border-b">
						<th className="p-2 w-28 sm:w-44">Device</th>
						<th className="p-2 w-40 hidden sm:table-cell">Location</th>
						<th className="p-2 w-16 sm:w-20 text-right">Temp</th>
						<th className="p-2 w-24 text-right hidden sm:table-cell">Humidity</th>
						<th className="p-2 w-20 sm:w-24 text-right">Anomaly</th>
						<th className="p-2">Last seen</th>
					</tr>
				</thead>
				<tbody>
					{padTop > 0 && (
						<tr aria-hidden>
							<td colSpan={6} className="p-0" style={{ height: padTop }} />
						</tr>
					)}
					{visible.map((r, i) => {
						const stale = isStale(r.recorded_at, nowMs, STALE_MS);
						const anomalous = r.anomaly_prob > ANOMALY_FLAG;
						return (
							<tr key={r.device_id} ref={i === 0 ? measureRow : undefined} className="border-b">
								<td className="p-3 sm:p-2 font-mono truncate">
									<Link to={`/device/${r.device_id}`} className="text-blue-700 hover:underline">
										{r.device_id}
									</Link>
								</td>
								<td className="p-3 sm:p-2 truncate hidden sm:table-cell">
									{r.location_name || r.location}
								</td>
								<td className="p-3 sm:p-2 text-right">
									<FlashCell value={r.temperature} decimals={1} />
								</td>
								<td className="p-3 sm:p-2 text-right hidden sm:table-cell">
									<FlashCell value={r.humidity} decimals={1} />
								</td>
								<td
									className={`p-3 sm:p-2 text-right tabular-nums ${anomalous ? 'text-red-600 font-semibold' : ''}`}
								>
									{`${r.anomaly_prob.toFixed(2)}${anomalous ? ' !' : ''}`}
								</td>
								<td className="p-3 sm:p-2 tabular-nums whitespace-nowrap">
									{r.recorded_at}
									{stale ? <span className="ml-2 text-xs text-amber-600">stale</span> : null}
								</td>
							</tr>
						);
					})}
					{padBottom > 0 && (
						<tr aria-hidden>
							<td colSpan={6} className="p-0" style={{ height: padBottom }} />
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
});
