const API_BASE = 'http://localhost:3030';

const DEVICE_IDS = ['device_1234', 'device_818181', 'device_919191'];

async function fetchDevice(deviceId) {
	const res = await fetch(`${API_BASE}/api/${deviceId}`);
	return res.json();
}

async function fetchFleetLatest() {
	const latest = [];
	for (const id of DEVICE_IDS) {
		const rows = await fetchDevice(id);
		if (rows && rows.length) latest.push(rows[0]);
	}
	return latest;
}

function summarizeByLocation(latest) {
	const byLocation = {};
	for (const r of latest) {
		const loc = r.location || 'unknown';
		if (!byLocation[loc]) {
			byLocation[loc] = { location: loc, count: 0, tempSum: 0, humiditySum: 0 };
		}
		byLocation[loc].count += 1;
		byLocation[loc].tempSum += Number(r.temperature) || 0;
		byLocation[loc].humiditySum += Number(r.humidity) || 0;
	}
	return Object.values(byLocation).map((g) => ({
		location: g.location,
		devices: g.count,
		avgTemperature: g.tempSum / g.count,
		avgHumidity: g.humiditySum / g.count,
	}));
}

export { API_BASE, DEVICE_IDS, fetchDevice, fetchFleetLatest, summarizeByLocation };
