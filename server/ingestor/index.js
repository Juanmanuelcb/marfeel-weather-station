const express = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { createClient } = require('@clickhouse/client');

const PORT = process.env.PORT || 3030;

// Small on purpose. The signer sustains far fewer signatures/sec than the fleet
// offers on 1 CPU, so a large cap would ack readings and then drop them at the
// next restart. A tight cap sheds as honest 503s at accept time instead.
const PENDING_CAP = 100;
// Flush whichever comes first. At the real signing rate the timer always wins;
// the size cap is a safety valve for a faster core or multiple replicas.
const BATCH_MAX_ROWS = 500;
const FLUSH_INTERVAL_MS = 1000;
// Docker sends SIGKILL ~10s after SIGTERM; stay under it.
const SHUTDOWN_DEADLINE_MS = 9000;
// ClickHouse DateTime is 32-bit (1970..2106). A timestamp past this formats as a
// 6-digit-year string CH can't parse, and one bad row fails the whole batch.
const MAX_TIMESTAMP = 4294967295;

const EXPECTED_TEMP = 20;

function toFinite(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

// Hot-path guard: reject only what the writer can't survive (a timestamp outside
// the DateTime range throws or poisons the batch), coerce everything else to the
// schema's non-nullable defaults. Returns a normalized payload or null.
function validate(body) {
	if (!body || typeof body !== 'object') return null;
	const timestamp = Number(body.timestamp);
	if (!(timestamp > 0 && timestamp <= MAX_TIMESTAMP)) return null;
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

	// NOAA heat-index formula: T is temperature in Fahrenheit, R is relative humidity %.
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

// The pipeline, with the ClickHouse client and the signer injected so the accept
// path, backpressure, batching, and shutdown can be tested without a worker or DB.
function createIngestor({ client, sign }) {
	const pending = [];
	const batch = [];
	let inFlight = null;
	let flushing = false;
	let shuttingDown = false;

	function pump() {
		if (shuttingDown || inFlight || pending.length === 0) return;
		const payload = pending.shift();
		inFlight = payload;
		sign(payload).then((signature) => {
			inFlight = null;
			try {
				batch.push(buildRow(payload, signature));
				if (batch.length >= BATCH_MAX_ROWS) flush();
			} catch (err) {
				// A single un-buildable reading must not wedge the pipeline.
				console.error(`[ingestor] dropped reading for ${payload.device_id}: ${err.message}`);
			}
			pump();
		}).catch((err) => {
			// Prod sign never rejects (a dead worker exits the process); this keeps
			// the loop alive for an injected signer that can, and in tests.
			inFlight = null;
			console.error(`[ingestor] signing failed for ${payload.device_id}: ${err.message}`);
			pump();
		});
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

	const flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	async function drain() {
		shuttingDown = true;
		clearInterval(flushTimer);
		const deadline = Date.now() + SHUTDOWN_DEADLINE_MS;
		while (inFlight && Date.now() < deadline) await sleep(10);
		// Let any timer-triggered flush finish first; clearInterval does not stop
		// an insert already in progress, and flush() would no-op on its guard.
		while (flushing && Date.now() < deadline) await sleep(10);
		await flush();
		return pending.length + (inFlight ? 1 : 0);
	}

	const app = express();
	app.use(express.json({ limit: '16kb' }));

	app.get('/health', (req, res) => {
		if (shuttingDown) return res.status(503).json({ status: 'shutting_down' });
		res.json({ status: 'ok' });
	});

	app.post('/ingest', (req, res) => {
		if (shuttingDown) return res.status(503).json({ status: 'shutting_down' });
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
				query: 'SELECT * FROM readings WHERE device_id = {d:String} ORDER BY recorded_at DESC LIMIT 1000',
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

	return { app, drain, flush, stats: () => ({ pending: pending.length, batch: batch.length, shuttingDown }) };
}

function startServer() {
	if (!process.env.CLICKHOUSE_USER || !process.env.CLICKHOUSE_PASSWORD) {
		console.error('[ingestor] CLICKHOUSE_USER and CLICKHOUSE_PASSWORD are required');
		process.exit(1);
	}

	const client = createClient({
		url: process.env.CLICKHOUSE_URL || 'http://clickhouse:8123',
		username: process.env.CLICKHOUSE_USER,
		password: process.env.CLICKHOUSE_PASSWORD,
		database: 'sensor_data',
	});

	const worker = new Worker(path.join(__dirname, 'signer.worker.js'));
	let pendingResolve = null;
	worker.on('message', ({ signature }) => {
		const resolve = pendingResolve;
		pendingResolve = null;
		if (resolve) resolve(signature);
	});

	// One signature is ever outstanding (pump signs serially), so a single
	// resolver is enough to correlate the worker's reply.
	const sign = (payload) => new Promise((resolve) => {
		pendingResolve = resolve;
		worker.postMessage(payload);
	});

	const { app, drain, flush } = createIngestor({ client, sign });
	const server = app.listen(PORT, () => console.log(`Ingestor listening on ${PORT}`));

	let shuttingDown = false;

	worker.on('error', async (err) => {
		console.error(`[ingestor] signer worker failed: ${err.message}`);
		try { await flush(); } catch { /* exiting anyway */ }
		process.exit(1);
	});

	worker.on('exit', (code) => {
		if (shuttingDown) return;
		console.error(`[ingestor] signer worker exited (${code}); exiting for restart`);
		process.exit(1);
	});

	async function shutdown() {
		if (shuttingDown) return;
		shuttingDown = true;
		server.close();
		server.closeIdleConnections();

		let dropped = 0;
		try {
			dropped = await drain();
			await worker.terminate();
			await client.close();
		} catch (err) {
			console.error(`[ingestor] shutdown cleanup failed: ${err.message}`);
		}

		if (dropped) console.error(`[ingestor] shutdown dropped ${dropped} un-signed readings`);
		process.exit(0);
	}

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);
}

if (require.main === module) startServer();

module.exports = { validate, calculateMetrics, detectAnomaly, toRecordedAt, buildRow, createIngestor };
