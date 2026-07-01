import { memo } from 'react';
import type { LocationRollup } from '../../api';
import { useVirtualWindow } from '../../lib/useVirtualWindow';
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
			className="max-h-[50vh] overflow-auto rounded shadow bg-white"
		>
			<table className="w-full table-fixed text-sm">
				<thead className="sticky top-0 z-10 bg-white">
					<tr className="text-left border-b">
						<th className="p-2">Location</th>
						<th className="p-2 w-24 text-right">Devices</th>
						<th className="p-2 w-24 text-right">Avg temp</th>
						<th className="p-2 w-28 text-right hidden sm:table-cell">Avg humidity</th>
						<th className="p-2 w-28 text-right hidden sm:table-cell">Avg anomaly</th>
						<th className="p-2 w-28 text-right">Anomalous</th>
					</tr>
				</thead>
				<tbody>
					{padTop > 0 && (
						<tr aria-hidden>
							<td colSpan={6} className="p-0" style={{ height: padTop }} />
						</tr>
					)}
					{visible.map((l, i) => (
						<tr key={l.location} ref={i === 0 ? measureRow : undefined} className="border-b">
							<td className="p-3 sm:p-2 truncate">{l.location_name || l.location}</td>
							<td className="p-3 sm:p-2 text-right">
								<FlashCell value={l.devices} decimals={0} />
							</td>
							<td className="p-3 sm:p-2 text-right">
								<FlashCell value={l.avg_temperature} decimals={1} />
							</td>
							<td className="p-3 sm:p-2 text-right hidden sm:table-cell">
								<FlashCell value={l.avg_humidity} decimals={1} />
							</td>
							<td className="p-3 sm:p-2 text-right hidden sm:table-cell">
								<FlashCell value={l.avg_anomaly} decimals={2} />
							</td>
							<td
								className={`p-3 sm:p-2 text-right ${l.anomalous_devices > 0 ? 'text-red-600 font-semibold' : ''}`}
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
