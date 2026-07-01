import { useMemo, useState } from 'react';
import { useSnapshot } from '../../snapshot';
import { FleetTable } from '../../components/fleetTable';
import { LocationSummary } from '../../components/locationSummary';

export function Home() {
	const { snapshot, status } = useSnapshot();
	const [location, setLocation] = useState('');

	const fleet = useMemo(() => snapshot?.fleet ?? [], [snapshot]);
	const filtered = useMemo(
		() => (location ? fleet.filter(r => r.location === location) : fleet),
		[fleet, location],
	);

	if (!snapshot) {
		if (status === 'error') {
			return (
				<div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-700">
					Lost connection to the fleet stream. Retrying…
				</div>
			);
		}
		return (
			<div className="space-y-8 animate-pulse">
				<div className="h-6 w-40 rounded-lg bg-slate-200" />
				<div className="space-y-2">
					<div className="h-4 w-32 rounded bg-slate-200" />
					<div className="h-24 rounded-lg bg-slate-200" />
				</div>
				<div className="space-y-2">
					<div className="h-4 w-24 rounded bg-slate-200" />
					<div className="h-48 rounded-lg bg-slate-200" />
				</div>
			</div>
		);
	}
	if (!fleet.length) {
		return (
			<div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
				No devices reporting yet.
			</div>
		);
	}

	// Staleness is measured against the snapshot's own timestamp, so the table has a
	// single repaint beat (the 5s frame) instead of a second, drifting interval.
	const nowMs = Date.parse(snapshot.ts);

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<h1 className="text-xl font-semibold tracking-tight text-slate-900">Fleet overview</h1>
				<span className="inline-flex items-center gap-1.5 self-start rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600">
					<span
						className={`h-1.5 w-1.5 rounded-full ${status === 'open' ? 'bg-live animate-pulse' : 'bg-stale'}`}
					/>
					{status === 'open' ? 'Live' : 'Reconnecting'} · {fleet.length} devices ·{' '}
					{snapshot.ts.slice(11, 19)}
				</span>
			</div>

			<section>
				<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
					By location
				</h2>
				<LocationSummary locations={snapshot.locations} />
			</section>

			<section>
				<div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Devices</h2>
					<select
						aria-label="Filter by location"
						className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-700 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 sm:min-h-0 sm:w-auto"
						value={location}
						onChange={e => setLocation(e.target.value)}
					>
						<option value="">All locations</option>
						{snapshot.locations.map(l => (
							<option key={l.location} value={l.location}>
								{l.location_name || l.location}
							</option>
						))}
					</select>
				</div>
				{filtered.length ? (
					<FleetTable rows={filtered} nowMs={nowMs} />
				) : (
					<div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
						No devices in this location.{' '}
						<button
							className="font-medium text-accent-600 hover:text-accent-700"
							onClick={() => setLocation('')}
						>
							Clear filter
						</button>
					</div>
				)}
			</section>
		</div>
	);
}
