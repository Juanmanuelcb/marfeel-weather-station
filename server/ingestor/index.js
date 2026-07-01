const express = require('express');
const path = require('path');
const { Worker } = require('worker_threads');
const { createClient } = require('@clickhouse/client');

const PORT = process.env.PORT || 3030;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

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

// Read API. The sort key is recorded_at only, so every query needs a time bound
// or it full-scans. A device silent longer than the fleet window drops out.
const FLEET_WINDOW_S = 300;
const ANOMALY_THRESHOLD = 0.5;
const DEVICE_HISTORY_SINCE_S = 3600;
const DEVICE_HISTORY_LIMIT = 500;
const DEVICE_HISTORY_LIMIT_MAX = 2000;
// One shared poller drives the live stream, so DB load is independent of viewers.
const POLL_INTERVAL_MS = 5000;
const SSE_HEARTBEAT_MS = 20000;
const SSE_MAX_BUFFER = 1_000_000;

const EXPECTED_TEMP = 20;

// Reused by the HTTP routes and the live poller.
const FLEET_SQL = `
	SELECT r.device_id AS device_id, r.temperature AS temperature, r.humidity AS humidity,
		r.pressure AS pressure, r.wind_speed AS wind_speed, r.heat_index AS heat_index,
		r.air_density AS air_density, r.wind_chill AS wind_chill, r.dew_point AS dew_point,
		r.anomaly_prob AS anomaly_prob, r.recorded_at AS recorded_at, r.location AS location,
		c.name AS location_name, c.latitude AS latitude, c.longitude AS longitude
	FROM (
		SELECT * FROM readings
		WHERE recorded_at >= now() - INTERVAL {window:UInt32} SECOND
			AND ({location:String} = '' OR location = {location:String})
		ORDER BY recorded_at DESC
		LIMIT 1 BY device_id
	) AS r
	LEFT JOIN cities AS c ON r.location = c.location
	ORDER BY r.device_id`;

const LOCATIONS_SQL = `
	SELECT r.location AS location, c.name AS location_name, count() AS devices,
		round(avg(r.temperature), 2) AS avg_temperature,
		round(avg(r.humidity), 2) AS avg_humidity,
		round(avg(r.anomaly_prob), 4) AS avg_anomaly,
		countIf(r.anomaly_prob > {tau:Float32}) AS anomalous_devices
	FROM (
		SELECT * FROM readings
		WHERE recorded_at >= now() - INTERVAL {window:UInt32} SECOND
		ORDER BY recorded_at DESC
		LIMIT 1 BY device_id
	) AS r
	LEFT JOIN cities AS c ON r.location = c.location
	GROUP BY r.location, c.name
	ORDER BY r.location`;

function toFinite(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function intParam(raw, fallback, min, max) {
	const n = Number(raw);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(n)));
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
	// Stored as a UTC wall-clock string. The read endpoints compare against now(),
	// which is only consistent while the ClickHouse server runs in UTC (image default).
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

	const subscribers = new Set();
	let snapshot = null;

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

	async function query(sql, query_params) {
		const rs = await client.query({ query: sql, query_params, format: 'JSONEachRow' });
		return rs.json();
	}

	// Drop a subscriber that can't keep up rather than buffer it unbounded on a
	// 512MB pod. A dead socket lands here or on the 'error' handler in the route.
	function send(res, frame) {
		if (res.writableEnded || res.writableLength > SSE_MAX_BUFFER) {
			res.end();
			subscribers.delete(res);
			return;
		}
		res.write(frame);
	}

	// One poll per tick, fanned out to every subscriber, so the DB load does not
	// grow with viewer count. The client filters the full fleet by location itself.
	async function poll() {
		try {
			const [fleet, locations] = await Promise.all([
				query(FLEET_SQL, { window: FLEET_WINDOW_S, location: '' }),
				query(LOCATIONS_SQL, { window: FLEET_WINDOW_S, tau: ANOMALY_THRESHOLD }),
			]);
			snapshot = { ts: new Date().toISOString(), fleet, locations };
			const frame = `data: ${JSON.stringify(snapshot)}\n\n`;
			for (const res of subscribers) send(res, frame);
		} catch (err) {
			// Keep the last good snapshot; a poll blip must not drop viewers.
			console.error(`[ingestor] snapshot poll failed: ${err.message}`);
		}
	}

	const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
	const heartbeatTimer = setInterval(() => {
		for (const res of subscribers) send(res, ': ping\n\n');
	}, SSE_HEARTBEAT_MS);
	poll();

	async function drain() {
		shuttingDown = true;
		clearInterval(flushTimer);
		clearInterval(pollTimer);
		clearInterval(heartbeatTimer);
		for (const res of subscribers) res.end();
		subscribers.clear();
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

	async function readJson(res, sql, query_params) {
		res.header('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
		try {
			res.json(await query(sql, query_params));
		} catch (err) {
			// A read failure must not take down the shared ingestion process.
			console.error(`[ingestor] read failed: ${err.message}`);
			res.status(500).json({ status: 'error' });
		}
	}

	app.get('/api/stream', (req, res) => {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
		});
		subscribers.add(res);
		// New subscribers get the current snapshot now, not after a full poll.
		if (snapshot) send(res, `data: ${JSON.stringify(snapshot)}\n\n`);
		req.on('close', () => subscribers.delete(res));
		// A half-open socket surfaces here, not on 'close'. Without this an unhandled
		// stream error would take down the shared ingestion process.
		res.on('error', () => subscribers.delete(res));
	});

	app.get('/api/fleet', (req, res) => {
		const window = intParam(req.query.window, FLEET_WINDOW_S, 10, 3600);
		const location = String(req.query.location ?? '');
		readJson(res, FLEET_SQL, { window, location });
	});

	app.get('/api/locations', (req, res) => {
		const window = intParam(req.query.window, FLEET_WINDOW_S, 10, 3600);
		readJson(res, LOCATIONS_SQL, { window, tau: ANOMALY_THRESHOLD });
	});

	// Bounded per-device history for the detail chart, deduped by signature so
	// at-least-once re-inserts don't show as duplicate points.
	app.get('/api/device/:id', (req, res) => {
		const since = intParam(req.query.since, DEVICE_HISTORY_SINCE_S, 10, 86400);
		const limit = intParam(req.query.limit, DEVICE_HISTORY_LIMIT, 1, DEVICE_HISTORY_LIMIT_MAX);
		readJson(res, `
			SELECT device_id, temperature, humidity, pressure, wind_speed, heat_index,
				air_density, wind_chill, dew_point, location, recorded_at, anomaly_prob
			FROM (
				SELECT * FROM readings
				WHERE device_id = {id:String}
					AND recorded_at >= now() - INTERVAL {since:UInt32} SECOND
				ORDER BY recorded_at DESC
				LIMIT 1 BY signature
			)
			ORDER BY recorded_at DESC
			LIMIT {limit:UInt32}`, { id: req.params.id, since, limit });
	});

	return { app, drain, flush, poll, stats: () => ({ pending: pending.length, batch: batch.length, subscribers: subscribers.size, shuttingDown }) };
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

module.exports = { validate, intParam, calculateMetrics, detectAnomaly, toRecordedAt, buildRow, createIngestor };
