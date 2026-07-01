const express = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { createClient } = require('@clickhouse/client');

const PORT = process.env.PORT || 3030;

// Raw payloads awaiting a signature. Capped: on 1 CPU the signer sustains far
// fewer signatures/sec than the fleet offers, so this backlog grows under load.
// A hard cap turns silent gateway-timeout loss into explicit, countable 503s.
const PENDING_CAP = 1000;
// Flush whichever comes first. Time bound keeps the in-flight batch small so a
// 30s restart (and the SIGTERM flush) never strands much.
const BATCH_MAX_ROWS = 500;
const FLUSH_INTERVAL_MS = 1000;
// Docker sends SIGKILL ~10s after SIGTERM; stay under it.
const SHUTDOWN_DEADLINE_MS = 9000;

const EXPECTED_TEMP = 20;

function toFinite(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

// Hot-path guard: reject only what the writer can't survive (an unparseable
// timestamp throws on Date construction), coerce everything else to the
// schema's non-nullable defaults. Returns a normalized payload or null.
function validate(body) {
	if (!body || typeof body !== 'object') return null;
	const timestamp = Number(body.timestamp);
	// Reject what would crash row-building: non-positive or beyond the range a
	// JS Date can hold (toISOString throws), since recorded_at is mandatory.
	if (!(timestamp > 0 && timestamp < 8.64e12)) return null;
	return {
		device_id: String(body.device_id ?? ''),
		temperature: toFinite(body.temperature),
		humidity: toFinite(body.humidity),
		pressure: toFinite(body.pressure),
		wind_speed: toFinite(body.wind_speed),
		timestamp,
		location: String(body.location ?? ''),
		attestation: String(body.attestation ?? ''),
	};
}

function calculateMetrics(temperature, humidity, pressure, windSpeed) {
	const alpha = ((17.27 * temperature) / (237.7 + temperature)) + Math.log(humidity / 100);
	const dewPoint = (237.7 * alpha) / (17.27 - alpha);
	const airDensity = pressure / (287.05 * (temperature + 273.15));
	const windChill = windSpeed > 4.8
		? 13.12 + 0.6215 * temperature - 11.37 * Math.pow(windSpeed, 0.16) + 0.3965 * temperature * Math.pow(windSpeed, 0.16)
		: temperature;

	const T = temperature * 9 / 5 + 32;
	const R = humidity;
	const hiF = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
		- 6.83783e-3 * T * T - 5.481717e-2 * R * R + 1.22874e-3 * T * T * R
		+ 8.5282e-4 * T * R * R - 1.99e-6 * T * T * R * R;
	const heatIndex = (hiF - 32) * 5 / 9;

	return { dewPoint, airDensity, windChill, heatIndex };
}

function detectAnomaly(temperature) {
	return Math.min(1, Math.abs(temperature - EXPECTED_TEMP) / 10);
}

function toRecordedAt(timestamp) {
	return new Date(timestamp * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

// A fresh object per reading. The spike mutated one shared module-level object
// across an await, so concurrent requests overwrote each other's fields.
function buildRow(payload, signature) {
	const { dewPoint, airDensity, windChill, heatIndex } = calculateMetrics(
		payload.temperature, payload.humidity, payload.pressure, payload.wind_speed,
	);
	return {
		device_id: payload.device_id,
		temperature: payload.temperature,
		humidity: payload.humidity,
		pressure: payload.pressure,
		wind_speed: payload.wind_speed,
		// The formulas can produce NaN/Infinity from coerced-to-zero inputs
		// (e.g. humidity 0 -> log(0)); a non-nullable column rejects null.
		heat_index: toFinite(heatIndex),
		air_density: toFinite(airDensity),
		wind_chill: toFinite(windChill),
		dew_point: toFinite(dewPoint),
		location: payload.location,
		recorded_at: toRecordedAt(payload.timestamp),
		anomaly_prob: detectAnomaly(payload.temperature),
		signature,
		attestation: payload.attestation,
	};
}

function startServer() {
	const client = createClient({
		url: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
		username: process.env.CLICKHOUSE_USER || 'usr',
		password: process.env.CLICKHOUSE_PASSWORD || '123456789',
		database: 'sensor_data',
	});

	const worker = new Worker(path.join(__dirname, 'signer.worker.js'));

	const pending = [];
	const batch = [];
	let inFlight = null;
	let flushing = false;
	let shuttingDown = false;

	function pump() {
		if (shuttingDown || inFlight || pending.length === 0) return;
		inFlight = pending.shift();
		worker.postMessage(inFlight);
	}

	async function flush() {
		if (flushing || batch.length === 0) return;
		flushing = true;
		const rows = batch.splice(0, batch.length);
		try {
			await client.insert({ table: 'readings', values: rows, format: 'JSONEachRow' });
		} catch {
			try {
				await client.insert({ table: 'readings', values: rows, format: 'JSONEachRow' });
			} catch (second) {
				// One retry then shed: a wedged writer must not block ingestion or grow memory.
				console.error(`[ingestor] dropped batch of ${rows.length} rows after retry: ${second.message}`);
			}
		} finally {
			flushing = false;
		}
	}

	worker.on('message', ({ signature }) => {
		const payload = inFlight;
		inFlight = null;
		try {
			batch.push(buildRow(payload, signature));
			if (batch.length >= BATCH_MAX_ROWS) flush();
		} catch (err) {
			// A single un-buildable reading must not wedge the pipeline.
			console.error(`[ingestor] dropped reading for ${payload?.device_id}: ${err.message}`);
		}
		pump();
	});

	worker.on('error', async (err) => {
		console.error(`[ingestor] signer worker failed: ${err.message}; dropping ${pending.length} un-signed`);
		try { await flush(); } catch { /* exiting anyway */ }
		process.exit(1);
	});

	worker.on('exit', (code) => {
		if (shuttingDown) return;
		console.error(`[ingestor] signer worker exited (${code}); exiting for restart`);
		process.exit(1);
	});

	const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);

	const app = express();
	app.use(express.json());

	app.post('/ingest', (req, res) => {
		const payload = validate(req.body);
		if (!payload) return res.status(400).json({ status: 'invalid' });
		if (pending.length >= PENDING_CAP) return res.status(503).json({ status: 'overloaded' });
		pending.push(payload);
		pump();
		res.status(202).json({ status: 'accepted' });
	});

	app.get('/api/:deviceId', async (req, res) => {
		res.header('Access-Control-Allow-Origin', '*');
		try {
			const rs = await client.query({
				query: 'SELECT * FROM readings WHERE device_id = {d:String} ORDER BY recorded_at DESC',
				query_params: { d: req.params.deviceId },
				format: 'JSONEachRow',
			});
			res.json(await rs.json());
		} catch (err) {
			// A read failure must not take down the shared ingestion process.
			console.error(`[ingestor] read failed for ${req.params.deviceId}: ${err.message}`);
			res.status(500).json({ status: 'error' });
		}
	});

	const server = app.listen(PORT, () => console.log(`Ingestor listening on ${PORT}`));

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	async function shutdown() {
		if (shuttingDown) return;
		shuttingDown = true;
		clearInterval(flushTimer);
		server.close();
		server.closeIdleConnections();

		const deadline = Date.now() + SHUTDOWN_DEADLINE_MS;
		while (inFlight && Date.now() < deadline) await sleep(10);

		try {
			await worker.terminate();
			await flush();
			await client.close();
		} catch (err) {
			console.error(`[ingestor] shutdown cleanup failed: ${err.message}`);
		}

		const dropped = pending.length + (inFlight ? 1 : 0);
		if (dropped) console.error(`[ingestor] shutdown dropped ${dropped} un-signed readings`);
		process.exit(0);
	}

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}

if (require.main === module) startServer();

module.exports = { validate, calculateMetrics, detectAnomaly, toRecordedAt, buildRow };
