import { memo } from 'react';
import type { LocationRollup } from '../../api';
import { useVirtualWindow } from '../../lib/useVirtualWindow';
import { AnomalyValue } from '../anomalyValue';
import { FlashCell } from '../flashCell';

type Props = {
	locations: LocationRollup[];
};

// Virtualized too: locations are bounded (one row per location, up to ~1000), but that's
// still large enough to window.
export const LocationSummary = memo(function LocationSummary({ locations }: Props) {
	const { containerRef, measureRow, onScroll, start, end, padTop, padBottom } = useVirtualWindow(
		locations.length,
	);
	const visible = locations.slice(start, end);

	return (
		<div
			ref={containerRef}
			onScroll={onScroll}
			className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200 bg-white shadow-card"
		>
			<table className="w-full table-fixed text-sm">
				<thead className="sticky top-0 z-10 bg-white">
					<tr className="text-left border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
						<th className="px-4 py-2.5 font-medium">Location</th>
						<th className="px-4 py-2.5 font-medium w-24 text-right">Devices</th>
						<th className="px-4 py-2.5 font-medium w-24 text-right">Avg temp</th>
						<th className="px-4 py-2.5 font-medium w-28 text-right hidden sm:table-cell">
							Avg humidity
						</th>
						<th className="px-4 py-2.5 font-medium w-28 text-right hidden sm:table-cell">
							Avg anomaly
						</th>
						<th className="px-4 py-2.5 font-medium w-28 text-right">Anomalous</th>
					</tr>
				</thead>
				<tbody>
					{padTop > 0 && (
						<tr aria-hidden>
							<td colSpan={6} className="p-0" style={{ height: padTop }} />
						</tr>
					)}
					{visible.map((l, i) => (
						<tr
							key={l.location}
							ref={i === 0 ? measureRow : undefined}
							className="border-b border-black/[0.06] hover:bg-slate-50 transition-colors"
						>
							<td className="px-4 py-3 sm:py-2.5 truncate font-medium text-slate-800">
								{l.location_name || l.location}
							</td>
							<td className="px-4 py-3 sm:py-2.5 text-right text-slate-600">
								<FlashCell value={l.devices} decimals={0} />
							</td>
							<td className="px-4 py-3 sm:py-2.5 text-right text-slate-700">
								<FlashCell value={l.avg_temperature} decimals={1} />
							</td>
							<td className="px-4 py-3 sm:py-2.5 text-right hidden sm:table-cell text-slate-600">
								<FlashCell value={l.avg_humidity} decimals={1} />
							</td>
							<td className="px-4 py-3 sm:py-2.5 text-right hidden sm:table-cell text-slate-600">
								<AnomalyValue prob={l.avg_anomaly} />
							</td>
							<td
								className={`px-4 py-3 sm:py-2.5 text-right ${l.anomalous_devices > 0 ? 'text-anomaly font-semibold' : 'text-slate-600'}`}
							>
								<FlashCell value={l.anomalous_devices} decimals={0} />
							</td>
						</tr>
					))}
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
