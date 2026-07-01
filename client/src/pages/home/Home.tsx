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
			return <p className="text-red-600">Lost connection to the fleet stream. Retrying…</p>;
		}
		return (
			<div className="space-y-8 animate-pulse">
				<div className="h-6 w-40 bg-gray-200 rounded" />
				<div className="space-y-2">
					<div className="h-5 w-32 bg-gray-200 rounded" />
					<div className="h-24 bg-gray-200 rounded" />
				</div>
				<div className="space-y-2">
					<div className="h-5 w-24 bg-gray-200 rounded" />
					<div className="h-48 bg-gray-200 rounded" />
				</div>
			</div>
		);
	}
	if (!fleet.length) {
		return <p className="text-gray-500">No devices reporting yet.</p>;
	}

	// Staleness is measured against the snapshot's own timestamp, so the table has a
	// single repaint beat (the 5s frame) instead of a second, drifting interval.
	const nowMs = Date.parse(snapshot.ts);

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-bold">Fleet overview</h1>
				<span className="text-xs text-gray-500">
					{status === 'open' ? 'live' : 'reconnecting'} · {fleet.length} devices · updated{' '}
					{snapshot.ts.slice(11, 19)}
				</span>
			</div>

			<section>
				<h2 className="text-lg font-semibold mb-2">By location</h2>
				<LocationSummary locations={snapshot.locations} />
			</section>

			<section>
				<div className="flex items-center gap-3 mb-2">
					<h2 className="text-lg font-semibold">Devices</h2>
					<select
						className="text-sm border rounded px-2 py-1 bg-white"
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
					<p className="text-gray-500">
						No devices in this location.{' '}
						<button className="underline" onClick={() => setLocation('')}>
							Clear filter
						</button>
					</p>
				)}
			</section>
		</div>
	);
}
