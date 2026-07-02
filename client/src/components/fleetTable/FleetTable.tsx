import { memo } from 'react';
import { Link } from 'react-router';
import type { FleetReading } from '../../api';
import { isStale } from '../../lib/staleness';
import { useVirtualWindow } from '../../lib/useVirtualWindow';
import { AnomalyValue } from '../anomalyValue';
import { FlashCell } from '../flashCell';

const STALE_MS = 15000;

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
			className="max-h-[70vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-card"
		>
			<table className="w-full table-fixed text-sm">
				<thead className="sticky top-0 z-10 bg-white">
					<tr className="text-left border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
						<th className="px-4 py-2.5 font-medium w-28 sm:w-44">Device</th>
						<th className="px-4 py-2.5 font-medium w-40 hidden sm:table-cell">Location</th>
						<th className="px-4 py-2.5 font-medium w-16 sm:w-20 text-right">Temp</th>
						<th className="px-4 py-2.5 font-medium w-24 text-right hidden sm:table-cell">
							Humidity
						</th>
						<th className="px-4 py-2.5 font-medium w-20 sm:w-24 text-right">Anomaly</th>
						<th className="px-4 py-2.5 font-medium">Recorded</th>
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
						return (
							<tr
								key={r.device_id}
								ref={i === 0 ? measureRow : undefined}
								className="border-b border-black/[0.06] hover:bg-slate-50 transition-colors"
							>
								<td className="px-4 py-3 sm:py-2.5 font-mono truncate">
									<Link
										to={`/device/${r.device_id}`}
										className="text-accent-600 hover:text-accent-700 font-medium"
									>
										{r.device_id}
									</Link>
								</td>
								<td className="px-4 py-3 sm:py-2.5 truncate hidden sm:table-cell text-slate-600">
									{r.location_name || r.location}
								</td>
								<td className="px-4 py-3 sm:py-2.5 text-right text-slate-700">
									<FlashCell value={r.temperature} decimals={1} />
								</td>
								<td className="px-4 py-3 sm:py-2.5 text-right hidden sm:table-cell text-slate-700">
									<FlashCell value={r.humidity} decimals={1} />
								</td>
								<td className="px-4 py-3 sm:py-2.5 text-right text-slate-700">
									<AnomalyValue prob={r.anomaly_prob} />
								</td>
								<td className="px-4 py-3 sm:py-2.5 tabular-nums whitespace-nowrap text-slate-500">
									{r.recorded_at}
									{stale ? (
										<span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
											stale
										</span>
									) : null}
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
