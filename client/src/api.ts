export type FleetReading = {
	device_id: string;
	temperature: number;
	humidity: number;
	pressure: number;
	wind_speed: number;
	heat_index: number;
	air_density: number;
	wind_chill: number;
	dew_point: number;
	anomaly_prob: number;
	recorded_at: string;
	location: string;
	location_name: string;
	latitude: number;
	longitude: number;
};

export type LocationRollup = {
	location: string;
	location_name: string;
	devices: number;
	avg_temperature: number;
	avg_humidity: number;
	avg_anomaly: number;
	anomalous_devices: number;
};

export type Snapshot = {
	ts: string;
	fleet: FleetReading[];
	locations: LocationRollup[];
};

export type DeviceReading = {
	device_id: string;
	temperature: number;
	humidity: number;
	pressure: number;
	wind_speed: number;
	heat_index: number;
	air_density: number;
	wind_chill: number;
	dew_point: number;
	location: string;
	recorded_at: string;
	anomaly_prob: number;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3030';

// ClickHouse returns count() columns as strings over JSONEachRow; make them numbers.
function normalizeSnapshot(raw: Snapshot): Snapshot {
	return {
		...raw,
		locations: raw.locations.map((l) => ({
			...l,
			devices: Number(l.devices),
			anomalous_devices: Number(l.anomalous_devices),
		})),
	};
}

type StreamHandlers = {
	onSnapshot: (snapshot: Snapshot) => void;
	onOpen?: () => void;
	onError?: () => void;
};

export function openSnapshotStream(handlers: StreamHandlers): () => void {
	const source = new EventSource(`${API_BASE}/api/stream`);
	source.onmessage = (event) => {
		// A malformed frame must surface as an error, not silently freeze the console.
		try {
			handlers.onSnapshot(normalizeSnapshot(JSON.parse(event.data)));
		} catch {
			handlers.onError?.();
		}
	};
	source.onopen = () => handlers.onOpen?.();
	source.onerror = () => handlers.onError?.();
	return () => source.close();
}

export async function fetchDeviceHistory(deviceId: string, sinceSeconds = 3600, limit = 200): Promise<DeviceReading[]> {
	const res = await fetch(`${API_BASE}/api/device/${encodeURIComponent(deviceId)}?since=${sinceSeconds}&limit=${limit}`);
	if (!res.ok) throw new Error(`device history failed: ${res.status}`);
	return res.json();
}
