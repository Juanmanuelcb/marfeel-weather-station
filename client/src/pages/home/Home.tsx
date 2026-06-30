import { useEffect, useState } from 'react';
import { fetchFleetLatest, summarizeByLocation } from '../../api.js';

export const Home = () => {
	const [latest, setLatest] = useState<any[]>([]);
	const [summary, setSummary] = useState<any[]>([]);

	useEffect(() => {
		const load = async () => {
			const fleet = await fetchFleetLatest();
			setLatest(fleet);
			setSummary(summarizeByLocation(fleet));
		};
		load();
		const t = setInterval(() => window.location.reload(), 5000);
		return () => clearInterval(t);
	}, []);

	return (
		<div className="min-h-screen bg-gray-100 p-6 space-y-8">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-bold">Fleet overview</h1>
				<button
					className="text-sm bg-gray-800 text-white rounded px-3 py-1"
					onClick={() => window.location.reload()}
				>
					Refresh
				</button>
			</div>
			<section>
				<h2 className="text-lg font-semibold mb-2">By location</h2>
				<table className="w-full text-sm bg-white rounded shadow">
					<thead>
						<tr className="text-left border-b">
							<th className="p-2">Location</th>
							<th className="p-2">Devices</th>
							<th className="p-2">Avg temp</th>
							<th className="p-2">Avg humidity</th>
						</tr>
					</thead>
					<tbody>
						{summary.map((s) => (
							<tr key={s.location} className="border-b">
								<td className="p-2">{s.location}</td>
								<td className="p-2">{s.devices}</td>
								<td className="p-2">{s.avgTemperature.toFixed(1)}</td>
								<td className="p-2">{s.avgHumidity.toFixed(1)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>

			<section>
				<h2 className="text-lg font-semibold mb-2">Devices</h2>
				<table className="w-full text-sm bg-white rounded shadow">
					<thead>
						<tr className="text-left border-b">
							<th className="p-2">Device</th>
							<th className="p-2">Location</th>
							<th className="p-2">Temp</th>
							<th className="p-2">Humidity</th>
							<th className="p-2">Recorded</th>
						</tr>
					</thead>
					<tbody>
						{latest.map((r) => (
							<tr key={r.device_id} className="border-b">
								<td className="p-2">{r.device_id}</td>
								<td className="p-2">{r.location}</td>
								<td className="p-2">{r.temperature}</td>
								<td className="p-2">{r.humidity}</td>
								<td className="p-2">{r.recorded_at}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
};
