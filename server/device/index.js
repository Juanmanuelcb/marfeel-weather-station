'use strict';

const path   = require('path');
const fs     = require('fs');
const loader = require('@assemblyscript/loader');
const axios  = require('axios');

const TARGET_URL   = process.env.TARGET_URL;
const DEVICE_COUNT = parseInt(process.env.DEVICE_COUNT || '3', 10);
const INTERVAL_MS  = parseInt(process.env.INTERVAL_MS  || '500', 10);

const GLITCH_WARMUP_S   = parseInt(process.env.GLITCH_WARMUP_S   || '60',  10);
const GLITCH_PERIOD_S   = parseInt(process.env.GLITCH_PERIOD_S   || '180', 10);
const GLITCH_DURATION_S = parseInt(process.env.GLITCH_DURATION_S || '30',  10);

// Buffer readings and retry so a brief ingestor outage (the 30s restart) doesn't
// drop data. Bounded: on sustained overload the oldest readings are shed.
const MAX_QUEUE      = parseInt(process.env.MAX_QUEUE || '5000', 10);
const BACKOFF_MIN_MS = 500;
const BACKOFF_MAX_MS = 5000;

const NAMED_DEVICES = [1234, 818181, 919191];

const queue = [];
let dropped = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildDeviceIds() {
  if (DEVICE_COUNT <= NAMED_DEVICES.length) return NAMED_DEVICES.slice(0, DEVICE_COUNT);
  const ids = [...NAMED_DEVICES];
  for (let i = NAMED_DEVICES.length; i < DEVICE_COUNT; i++) ids.push(100000 + i);
  return ids;
}

function enqueue(payload) {
  if (queue.length >= MAX_QUEUE) { queue.shift(); dropped++; }
  queue.push(payload);
}

// One serial sender drains the shared queue. A 4xx is a bad payload (drop it),
// except 429/408 which mean "slow down and retry"; a 5xx / timeout / network error
// is transient (retry the same reading with backoff).
async function drain() {
  let backoff = BACKOFF_MIN_MS;
  for (;;) {
    if (queue.length === 0) { await sleep(50); continue; }
    const payload = queue[0];
    try {
      await axios.post(TARGET_URL, payload);
      queue.shift();
      backoff = BACKOFF_MIN_MS;
    } catch (err) {
      const status = err.response ? err.response.status : 0;
      if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
        queue.shift();
        console.error(`[device] dropped ${payload.device_id}: HTTP ${status}`);
        backoff = BACKOFF_MIN_MS;
      } else {
        await sleep(backoff);
        backoff = Math.min(BACKOFF_MAX_MS, backoff * 2);
      }
    }
  }
}

async function main() {
  const wasmBytes = fs.readFileSync(path.join(__dirname, 'device.wasm'));
  const { exports: wasm } = await loader.instantiate(wasmBytes, {
    env: { seed: () => Math.random() }
  });

  wasm.seed(BigInt(Date.now()));

  const ids = buildDeviceIds();
  const startMs = Date.now();

  setInterval(() => {
    const nowSeconds = Date.now() / 1000;
    const uptimeS = (Date.now() - startMs) / 1000;
    const inGlitch = uptimeS >= GLITCH_WARMUP_S
      && Math.floor(uptimeS - GLITCH_WARMUP_S) % GLITCH_PERIOD_S < GLITCH_DURATION_S;
    for (const id of ids) {
      const ptr = wasm.__pin(wasm.generate(id, nowSeconds, inGlitch ? 1 : 0));
      const jsonStr = wasm.__getString(ptr);
      wasm.__unpin(ptr);
      enqueue(JSON.parse(jsonStr));
    }
  }, INTERVAL_MS);

  setInterval(() => {
    if (dropped > 0) console.error(`[device] buffer full, ${dropped} readings dropped (queue ${queue.length}/${MAX_QUEUE})`);
  }, 10000);

  drain();
}

main().catch(err => { console.error(err); process.exit(1); });
