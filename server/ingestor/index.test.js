const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const { validate, intParam, calculateMetrics, detectAnomaly, toRecordedAt, buildRow, createIngestor } = require('./index');

const sample = {
	device_id: 1234,
	temperature: 21.5,
	humidity: 60,
	pressure: 101325,
	wind_speed: 5,
	timestamp: 1700000000,
	location: 'Location_1',
	attestation: 'att',
};

test('validate coerces device_id and location to strings', () => {
	const out = validate(sample);
	assert.strictEqual(out.device_id, '1234');
	assert.strictEqual(out.location, 'Location_1');
	assert.strictEqual(out.attestation, 'att');
});

test('validate coerces missing or non-numeric metrics to 0', () => {
	const out = validate({ timestamp: 1700000000 });
	assert.strictEqual(out.temperature, 0);
	assert.strictEqual(out.humidity, 0);
	assert.strictEqual(out.pressure, 0);
	assert.strictEqual(out.wind_speed, 0);
	assert.strictEqual(out.device_id, '');
	assert.strictEqual(out.location, '');
});

test('validate rejects an unparseable timestamp', () => {
	assert.strictEqual(validate({ ...sample, timestamp: 'nope' }), null);
	assert.strictEqual(validate({ ...sample, timestamp: undefined }), null);
	assert.strictEqual(validate(null), null);
});

test('validate rejects timestamps outside the ClickHouse DateTime range', () => {
	assert.ok(validate({ ...sample, timestamp: 1782903338 }));
	assert.strictEqual(validate({ ...sample, timestamp: 8e12 }), null); // the glitch value that poisoned batches
	assert.strictEqual(validate({ ...sample, timestamp: 5e9 }), null); // past 2106
	assert.strictEqual(validate({ ...sample, timestamp: 1e20 }), null);
	assert.strictEqual(validate({ ...sample, timestamp: 0 }), null);
	assert.strictEqual(validate({ ...sample, timestamp: -1 }), null);
});

test('buildRow keeps derived metrics finite when inputs coerce to zero', () => {
	const row = buildRow(validate({ timestamp: 1700000000 }), 'sig');
	assert.ok(Number.isFinite(row.dew_point));
	assert.ok(Number.isFinite(row.air_density));
	assert.ok(Number.isFinite(row.heat_index));
	assert.ok(Number.isFinite(row.wind_chill));
});

test('buildRow returns an independent object per reading', () => {
	const a = buildRow(validate(sample), 'sig-a');
	const b = buildRow(validate({ ...sample, device_id: 999, temperature: -5 }), 'sig-b');

	assert.notStrictEqual(a, b);
	a.temperature = 12345;
	assert.strictEqual(b.temperature, -5);
	assert.strictEqual(a.signature, 'sig-a');
	assert.strictEqual(b.signature, 'sig-b');
	assert.strictEqual(b.device_id, '999');
});

test('buildRow maps all 14 schema columns', () => {
	const row = buildRow(validate(sample), 'sig');
	assert.deepStrictEqual(Object.keys(row).sort(), [
		'air_density', 'anomaly_prob', 'attestation', 'device_id', 'dew_point',
		'heat_index', 'humidity', 'location', 'pressure', 'recorded_at',
		'signature', 'temperature', 'wind_chill', 'wind_speed',
	]);
});

test('toRecordedAt formats a unix timestamp as a ClickHouse DateTime', () => {
	assert.strictEqual(toRecordedAt(0), '1970-01-01 00:00:00');
	assert.strictEqual(toRecordedAt(1700000000), '2023-11-14 22:13:20');
});

test('intParam parses, clamps, and falls back', () => {
	assert.strictEqual(intParam(undefined, 300, 10, 3600), 300);
	assert.strictEqual(intParam('abc', 300, 10, 3600), 300);
	assert.strictEqual(intParam('60', 300, 10, 3600), 60);
	assert.strictEqual(intParam('99999', 300, 10, 3600), 3600);
	assert.strictEqual(intParam('1', 300, 10, 3600), 10);
	assert.strictEqual(intParam('60.9', 300, 10, 3600), 60);
});

test('detectAnomaly clamps to [0, 1]', () => {
	assert.strictEqual(detectAnomaly(20), 0);
	assert.strictEqual(detectAnomaly(25), 0.5);
	assert.strictEqual(detectAnomaly(100), 1);
	assert.strictEqual(detectAnomaly(-100), 1);
});

test('calculateMetrics returns finite derived values', () => {
	const m = calculateMetrics(21.5, 60, 101325, 5);
	for (const v of Object.values(m)) assert.ok(Number.isFinite(v));
});

function post(port, path, body) {
	return new Promise((resolve, reject) => {
		const data = Buffer.from(JSON.stringify(body));
		const req = http.request(
			{ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': 'application/json', 'content-length': data.length } },
			(res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); },
		);
		req.on('error', reject);
		req.end(data);
	});
}

async function waitFor(cond, timeoutMs = 1000) {
	const deadline = Date.now() + timeoutMs;
	while (!cond() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
	if (!cond()) throw new Error('waitFor timed out');
}

test('POST /ingest sheds with 503 once the queue is at capacity', async () => {
	let release;
	const gate = new Promise((r) => { release = r; });
	const sign = () => gate.then(() => 'sig'); // hang so nothing drains
	const client = { insert: async () => {}, close: async () => {} };
	const { app, drain } = createIngestor({ client, sign });
	const server = app.listen(0);
	const port = server.address().port;
	try {
		const codes = [];
		for (let i = 0; i < 105; i++) codes.push(await post(port, '/ingest', sample));
		assert.ok(codes.filter((c) => c === 202).length >= 100, 'accepts up to capacity');
		assert.ok(codes.includes(503), 'sheds once full');
	} finally {
		release();
		await drain();
		server.close();
	}
});

test('drain flushes the built batch before returning', async () => {
	const inserted = [];
	const client = { insert: async ({ values }) => { inserted.push(...values); }, close: async () => {} };
	const sign = async () => 'sig';
	const { app, drain, stats } = createIngestor({ client, sign });
	const server = app.listen(0);
	const port = server.address().port;
	try {
		for (let i = 0; i < 5; i++) assert.strictEqual(await post(port, '/ingest', { ...sample, device_id: i }), 202);
		await waitFor(() => stats().batch === 5);
		const dropped = await drain();
		assert.strictEqual(dropped, 0);
		assert.strictEqual(inserted.length, 5);
	} finally {
		await drain().catch(() => {}); // clears the flush interval even if an assert above threw
		server.close();
	}
});
