import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { fetchDeviceHistory } from '../../api';
import type { DeviceReading } from '../../api';
import { Sparkline } from '../../components/sparkline';

type Status = 'loading' | 'ready' | 'error';

export function Device() {
	const { deviceId } = useParams();
	const [readings, setReadings] = useState<DeviceReading[]>([]);
	const [status, setStatus] = useState<Status>('loading');

	useEffect(() => {
		if (!deviceId) return;
		let active = true;
		setStatus('loading');
		fetchDeviceHistory(deviceId)
			.then((rows) => { if (active) { setReadings(rows); setStatus('ready'); } })
			.catch(() => { if (active) setStatus('error'); });
		return () => { active = false; };
	}, [deviceId]);

	// History is newest-first; the chart reads oldest-to-newest.
	const temps = useMemo(() => readings.map((r) => r.temperature).reverse(), [readings]);
	const latest = readings[0];

	if (status === 'loading') {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-6 w-40 bg-gray-200 rounded" />
				<div className="h-32 bg-gray-200 rounded" />
				<div className="h-48 bg-gray-200 rounded" />
			</div>
		);
	}
	if (status === 'error') return <p className="text-red-600">Could not load {deviceId}.</p>;
	if (!latest) return <p className="text-gray-500">No recent readings for {deviceId}.</p>;

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold font-mono">{deviceId}</h1>
				<p className="text-sm text-gray-600">
					{latest.location} · {readings.length} readings · latest {latest.recorded_at}
				</p>
			</div>

			<section className="bg-white rounded shadow p-4">
				<h2 className="text-sm font-semibold mb-2 text-gray-700">Temperature</h2>
				<Sparkline values={temps} label="Temperature over time" className="w-full h-32 text-blue-600" />
			</section>

			<section>
				<h2 className="text-lg font-semibold mb-2">Recent readings</h2>
				<table className="w-full text-sm bg-white rounded shadow">
					<thead>
						<tr className="text-left border-b">
							<th className="p-2">Recorded</th>
							<th className="p-2">Temp</th>
							<th className="p-2">Humidity</th>
							<th className="p-2">Anomaly</th>
						</tr>
					</thead>
					<tbody>
						{readings.slice(0, 20).map((r, i) => (
							<tr key={`${r.recorded_at}-${i}`} className="border-b">
								<td className="p-2">{r.recorded_at}</td>
								<td className="p-2">{r.temperature.toFixed(1)}</td>
								<td className="p-2">{r.humidity.toFixed(1)}</td>
								<td className="p-2">{r.anomaly_prob.toFixed(2)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}
