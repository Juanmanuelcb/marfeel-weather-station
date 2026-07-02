# Weather Station

A real-time console for a fleet of weather sensors. Devices stream readings over
HTTP, an ingestion service signs and stores them in ClickHouse, and a React console
shows the fleet live. This started as a rough spike and was taken to production.

## Docs

- **[DECISIONS.md](./DECISIONS.md)** — read this first. What changed in the spike and
  why, the trade-offs, and what I left alone.
- **[INSTRUCTIONS.md](./INSTRUCTIONS.md)** — the original challenge brief.
- **[AGENTS.md](./AGENTS.md)** — inherited agent notes from the spike.

## Quick start

One setup step: copy the env template (the committed `.env` was removed because it
held credentials).

```sh
cp .env.example .env
DEVICE_COUNT=50 docker compose up
```

Open http://localhost:5173 for the console. `DEVICE_COUNT=50` pushes production-level
load through the ingest path; drop it for a gentler stream.

## Running the client alone

```sh
cd client && npm install && npm run dev
```

## Testing

```sh
cd server/ingestor && npm ci && npm test   # 15 tests
cd client && npm ci && npm test            # 19 tests
```

## Building

```sh
cd client && npm run build   # production bundle (tsc + vite)
docker compose build         # all service images
```

## Architecture

The ingest path is decoupled so it survives real load. Devices post to an nginx
gateway, which spreads across three ingestor replicas. Each replica accepts a reading,
returns `202`, and signs it on a worker thread, then batches the writes to ClickHouse.
Overload sheds honest `503`s instead of dropping silently.

The console reads through one server-sent-events stream. A single server-side poller
queries ClickHouse every 5 seconds and fans the snapshot out to every viewer, so
database load does not grow with the number of people watching.

## Layout

```
server/ingestor    productionized ingestion service (Node) + read API
server/device      device simulator (load generator)
server/gateway     nginx gateway (routing, rate limiting)
server/clickhouse  schema (init.sql, a fixed external contract)
client             React console (fleet view, device detail, live updates)
```
