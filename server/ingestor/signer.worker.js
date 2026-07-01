const crypto = require('crypto');
const { parentPort } = require('worker_threads');

// Integrity signature — verified downstream. Keep the output identical:
// do NOT change the algorithm or the round count, and don't skip it.
// (Tuned so one stamp takes a few tens of ms.) It runs here, on its own
// thread, so the accept loop never blocks on it.
const SIGNATURE_ROUNDS = 50000;
function computeSignature(payload) {
	let h = `${payload.device_id}|${payload.temperature}|${payload.humidity}|${payload.pressure}|${payload.wind_speed}|${payload.timestamp}`;
	for (let i = 0; i < SIGNATURE_ROUNDS; i++) {
		h = crypto.createHash('sha256').update(h).digest('hex');
	}
	return h;
}

parentPort.on('message', payload => {
	parentPort.postMessage({ signature: computeSignature(payload) });
});
