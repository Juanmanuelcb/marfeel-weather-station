import { memo } from 'react';
import type { LocationRollup } from '../../api';

type Props = {
	locations: LocationRollup[];
};

export const LocationSummary = memo(function LocationSummary({ locations }: Props) {
	return (
		<table className="w-full text-sm bg-white rounded shadow">
			<thead>
				<tr className="text-left border-b">
					<th className="p-2">Location</th>
					<th className="p-2">Devices</th>
					<th className="p-2">Avg temp</th>
					<th className="p-2">Avg humidity</th>
					<th className="p-2">Avg anomaly</th>
					<th className="p-2">Anomalous</th>
				</tr>
			</thead>
			<tbody>
				{locations.map((l) => (
					<tr key={l.location} className="border-b">
						<td className="p-2">{l.location_name || l.location}</td>
						<td className="p-2">{l.devices}</td>
						<td className="p-2">{l.avg_temperature.toFixed(1)}</td>
						<td className="p-2">{l.avg_humidity.toFixed(1)}</td>
						<td className="p-2">{l.avg_anomaly.toFixed(2)}</td>
						<td className={`p-2 ${l.anomalous_devices > 0 ? 'text-red-600 font-semibold' : ''}`}>
							{l.anomalous_devices}
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
});
