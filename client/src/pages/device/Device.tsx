import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { fetchDeviceHistory } from '../../api';
import type { DeviceReading } from '../../api';
import { Sparkline } from '../../components/sparkline';
import type { SparkPoint } from '../../components/sparkline';

const POLL_MS = 3000;

type Status = 'loading' | 'ready' | 'error';

function ChartCard({
	title,
	color,
	children,
}: {
	title: string;
	color: string;
	children: ReactNode;
}) {
	return (
		<section className={`bg-white rounded shadow p-4 ${color}`}>
			<h2 className="text-sm font-semibold mb-2 text-gray-700">{title}</h2>
			{children}
		</section>
	);
}

export function Device() {
	const { deviceId } = useParams();
	const [readings, setReadings] = useState<DeviceReading[]>([]);
	const [status, setStatus] = useState<Status>('loading');

	// Poll the history so the charts actually move; without this the page shows a
	// frozen snapshot from when it mounted.
	useEffect(() => {
		if (!deviceId) return;
		let active = true;
		setStatus('loading');
		setReadings([]);
		const load = () =>
			fetchDeviceHistory(deviceId)
				.then(rows => {
					if (active) {
						setReadings(rows);
						setStatus('ready');
					}
				})
				.catch(() => {
					if (active) setStatus('error');
				});
		load();
		const t = setInterval(load, POLL_MS);
		return () => {
			active = false;
			clearInterval(t);
		};
	}, [deviceId]);

	// History is newest-first; charts read oldest-to-newest.
	const series = useMemo(() => readings.slice().reverse(), [readings]);
	const pointsOf = (pick: (r: DeviceReading) => number): SparkPoint[] =>
		series.map(r => ({ t: r.recorded_at, v: pick(r) }));
	const latest = readings[0];

	if (status === 'loading' && !readings.length) {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-6 w-40 bg-gray-200 rounded" />
				<div className="grid gap-4 md:grid-cols-3">
					<div className="h-40 bg-gray-200 rounded" />
					<div className="h-40 bg-gray-200 rounded" />
					<div className="h-40 bg-gray-200 rounded" />
				</div>
				<div className="h-48 bg-gray-200 rounded" />
			</div>
		);
	}
	if (status === 'error' && !readings.length) {
		return <p className="text-red-600">Could not load {deviceId}.</p>;
	}
	if (!latest) return <p className="text-gray-500">No recent readings for {deviceId}.</p>;

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-xl font-bold font-mono">{deviceId}</h1>
				<p className="text-sm text-gray-600 flex items-center gap-2">
					<span className="inline-flex items-center gap-1">
						<span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
						live
					</span>
					· {latest.location} · {readings.length} readings · latest {latest.recorded_at}
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-3">
				<ChartCard title="Temperature" color="text-blue-600">
					<Sparkline
						points={pointsOf(r => r.temperature)}
						label="Temperature over time"
						unit="°"
						className="w-full"
					/>
				</ChartCard>
				<ChartCard title="Humidity" color="text-teal-600">
					<Sparkline
						points={pointsOf(r => r.humidity)}
						label="Humidity over time"
						unit="%"
						className="w-full"
					/>
				</ChartCard>
				<ChartCard title="Anomaly" color="text-red-600">
					<Sparkline
						points={pointsOf(r => r.anomaly_prob)}
						label="Anomaly over time"
						decimals={2}
						domain={[0, 1]}
						className="w-full"
					/>
				</ChartCard>
			</div>

			<section>
				<h2 className="text-lg font-semibold mb-2">Recent readings</h2>
				<table className="w-full table-fixed text-sm bg-white rounded shadow">
					<thead>
						<tr className="text-left border-b">
							<th className="p-2">Recorded</th>
							<th className="p-2 w-24 text-right">Temp</th>
							<th className="p-2 w-28 text-right">Humidity</th>
							<th className="p-2 w-28 text-right">Anomaly</th>
						</tr>
					</thead>
					<tbody>
						{readings.slice(0, 20).map(r => (
							<tr key={`${r.recorded_at}-${r.temperature}-${r.humidity}`} className="border-b">
								<td className="p-2 tabular-nums">{r.recorded_at}</td>
								<td className="p-2 text-right tabular-nums">{r.temperature.toFixed(1)}</td>
								<td className="p-2 text-right tabular-nums">{r.humidity.toFixed(1)}</td>
								<td className="p-2 text-right tabular-nums">{r.anomaly_prob.toFixed(2)}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</div>
	);
}
