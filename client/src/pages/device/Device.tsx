import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import { fetchDeviceHistory } from '../../api';
import type { DeviceReading } from '../../api';
import { Sparkline } from '../../components/sparkline';
import type { SparkPoint } from '../../components/sparkline';

const POLL_MS = 3000;

type Status = 'loading' | 'ready' | 'error';
type ChartKey = 'temperature' | 'humidity' | 'anomaly';

function ExpandIcon() {
	return (
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
		</svg>
	);
}

function ChartCard({
	title,
	color,
	onExpand,
	children,
}: {
	title: string;
	color: string;
	onExpand: () => void;
	children: ReactNode;
}) {
	return (
		<section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-card ${color}`}>
			<div className="mb-2 flex items-center justify-between">
				<h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</h2>
				<button
					type="button"
					onClick={onExpand}
					aria-label={`Expand ${title} chart`}
					className="text-slate-400 hover:text-slate-600"
				>
					<ExpandIcon />
				</button>
			</div>
			{children}
		</section>
	);
}

export function Device() {
	const { deviceId } = useParams();
	const [readings, setReadings] = useState<DeviceReading[]>([]);
	const [status, setStatus] = useState<Status>('loading');
	const [expanded, setExpanded] = useState<ChartKey | null>(null);

	// Poll the history so the charts actually move; without this the page shows a
	// frozen snapshot from when it mounted.
	useEffect(() => {
		if (!deviceId) return;
		let active = true;
		setStatus('loading');
		setReadings([]);
		setExpanded(null);
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
				<div className="h-6 w-40 rounded-lg bg-slate-200" />
				<div className="grid gap-4 md:grid-cols-3">
					<div className="h-44 rounded-lg bg-slate-200" />
					<div className="h-44 rounded-lg bg-slate-200" />
					<div className="h-44 rounded-lg bg-slate-200" />
				</div>
				<div className="h-48 rounded-lg bg-slate-200" />
			</div>
		);
	}
	if (status === 'error' && !readings.length) {
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
				Could not load {deviceId}.
			</div>
		);
	}
	if (!latest) {
		return (
			<div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
				No recent readings for {deviceId}.
			</div>
		);
	}

	// A background poll can fail after the first load. Show that instead of a green
	// "live" dot pulsing over data that has quietly stopped updating.
	const live = status === 'ready';

	const charts = [
		{
			key: 'temperature' as const,
			title: 'Temperature',
			color: 'text-accent-600',
			unit: '°',
			decimals: 1,
			domain: undefined,
			points: pointsOf(r => r.temperature),
		},
		{
			key: 'humidity' as const,
			title: 'Humidity',
			color: 'text-sky-600',
			unit: '%',
			decimals: 1,
			domain: undefined,
			points: pointsOf(r => r.humidity),
		},
		{
			key: 'anomaly' as const,
			title: 'Anomaly',
			color: 'text-anomaly',
			unit: '',
			decimals: 2,
			domain: [0, 1] as [number, number],
			points: pointsOf(r => r.anomaly_prob),
		},
	];
	const active = charts.find(c => c.key === expanded);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-lg font-semibold font-mono tracking-tight text-slate-900 break-all">
					{deviceId}
				</h1>
				<p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
					<span className="inline-flex items-center gap-1.5">
						<span
							className={`h-2 w-2 rounded-full ${live ? 'bg-live animate-pulse' : 'bg-stale'}`}
						/>
						{live ? 'live' : 'reconnecting'}
					</span>
					<span>· {latest.location}</span>
					<span>· {readings.length} readings</span>
					<span>· latest {latest.recorded_at}</span>
				</p>
			</div>

			{active ? (
				<section
					className={`rounded-lg border border-slate-200 bg-white p-4 shadow-card ${active.color}`}
				>
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
							{active.title}
						</h2>
						<button
							type="button"
							onClick={() => setExpanded(null)}
							className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
						>
							Back to grid
						</button>
					</div>
					<Sparkline
						points={active.points}
						label={`${active.title} over time`}
						unit={active.unit}
						decimals={active.decimals}
						domain={active.domain}
						width={900}
						height={320}
						className="mx-auto w-full max-w-4xl"
					/>
				</section>
			) : (
				<div className="grid gap-4 md:grid-cols-3">
					{charts.map(c => (
						<ChartCard
							key={c.key}
							title={c.title}
							color={c.color}
							onExpand={() => setExpanded(c.key)}
						>
							<Sparkline
								points={c.points}
								label={`${c.title} over time`}
								unit={c.unit}
								decimals={c.decimals}
								domain={c.domain}
								className="w-full"
							/>
						</ChartCard>
					))}
				</div>
			)}

			<section>
				<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
					Recent readings
				</h2>
				<div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-card">
					<table className="w-full min-w-[480px] table-fixed text-sm">
						<thead>
							<tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
								<th className="px-4 py-2.5 font-medium">Recorded</th>
								<th className="px-4 py-2.5 font-medium w-24 text-right">Temp</th>
								<th className="px-4 py-2.5 font-medium w-28 text-right">Humidity</th>
								<th className="px-4 py-2.5 font-medium w-28 text-right">Anomaly</th>
							</tr>
						</thead>
						<tbody>
							{readings.slice(0, 20).map(r => (
								<tr
									key={`${r.recorded_at}-${r.temperature}-${r.humidity}`}
									className="border-b border-black/[0.06] hover:bg-slate-50 transition-colors"
								>
									<td className="px-4 py-2.5 tabular-nums text-slate-500">{r.recorded_at}</td>
									<td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
										{r.temperature.toFixed(1)}
									</td>
									<td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
										{r.humidity.toFixed(1)}
									</td>
									<td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
										{r.anomaly_prob.toFixed(2)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
