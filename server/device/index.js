'use strict';

const path   = require('path');
const fs     = require('fs');
const loader = require('@assemblyscript/loader');
const axios  = require('axios');

const TARGET_URL   = process.env.TARGET_URL;
const DEVICE_COUNT = parseInt(process.env.DEVICE_COUNT || '3', 10);
const INTERVAL_MS  = parseInt(process.env.INTERVAL_MS  || '500', 10);

const GLITCH_WARMUP_S  = parseInt(process.env.GLITCH_WARMUP_S  || '60',  10);
const GLITCH_PERIOD_S  = parseInt(process.env.GLITCH_PERIOD_S  || '180', 10);
const GLITCH_DURATION_S = parseInt(process.env.GLITCH_DURATION_S || '30', 10);

const NAMED_DEVICES = [1234, 818181, 919191];

function buildDeviceIds() {
  if (DEVICE_COUNT <= NAMED_DEVICES.length) return NAMED_DEVICES.slice(0, DEVICE_COUNT);
  const ids = [...NAMED_DEVICES];
  for (let i = NAMED_DEVICES.length; i < DEVICE_COUNT; i++) ids.push(100000 + i);
  return ids;
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
      const payload = JSON.parse(jsonStr);
      axios.post(TARGET_URL, payload).catch(err => {
        const reason = err.response ? `HTTP ${err.response.status}` : (err.code || err.message);
        console.error(`[device] dropped reading for ${payload.device_id}: ${reason}`);
      });
    }
  }, INTERVAL_MS);
}

main().catch(err => { console.error(err); process.exit(1); });
